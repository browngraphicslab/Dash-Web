import { computed } from "mobx";
import { observer } from "mobx-react";
import { createSchema, makeInterface } from "../../../new_fields/Schema";
import { BoolCast, FieldValue, NumCast } from "../../../new_fields/Types";
import { Transform } from "../../util/Transform";
import { DocComponent } from "../DocComponent";
import { DocumentView, DocumentViewProps, positionSchema } from "./DocumentView";
import "./DocumentView.scss";
import React = require("react");

export interface CollectionFreeFormDocumentViewProps extends DocumentViewProps {
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
    @computed get X() { return FieldValue(this.Document.x, 0); }
    @computed get Y() { return FieldValue(this.Document.y, 0); }
    @computed get zoom(): number { return 1 / FieldValue(this.Document.zoomBasis, 1); }
    @computed get nativeWidth(): number { return FieldValue(this.Document.nativeWidth, 0); }
    @computed get nativeHeight(): number { return FieldValue(this.Document.nativeHeight, 0); }
    @computed get width(): number { return BoolCast(this.props.Document.willMaximize) ? 0 : FieldValue(this.Document.width, 0); }
    @computed get height(): number { return BoolCast(this.props.Document.willMaximize) ? 0 : FieldValue(this.Document.height, 0); }

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
    contentScaling = () => this.nativeWidth > 0 ? this.width / this.nativeWidth : 1;
    panelWidth = () => this.props.PanelWidth();
    panelHeight = () => this.props.PanelHeight();
    getTransform = (): Transform => this.props.ScreenToLocalTransform()
        .translate(-this.X, -this.Y)
        .scale(1 / this.contentScaling()).scale(1 / this.zoom)

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
        let br = NumCast(this.props.Document.borderRounding);
        return br >= 0 ? br :
            NumCast(this.props.Document.nativeWidth) === 0 ?
                Math.min(this.props.PanelWidth(), this.props.PanelHeight())
                : Math.min(this.Document.nativeWidth || 0, this.Document.nativeHeight || 0);
    }

    render() {
        return (
            <div className="collectionFreeFormDocumentView-container"
                style={{
                    transformOrigin: "left top",
                    position: "absolute",
                    backgroundColor: "transparent",
                    borderRadius: `${this.borderRounding()}px`,
                    transform: this.transform,
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