import { computed } from "mobx";
import { observer } from "mobx-react";
import { createSchema, makeInterface } from "../../../new_fields/Schema";
import { BoolCast, FieldValue, NumCast, StrCast, Cast } from "../../../new_fields/Types";
import { Transform } from "../../util/Transform";
import { DocComponent } from "../DocComponent";
import { DocumentView, DocumentViewProps, positionSchema } from "./DocumentView";
import "./DocumentView.scss";
import React = require("react");
import { Doc } from "../../../new_fields/Doc";
import { random } from "animejs";

export interface CollectionFreeFormDocumentViewProps extends DocumentViewProps {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    jitterRotation: number;
}

const schema = createSchema({
    zoomBasis: "number",
    zIndex: "number",
});

//TODO Types: The import order is wrong, so positionSchema is undefined
type FreeformDocument = makeInterface<[typeof schema, typeof positionSchema]>;
const FreeformDocument = makeInterface(schema, positionSchema);

@observer
export class CollectionFreeFormDocumentView extends DocComponent<CollectionFreeFormDocumentViewProps, FreeformDocument>(FreeformDocument) {
    @computed get transform() { return `scale(${this.props.ContentScaling()}) translate(${this.X}px, ${this.Y}px) rotate(${random(-1, 1) * this.props.jitterRotation}deg) scale(${this.zoom}) `; }
    @computed get X() { return this.props.x !== undefined ? this.props.x : this.Document.x || 0; }
    @computed get Y() { return this.props.y !== undefined ? this.props.y : this.Document.y || 0; }
    @computed get width(): number { return BoolCast(this.props.Document.willMaximize) ? 0 : this.props.width !== undefined ? this.props.width : this.Document.width || 0; }
    @computed get height(): number { return BoolCast(this.props.Document.willMaximize) ? 0 : this.props.height !== undefined ? this.props.height : this.Document.height || 0; }
    @computed get zoom(): number { return 1 / FieldValue(this.Document.zoomBasis, 1); }
    @computed get nativeWidth(): number { return FieldValue(this.Document.nativeWidth, 0); }
    @computed get nativeHeight(): number { return FieldValue(this.Document.nativeHeight, 0); }
    @computed get scaleToOverridingWidth() { return this.width / NumCast(this.props.Document.width, this.width); }

    contentScaling = () => this.nativeWidth > 0 && !BoolCast(this.props.Document.ignoreAspect) ? this.width / this.nativeWidth : 1;
    panelWidth = () => this.props.PanelWidth();
    panelHeight = () => this.props.PanelHeight();
    getTransform = (): Transform => this.props.ScreenToLocalTransform()
        .translate(-this.X, -this.Y)
        .scale(1 / this.contentScaling()).scale(1 / this.zoom / this.scaleToOverridingWidth)

    animateBetweenIcon = (icon: number[], stime: number, maximizing: boolean) => {
        this.props.bringToFront(this.props.Document);
        let targetPos = [this.Document.x || 0, this.Document.y || 0];
        let iconPos = this.props.ScreenToLocalTransform().transformPoint(icon[0], icon[1]);
        DocumentView.animateBetweenIconFunc(this.props.Document,
            this.Document.width || 0, this.Document.height || 0, stime, maximizing, (progress: number) => {
                let pval = maximizing ?
                    [iconPos[0] + (targetPos[0] - iconPos[0]) * progress, iconPos[1] + (targetPos[1] - iconPos[1]) * progress] :
                    [targetPos[0] + (iconPos[0] - targetPos[0]) * progress, targetPos[1] + (iconPos[1] - targetPos[1]) * progress];
                this.Document.x = progress === 1 ? targetPos[0] : pval[0];
                this.Document.y = progress === 1 ? targetPos[1] : pval[1];
            });
    }

    borderRounding = () => {
        let br = StrCast(this.props.Document.layout instanceof Doc ? this.props.Document.layout.borderRounding : this.props.Document.borderRounding);
        if (br.endsWith("%")) {
            let percent = Number(br.substr(0, br.length - 1)) / 100;
            let nativeDim = Math.min(NumCast(this.props.Document.nativeWidth), NumCast(this.props.Document.nativeHeight));
            let minDim = percent * (nativeDim ? nativeDim : Math.min(this.props.PanelWidth(), this.props.PanelHeight()));
            return minDim;
        }
        return undefined;
    }

    @computed
    get clusterColor() { return this.props.backgroundColor(this.props.Document); }

    clusterColorFunc = (doc: Doc) => this.clusterColor;

    render() {
        let txf = this.transform;
        let w = this.width;
        let h = this.height;
        let renderScript = this.Document.renderScript;
        if (renderScript) {
            let someView = Cast(this.Document.someView, Doc);
            let minimap = Cast(this.Document.minimap, Doc);
            if (someView instanceof Doc && minimap instanceof Doc) {
                let x = (NumCast(someView.panX) - NumCast(someView.width) / 2 / NumCast(someView.scale) - (NumCast(minimap.fitX) - NumCast(minimap.fitW) / 2)) / NumCast(minimap.fitW) * NumCast(minimap.width) - NumCast(minimap.width) / 2;
                let y = (NumCast(someView.panY) - NumCast(someView.height) / 2 / NumCast(someView.scale) - (NumCast(minimap.fitY) - NumCast(minimap.fitH) / 2)) / NumCast(minimap.fitH) * NumCast(minimap.height) - NumCast(minimap.height) / 2;
                w = NumCast(someView.width) / NumCast(someView.scale) / NumCast(minimap.fitW) * NumCast(minimap.width);
                h = NumCast(someView.height) / NumCast(someView.scale) / NumCast(minimap.fitH) * NumCast(minimap.height);
                txf = `translate(${x}px,${y}px)`;
            }
        }
        const hasPosition = this.props.x !== undefined || this.props.y !== undefined;
        return (
            <div className="collectionFreeFormDocumentView-container"
                style={{
                    transformOrigin: "left top",
                    position: "absolute",
                    backgroundColor: "transparent",
                    boxShadow:
                        this.props.Document.opacity === 0 ? undefined :  // if it's not visible, then no shadow
                            this.props.Document.z ? `#9c9396  ${StrCast(this.props.Document.boxShadow, "10px 10px 0.9vw")}` :  // if it's a floating doc, give it a big shadow
                                this.clusterColor ? (
                                    this.props.Document.isBackground ? `0px 0px 50px 50px ${this.clusterColor}` :  // if it's a background & has a cluster color, make the shadow spread really big
                                        `${this.clusterColor} ${StrCast(this.props.Document.boxShadow, `0vw 0vw ${50 / this.props.ContentScaling()}px`)}`) :  // if it's just in a cluster, make the shadown roughly match the cluster border extent
                                    undefined,
                    borderRadius: this.borderRounding(),
                    transform: txf,
                    transition: hasPosition ? "transform 1s" : StrCast(this.props.Document.transition),
                    width: w,
                    height: h,
                    zIndex: this.Document.zIndex || 0,
                }} >
                <DocumentView {...this.props}
                    ContentScaling={this.contentScaling}
                    ScreenToLocalTransform={this.getTransform}
                    backgroundColor={this.clusterColorFunc}
                    PanelWidth={this.panelWidth}
                    PanelHeight={this.panelHeight}
                    animateBetweenIcon={this.animateBetweenIcon}
                />
            </div>
        );
    }
}