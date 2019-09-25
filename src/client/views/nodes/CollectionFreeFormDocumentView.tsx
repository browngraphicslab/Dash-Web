import { computed, action, observable, reaction, IReactionDisposer, trace } from "mobx";
import { observer } from "mobx-react";
import { createSchema, makeInterface, listSpec } from "../../../new_fields/Schema";
import { FieldValue, NumCast, StrCast, Cast } from "../../../new_fields/Types";
import { Transform } from "../../util/Transform";
import { DocComponent } from "../DocComponent";
import { percent2frac } from "../../../Utils";
import { DocumentView, DocumentViewProps, documentSchema } from "./DocumentView";
import "./CollectionFreeFormDocumentView.scss";
import React = require("react");
import { Doc, WidthSym, HeightSym } from "../../../new_fields/Doc";
import { random } from "animejs";

export interface CollectionFreeFormDocumentViewProps extends DocumentViewProps {
    dataProvider?: (doc: Doc, dataDoc?: Doc) => { x: number, y: number, width: number, height: number, z: number, transition?: string } | undefined
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    jitterRotation: number;
    transition?: string;
}
export const positionSchema = createSchema({
    zIndex: "number",
    x: "number",
    y: "number",
    z: "number",
});

export type PositionDocument = makeInterface<[typeof documentSchema, typeof positionSchema]>;
export const PositionDocument = makeInterface(documentSchema, positionSchema);

@observer
export class CollectionFreeFormDocumentView extends DocComponent<CollectionFreeFormDocumentViewProps, PositionDocument>(PositionDocument) {
    _disposer: IReactionDisposer | undefined = undefined;
    get transform() { return `scale(${this.props.ContentScaling()}) translate(${this.X}px, ${this.Y}px) rotate(${random(-1, 1) * this.props.jitterRotation}deg)`; }
    get X() { return this._animPos !== undefined ? this._animPos[0] : this.renderScriptDim ? this.renderScriptDim.x : this.props.x !== undefined ? this.props.x : this.dataProvider ? this.dataProvider.x : this.Document.x || 0; }
    get Y() { return this._animPos !== undefined ? this._animPos[1] : this.renderScriptDim ? this.renderScriptDim.y : this.props.y !== undefined ? this.props.y : this.dataProvider ? this.dataProvider.y : this.Document.y || 0; }
    get width() { return this.renderScriptDim ? this.renderScriptDim.width : this.props.width !== undefined ? this.props.width : this.props.dataProvider && this.dataProvider ? this.dataProvider.width : this.props.Document[WidthSym](); }
    get height() { return this.renderScriptDim ? this.renderScriptDim.height : this.props.height !== undefined ? this.props.height : this.props.dataProvider && this.dataProvider ? this.dataProvider.height : this.props.Document[HeightSym](); }
    @computed get dataProvider() { return this.props.dataProvider && this.props.dataProvider(this.props.Document, this.props.DataDoc) ? this.props.dataProvider(this.props.Document, this.props.DataDoc) : undefined; }
    @computed get nativeWidth() { return FieldValue(this.Document.nativeWidth, 0); }
    @computed get nativeHeight() { return FieldValue(this.Document.nativeHeight, 0); }

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

    componentWillUnmount() {
        this._disposer && this._disposer();
    }
    componentDidMount() {
        this._disposer = reaction(() => [this.props.Document.animateToPos, this.props.Document.isAnimating],
            () => {
                const target = this.props.Document.animateToPos ? Array.from(Cast(this.props.Document.animateToPos, listSpec("number"))!) : undefined;
                this._animPos = !target ? undefined : target[2] ? [this.Document.x || 0, this.Document.y || 0] : this.props.ScreenToLocalTransform().transformPoint(target[0], target[1]);
            }, { fireImmediately: true });
    }

    contentScaling = () => this.nativeWidth > 0 && !this.props.Document.ignoreAspect ? this.width / this.nativeWidth : 1;
    panelWidth = () => this.props.PanelWidth();
    panelHeight = () => this.props.PanelHeight();
    getTransform = (): Transform => this.props.ScreenToLocalTransform()
        .translate(-this.X, -this.Y)
        .scale(1 / this.contentScaling())

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

    @observable _animPos: number[] | undefined = undefined;

    finalPanelWidh = () => { return this.dataProvider ? this.dataProvider.width : this.panelWidth(); }
    finalPanelHeight = () => { return this.dataProvider ? this.dataProvider.height : this.panelHeight(); }

    render() {
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
                    transition: this.Document.isAnimating !== undefined ? ".5s ease-in" : this.props.transition ? this.props.transition : this.dataProvider ? this.dataProvider.transition : StrCast(this.layoutDoc.transition),
                    width: this.width,
                    height: this.height,
                    zIndex: this.Document.zIndex || 0,
                }} >
                <DocumentView {...this.props}
                    ContentScaling={this.contentScaling}
                    ScreenToLocalTransform={this.getTransform}
                    backgroundColor={this.clusterColorFunc}
                    PanelWidth={this.finalPanelWidh}
                    PanelHeight={this.finalPanelHeight}
                />
            </div>
        );
    }
}