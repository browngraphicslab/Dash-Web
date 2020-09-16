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
import { numberRange, smoothScroll, returnVal } from "../../../Utils";
import { ComputedField } from "../../../fields/ScriptField";
import { listSpec } from "../../../fields/Schema";
import { DocumentType } from "../../documents/DocumentTypes";
import { Zoom, Fade, Flip, Rotate, Bounce, Roll, LightSpeed } from 'react-reveal';
import { PresBox } from "./PresBox";
import { InkingStroke } from "../InkingStroke";

export interface CollectionFreeFormDocumentViewProps extends DocumentViewProps {
    dataProvider?: (doc: Doc, replica: string) => { x: number, y: number, zIndex?: number, opacity?: number, highlight?: boolean, z: number, transition?: string } | undefined;
    sizeProvider?: (doc: Doc, replica: string) => { width: number, height: number } | undefined;
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
    @computed get nativeWidth() { return returnVal(this.props.NativeWidth?.(), NumCast(this.layoutDoc._nativeWidth, this.freezeDimensions ? this.layoutDoc[WidthSym]() : 0)); }
    @computed get nativeHeight() { return returnVal(this.props.NativeHeight?.(), NumCast(this.layoutDoc._nativeHeight, this.freezeDimensions ? this.layoutDoc[HeightSym]() : 0)); }

    public static getValues(doc: Doc, time: number) {
        const timecode = Math.round(time);
        return ({
            h: Cast(doc["h-indexed"], listSpec("number"), [NumCast(doc._height)]).reduce((p, h, i) => (i <= timecode && h !== undefined) || p === undefined ? h : p, undefined as any as number),
            w: Cast(doc["w-indexed"], listSpec("number"), [NumCast(doc._width)]).reduce((p, w, i) => (i <= timecode && w !== undefined) || p === undefined ? w : p, undefined as any as number),
            x: Cast(doc["x-indexed"], listSpec("number"), [NumCast(doc.x)]).reduce((p, x, i) => (i <= timecode && x !== undefined) || p === undefined ? x : p, undefined as any as number),
            y: Cast(doc["y-indexed"], listSpec("number"), [NumCast(doc.y)]).reduce((p, y, i) => (i <= timecode && y !== undefined) || p === undefined ? y : p, undefined as any as number),
            scroll: Cast(doc["scroll-indexed"], listSpec("number"), [NumCast(doc._scrollTop, 0)]).reduce((p, s, i) => (i <= timecode && s !== undefined) || p === undefined ? s : p, undefined as any as number),
            opacity: Cast(doc["opacity-indexed"], listSpec("number"), [NumCast(doc.opacity, 1)]).reduce((p, o, i) => i <= timecode || p === undefined ? o : p, undefined as any as number),
        });
    }

    public static setValues(time: number, d: Doc, x?: number, y?: number, h?: number, w?: number, scroll?: number, opacity?: number) {
        const timecode = Math.round(time);
        const hindexed = Cast(d["h-indexed"], listSpec("number"), []).slice();
        const windexed = Cast(d["w-indexed"], listSpec("number"), []).slice();
        const xindexed = Cast(d["x-indexed"], listSpec("number"), []).slice();
        const yindexed = Cast(d["y-indexed"], listSpec("number"), []).slice();
        const oindexed = Cast(d["opacity-indexed"], listSpec("number"), []).slice();
        const scrollIndexed = Cast(d["scroll-indexed"], listSpec("number"), []).slice();
        xindexed[timecode] = x as any as number;
        yindexed[timecode] = y as any as number;
        hindexed[timecode] = h as any as number;
        windexed[timecode] = w as any as number;
        oindexed[timecode] = opacity as any as number;
        if (scroll) scrollIndexed[timecode] = scroll as any as number;
        d["x-indexed"] = new List<number>(xindexed);
        d["y-indexed"] = new List<number>(yindexed);
        d["h-indexed"] = new List<number>(hindexed);
        d["w-indexed"] = new List<number>(windexed);
        d["opacity-indexed"] = new List<number>(oindexed);
        d["scroll-indexed"] = new List<number>(scrollIndexed);
        if (d.appearFrame) {
            if (d.appearFrame === timecode + 1) {
                d["text-color"] = "red";
            } else if (d.appearFrame < timecode + 1) {
                d["text-color"] = "grey";
            } else { d["text-color"] = "black"; }
        } else if (d.appearFrame === 0) {
            d["text-color"] = "black";
        }
    }

