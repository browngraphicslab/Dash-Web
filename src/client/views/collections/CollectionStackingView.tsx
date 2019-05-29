import React = require("react");
import { observer } from "mobx-react";
import { CollectionSubView, CollectionViewProps, SubCollectionViewProps } from "./CollectionSubView";
import { Doc, WidthSym, HeightSym, DocListCast } from "../../../new_fields/Doc";
import { DocumentView } from "../nodes/DocumentView";
import { Transform } from "../../util/Transform";
import { emptyFunction, returnOne, Utils } from "../../../Utils";
import "./CollectionStackingView.scss";
import { action, reaction, trace, computed } from "mobx";
import { StrCast, NumCast } from "../../../new_fields/Types";
import { Id } from "../../../new_fields/FieldSymbols";



@observer
export class CollectionStackingView extends CollectionSubView(doc => doc) {

    get gridGap() { return 10; }
    get gridSize() { return 20; }
    get itemWidth() { return NumCast(this.props.Document.itemWidth, 250); }

    constructor(props: SubCollectionViewProps) {
        super(props);
    }

    @action
    moveDocument = (doc: Doc, targetCollection: Doc, addDocument: (document: Doc) => boolean): boolean => {
        this.props.removeDocument(doc);
        addDocument(doc);
        return true;
    }
    getDocTransform(doc: Doc, dref: HTMLDivElement) {
        let { scale, translateX, translateY } = Utils.GetScreenTransform(dref);
        let outerXf = Utils.GetScreenTransform(this.masonryGridRef!);
        let offset = this.props.ScreenToLocalTransform().transformDirection(outerXf.translateX - translateX, outerXf.translateY - translateY);
        return this.props.ScreenToLocalTransform().translate(offset[0], offset[1]).scale(NumCast(doc.width, 1) / this.itemWidth);
    }
    masonryGridRef: HTMLDivElement | null = null;
    createRef = (ele: HTMLDivElement | null) => {
        this.masonryGridRef = ele;
        this.createDropTarget(ele!);
    }
    @computed
    get children() {
        return this.childDocs.map(d => {
            let colSpan = Math.ceil((this.itemWidth + this.gridGap) / (this.gridSize + this.gridGap));
            let rowSpan = Math.ceil((this.itemWidth / d[WidthSym]() * d[HeightSym]() + this.gridGap) / (this.gridSize + this.gridGap));
            let dref = React.createRef<HTMLDivElement>();
            let dxf = () => this.getDocTransform(d, dref.current!);
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
                    transform: `scale(${this.itemWidth / NumCast(d.nativeWidth, d[WidthSym]())}, ${this.itemWidth / NumCast(d.nativeWidth, d[WidthSym]())})`
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
                    toggleMinimized={emptyFunction}
                    whenActiveChanged={this.props.whenActiveChanged} />
            </div>);
        })
    }
    onClick = (e: React.MouseEvent) => {
        if (this.props.active()) {
            let rect = (this.masonryGridRef!.firstChild! as HTMLElement).getBoundingClientRect();
            if (e.clientX < rect.left || e.clientX > rect.right || e.clientY > rect.bottom) this.props.select(false);
            e.stopPropagation();
        }
    }
    render() {
        let leftMargin = 20;
        let topMargin = 20;
        let itemCols = Math.ceil(this.itemWidth / (this.gridSize + this.gridGap));
        let cells = Math.floor((this.props.PanelWidth() - leftMargin) / (itemCols * (this.gridSize + this.gridGap)));
        return (
            <div className="collectionStackingView" ref={this.createRef} onClick={this.onClick} onWheel={(e: React.WheelEvent) => e.stopPropagation()}>
                <div className="collectionStackingview-masonryGrid"
                    style={{
                        padding: `${topMargin}px 0px 0px ${leftMargin}px`,
                        width: `${cells * itemCols * (this.gridSize + this.gridGap) + leftMargin}`,
                        height: "auto",
                        marginLeft: "auto", marginRight: "auto", position: "relative",
                        gridGap: this.gridGap,
                        gridTemplateColumns: `repeat(auto-fill, minmax(${this.gridSize}px,1fr))`,
                        gridAutoRows: `${this.gridSize}px`
                    }}
                >
                    {this.children}
                </div>
            </div>
        );
    }
}