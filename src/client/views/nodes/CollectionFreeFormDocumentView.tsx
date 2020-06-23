import { computed, IReactionDisposer, observable, reaction, trace } from "mobx";
import { observer } from "mobx-react";
import { Doc, HeightSym, WidthSym } from "../../../fields/Doc";
import { Cast, NumCast, StrCast } from "../../../fields/Types";
import { Transform } from "../../util/Transform";
import { DocComponent } from "../DocComponent";
import "./CollectionFreeFormDocumentView.scss";
import { DocumentView, DocumentViewProps } from "./DocumentView";
import React = require("react");
import { Document } from "../../../fields/documentSchemas";
import { TraceMobx } from "../../../fields/util";
import { ContentFittingDocumentView } from "./ContentFittingDocumentView";
import { List } from "../../../fields/List";
import { numberRange } from "../../../Utils";
import { ComputedField } from "../../../fields/ScriptField";
import { listSpec } from "../../../fields/Schema";
import { DocumentType } from "../../documents/DocumentTypes";

export interface CollectionFreeFormDocumentViewProps extends DocumentViewProps {
    dataProvider?: (doc: Doc, replica: string) => { x: number, y: number, zIndex?: number, opacity?: number, highlight?: boolean, z: number, transition?: string } | undefined;
    sizeProvider?: (doc: Doc, replica: string) => { width: number, height: number } | undefined;
    zIndex?: number;
    highlight?: boolean;
    jitterRotation: number;
    transition?: string;
    fitToBox?: boolean;
    replica: string;
}

@observer
export class CollectionFreeFormDocumentView extends DocComponent<CollectionFreeFormDocumentViewProps, Document>(Document) {
    @observable _animPos: number[] | undefined = undefined;
    random(min: number, max: number) { // min should not be equal to max
        const mseed = Math.abs(this.X * this.Y);
        const seed = (mseed * 9301 + 49297) % 233280;
        const rnd = seed / 233280;
        return min + rnd * (max - min);
    }
    get displayName() { return "CollectionFreeFormDocumentView(" + this.rootDoc.title + ")"; } // this makes mobx trace() statements more descriptive
    get maskCentering() { return this.props.Document.isInkMask ? 2500 : 0; }
    get transform() { return `scale(${this.props.ContentScaling()}) translate(${this.X - this.maskCentering}px, ${this.Y - this.maskCentering}px) rotate(${this.random(-1, 1) * this.props.jitterRotation}deg)`; }
    get X() { return this.dataProvider ? this.dataProvider.x : (this.Document.x || 0); }
    get Y() { return this.dataProvider ? this.dataProvider.y : (this.Document.y || 0); }
    get Opacity() { return this.dataProvider ? this.dataProvider.opacity : Cast(this.layoutDoc.opacity, "number", null); }
    get ZInd() { return this.dataProvider ? this.dataProvider.zIndex : (this.Document.zIndex || 0); }
    get Highlight() { return this.dataProvider?.highlight; }
    get width() { return this.props.sizeProvider && this.sizeProvider ? this.sizeProvider.width : this.layoutDoc[WidthSym](); }
    get height() {
        const hgt = this.props.sizeProvider && this.sizeProvider ? this.sizeProvider.height : this.layoutDoc[HeightSym]();
        return (hgt === undefined && this.nativeWidth && this.nativeHeight) ? this.width * this.nativeHeight / this.nativeWidth : hgt;
    }
    @computed get freezeDimensions() { return this.props.FreezeDimensions; }
    @computed get dataProvider() { return this.props.dataProvider?.(this.props.Document, this.props.replica); }
    @computed get sizeProvider() { return this.props.sizeProvider?.(this.props.Document, this.props.replica); }
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