    public static updateScrollframe(doc: Doc, time: number) {
        const timecode = Math.round(time);
        const scrollIndexed = Cast(doc['scroll-indexed'], listSpec("number"), null);
        scrollIndexed?.length <= timecode + 1 && scrollIndexed.push(undefined as any as number);
        setTimeout(() => doc.dataTransition = "inherit", 1010);
    }

    public static setupScroll(doc: Doc, timecode: number) {
        const scrollList = new List<number>();
        scrollList[timecode] = NumCast(doc._scrollTop);
        doc["scroll-indexed"] = scrollList;
        doc.activeFrame = ComputedField.MakeFunction("self._currentFrame");
        doc._scrollTop = ComputedField.MakeInterpolated("scroll", "activeFrame");
    }


    public static updateKeyframe(docs: Doc[], time: number, targetDoc?: Doc) {
        const timecode = Math.round(time);
        docs.forEach(doc => {
            const xindexed = Cast(doc['x-indexed'], listSpec("number"), null);
            const yindexed = Cast(doc['y-indexed'], listSpec("number"), null);
            const hindexed = Cast(doc['h-indexed'], listSpec("number"), null);
            const windexed = Cast(doc['w-indexed'], listSpec("number"), null);
            const opacityindexed = Cast(doc['opacity-indexed'], listSpec("number"), null);
            hindexed?.length <= timecode + 1 && hindexed.push(undefined as any as number);
            windexed?.length <= timecode + 1 && windexed.push(undefined as any as number);
            xindexed?.length <= timecode + 1 && xindexed.push(undefined as any as number);
            yindexed?.length <= timecode + 1 && yindexed.push(undefined as any as number);
            opacityindexed?.length <= timecode + 1 && opacityindexed.push(undefined as any as number);
            if (doc.appearFrame && targetDoc) {
                if (doc.appearFrame === timecode + 1) {
                    doc["text-color"] = StrCast(targetDoc["pres-text-color"]);
                } else if (doc.appearFrame < timecode + 1) {
                    doc["text-color"] = StrCast(targetDoc["pres-text-viewed-color"]);
                } else { doc["text-color"] = "black"; }
            } else if (doc.appearFrame === 0) {
                doc["text-color"] = "black";
            }
            doc.dataTransition = "all 1s";
        });
        setTimeout(() => docs.forEach(doc => doc.dataTransition = "inherit"), 1010);
    }

