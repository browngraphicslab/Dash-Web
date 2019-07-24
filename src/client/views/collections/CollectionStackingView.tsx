import React = require("react");
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { action, computed, IReactionDisposer, reaction, untracked, observable, runInAction } from "mobx";
import { observer } from "mobx-react";
import { Doc, HeightSym, WidthSym } from "../../../new_fields/Doc";
import { Id } from "../../../new_fields/FieldSymbols";
import { BoolCast, NumCast, Cast, StrCast } from "../../../new_fields/Types";
import { emptyFunction, Utils, returnTrue } from "../../../Utils";
import { CollectionSchemaPreview } from "./CollectionSchemaView";
import "./CollectionStackingView.scss";
import { CollectionSubView } from "./CollectionSubView";
import { undoBatch } from "../../util/UndoManager";
import { DragManager } from "../../util/DragManager";
import { DocumentType } from "../../documents/Documents";
import { Transform } from "../../util/Transform";
import { CursorProperty } from "csstype";

@observer
export class CollectionStackingView extends CollectionSubView(doc => doc) {
    _masonryGridRef: HTMLDivElement | null = null;
    _draggerRef = React.createRef<HTMLDivElement>();
    _heightDisposer?: IReactionDisposer;
    _docXfs: any[] = [];
    _columnStart: number = 0;
    @observable private cursor: CursorProperty = "grab";
    @computed get xMargin() { return NumCast(this.props.Document.xMargin, 2 * this.gridGap); }
    @computed get yMargin() { return NumCast(this.props.Document.yMargin, 2 * this.gridGap); }
    @computed get gridGap() { return NumCast(this.props.Document.gridGap, 10); }
    @computed get singleColumn() { return BoolCast(this.props.Document.singleColumn, true); }
    @computed get columnWidth() { return this.singleColumn ? (this.props.PanelWidth() / (this.props as any).ContentScaling() - 2 * this.xMargin) : Math.min(this.props.PanelWidth() - 2 * this.xMargin, NumCast(this.props.Document.columnWidth, 250)); }
    @computed get filteredChildren() { return this.childDocs.filter(d => !d.isMinimized); }

    @computed get Sections() {
        let sectionFilter = StrCast(this.props.Document.sectionFilter);
        let fields = new Map<object, Doc[]>();
        sectionFilter && this.filteredChildren.map(d => {
            let sectionValue = (d[sectionFilter] ? d[sectionFilter] : "-undefined-") as object;
            if (!fields.has(sectionValue)) fields.set(sectionValue, [d]);
            else fields.get(sectionValue)!.push(d);
        });
        return fields;
    }
    componentDidMount() {
        this._heightDisposer = reaction(() => [this.yMargin, this.gridGap, this.columnWidth, this.childDocs.map(d => [d.height, d.width, d.zoomBasis, d.nativeHeight, d.nativeWidth, d.isMinimized])],
            () => this.singleColumn &&
                (this.props.Document.height = this.Sections.size * 50 + this.filteredChildren.reduce((height, d, i) =>
                    height + this.getDocHeight(d) + (i === this.filteredChildren.length - 1 ? this.yMargin : this.gridGap), this.yMargin))
            , { fireImmediately: true });
    }
    componentWillUnmount() {
        this._heightDisposer && this._heightDisposer();
    }

    @action
    moveDocument = (doc: Doc, targetCollection: Doc, addDocument: (document: Doc) => boolean): boolean => {
        return this.props.removeDocument(doc) && addDocument(doc);
    }
    createRef = (ele: HTMLDivElement | null) => {
        this._masonryGridRef = ele;
        this.createDropTarget(ele!);
    }

    overlays = (doc: Doc) => {
        return doc.type === DocumentType.IMG || doc.type === DocumentType.VID ? { title: "title", caption: "caption" } : {};
    }

