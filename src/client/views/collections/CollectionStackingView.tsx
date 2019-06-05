import React = require("react");
import { action, computed, IReactionDisposer, reaction, trace } from "mobx";
import { observer } from "mobx-react";
import { Doc, HeightSym, WidthSym } from "../../../new_fields/Doc";
import { Id } from "../../../new_fields/FieldSymbols";
import { BoolCast, NumCast } from "../../../new_fields/Types";
import { emptyFunction, returnOne, Utils } from "../../../Utils";
import { SelectionManager } from "../../util/SelectionManager";
import { undoBatch } from "../../util/UndoManager";
import { DocumentView } from "../nodes/DocumentView";
import { CollectionSchemaPreview } from "./CollectionSchemaView";
import "./CollectionStackingView.scss";
import { CollectionSubView } from "./CollectionSubView";

@observer
export class CollectionStackingView extends CollectionSubView(doc => doc) {
    _masonryGridRef: HTMLDivElement | null = null;
    _heightDisposer?: IReactionDisposer;
    @computed get gridGap() { return NumCast(this.props.Document.gridGap, 10); }
    @computed get gridSize() { return NumCast(this.props.Document.gridSize, 20); }
    @computed get singleColumn() { return BoolCast(this.props.Document.singleColumn, true); }
    @computed get columnWidth() { return this.singleColumn ? this.props.PanelWidth() - 4 * this.gridGap : NumCast(this.props.Document.columnWidth, 250); }

    componentDidMount() {
        this._heightDisposer = reaction(() => [this.props.Document.gridGap, this.gridSize, this.columnWidth, this.childDocs.map(d => [d.height, d.width, d.zoomBasis, d.nativeHeight, d.nativeWidth, d.isMinimized])],
            () => {
                if (this.singleColumn) {
                    this.props.Document.height = this.childDocs.filter(d => !d.isMinimized).reduce((height, d) => {
                        let hgt = d[HeightSym]();
                        let wid = d[WidthSym]();
                        let nw = NumCast(d.nativeWidth);
                        let nh = NumCast(d.nativeHeight);
                        if (nw && nh) hgt = nh / nw * Math.min(this.columnWidth, wid);
                        return height + hgt + 2 * this.gridGap;
                    }, this.gridGap * 2);
                }
            }, { fireImmediately: true });
    }
    componentWillUnmount() {
        if (this._heightDisposer) this._heightDisposer();
    }

    @action
    moveDocument = (doc: Doc, targetCollection: Doc, addDocument: (document: Doc) => boolean): boolean => {
        this.props.removeDocument(doc);
        addDocument(doc);
        return true;
    }
    getDocTransform(doc: Doc, dref: HTMLDivElement) {
        let { scale, translateX, translateY } = Utils.GetScreenTransform(dref);
        let outerXf = Utils.GetScreenTransform(this._masonryGridRef!);
        let offset = this.props.ScreenToLocalTransform().transformDirection(outerXf.translateX - translateX, outerXf.translateY - translateY);
        return this.props.ScreenToLocalTransform().translate(offset[0], offset[1]).scale(NumCast(doc.width, 1) / this.columnWidth);
    }
    createRef = (ele: HTMLDivElement | null) => {
        this._masonryGridRef = ele;
        this.createDropTarget(ele!);
    }
    @undoBatch
    @action
    public collapseToPoint = (scrpt: number[], expandedDocs: Doc[] | undefined): void => {
        SelectionManager.DeselectAll();
        if (expandedDocs) {
            let isMinimized: boolean | undefined;
            expandedDocs.map(d => Doc.GetProto(d)).map(maximizedDoc => {
                if (isMinimized === undefined) {
                    isMinimized = BoolCast(maximizedDoc.isMinimized, false);
                }
                maximizedDoc.isMinimized = !isMinimized;
            });
        }
    }

