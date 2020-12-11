import { action, computed, observable } from "mobx";
import { observer } from "mobx-react";
import { Doc, HeightSym, Opt, WidthSym } from "../../../fields/Doc";
import { Document } from "../../../fields/documentSchemas";
import { List } from "../../../fields/List";
import { listSpec } from "../../../fields/Schema";
import { ComputedField } from "../../../fields/ScriptField";
import { Cast, NumCast, StrCast } from "../../../fields/Types";
import { TraceMobx } from "../../../fields/util";
import { numberRange, returnVal } from "../../../Utils";
import { DocumentType } from "../../documents/DocumentTypes";
import { Transform } from "../../util/Transform";
import { DocComponent } from "../DocComponent";
import { InkingStroke } from "../InkingStroke";
import "./CollectionFreeFormDocumentView.scss";
import { ContentFittingDocumentView } from "./ContentFittingDocumentView";
import { DocumentView, DocumentViewProps } from "./DocumentView";
import React = require("react");
import { StyleProp } from "../StyleProvider";

export interface CollectionFreeFormDocumentViewProps extends DocumentViewProps {
    dataProvider?: (doc: Doc, replica: string) => { x: number, y: number, zIndex?: number, opacity?: number, highlight?: boolean, z: number, transition?: string } | undefined;
    sizeProvider?: (doc: Doc, replica: string) => { width: number, height: number } | undefined;
    layerProvider?: (doc: Doc, assign?: boolean) => boolean;
    zIndex?: number;
    highlight?: boolean;
    jitterRotation: number;
    dataTransition?: string;
    fitToBox?: boolean;
    replica: string;
}

@observer
export class CollectionFreeFormDocumentView extends DocComponent<CollectionFreeFormDocumentViewProps, Document>(Document) {
    @observable _animPos: number[] | undefined = undefined;
    @observable _contentView: ContentFittingDocumentView | undefined | null;
    random(min: number, max: number) { // min should not be equal to max
        const mseed = Math.abs(this.X * this.Y);
        const seed = (mseed * 9301 + 49297) % 233280;
        const rnd = seed / 233280;
        return min + rnd * (max - min);
    }
    get displayName() { return "CollectionFreeFormDocumentView(" + this.rootDoc.title + ")"; } // this makes mobx trace() statements more descriptive
    get maskCentering() { return this.props.Document.isInkMask ? InkingStroke.MaskDim / 2 : 0; }
    get transform() { return `scale(${this.props.ContentScaling()}) translate(${this.X - this.maskCentering}px, ${this.Y - this.maskCentering}px) rotate(${this.random(-1, 1) * this.props.jitterRotation}deg)`; }
    get X() { return this.dataProvider ? this.dataProvider.x : (this.Document.x || 0); }
    get Y() { return this.dataProvider ? this.dataProvider.y : (this.Document.y || 0); }
    get ZInd() { return this.dataProvider ? this.dataProvider.zIndex : (this.Document.zIndex || 0); }
    get Opacity() { return this.dataProvider ? this.dataProvider.opacity : undefined; }
    get Highlight() { return this.dataProvider?.highlight; }
    get width() { return this.props.sizeProvider && this.sizeProvider ? this.sizeProvider.width : this.layoutDoc[WidthSym](); }
    get height() {
        const hgt = this.props.sizeProvider && this.sizeProvider ? this.sizeProvider.height : this.layoutDoc[HeightSym]();
        return (hgt === undefined && this.nativeWidth && this.nativeHeight) ? this.width * this.nativeHeight / this.nativeWidth : hgt;
    }
    @computed get freezeDimensions() { return this.props.freezeDimensions; }
    @computed get dataProvider() { return this.props.dataProvider?.(this.props.Document, this.props.replica); }
    @computed get sizeProvider() { return this.props.sizeProvider?.(this.props.Document, this.props.replica); }
    @computed get nativeWidth() { return returnVal(this.props.NativeWidth?.(), Doc.NativeWidth(this.layoutDoc, undefined, this.freezeDimensions)); }
    @computed get nativeHeight() { return returnVal(this.props.NativeHeight?.(), Doc.NativeHeight(this.layoutDoc, undefined, this.freezeDimensions)); }

    styleProvider = (doc: Doc | undefined, props: Opt<DocumentViewProps>, property: string) => {
        if (property === StyleProp.Opacity && doc === this.layoutDoc) return this.Opacity; // only change the opacity for this specific document, not its children
        return this.props.styleProvider?.(doc, props, property);
    }

    static animFields = ["_height", "_width", "x", "y", "_scrollTop", "opacity"];
    public static getValues(doc: Doc, time: number) {
        return CollectionFreeFormDocumentView.animFields.reduce((p, val) => {
            p[val] = Cast(`${val}-indexed`, listSpec("number"), [NumCast(doc[val])]).reduce((p, v, i) => (i <= Math.round(time) && v !== undefined) || p === undefined ? v : p, undefined as any as number);
            return p;
        }, {} as { [val: string]: Opt<number> });
    }

    public static setValues(time: number, d: Doc, vals: { [val: string]: Opt<number> }) {
        const timecode = Math.round(time);
        Object.keys(vals).forEach(val => {
            const findexed = Cast(d[`${val}-indexed`], listSpec("number"), []).slice();
            findexed[timecode] = vals[val] as any as number;
            d[`${val}-indexed`] = new List<number>(findexed);
        });
        d.appearFrame && (d["text-color"] =
            d.appearFrame === timecode + 1 ? "red" :
                d.appearFrame < timecode + 1 ? "grey" : "black");
    }

