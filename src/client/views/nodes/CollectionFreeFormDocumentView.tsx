import { computed, trace, action } from "mobx";
import { observer } from "mobx-react";
import { KeyStore } from "../../../fields/KeyStore";
import { NumberField } from "../../../fields/NumberField";
import { Document } from "../../../fields/Document";
import { Transform } from "../../util/Transform";
import { DocumentView, DocumentViewProps } from "./DocumentView";
import "./DocumentView.scss";
import React = require("react");
import { OmitKeys, Utils } from "../../../Utils";
import { SelectionManager } from "../../util/SelectionManager";
import { ListField } from "../../../fields/ListField";
import { BooleanField } from "../../../fields/BooleanField";
import { matchedData } from "express-validator/filter";

export interface CollectionFreeFormDocumentViewProps extends DocumentViewProps {
}

@observer
export class CollectionFreeFormDocumentView extends React.Component<CollectionFreeFormDocumentViewProps> {
    private _mainCont = React.createRef<HTMLDivElement>();
    private _downX: number = 0;
    private _downY: number = 0;

    @computed get transform() {
        return `scale(${this.props.ContentScaling()}, ${this.props.ContentScaling()}) translate(${this.X}px, ${this.Y}px) scale(${this.zoom}, ${this.zoom}) `;
    }
    @computed get X() { return this.props.Document.GetNumber(KeyStore.X, 0); }
    @computed get Y() { return this.props.Document.GetNumber(KeyStore.Y, 0); }
    @computed get zoom() { return 1 / this.props.Document.GetNumber(KeyStore.ZoomBasis, 1); }
    @computed get nativeWidth() { return this.props.Document.GetNumber(KeyStore.NativeWidth, 0); }
    @computed get nativeHeight() { return this.props.Document.GetNumber(KeyStore.NativeHeight, 0); }
    @computed get width() { return this.props.Document.Width(); }
    @computed get height() { return this.props.Document.Height(); }
    @computed get zIndex() { return this.props.Document.GetNumber(KeyStore.ZIndex, 0); }
    set width(w: number) {
        this.props.Document.SetData(KeyStore.Width, w, NumberField);
        if (this.nativeWidth && this.nativeHeight) {
            this.props.Document.SetNumber(KeyStore.Height, this.nativeHeight / this.nativeWidth * w);
        }
    }
    set height(h: number) {
        this.props.Document.SetData(KeyStore.Height, h, NumberField);
        if (this.nativeWidth && this.nativeHeight) {
            this.props.Document.SetNumber(KeyStore.Width, this.nativeWidth / this.nativeHeight * h);
        }
    }
    set zIndex(h: number) {
        this.props.Document.SetData(KeyStore.ZIndex, h, NumberField);
    }

    contentScaling = () => (this.nativeWidth > 0 ? this.width / this.nativeWidth : 1);
    panelWidth = () => this.props.PanelWidth();
    panelHeight = () => this.props.PanelHeight();
    toggleMinimized = () => this.toggleIcon();
    getTransform = (): Transform => this.props.ScreenToLocalTransform()
        .translate(-this.X, -this.Y)
        .scale(1 / this.contentScaling()).scale(1 / this.zoom)

    @computed
    get docView() {
        return <DocumentView {...OmitKeys(this.props, ['zoomFade'])}
            toggleMinimized={this.toggleMinimized}
            ContentScaling={this.contentScaling}
            ScreenToLocalTransform={this.getTransform}
            PanelWidth={this.panelWidth}
            PanelHeight={this.panelHeight}
            borderRounding={this.borderRounding}
        />;
    }

