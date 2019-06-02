import React = require("react");
import { action, computed, IReactionDisposer, reaction } from "mobx";
import { observer } from "mobx-react";
import { Doc, HeightSym, WidthSym } from "../../../new_fields/Doc";
import { Id } from "../../../new_fields/FieldSymbols";
import { BoolCast, NumCast } from "../../../new_fields/Types";
import { emptyFunction, returnOne, Utils } from "../../../Utils";
import { SelectionManager } from "../../util/SelectionManager";
import { undoBatch } from "../../util/UndoManager";
import { DocumentView } from "../nodes/DocumentView";
import "./CollectionStackingView.scss";
import { CollectionSubView } from "./CollectionSubView";
import { CollectionSchemaPreview } from "./CollectionSchemaView";

@observer
export class CollectionStackingView extends CollectionSubView(doc => doc) {
    _masonryGridRef: HTMLDivElement | null = null;
    _heightDisposer?: IReactionDisposer;
    get gridGap() { return 10; }
    get gridSize() { return 20; }
    get singleColumn() { return BoolCast(this.props.Document.singleColumn, true); }
    get columnWidth() { return this.singleColumn ? this.props.PanelWidth() - 2 * this.gridSize - this.gridGap : NumCast(this.props.Document.columnWidth, 250); }

    componentDidMount() {
        this._heightDisposer = reaction(() => [this.childDocs.map(d => [d[HeightSym](), d.isMinimized]), this.props.PanelHeight(), this.props.PanelWidth()],
            () => {
                if (this.singleColumn) {
                    this.props.Document.height = this.childDocs.filter(d => !d.isMinimized).reduce((height, d) => {
                        let hgt = d[HeightSym]();
                        let nw = NumCast(d.nativeWidth);
                        let nh = NumCast(d.nativeHeight);
                        if (nw && nh) hgt = nh / nw * Math.min(this.columnWidth, d[WidthSym]());
                        let rowSpan = Math.ceil((hgt + this.gridGap) / (this.gridSize + this.gridGap));
                        return height + rowSpan * (this.gridSize + this.gridGap);
                    }, 10);
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
        return this.childDocs.filter(d => !d.isMinimized).map(d => {
            let dref = React.createRef<HTMLDivElement>();
            let script = undefined;
            let colWidth = () => this.columnWidth;
            let rowHeight = () => {
                let hgt = d[HeightSym]();
                let nw = NumCast(d.nativeWidth);
                let nh = NumCast(d.nativeHeight);
                if (nw && nh) hgt = nh / nw * Math.min(this.columnWidth, d[WidthSym]());
                return hgt;
            }
            let dxf = () => this.getDocTransform(d, dref.current!).scale(this.columnWidth / d[WidthSym]());
            return <div className="colletionStackingView-masonryDoc"
                key={d[Id]}
                ref={dref}
                style={{ width: colWidth(), height: rowHeight() }} >
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
            let colSpan = Math.ceil((this.columnWidth + this.gridGap) / (this.gridSize + this.gridGap));
            let rowSpan = Math.ceil((this.columnWidth / d[WidthSym]() * d[HeightSym]() + this.gridGap) / (this.gridSize + this.gridGap));
            let childFocus = (doc: Doc) => {
                doc.libraryBrush = true;
                this.props.focus(this.props.Document); // just focus on this collection, not the underlying document because the API doesn't support adding an offset to focus on and we can't pan zoom our contents to be centered.
            }
            return (<div className="colletionStackingView-masonryDoc"
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
        let leftMargin = 20;
        let topMargin = 20;
        let itemCols = Math.ceil(this.columnWidth / (this.gridSize + this.gridGap));
        let cells = Math.floor((this.props.PanelWidth() - leftMargin) / (itemCols * (this.gridSize + this.gridGap)));
        return (
            <div className="collectionStackingView" style={{ height: "100%" }}
                ref={this.createRef} onWheel={(e: React.WheelEvent) => e.stopPropagation()}>
                <div className="collectionStackingView-masonryGrid"
                    style={{
                        padding: `${topMargin}px 0px 0px ${leftMargin}px`,
                        width: `${cells * itemCols * (this.gridSize + this.gridGap) + leftMargin}`,
                        height: "100%",
                        overflow: "hidden",
                        marginLeft: "auto", marginRight: "auto", position: "relative",
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