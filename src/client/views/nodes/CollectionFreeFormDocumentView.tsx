import { computed } from "mobx";
import { observer } from "mobx-react";
import { createSchema, makeInterface } from "../../../new_fields/Schema";
import { FieldValue, NumCast, StrCast, Cast } from "../../../new_fields/Types";
import { Transform } from "../../util/Transform";
import { DocComponent } from "../DocComponent";
import { percent2frac } from "../../../Utils"
import { DocumentView, DocumentViewProps, documentSchema } from "./DocumentView";
import "./CollectionFreeFormDocumentView.scss";
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
const positionSchema = createSchema({
    zIndex: "number",
    x: "number",
    y: "number",
    z: "number",
});

export type PositionDocument = makeInterface<[typeof documentSchema, typeof positionSchema]>;
export const PositionDocument = makeInterface(documentSchema, positionSchema);

@observer
export class CollectionFreeFormDocumentView extends DocComponent<CollectionFreeFormDocumentViewProps, PositionDocument>(PositionDocument) {
    @computed get transform() { return `scale(${this.props.ContentScaling()}) translate(${this.X}px, ${this.Y}px) rotate(${random(-1, 1) * this.props.jitterRotation}deg)`; }
    @computed get X() { return this.renderScriptDim ? this.renderScriptDim.x : this.props.x !== undefined ? this.props.x : this.Document.x || 0; }
    @computed get Y() { return this.renderScriptDim ? this.renderScriptDim.y : this.props.y !== undefined ? this.props.y : this.Document.y || 0; }
    @computed get width() { return this.Document.willMaximize ? 0 : this.renderScriptDim ? this.renderScriptDim.width : this.props.width !== undefined ? this.props.width : this.Document.width || 0; }
    @computed get height() { return this.Document.willMaximize ? 0 : this.renderScriptDim ? this.renderScriptDim.height : this.props.height !== undefined ? this.props.height : this.Document.height || 0; }
    @computed get nativeWidth() { return FieldValue(this.Document.nativeWidth, 0); }
    @computed get nativeHeight() { return FieldValue(this.Document.nativeHeight, 0); }
    @computed get scaleToOverridingWidth() { return this.width / FieldValue(this.Document.width, this.width); }

    @computed get renderScriptDim() {
        if (this.Document.renderScript) {
            let someView = Cast(this.props.Document.someView, Doc);
            let minimap = Cast(this.props.Document.minimap, Doc);
            if (someView instanceof Doc && minimap instanceof Doc) {
                let x = (NumCast(someView.panX) - NumCast(someView.width) / 2 / NumCast(someView.scale) - (NumCast(minimap.fitX) - NumCast(minimap.fitW) / 2)) / NumCast(minimap.fitW) * NumCast(minimap.width) - NumCast(minimap.width) / 2;
                let y = (NumCast(someView.panY) - NumCast(someView.height) / 2 / NumCast(someView.scale) - (NumCast(minimap.fitY) - NumCast(minimap.fitH) / 2)) / NumCast(minimap.fitH) * NumCast(minimap.height) - NumCast(minimap.height) / 2;
                let w = NumCast(someView.width) / NumCast(someView.scale) / NumCast(minimap.fitW) * NumCast(minimap.width);
                let h = NumCast(someView.height) / NumCast(someView.scale) / NumCast(minimap.fitH) * NumCast(minimap.height);
                return { x: x, y: y, width: w, height: h };
            }
        }
        return undefined;
    }

    contentScaling = () => this.nativeWidth > 0 && !this.props.Document.ignoreAspect ? this.width / this.nativeWidth : 1;
    panelWidth = () => this.props.PanelWidth();
    panelHeight = () => this.props.PanelHeight();
    getTransform = (): Transform => this.props.ScreenToLocalTransform()
        .translate(-this.X, -this.Y)
        .scale(1 / this.contentScaling()).scale(1 / this.scaleToOverridingWidth)

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
        let ruleRounding = this.props.ruleProvider ? StrCast(this.props.ruleProvider["ruleRounding_" + this.Document.heading]) : undefined;
        let br = StrCast(((this.layoutDoc.layout as Doc) || this.Document).borderRounding);
        br = !br && ruleRounding ? ruleRounding : br;
        if (br.endsWith("%")) {
            let nativeDim = Math.min(NumCast(this.layoutDoc.nativeWidth), NumCast(this.layoutDoc.nativeHeight));
            return percent2frac(br) * (nativeDim ? nativeDim : Math.min(this.props.PanelWidth(), this.props.PanelHeight()));
        }
        return undefined;
    }

    @computed
    get clusterColor() { return this.props.backgroundColor(this.props.Document); }

    clusterColorFunc = (doc: Doc) => this.clusterColor;

    get layoutDoc() {
        // if this document's layout field contains a document (ie, a rendering template), then we will use that
        // to determine the render JSX string, otherwise the layout field should directly contain a JSX layout string.
        return this.props.Document.layout instanceof Doc ? this.props.Document.layout : this.props.Document;
    }

    render() {
        const hasPosition = this.props.x !== undefined || this.props.y !== undefined;
        return (
            <div className="collectionFreeFormDocumentView-container"
                style={{
                    boxShadow:
                        this.layoutDoc.opacity === 0 ? undefined :  // if it's not visible, then no shadow
                            this.layoutDoc.z ? `#9c9396  ${StrCast(this.layoutDoc.boxShadow, "10px 10px 0.9vw")}` :  // if it's a floating doc, give it a big shadow
                                this.clusterColor ? (`${this.clusterColor} ${StrCast(this.layoutDoc.boxShadow, `0vw 0vw ${(this.layoutDoc.isBackground ? 100 : 50) / this.props.ContentScaling()}px`)}`) :  // if it's just in a cluster, make the shadown roughly match the cluster border extent
                                    this.layoutDoc.isBackground ? `1px 1px 1px ${this.clusterColor}` :  // if it's a background & has a cluster color, make the shadow spread really big
                                        StrCast(this.layoutDoc.boxShadow, ""),
                    borderRadius: this.borderRounding(),
                    transform: this.transform,
                    transition: hasPosition ? "transform 1s" : StrCast(this.layoutDoc.transition),
                    width: this.width,
                    height: this.height,
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