    public static getValues(doc: Doc, time: number) {
        const timecode = Math.round(time);
        return ({
            x: Cast(doc["x-indexed"], listSpec("number"), []).reduce((p, x, i) => (i <= timecode && x !== undefined) || p === undefined ? x : p, undefined as any as number),
            y: Cast(doc["y-indexed"], listSpec("number"), []).reduce((p, y, i) => (i <= timecode && y !== undefined) || p === undefined ? y : p, undefined as any as number),
            opacity: Cast(doc["opacity-indexed"], listSpec("number"), []).reduce((p, o, i) => i <= timecode || p === undefined ? o : p, undefined as any as number),
        });
    }

    public static setValues(time: number, d: Doc, x?: number, y?: number, opacity?: number) {
        const timecode = Math.round(time);
        Cast(d["x-indexed"], listSpec("number"), [])[timecode] = x as any as number;
        Cast(d["y-indexed"], listSpec("number"), [])[timecode] = y as any as number;
        Cast(d["opacity-indexed"], listSpec("number"), null)[timecode] = opacity as any as number;
    }
    public static updateKeyframe(docs: Doc[], time: number) {
        const timecode = Math.round(time);
        docs.forEach(doc => {
            const xindexed = Cast(doc['x-indexed'], listSpec("number"), null);
            const yindexed = Cast(doc['y-indexed'], listSpec("number"), null);
            const opacityindexed = Cast(doc['opacity-indexed'], listSpec("number"), null);
            xindexed?.length <= timecode + 1 && xindexed.push(undefined as any as number);
            yindexed?.length <= timecode + 1 && yindexed.push(undefined as any as number);
            opacityindexed?.length <= timecode + 1 && opacityindexed.push(undefined as any as number);
            doc.transition = "all 1s";
        });
        setTimeout(() => docs.forEach(doc => doc.transition = "inherit"), 1010);
    }

    public static gotoKeyframe(docs: Doc[]) {
        docs.forEach(doc => doc.transition = "all 1s");
        setTimeout(() => docs.forEach(doc => doc.transition = "inherit"), 1010);
    }

    public static setupKeyframes(docs: Doc[], timecode: number, progressivize: boolean = false) {
        docs.forEach((doc, i) => {
            const curTimecode = progressivize ? i : timecode;
            const xlist = new List<number>(numberRange(timecode + 1).map(i => undefined) as any as number[]);
            const ylist = new List<number>(numberRange(timecode + 1).map(i => undefined) as any as number[]);
            const olist = new List<number>(numberRange(timecode + 1).map(t => progressivize && t < i ? 0 : 1));
            xlist[curTimecode] = NumCast(doc.x);
            ylist[curTimecode] = NumCast(doc.y);
            doc["x-indexed"] = xlist;
            doc["y-indexed"] = ylist;
            doc["opacity-indexed"] = olist;
            doc.activeFrame = ComputedField.MakeFunction("self.context?.currentFrame||0");
            doc.x = ComputedField.MakeInterpolated("x", "activeFrame");
            doc.y = ComputedField.MakeInterpolated("y", "activeFrame");
            doc.opacity = ComputedField.MakeInterpolated("opacity", "activeFrame");
            doc.transition = "inherit";
        });
    }

    nudge = (x: number, y: number) => {
        this.props.Document.x = NumCast(this.props.Document.x) + x;
        this.props.Document.y = NumCast(this.props.Document.y) + y;
    }