    getDisplayDoc(layoutDoc: Doc, d: Doc, dxf: () => Transform) {
        let resolvedDataDoc = !this.props.Document.isTemplate && this.props.DataDoc !== this.props.Document ? this.props.DataDoc : undefined;
        let width = () => d.nativeWidth ? Math.min(layoutDoc[WidthSym](), this.columnWidth) : this.columnWidth;
        let height = () => this.getDocHeight(layoutDoc);
        let finalDxf = () => dxf().scale(this.columnWidth / layoutDoc[WidthSym]());
        return <CollectionSchemaPreview
            Document={layoutDoc}
            DataDocument={resolvedDataDoc}
            showOverlays={this.overlays}
            renderDepth={this.props.renderDepth}
            fitToBox={true}
            width={width}
            height={height}
            getTransform={finalDxf}
            CollectionView={this.props.CollectionView}
            addDocument={this.props.addDocument}
            moveDocument={this.props.moveDocument}
            removeDocument={this.props.removeDocument}
            active={this.props.active}
            whenActiveChanged={this.props.whenActiveChanged}
            addDocTab={this.props.addDocTab}
            setPreviewScript={emptyFunction}
            previewScript={undefined}>
        </CollectionSchemaPreview>;
    }
    getDocHeight(d: Doc) {
        let nw = NumCast(d.nativeWidth);
        let nh = NumCast(d.nativeHeight);
        let aspect = nw && nh ? nh / nw : 1;
        let wid = Math.min(d[WidthSym](), this.columnWidth);
        return (nw && nh) ? wid * aspect : d[HeightSym]();
    }

    offsetTransform(doc: Doc, translateX: number, translateY: number) {
        let outerXf = Utils.GetScreenTransform(this._masonryGridRef!);
        let offset = this.props.ScreenToLocalTransform().transformDirection(outerXf.translateX - translateX, outerXf.translateY - translateY);
        return this.props.ScreenToLocalTransform().translate(offset[0], offset[1]).scale(NumCast(doc.width, 1) / this.columnWidth);
    }
    getDocTransform(doc: Doc, dref: HTMLDivElement) {
        let { scale, translateX, translateY } = Utils.GetScreenTransform(dref);
        return this.offsetTransform(doc, translateX, translateY);
    }

    getSingleDocTransform(doc: Doc, ind: number, width: number) {
        let localY = this.filteredChildren.reduce((height, d, i) =>
            height + (i < ind ? this.getDocHeight(Doc.expandTemplateLayout(d, this.props.DataDoc)) + this.gridGap : 0), this.yMargin);
        let translate = this.props.ScreenToLocalTransform().inverse().transformPoint((this.props.PanelWidth() - width) / 2, localY);
        return this.offsetTransform(doc, translate[0], translate[1]);
    }

    children(docs: Doc[]) {
        this._docXfs.length = 0;
        return docs.map((d, i) => {
            let layoutDoc = Doc.expandTemplateLayout(d, this.props.DataDoc);
            let width = () => d.nativeWidth ? Math.min(layoutDoc[WidthSym](), this.columnWidth) : this.columnWidth;
            let height = () => this.getDocHeight(layoutDoc);
            if (this.singleColumn) {
                //have to add the height of all previous single column sections or the doc decorations will be in the wrong place.
                let dxf = () => this.getSingleDocTransform(layoutDoc, i, width());
                let rowHgtPcnt = height();
                this._docXfs.push({ dxf: dxf, width: width, height: height });
                return <div className="collectionStackingView-columnDoc" key={d[Id]} style={{ width: width(), marginTop: i === 0 ? 0 : this.gridGap, height: `${rowHgtPcnt}` }} >
                    {this.getDisplayDoc(layoutDoc, d, dxf)}
                </div>;
            } else {
                let dref = React.createRef<HTMLDivElement>();
                let dxf = () => this.getDocTransform(layoutDoc, dref.current!);
                let rowSpan = Math.ceil((height() + this.gridGap) / this.gridGap);
                this._docXfs.push({ dxf: dxf, width: width, height: height });
                return <div className="collectionStackingView-masonryDoc" key={d[Id]} ref={dref} style={{ gridRowEnd: `span ${rowSpan}` }} >
                    {this.getDisplayDoc(layoutDoc, d, dxf)}
                </div>;
            }
        });
    }

    columnDividerDown = (e: React.PointerEvent) => {
        e.stopPropagation();
        e.preventDefault();
        runInAction(() => this.cursor = "grabbing");
        document.addEventListener("pointermove", this.onDividerMove);
        document.addEventListener('pointerup', this.onDividerUp);
        this._columnStart = this.props.ScreenToLocalTransform().transformPoint(e.clientX, e.clientY)[0];
    }
    @action
    onDividerMove = (e: PointerEvent): void => {
        let dragPos = this.props.ScreenToLocalTransform().transformPoint(e.clientX, e.clientY)[0];
        let delta = dragPos - this._columnStart;
        this._columnStart = dragPos;
        this.props.Document.columnWidth = this.columnWidth + delta;
    }

    @action
    onDividerUp = (e: PointerEvent): void => {
        runInAction(() => this.cursor = "grab");
        document.removeEventListener("pointermove", this.onDividerMove);
        document.removeEventListener('pointerup', this.onDividerUp);
    }

