import { action, computed, observable } from "mobx";
import { observer } from "mobx-react";
import { Bounce, Fade, Flip, LightSpeed, Roll, Rotate, Zoom } from 'react-reveal';
import { Doc, HeightSym, WidthSym, Opt } from "../../../fields/Doc";
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
import { PresBox, PresEffect } from "./PresBox";
import React = require("react");

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
    @computed get nativeWidth() { return returnVal(this.props.NativeWidth?.(), Doc.NativeWidth(this.layoutDoc, undefined, this.freezeDimensions)); }
    @computed get nativeHeight() { return returnVal(this.props.NativeHeight?.(), Doc.NativeHeight(this.layoutDoc, undefined, this.freezeDimensions)); }

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

    // public static updateScrollframe(doc: Doc, time: number) {
    //     console.log('update scroll frame');
    //     const timecode = Math.round(time);
    //     const scrollIndexed = Cast(doc['scroll-indexed'], listSpec("number"), null);
    //     scrollIndexed?.length <= timecode + 1 && scrollIndexed.push(undefined as any as number);
    //     setTimeout(() => doc.dataTransition = "inherit", 1010);
    // }

    // public static setupScroll(doc: Doc, timecode: number) {
    //     const scrollList = new List<number>();
    //     scrollList[timecode] = NumCast(doc._scrollTop);
    //     doc["scroll-indexed"] = scrollList;
    //     doc.activeFrame = ComputedField.MakeFunction("self._currentFrame");
    //     doc._scrollTop = ComputedField.MakeInterpolated("scroll", "activeFrame");
    // }


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
        setTimeout(() => docs.forEach(doc => { doc._viewTransition = undefined; doc.dataTransition = "inherit" }), 1010);
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

    @computed get freeformNodeDiv() {
        const node = <DocumentView {...this.props}
            nudge={this.nudge}
            dragDivName={"collectionFreeFormDocumentView-container"}
            ContentScaling={this.contentScaling}
            ScreenToLocalTransform={this.getTransform}
            styleProvider={this.props.styleProvider}
            opacity={this.opacity}
            layerProvider={this.props.layerProvider}
            NativeHeight={this.NativeHeight}
            NativeWidth={this.NativeWidth}
            PanelWidth={this.panelWidth}
            PanelHeight={this.panelHeight} />;
        if (PresBox.Instance && this.layoutDoc === PresBox.Instance.childDocs[PresBox.Instance.itemIndex]?.presentationTargetDoc) {
            const effectProps = {
                left: this.layoutDoc.presEffectDirection === PresEffect.Left,
                right: this.layoutDoc.presEffectDirection === PresEffect.Right,
                top: this.layoutDoc.presEffectDirection === PresEffect.Top,
                bottom: this.layoutDoc.presEffectDirection === PresEffect.Bottom,
                opposite: true,
                delay: this.layoutDoc.presTransition,
                // when: this.layoutDoc === PresBox.Instance.childDocs[PresBox.Instance.itemIndex]?.presentationTargetDoc,
            };
            switch (this.layoutDoc.presEffect) {
                case "Zoom": return (<Zoom {...effectProps}>{node}</Zoom>); break;
                case PresEffect.Fade: return (<Fade {...effectProps}>{node}</Fade>); break;
                case PresEffect.Flip: return (<Flip {...effectProps}>{node}</Flip>); break;
                case PresEffect.Rotate: return (<Rotate {...effectProps}>{node}</Rotate>); break;
                case PresEffect.Bounce: return (<Bounce {...effectProps}>{node}</Bounce>); break;
                case PresEffect.Roll: return (<Roll {...effectProps}>{node}</Roll>); break;
                case "LightSpeed": return (<LightSpeed {...effectProps}>{node}</LightSpeed>); break;
                case PresEffect.None: return node; break;
                default: return node; break;
            }
        } else {
            return node;
        }
    }

    contentScaling = () => this.nativeWidth > 0 && !this.props.fitToBox && !this.freezeDimensions ? this.width / this.nativeWidth : 1;
    panelWidth = () => (this.sizeProvider?.width || this.props.PanelWidth?.());
    panelHeight = () => (this.sizeProvider?.height || this.props.PanelHeight?.());
    getTransform = (): Transform => this.props.ScreenToLocalTransform().translate(-this.X, -this.Y).scale(1 / this.contentScaling());
    focusDoc = (doc: Doc) => this.props.focus(doc, false);
    opacity = () => this.Opacity;
    NativeWidth = () => this.nativeWidth;
    NativeHeight = () => this.nativeHeight;
    @computed get pointerEvents() {
        if (this.props.pointerEvents === "none") return "none";
        return this.props.styleProvider?.(this.Document, this.props, !this._contentView?.docView?.isSelected() ? "pointerEvents:selected" : "pointerEvents", this.props.layerProvider);
    }
    render() {
        TraceMobx();
        const backgroundColor = this.props.styleProvider?.(this.Document, this.props, "backgroundColor", this.props.layerProvider);
        const borderRounding = StrCast(Doc.Layout(this.layoutDoc).borderRounding) || StrCast(this.layoutDoc.borderRounding) || StrCast(this.Document.borderRounding) || undefined;
        return <div className="collectionFreeFormDocumentView-container"
            style={{
                boxShadow:
                    this.Opacity === 0 ? undefined :  // if it's not visible, then no shadow
                        this.layoutDoc.z ? `#9c9396  ${StrCast(this.layoutDoc.boxShadow, "10px 10px 0.9vw")}` :  // if it's a floating doc, give it a big shadow
                            this.props.backgroundHalo?.(this.props.Document) && this.props.Document.type !== DocumentType.INK ? (`${this.props.styleProvider?.(this.props.Document, this.props, "backgroundColor", this.props.layerProvider)} ${StrCast(this.layoutDoc.boxShadow, `0vw 0vw ${(Cast(this.layoutDoc.layers, listSpec("string"), []).includes("background") ? 100 : 50) / this.props.ContentScaling()}px`)}`) :  // if it's just in a cluster, make the shadown roughly match the cluster border extent
                                Cast(this.layoutDoc.layers, listSpec("string"), []).includes('background') ? undefined :  // if it's a background & has a cluster color, make the shadow spread really big
                                    StrCast(this.layoutDoc.boxShadow, ""),
                borderRadius: borderRounding,
                outline: this.Highlight ? "orange solid 2px" : "",
                transform: this.transform,
                transition: this.props.dataTransition ? this.props.dataTransition : this.dataProvider ? this.dataProvider.transition : StrCast(this.layoutDoc.dataTransition),
                width: this.props.Document.isInkMask ? InkingStroke.MaskDim : this.width,
                height: this.props.Document.isInkMask ? InkingStroke.MaskDim : this.height,
                zIndex: this.ZInd,
                mixBlendMode: StrCast(this.layoutDoc.mixBlendMode) as any,
                display: this.ZInd === -99 ? "none" : undefined,
                // @ts-ignore
                pointerEvents: this.pointerEvents
            }} >

            {Doc.UserDoc().renderStyle !== "comic" ? (null) :
                <div style={{ width: "100%", height: "100%", position: "absolute" }}>
                    <svg style={{ transform: `scale(1,${this.props.PanelHeight() / this.props.PanelWidth()})`, transformOrigin: "top left", overflow: "visible" }} viewBox="0 0 12 14">
                        <path d="M 7 0 C 9 -1 13 1 12 4 C 11 10 13 12 10 12 C 6 12 7 13 2 12 Q -1 11 0 8 C 1 4 0 4 0 2 C 0 0 1 0 1 0 C 3 0 3 1 7 0"
                            style={{ stroke: "black", fill: backgroundColor, strokeWidth: 0.2 }} />
                    </svg>
                </div>}

            {!this.props.fitToBox ?
                <>{this.freeformNodeDiv}</>
                : <ContentFittingDocumentView {...this.props}
                    ref={action((r: ContentFittingDocumentView | null) => this._contentView = r)}
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