    @computed
    get singleColumnChildren() {
        return this.childDocs.filter(d => !d.isMinimized).map((d, i) => {
            let dref = React.createRef<HTMLDivElement>();
            let script = undefined;
            let colWidth = () => d.nativeWidth ? Math.min(d[WidthSym](), this.columnWidth) : this.columnWidth;
            let margin = colWidth() < this.columnWidth ? "auto" : undefined;
            let rowHeight = () => {
                let hgt = d[HeightSym]();
                let nw = NumCast(d.nativeWidth);
                let nh = NumCast(d.nativeHeight);
                if (nw && nh) hgt = nh / nw * colWidth();
                return hgt;
            }
            let dxf = () => this.getDocTransform(d, dref.current!).scale(this.columnWidth / d[WidthSym]());
            return <div className="collectionStackingView-masonryDoc"
                key={d[Id]}
                ref={dref}
                style={{ marginTop: `${i ? 2 * this.gridGap : 0}px`, width: colWidth(), height: rowHeight(), marginLeft: margin, marginRight: margin }} >
                <CollectionSchemaPreview
                    Document={d}
                    width={colWidth}
                    height={rowHeight}
                    getTransform={dxf}
                    CollectionView={this.props.CollectionView}
                    addDocument={this.props.addDocument}
                    removeDocument={this.props.removeDocument}
                    active={this.props.active}
                    whenActiveChanged={this.props.whenActiveChanged}
                    addDocTab={this.props.addDocTab}
                    setPreviewScript={emptyFunction}
                    previewScript={script}>
                </CollectionSchemaPreview>
            </div>;
        });
    }
    @computed
    get children() {
        return this.childDocs.filter(d => !d.isMinimized).map(d => {
            let dref = React.createRef<HTMLDivElement>();
            let dxf = () => this.getDocTransform(d, dref.current!);
            let colSpan = Math.ceil(Math.min(d[WidthSym](), this.columnWidth + this.gridGap) / (this.gridSize + this.gridGap));
            let rowSpan = Math.ceil((this.columnWidth / d[WidthSym]() * d[HeightSym]() + this.gridGap) / (this.gridSize + this.gridGap));
            let childFocus = (doc: Doc) => {
                doc.libraryBrush = true;
                this.props.focus(this.props.Document); // just focus on this collection, not the underlying document because the API doesn't support adding an offset to focus on and we can't pan zoom our contents to be centered.
            }
            return (<div className="collectionStackingView-masonryDoc"
                key={d[Id]}
                ref={dref}
                style={{
                    width: NumCast(d.nativeWidth, d[WidthSym]()),
                    height: NumCast(d.nativeHeight, d[HeightSym]()),
                    transformOrigin: "top left",
                    gridRowEnd: `span ${rowSpan}`,
                    gridColumnEnd: `span ${colSpan}`,
                    transform: `scale(${this.columnWidth / NumCast(d.nativeWidth, d[WidthSym]())}, ${this.columnWidth / NumCast(d.nativeWidth, d[WidthSym]())})`
                }} >
                <DocumentView key={d[Id]} Document={d}
                    addDocument={this.props.addDocument}
                    removeDocument={this.props.removeDocument}
                    moveDocument={this.moveDocument}
                    ContainingCollectionView={this.props.CollectionView}
                    isTopMost={false}
                    ScreenToLocalTransform={dxf}
                    focus={childFocus}
                    ContentScaling={returnOne}
                    PanelWidth={d[WidthSym]}
                    PanelHeight={d[HeightSym]}
                    selectOnLoad={false}
                    parentActive={this.props.active}
                    addDocTab={this.props.addDocTab}
                    bringToFront={emptyFunction}
                    whenActiveChanged={this.props.whenActiveChanged}
                    collapseToPoint={this.collapseToPoint}
                />
            </div>);
        })
    }
    render() {
        let leftMargin = 2 * this.gridGap;
        let topMargin = 2 * this.gridGap;
        let itemCols = Math.ceil(this.columnWidth / (this.gridSize + this.gridGap));
        let cells = Math.floor((this.props.PanelWidth() - leftMargin) / (itemCols * (this.gridSize + this.gridGap)));
        return (
            <div className="collectionStackingView" style={{ height: "100%" }}
                ref={this.createRef} onWheel={(e: React.WheelEvent) => e.stopPropagation()}>
                <div className={`collectionStackingView-masonry${this.singleColumn ? "Single" : "Grid"}`}
                    style={{
                        padding: `${topMargin}px 0px 0px ${leftMargin}px`,
                        width: this.singleColumn ? "100%" : `${cells * itemCols * (this.gridSize + this.gridGap) + leftMargin}`,
                        height: "100%",
                        overflow: "hidden",
                        marginRight: "auto",
                        position: "relative",
                        gridGap: this.gridGap,
                        gridTemplateColumns: this.singleColumn ? undefined : `repeat(auto-fill, minmax(${this.gridSize}px,1fr))`,
                        gridAutoRows: this.singleColumn ? undefined : `${this.gridSize}px`
                    }}
                >
                    {this.singleColumn ? this.singleColumnChildren : this.children}
                </div>
            </div>
        );
    }
}