    @computed get columnDragger() {
        return <div className="collectionStackingView-columnDragger" onPointerDown={this.columnDividerDown} ref={this._draggerRef} style={{ cursor: this.cursor, left: `${this.columnWidth + this.xMargin}px` }} >
            <FontAwesomeIcon icon={"arrows-alt-h"} />
        </div>;
    }

    @undoBatch
    @action
    drop = (e: Event, de: DragManager.DropEvent) => {
        let targInd = -1;
        let where = [de.x, de.y];
        if (de.data instanceof DragManager.DocumentDragData) {
            this._docXfs.map((cd, i) => {
                let pos = cd.dxf().inverse().transformPoint(-2 * this.gridGap, -2 * this.gridGap);
                let pos1 = cd.dxf().inverse().transformPoint(cd.width(), cd.height());
                if (where[0] > pos[0] && where[0] < pos1[0] && where[1] > pos[1] && where[1] < pos1[1]) {
                    targInd = i;
                }
            });
        }
        if (super.drop(e, de)) {
            let newDoc = de.data.droppedDocuments[0];
            let docs = this.childDocList;
            if (docs) {
                if (targInd === -1) targInd = docs.length;
                else targInd = docs.indexOf(this.filteredChildren[targInd]);
                let srcInd = docs.indexOf(newDoc);
                docs.splice(srcInd, 1);
                docs.splice(targInd > srcInd ? targInd - 1 : targInd, 0, newDoc);
            }
        }
        return false;
    }
    @undoBatch
    @action
    onDrop = (e: React.DragEvent): void => {
        let where = [e.clientX, e.clientY];
        let targInd = -1;
        this._docXfs.map((cd, i) => {
            let pos = cd.dxf().inverse().transformPoint(-2 * this.gridGap, -2 * this.gridGap);
            let pos1 = cd.dxf().inverse().transformPoint(cd.width(), cd.height());
            if (where[0] > pos[0] && where[0] < pos1[0] && where[1] > pos[1] && where[1] < pos1[1]) {
                targInd = i;
            }
        });
        super.onDrop(e, {}, () => {
            if (targInd !== -1) {
                let newDoc = this.childDocs[this.childDocs.length - 1];
                let docs = this.childDocList;
                if (docs) {
                    docs.splice(docs.length - 1, 1);
                    docs.splice(targInd, 0, newDoc);
                }
            }
        });
    }
    section(heading: string, docList: Doc[]) {
        let cols = this.singleColumn ? 1 : Math.max(1, Math.min(this.filteredChildren.length,
            Math.floor((this.props.PanelWidth() - 2 * this.xMargin) / (this.columnWidth + this.gridGap))));
        let templatecols = "";
        for (let i = 0; i < cols; i++) templatecols += `${this.columnWidth}px `;
        return <div key={heading}>
            {heading ? <div key={`${heading}`} className="collectionStackingView-sectionHeader">{heading}</div> : (null)}
            <div key={`${heading}-stack`} className={`collectionStackingView-masonry${this.singleColumn ? "Single" : "Grid"}`}
                style={{
                    padding: this.singleColumn ? `${this.yMargin}px ${this.xMargin}px ${this.yMargin}px ${this.xMargin}px` : `${this.yMargin}px ${this.xMargin}px`,
                    margin: "auto",
                    width: this.singleColumn ? undefined : `${cols * (this.columnWidth + this.gridGap) + 2 * this.xMargin - this.gridGap}px`,
                    height: 'max-content',
                    position: "relative",
                    gridGap: this.gridGap,
                    gridTemplateColumns: this.singleColumn ? undefined : templatecols,
                    gridAutoRows: this.singleColumn ? undefined : "0px"
                }}
            >
                {this.children(docList)}
                {this.singleColumn ? (null) : this.columnDragger}
            </div></div>;
    }
    render() {
        return (
            <div className="collectionStackingView"
                ref={this.createRef} onDrop={this.onDrop.bind(this)} onWheel={(e: React.WheelEvent) => e.stopPropagation()} >
                {/* {sectionFilter as boolean ? [
                    ["width > height", this.filteredChildren.filter(f => f[WidthSym]() >= 1 + f[HeightSym]())],
                    ["width = height", this.filteredChildren.filter(f => Math.abs(f[WidthSym]() - f[HeightSym]()) < 1)],
                    ["height > width", this.filteredChildren.filter(f => f[WidthSym]() + 1 <= f[HeightSym]())]]. */}
                {this.props.Document.sectionFilter ? Array.from(this.Sections.entries()).
                    map(section => this.section(section[0].toString(), section[1])) :
                    this.section("", this.filteredChildren)}
            </div>
        );
    }
}