    contentScaling = () => this.nativeWidth > 0 && !this.props.fitToBox && !this.freezeDimensions ? this.width / this.nativeWidth : 1;
    panelWidth = () => (this.sizeProvider?.width || this.props.PanelWidth?.());
    panelHeight = () => (this.sizeProvider?.height || this.props.PanelHeight?.());
    getTransform = (): Transform => this.props.ScreenToLocalTransform().translate(-this.X, -this.Y).scale(1 / this.contentScaling());
    focusDoc = (doc: Doc) => this.props.focus(doc, false);
    opacity = () => this.Opacity;
    NativeWidth = () => this.nativeWidth;
    NativeHeight = () => this.nativeHeight;
    render() {
        TraceMobx();
        const backgroundColor = StrCast(this.layoutDoc._backgroundColor) || StrCast(this.layoutDoc.backgroundColor) || StrCast(this.Document.backgroundColor) || this.props.backgroundColor?.(this.Document);
        return <div className="collectionFreeFormDocumentView-container"
            style={{
                boxShadow:
                    this.Opacity === 0 ? undefined :  // if it's not visible, then no shadow
                        this.layoutDoc.z ? `#9c9396  ${StrCast(this.layoutDoc.boxShadow, "10px 10px 0.9vw")}` :  // if it's a floating doc, give it a big shadow
                            this.props.backgroundHalo?.() && this.props.Document.type !== DocumentType.INK ? (`${this.props.backgroundColor?.(this.props.Document)} ${StrCast(this.layoutDoc.boxShadow, `0vw 0vw ${(this.layoutDoc.isBackground ? 100 : 50) / this.props.ContentScaling()}px`)}`) :  // if it's just in a cluster, make the shadown roughly match the cluster border extent
                                this.layoutDoc.isBackground ? undefined :  // if it's a background & has a cluster color, make the shadow spread really big
                                    StrCast(this.layoutDoc.boxShadow, ""),
                borderRadius: StrCast(Doc.Layout(this.layoutDoc).borderRounding),
                outline: this.Highlight ? "orange solid 2px" : "",
                transform: this.transform,
                transition: this.props.transition ? this.props.transition : this.dataProvider ? this.dataProvider.transition : StrCast(this.layoutDoc.transition),
                width: this.props.Document.isInkMask ? 5000 : this.width,
                height: this.props.Document.isInkMask ? 5000 : this.height,
                zIndex: this.ZInd,
                mixBlendMode: StrCast(this.layoutDoc.mixBlendMode) as any,
                display: this.ZInd === -99 ? "none" : undefined,
                pointerEvents: this.props.Document.isBackground || this.Opacity === 0 || this.props.Document.type === DocumentType.INK || this.props.Document.isInkMask ? "none" : this.props.pointerEvents ? "all" : undefined
            }} >
            {Doc.UserDoc().renderStyle !== "comic" ? (null) :
                <div style={{ width: "100%", height: "100%", position: "absolute" }}>
                    <svg style={{ transform: `scale(1,${this.props.PanelHeight() / this.props.PanelWidth()})`, transformOrigin: "top left", overflow: "visible" }} viewBox="0 0 12 14">
                        <path d="M 7 0 C 9 -1 13 1 12 4 C 11 10 13 12 10 12 C 6 12 7 13 2 12 Q -1 11 0 8 C 1 4 0 4 0 2 C 0 0 1 0 1 0 C 3 0 3 1 7 0"
                            style={{ stroke: "black", fill: backgroundColor, strokeWidth: 0.2 }} />
                    </svg>
                </div>}

            {!this.props.fitToBox ?
                <DocumentView {...this.props}
                    nudge={this.nudge}
                    dragDivName={"collectionFreeFormDocumentView-container"}
                    ContentScaling={this.contentScaling}
                    ScreenToLocalTransform={this.getTransform}
                    backgroundColor={this.props.backgroundColor}
                    opacity={this.opacity}
                    NativeHeight={this.NativeHeight}
                    NativeWidth={this.NativeWidth}
                    PanelWidth={this.panelWidth}
                    PanelHeight={this.panelHeight} />
                : <ContentFittingDocumentView {...this.props}
                    ContainingCollectionDoc={this.props.ContainingCollectionDoc}
                    DataDoc={this.props.DataDoc}
                    ScreenToLocalTransform={this.getTransform}
                    NativeHeight={this.NativeHeight}
                    NativeWidth={this.NativeWidth}
                    PanelWidth={this.panelWidth}
                    PanelHeight={this.panelHeight}
                />}
        </div>;
    }
}
