import { computed } from "mobx";
import { observer } from "mobx-react";
import { createSchema, makeInterface } from "../../../new_fields/Schema";
import { BoolCast, FieldValue, NumCast, StrCast } from "../../../new_fields/Types";
import { Transform } from "../../util/Transform";
import { DocComponent } from "../DocComponent";
import { DocumentView, DocumentViewProps, positionSchema } from "./DocumentView";
import "./DocumentView.scss";
import React = require("react");

export interface CollectionFreeFormDocumentViewProps extends DocumentViewProps {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
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
    @computed get transform() { return `scale(${this.props.ContentScaling()}) translate(${this.X}px, ${this.Y}px) scale(${this.zoom}) `; }
    @computed get X() { return this.props.x !== undefined ? this.props.x : this.Document.x || 0; }
    @computed get Y() { return this.props.y !== undefined ? this.props.y : this.Document.y || 0; }
    @computed get width(): number { return BoolCast(this.props.Document.willMaximize) ? 0 : this.props.width !== undefined ? this.props.width : this.Document.width || 0; }
    @computed get height(): number { return BoolCast(this.props.Document.willMaximize) ? 0 : this.props.height !== undefined ? this.props.height : this.Document.height || 0; }
    @computed get zoom(): number { return 1 / FieldValue(this.Document.zoomBasis, 1); }
    @computed get nativeWidth(): number { return FieldValue(this.Document.nativeWidth, 0); }
    @computed get nativeHeight(): number { return FieldValue(this.Document.nativeHeight, 0); }

    set width(w: number) {
        this.Document.width = w;
        if (this.nativeWidth && this.nativeHeight) {
            this.Document.height = this.nativeHeight / this.nativeWidth * w;
        }
    }
    set height(h: number) {
        this.Document.height = h;
        if (this.nativeWidth && this.nativeHeight) {
            this.Document.width = this.nativeWidth / this.nativeHeight * h;
        }
    }
    @computed get scaleToOverridingWidth() { return this.width / NumCast(this.props.Document.width, this.width); }
    contentScaling = () => this.nativeWidth > 0 ? this.width / this.nativeWidth : 1;
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
        let br = StrCast(this.props.Document.borderRounding);
        if (br.endsWith("%")) {
            let percent = Number(br.substr(0, br.length - 1)) / 100;
            let nativeDim = Math.min(NumCast(this.props.Document.nativeWidth), NumCast(this.props.Document.nativeHeight));
            let minDim = percent * (nativeDim ? nativeDim : Math.min(this.props.PanelWidth(), this.props.PanelHeight()));
            return minDim;
        }
        return undefined;
    }

    render() {
        return (
            <div className="collectionFreeFormDocumentView-container"
                style={{
                    transformOrigin: "left top",
                    position: "absolute",
                    backgroundColor: "transparent",
                    borderRadius: this.borderRounding(),
                    transform: this.transform,
                    transition: StrCast(this.props.Document.transition),
                    width: this.width,
                    height: this.height,
                    zIndex: this.Document.zIndex || 0,
                }} >
                <DocumentView {...this.props}
                    ContentScaling={this.contentScaling}
                    ScreenToLocalTransform={this.getTransform}
                    PanelWidth={this.panelWidth}
                    PanelHeight={this.panelHeight}
                    animateBetweenIcon={this.animateBetweenIcon}
                />
            </div>
        );
    }
}