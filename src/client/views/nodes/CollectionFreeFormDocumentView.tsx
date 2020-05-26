import anime from "animejs";
import { computed, IReactionDisposer, observable, reaction, trace } from "mobx";
import { observer } from "mobx-react";
import { Doc, HeightSym, WidthSym } from "../../../fields/Doc";
import { Cast, NumCast, StrCast } from "../../../fields/Types";
import { Transform } from "../../util/Transform";
import { DocComponent } from "../DocComponent";
import "./CollectionFreeFormDocumentView.scss";
import { DocumentView, DocumentViewProps } from "./DocumentView";
import React = require("react");
import { PositionDocument } from "../../../fields/documentSchemas";
import { TraceMobx } from "../../../fields/util";
import { ContentFittingDocumentView } from "./ContentFittingDocumentView";

export interface CollectionFreeFormDocumentViewProps extends DocumentViewProps {
    dataProvider?: (doc: Doc) => { x: number, y: number, zIndex?: number, highlight?: boolean, width: number, height: number, z: number, transition?: string } | undefined;
    x?: number;
    y?: number;
    z?: number;
    zIndex?: number;
    highlight?: boolean;
    width?: number;
    height?: number;
    jitterRotation: number;
    transition?: string;
    fitToBox?: boolean;
}

@observer
export class CollectionFreeFormDocumentView extends DocComponent<CollectionFreeFormDocumentViewProps, PositionDocument>(PositionDocument) {
    @observable _animPos: number[] | undefined = undefined;
    get displayName() { return "CollectionFreeFormDocumentView(" + this.props.Document.title + ")"; } // this makes mobx trace() statements more descriptive
    get transform() { return `scale(${this.props.ContentScaling()}) translate(${this.X}px, ${this.Y}px) rotate(${anime.random(-1, 1) * this.props.jitterRotation}deg)`; }
    get X() { return this.renderScriptDim ? this.renderScriptDim.x : this.props.x !== undefined ? this.props.x : this.dataProvider ? this.dataProvider.x : (this.Document.x || 0); }
    get Y() { return this.renderScriptDim ? this.renderScriptDim.y : this.props.y !== undefined ? this.props.y : this.dataProvider ? this.dataProvider.y : (this.Document.y || 0); }
    get ZInd() { return this.dataProvider ? this.dataProvider.zIndex : (this.Document.zIndex || 0); }
    get Highlight() { return this.dataProvider?.highlight; }
    get width() { return this.renderScriptDim ? this.renderScriptDim.width : this.props.width !== undefined ? this.props.width : this.props.dataProvider && this.dataProvider ? this.dataProvider.width : this.layoutDoc[WidthSym](); }
    get height() {
        const hgt = this.renderScriptDim ? this.renderScriptDim.height : this.props.height !== undefined ? this.props.height : this.props.dataProvider && this.dataProvider ? this.dataProvider.height : this.layoutDoc[HeightSym]();
        return (hgt === undefined && this.nativeWidth && this.nativeHeight) ? this.width * this.nativeHeight / this.nativeWidth : hgt;
    }
    @computed get freezeDimensions() { return this.props.FreezeDimensions; }
    @computed get dataProvider() { return this.props.dataProvider && this.props.dataProvider(this.props.Document) ? this.props.dataProvider(this.props.Document) : undefined; }
    @computed get nativeWidth() { return NumCast(this.layoutDoc._nativeWidth, this.props.NativeWidth() || (this.freezeDimensions ? this.layoutDoc[WidthSym]() : 0)); }
    @computed get nativeHeight() { return NumCast(this.layoutDoc._nativeHeight, this.props.NativeHeight() || (this.freezeDimensions ? this.layoutDoc[HeightSym]() : 0)); }

