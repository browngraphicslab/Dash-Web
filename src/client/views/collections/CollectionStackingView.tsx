import React = require("react");
import { action, computed, IReactionDisposer, reaction, trace } from "mobx";
import { observer } from "mobx-react";
import { Doc, HeightSym, WidthSym } from "../../../new_fields/Doc";
import { Id } from "../../../new_fields/FieldSymbols";
import { BoolCast, NumCast } from "../../../new_fields/Types";
import { emptyFunction, returnOne, Utils } from "../../../Utils";
import { ContextMenu } from "../ContextMenu";
import { DocumentView } from "../nodes/DocumentView";
import { CollectionSchemaPreview } from "./CollectionSchemaView";
import "./CollectionStackingView.scss";
import { CollectionSubView } from "./CollectionSubView";
import { Transform } from "../../util/Transform";

@observer
export class CollectionStackingView extends CollectionSubView(doc => doc) {
    _masonryGridRef: HTMLDivElement | null = null;
    _heightDisposer?: IReactionDisposer;
    _gridSize = 1;
    @computed get xMargin() { return NumCast(this.props.Document.xMargin, 2 * this.gridGap); }
    @computed get yMargin() { return NumCast(this.props.Document.yMargin, 2 * this.gridGap); }
    @computed get gridGap() { return NumCast(this.props.Document.gridGap, 10); }
    @computed get singleColumn() { return BoolCast(this.props.Document.singleColumn, true); }
    @computed get columnWidth() { return this.singleColumn ? (this.props.PanelWidth() / (this.props as any).ContentScaling() - 2 * this.xMargin) : Math.min(this.props.PanelWidth() - 2 * this.xMargin, NumCast(this.props.Document.columnWidth, 250)); }

    singleColDocHeight(d: Doc) {
        let nw = NumCast(d.nativeWidth);
        let nh = NumCast(d.nativeHeight);
        let aspect = nw && nh ? nh / nw : 1;
        let wid = Math.min(d[WidthSym](), this.columnWidth);
        return (nw && nh) ? wid * aspect : d[HeightSym]();
    }
    componentDidMount() {
        this._heightDisposer = reaction(() => [this.yMargin, this.gridGap, this.columnWidth, this.childDocs.map(d => [d.height, d.width, d.zoomBasis, d.nativeHeight, d.nativeWidth, d.isMinimized])],
            () => {
                if (this.singleColumn) {
                    let children = this.childDocs.filter(d => !d.isMinimized);
                    this.props.Document.height = children.reduce((height, d, i) =>
                        height + this.singleColDocHeight(d) + (i === children.length - 1 ? this.yMargin : this.gridGap)
                        , this.yMargin);
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

    @computed
    get singleColumnChildren() {
        let children = this.childDocs.filter(d => !d.isMinimized);
        return children.map((d, i) => {
            let dref = React.createRef<HTMLDivElement>();
            let dxf = () => this.getDocTransform(d, dref.current!).scale(this.columnWidth / d[WidthSym]());
            let width = () => d.nativeWidth ? Math.min(d[WidthSym](), this.columnWidth) : this.columnWidth;
            let height = () => this.singleColDocHeight(d);
            return <div className="collectionStackingView-columnDoc"
                key={d[Id]}
                ref={dref}
                style={{ width: width(), height: height() }} >
                <CollectionSchemaPreview
                    Document={d}
                    DataDocument={this.props.DataDoc !== this.props.Document ? this.props.DataDoc : d}
                    width={width}
                    height={height}
                    getTransform={dxf}
                    CollectionView={this.props.CollectionView}
                    addDocument={this.props.addDocument}
                    moveDocument={this.props.moveDocument}
                    removeDocument={this.props.removeDocument}
                    active={this.props.active}
                    whenActiveChanged={this.props.whenActiveChanged}
                    addDocTab={this.props.addDocTab}
                    setPreviewScript={emptyFunction}
                    previewScript={undefined}>
                </CollectionSchemaPreview>
            </div>;
        });
    }
    @computed
    get children() {
        return this.childDocs.filter(d => !d.isMinimized).map((d, i) => {
            let aspect = d.nativeHeight ? NumCast(d.nativeWidth) / NumCast(d.nativeHeight) : undefined;
            let dref = React.createRef<HTMLDivElement>();
            let dxf = () => this.getDocTransform(d, dref.current!).scale(this.columnWidth / d[WidthSym]());
            let width = () => d.nativeWidth ? Math.min(d[WidthSym](), this.columnWidth) : this.columnWidth;
            let height = () => aspect ? width() / aspect : d[HeightSym]()
            let rowSpan = Math.ceil((height() + this.gridGap) / (this._gridSize + this.gridGap));
            return (<div className="collectionStackingView-masonryDoc"
                key={d[Id]}
                ref={dref}
                style={{ gridRowEnd: `span ${rowSpan}` }} >
                <CollectionSchemaPreview
                    Document={d}
                    DataDocument={this.props.DataDoc !== this.props.Document ? this.props.DataDoc : d}
                    CollectionView={this.props.CollectionView}
                    addDocument={this.props.addDocument}
                    moveDocument={this.props.moveDocument}
                    removeDocument={this.props.removeDocument}
                    getTransform={dxf}
                    width={width}
                    height={height}
                    active={this.props.active}
                    addDocTab={this.props.addDocTab}
                    whenActiveChanged={this.props.whenActiveChanged}
                    setPreviewScript={emptyFunction}
                    previewScript={undefined}>
                </CollectionSchemaPreview>
            </div>);
        });
    }
    onContextMenu = (e: React.MouseEvent): void => {
        if (!e.isPropagationStopped() && this.props.Document[Id] !== "mainDoc") { // need to test this because GoldenLayout causes a parallel hierarchy in the React DOM for its children and the main document view7
            ContextMenu.Instance.addItem({
                description: "Toggle multi-column",
                event: () => this.props.Document.singleColumn = !BoolCast(this.props.Document.singleColumn, true), icon: "file-pdf"
            });
        }
    }
    render() {
        let cols = this.singleColumn ? 1 : Math.max(1, Math.min(this.childDocs.filter(d => !d.isMinimized).length,
            Math.floor((this.props.PanelWidth() - 2 * this.xMargin) / (this.columnWidth + this.gridGap))));
        let templatecols = "";
        for (let i = 0; i < cols; i++) templatecols += `${this.columnWidth}px `;
        return (
            <div className="collectionStackingView" ref={this.createRef} onContextMenu={this.onContextMenu} onWheel={(e: React.WheelEvent) => e.stopPropagation()} >
                <div className={`collectionStackingView-masonry${this.singleColumn ? "Single" : "Grid"}`}

                    style={{
                        padding: this.singleColumn ? `${this.yMargin}px ${this.xMargin}px ${this.yMargin}px ${this.xMargin}px` : `${this.yMargin}px ${this.xMargin}px`,
                        margin: "auto",
                        width: this.singleColumn ? undefined : `${cols * (this.columnWidth + this.gridGap) + 2 * this.xMargin - this.gridGap}px`,
                        height: "100%",
                        position: "relative",
                        gridGap: this.gridGap,
                        gridTemplateColumns: this.singleColumn ? undefined : templatecols,
                        gridAutoRows: this.singleColumn ? undefined : `${this._gridSize}px`
                    }}
                >
                    {this.singleColumn ? this.singleColumnChildren : this.children}
                </div>
            </div>
        );
    }
}