    public static gotoKeyframe(docs: Doc[]) {
        docs.forEach(doc => doc.dataTransition = "all 1s");
        setTimeout(() => docs.forEach(doc => doc.dataTransition = "inherit"), 1010);
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
            const curTimecode = currTimecode;
            const xlist = new List<number>(numberRange(currTimecode + 1).map(i => undefined) as any as number[]);
            const ylist = new List<number>(numberRange(currTimecode + 1).map(i => undefined) as any as number[]);
            const wlist = new List<number>(numberRange(currTimecode + 1).map(i => undefined) as any as number[]);
            const hlist = new List<number>(numberRange(currTimecode + 1).map(i => undefined) as any as number[]);
            const olist = new List<number>(numberRange(currTimecode + 1).map(t => !doc.z && makeAppear && t < NumCast(doc.appearFrame) ? 0 : 1));
            wlist[curTimecode] = NumCast(doc._width);
            hlist[curTimecode] = NumCast(doc._height);
            xlist[curTimecode] = NumCast(doc.x);
            ylist[curTimecode] = NumCast(doc.y);
            doc["x-indexed"] = xlist;
            doc["y-indexed"] = ylist;
            doc["w-indexed"] = wlist;
            doc["h-indexed"] = hlist;
            doc["opacity-indexed"] = olist;
            doc.activeFrame = ComputedField.MakeFunction("self.context?._currentFrame||0");
            doc._height = ComputedField.MakeInterpolated("h", "activeFrame");
            doc._width = ComputedField.MakeInterpolated("w", "activeFrame");
            doc.x = ComputedField.MakeInterpolated("x", "activeFrame");
            doc.y = ComputedField.MakeInterpolated("y", "activeFrame");
            doc.opacity = ComputedField.MakeInterpolated("opacity", "activeFrame");
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
            backgroundColor={this.props.backgroundColor}
            opacity={this.opacity}
            NativeHeight={this.NativeHeight}
            NativeWidth={this.NativeWidth}
            PanelWidth={this.panelWidth}
            PanelHeight={this.panelHeight} />;
        if (PresBox.Instance && this.layoutDoc === PresBox.Instance.childDocs[PresBox.Instance.itemIndex]?.presentationTargetDoc) {
            const effectProps = {
                left: this.layoutDoc.presEffectDirection === 'left',
                right: this.layoutDoc.presEffectDirection === 'right',
                top: this.layoutDoc.presEffectDirection === 'top',
                bottom: this.layoutDoc.presEffectDirection === 'bottom',
                opposite: true,
                delay: this.layoutDoc.presTransition,
                // when: this.layoutDoc === PresBox.Instance.childDocs[PresBox.Instance.itemIndex]?.presentationTargetDoc,
            };
            switch (this.layoutDoc.presEffect) {
                case "Zoom": return (<Zoom {...effectProps}>{node}</Zoom>); break;
                case "Fade": return (<Fade {...effectProps}>{node}</Fade>); break;
                case "Flip": return (<Flip {...effectProps}>{node}</Flip>); break;
                case "Rotate": return (<Rotate {...effectProps}>{node}</Rotate>); break;
                case "Bounce": return (<Bounce {...effectProps}>{node}</Bounce>); break;
                case "Roll": return (<Roll {...effectProps}>{node}</Roll>); break;
                case "LightSpeed": return (<LightSpeed {...effectProps}>{node}</LightSpeed>); break;
                case "None": return node; break;
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
    render() {
        TraceMobx();
        const backgroundColor = StrCast(this.layoutDoc._backgroundColor) || StrCast(this.layoutDoc.backgroundColor) || StrCast(this.Document.backgroundColor) || this.props.backgroundColor?.(this.Document, this.props.renderDepth);
        const borderRounding = StrCast(Doc.Layout(this.layoutDoc).borderRounding) || StrCast(this.layoutDoc.borderRounding) || StrCast(this.Document.borderRounding) || undefined;
        return <div className="collectionFreeFormDocumentView-container"
            style={{
                boxShadow:
                    this.Opacity === 0 ? undefined :  // if it's not visible, then no shadow
                        this.layoutDoc.z ? `#9c9396  ${StrCast(this.layoutDoc.boxShadow, "10px 10px 0.9vw")}` :  // if it's a floating doc, give it a big shadow
                            this.props.backgroundHalo?.() && this.props.Document.type !== DocumentType.INK ? (`${this.props.backgroundColor?.(this.props.Document, this.props.renderDepth)} ${StrCast(this.layoutDoc.boxShadow, `0vw 0vw ${(this.layoutDoc._isBackground ? 100 : 50) / this.props.ContentScaling()}px`)}`) :  // if it's just in a cluster, make the shadown roughly match the cluster border extent
                                this.layoutDoc._isBackground ? undefined :  // if it's a background & has a cluster color, make the shadow spread really big
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
                pointerEvents: this.props.Document._isBackground || this.Opacity === 0 || this.props.Document.type === DocumentType.INK || this.props.Document.isInkMask ? "none" : this.props.pointerEvents
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