    animateBetweenIcon(first: boolean, icon: number[], targ: number[], width: number, height: number, stime: number, target: Document, maximizing: boolean) {
        setTimeout(() => {
            let now = Date.now();
            let progress = Math.min(1, (now - stime) / 200);
            let pval = maximizing ?
                [icon[0] + (targ[0] - icon[0]) * progress, icon[1] + (targ[1] - icon[1]) * progress] :
                [targ[0] + (icon[0] - targ[0]) * progress, targ[1] + (icon[1] - targ[1]) * progress];
            target.SetNumber(KeyStore.Width, maximizing ? 25 + (width - 25) * progress : width + (25 - width) * progress);
            target.SetNumber(KeyStore.Height, maximizing ? 25 + (height - 25) * progress : height + (25 - height) * progress);
            target.SetNumber(KeyStore.X, pval[0]);
            target.SetNumber(KeyStore.Y, pval[1]);
            if (first) {
                target.SetBoolean(KeyStore.IsMinimized, false);
            }
            if (now < stime + 200) {
                this.animateBetweenIcon(false, icon, targ, width, height, stime, target, maximizing);
            }
            else {
                if (!maximizing) {
                    target.SetBoolean(KeyStore.IsMinimized, true);
                    target.SetNumber(KeyStore.X, targ[0]);
                    target.SetNumber(KeyStore.Y, targ[1]);
                    target.SetNumber(KeyStore.Width, width);
                    target.SetNumber(KeyStore.Height, height);
                }
                (target as any).isIconAnimating = false;
            }
        },
            2);
    }
    @action
    public toggleIcon = async (): Promise<void> => {
        SelectionManager.DeselectAll();
        let isMinimized: boolean | undefined;
        let minimizedDocSet = await this.props.Document.GetTAsync(KeyStore.LinkTags, ListField);
        if (!minimizedDocSet) return;
        minimizedDocSet.Data.map(async minimizedDoc => {
            if (minimizedDoc instanceof Document) {
                this.props.addDocument && this.props.addDocument(minimizedDoc, false);
                let maximizedDoc = await minimizedDoc.GetTAsync(KeyStore.MaximizedDoc, Document);
                if (maximizedDoc instanceof Document && !(maximizedDoc as any).isIconAnimating) {
                    (maximizedDoc as any).isIconAnimating = true;
                    if (isMinimized === undefined) {
                        let maximizedDocMinimizedState = await maximizedDoc.GetTAsync(KeyStore.IsMinimized, BooleanField);
                        isMinimized = (maximizedDocMinimizedState && maximizedDocMinimizedState.Data) ? true : false;
                    }
                    let minx = await minimizedDoc.GetTAsync(KeyStore.X, NumberField);
                    let miny = await minimizedDoc.GetTAsync(KeyStore.Y, NumberField);
                    let maxx = await maximizedDoc.GetTAsync(KeyStore.X, NumberField);
                    let maxy = await maximizedDoc.GetTAsync(KeyStore.Y, NumberField);
                    let maxw = await maximizedDoc.GetTAsync(KeyStore.Width, NumberField);
                    let maxh = await maximizedDoc.GetTAsync(KeyStore.Height, NumberField);
                    if (minx !== undefined && miny !== undefined && maxx !== undefined && maxy !== undefined &&
                        maxw !== undefined && maxh !== undefined)
                        this.animateBetweenIcon(
                            true,
                            [minx.Data, miny.Data], [maxx.Data, maxy.Data], maxw.Data, maxh.Data,
                            Date.now(), maximizedDoc, isMinimized);
                }

            }
        })
    }
    onPointerDown = (e: React.PointerEvent): void => {
        this._downX = e.clientX;
        this._downY = e.clientY;
    }
    onClick = (e: React.MouseEvent): void => {
        e.stopPropagation();
        if (Math.abs(e.clientX - this._downX) < Utils.DRAG_THRESHOLD &&
            Math.abs(e.clientY - this._downY) < Utils.DRAG_THRESHOLD) {
            this.props.Document.GetTAsync(KeyStore.MaximizedDoc, Document).then(maxdoc => {
                if (maxdoc instanceof Document) {   // bcz: need a better way to associate behaviors with click events on widget-documents
                    this.props.addDocument && this.props.addDocument(maxdoc, false);
                    this.toggleIcon();
                }
            });
        }
    }

    borderRounding = () => {
        let br = this.props.Document.GetNumber(KeyStore.BorderRounding, 0);
        return br >= 0 ? br :
            this.props.Document.GetNumber(KeyStore.NativeWidth, 0) === 0 ?
                Math.min(this.props.PanelWidth(), this.props.PanelHeight())
                :
                Math.min(this.props.Document.GetNumber(KeyStore.NativeWidth, 0), this.props.Document.GetNumber(KeyStore.NativeHeight, 0));
    }

    render() {
        let maximizedDoc = this.props.Document.GetT(KeyStore.MaximizedDoc, Document);
        let zoomFade = 1;
        //var zoom = doc.GetNumber(KeyStore.ZoomBasis, 1);
        let transform = this.getTransform().scale(this.contentScaling()).inverse();
        var [sptX, sptY] = transform.transformPoint(0, 0);
        let [bptX, bptY] = transform.transformPoint(this.props.PanelWidth(), this.props.PanelHeight());
        let w = bptX - sptX;
        //zoomFade = area < 100 || area > 800 ? Math.max(0, Math.min(1, 2 - 5 * (zoom < this.scale ? this.scale / zoom : zoom / this.scale))) : 1;
        const screenWidth = 1800;
        let fadeUp = .75 * screenWidth;
        let fadeDown = (maximizedDoc ? .0075 : .075) * screenWidth;
        zoomFade = w < fadeDown  /* || w > fadeUp */ ? Math.max(0, Math.min(1, 2 - (w < fadeDown ? fadeDown / w : w / fadeUp))) : 1;

        return (
            <div className="collectionFreeFormDocumentView-container" ref={this._mainCont}
                onPointerDown={this.onPointerDown}
                onClick={this.onClick}
                style={{
                    opacity: zoomFade,
                    borderRadius: `${this.borderRounding()}px`,
                    transformOrigin: "left top",
                    transform: this.transform,
                    pointerEvents: (zoomFade < 0.09 ? "none" : "all"),
                    width: this.width,
                    height: this.height,
                    position: "absolute",
                    zIndex: this.zIndex,
                    backgroundColor: "transparent"
                }} >
                {this.docView}
            </div>
        );
    }
}