    @computed get renderScriptDim() {
        if (this.Document.renderScript) {
            const someView = Cast(this.props.Document.someView, Doc);
            const minimap = Cast(this.props.Document.minimap, Doc);
            if (someView instanceof Doc && minimap instanceof Doc) {
                const x = (NumCast(someView._panX) - NumCast(someView._width) / 2 / NumCast(someView.scale) - (NumCast(minimap.fitX) - NumCast(minimap.fitW) / 2)) / NumCast(minimap.fitW) * NumCast(minimap._width) - NumCast(minimap._width) / 2;
                const y = (NumCast(someView._panY) - NumCast(someView._height) / 2 / NumCast(someView.scale) - (NumCast(minimap.fitY) - NumCast(minimap.fitH) / 2)) / NumCast(minimap.fitH) * NumCast(minimap._height) - NumCast(minimap._height) / 2;
                const w = NumCast(someView._width) / NumCast(someView.scale) / NumCast(minimap.fitW) * NumCast(minimap.width);
                const h = NumCast(someView._height) / NumCast(someView.scale) / NumCast(minimap.fitH) * NumCast(minimap.height);
                return { x: x, y: y, width: w, height: h };
            }
        }
        return undefined;
    }
    nudge = (x: number, y: number) => {
        this.props.Document.x = NumCast(this.props.Document.x) + x;
        this.props.Document.y = NumCast(this.props.Document.y) + y;
    }

    contentScaling = () => this.nativeWidth > 0 && !this.props.fitToBox && !this.freezeDimensions ? this.width / this.nativeWidth : 1;
    panelWidth = () => (this.dataProvider?.width || this.props.PanelWidth?.());
    panelHeight = () => (this.dataProvider?.height || this.props.PanelHeight?.());
    getTransform = (): Transform => this.props.ScreenToLocalTransform()
        .translate(-this.X, -this.Y)
        .scale(1 / this.contentScaling())

    focusDoc = (doc: Doc) => this.props.focus(doc, false);
    NativeWidth = () => this.nativeWidth;
    NativeHeight = () => this.nativeHeight;
    render() {
        TraceMobx();
        return <div className="collectionFreeFormDocumentView-container"
            style={{
                boxShadow:
                    this.layoutDoc.opacity === 0 ? undefined :  // if it's not visible, then no shadow
                        this.layoutDoc.z ? `#9c9396  ${StrCast(this.layoutDoc.boxShadow, "10px 10px 0.9vw")}` :  // if it's a floating doc, give it a big shadow
                            this.props.backgroundHalo?.() ? (`${this.props.backgroundColor?.(this.props.Document)} ${StrCast(this.layoutDoc.boxShadow, `0vw 0vw ${(this.layoutDoc.isBackground ? 100 : 50) / this.props.ContentScaling()}px`)}`) :  // if it's just in a cluster, make the shadown roughly match the cluster border extent
                                this.layoutDoc.isBackground ? undefined :  // if it's a background & has a cluster color, make the shadow spread really big
                                    StrCast(this.layoutDoc.boxShadow, ""),
                borderRadius: StrCast(Doc.Layout(this.layoutDoc).borderRounding),
                outline: this.Highlight ? "orange solid 2px" : "",
                transform: this.transform,
                transition: this.props.transition ? this.props.transition : this.dataProvider ? this.dataProvider.transition : StrCast(this.layoutDoc.transition),
                width: this.width,
                height: this.height,
                zIndex: this.ZInd,
                display: this.ZInd === -99 ? "none" : undefined,
                pointerEvents: this.props.Document.isBackground ? "none" : this.props.pointerEvents ? "all" : undefined
            }} >

            {!this.props.fitToBox ?
                <DocumentView {...this.props}
                    nudge={this.nudge}
                    dragDivName={"collectionFreeFormDocumentView-container"}
                    ContentScaling={this.contentScaling}
                    ScreenToLocalTransform={this.getTransform}
                    backgroundColor={this.props.backgroundColor}
                    NativeHeight={this.NativeHeight}
                    NativeWidth={this.NativeWidth}
                    PanelWidth={this.panelWidth}
                    PanelHeight={this.panelHeight} />
                : <ContentFittingDocumentView {...this.props}
                    CollectionDoc={this.props.ContainingCollectionDoc}
                    DataDocument={this.props.DataDoc}
                    getTransform={this.getTransform}
                    NativeHeight={this.NativeHeight}
                    NativeWidth={this.NativeWidth}
                    active={this.props.parentActive}
                    focus={this.focusDoc}
                    PanelWidth={this.panelWidth}
                    PanelHeight={this.panelHeight}
                />}
        </div>;
    }
}