    public static updateKeyframe(docs: Doc[], time: number, targetDoc?: Doc) {
        const timecode = Math.round(time);
        docs.forEach(action(doc => {
            doc._viewTransition = doc.dataTransition = "all 1s";
            doc["text-color"] =
                !doc.appearFrame || !targetDoc ? "black" :
                    doc.appearFrame === timecode + 1 ? StrCast(targetDoc["pres-text-color"]) :
                        doc.appearFrame < timecode + 1 ? StrCast(targetDoc["pres-text-viewed-color"]) :
                            "black";
            CollectionFreeFormDocumentView.animFields.forEach(val => {
                const findexed = Cast(doc[`${val}-indexed`], listSpec("number"), null);
                findexed?.length <= timecode + 1 && findexed.push(undefined as any as number);
            });
        }));
        setTimeout(() => docs.forEach(doc => { doc._viewTransition = undefined; doc.dataTransition = "inherit"; }), 1010);
    }

    public static gotoKeyframe(docs: Doc[]) {
        docs.forEach(doc => doc._viewTransition = doc.dataTransition = "all 1s");
        setTimeout(() => docs.forEach(doc => { doc._viewTransition = undefined; doc.dataTransition = "inherit"; }), 1010);
    }

    public static setupZoom(doc: Doc, targDoc: Doc) {
        const width = new List<number>();
        const height = new List<number>();
        const top = new List<number>();
        const left = new List<number>();
        width.push(NumCast(targDoc._width));
        height.push(NumCast(targDoc._height));
        top.push(NumCast(targDoc._height) / -2);
        left.push(NumCast(targDoc._width) / -2);
        doc["viewfinder-width-indexed"] = width;
        doc["viewfinder-height-indexed"] = height;
        doc["viewfinder-top-indexed"] = top;
        doc["viewfinder-left-indexed"] = left;
    }

    public static setupKeyframes(docs: Doc[], currTimecode: number, makeAppear: boolean = false) {
        docs.forEach(doc => {
            if (doc.appearFrame === undefined) doc.appearFrame = currTimecode;
            if (!doc["opacity-indexed"]) { // opacity is unlike other fields because it's value should not be undefined before it appears to enable it to fade-in
                const olist = new List<number>(numberRange(currTimecode + 1).map(t => !doc.z && makeAppear && t < NumCast(doc.appearFrame) ? 0 : 1));
                doc["opacity-indexed"] = olist;
            }
            CollectionFreeFormDocumentView.animFields.forEach(val => doc[val] = ComputedField.MakeInterpolated(val, "activeFrame", doc, currTimecode));
            doc.activeFrame = ComputedField.MakeFunction("self.context?._currentFrame||0");
            doc.dataTransition = "inherit";
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
    NativeWidth = () => this.nativeWidth;
    NativeHeight = () => this.nativeHeight;
    returnThis = () => this;
    @computed get pointerEvents() {
        if (this.props.pointerEvents === "none") return "none";
        return this.props.styleProvider?.(this.Document, this.props, StyleProp.PointerEvents + (!this._contentView?.docView?.isSelected() ? ":selected" : ""));
    }
    render() {
        TraceMobx();
        const backgroundColor = this.props.styleProvider?.(this.Document, this.props, StyleProp.BackgroundColor);
        const borderRadius = this.props.styleProvider?.(this.Document, this.props, StyleProp.BorderRounding);
        const boxShadow = this.props.styleProvider?.(this.Document, this.props, StyleProp.BoxShadow);
        const divProps: DocumentViewProps = {
            ...this.props,
            CollectionFreeFormDocumentView: this.returnThis,
            dragDivName: "collectionFreeFormDocumentView-container",
            styleProvider: this.styleProvider,
            ScreenToLocalTransform: this.getTransform,
            NativeHeight: this.NativeHeight,
            NativeWidth: this.NativeWidth,
            PanelWidth: this.panelWidth,
            PanelHeight: this.panelHeight
        };
        return <div className="collectionFreeFormDocumentView-container"
            style={{
                boxShadow,
                borderRadius,
                outline: this.Highlight ? "orange solid 2px" : "",
                transform: this.transform,
                transition: this.props.dataTransition ? this.props.dataTransition : this.dataProvider ? this.dataProvider.transition : StrCast(this.layoutDoc.dataTransition),
                width: this.props.Document.isInkMask ? InkingStroke.MaskDim : this.width,
                height: this.props.Document.isInkMask ? InkingStroke.MaskDim : this.height,
                zIndex: this.ZInd,
                mixBlendMode: StrCast(this.layoutDoc.mixBlendMode) as any,
                display: this.ZInd === -99 ? "none" : undefined,
                pointerEvents: this.pointerEvents
            }} >

            {Doc.UserDoc().renderStyle !== "comic" ? (null) :
                <div style={{ width: "100%", height: "100%", position: "absolute" }}>
                    <svg style={{ transform: `scale(1,${this.props.PanelHeight() / this.props.PanelWidth()})`, transformOrigin: "top left", overflow: "visible" }} viewBox="0 0 12 14">
                        <path d="M 7 0 C 9 -1 13 1 12 4 C 11 10 13 12 10 12 C 6 12 7 13 2 12 Q -1 11 0 8 C 1 4 0 4 0 2 C 0 0 1 0 1 0 C 3 0 3 1 7 0"
                            style={{ stroke: "black", fill: backgroundColor, strokeWidth: 0.2 }} />
                    </svg>
                </div>}

            {this.props.fitToBox ?
                <ContentFittingDocumentView {...divProps} ref={action((r: ContentFittingDocumentView | null) => this._contentView = r)} /> :
                <DocumentView {...divProps} ContentScaling={this.contentScaling} />}
        </div>;
    }
}
