import React = require("react");
import { observer } from "mobx-react";
import { number } from "prop-types";
import { Doc, WidthSym } from "../../../new_fields/Doc";
import { CollectionStackingView } from "./CollectionStackingView";
import { Id } from "../../../new_fields/FieldSymbols";
import { Utils } from "../../../Utils";
import { NumCast, StrCast } from "../../../new_fields/Types";
import { EditableView } from "../EditableView";
import { action, observable } from "mobx";
import { undoBatch } from "../../util/UndoManager";
import { DragManager } from "../../util/DragManager";
import { DocumentManager } from "../../util/DocumentManager";
import { SelectionManager } from "../../util/SelectionManager";
import "./CollectionStackingView.scss";
import { Docs } from "../../documents/Documents";


interface CSVFieldColumnProps {
    cols: () => number;
    headings: () => object[];
    heading: string;
    docList: Doc[];
    parent: CollectionStackingView;
    type: "string" | "number" | "bigint" | "boolean" | "symbol" | "undefined" | "object" | "function" | undefined;
    createDropTarget: (ele: HTMLDivElement) => void;
}

@observer
export class CollectionStackingViewFieldColumn extends React.Component<CSVFieldColumnProps> {
    @observable private _background = "white";

    private _dropRef: HTMLDivElement | null = null;
    private dropDisposer?: DragManager.DragDropDisposer;

    createColumnDropRef = (ele: HTMLDivElement | null) => {
        this._dropRef = ele;
        this.dropDisposer && this.dropDisposer();
        if (ele) {
            this.dropDisposer = DragManager.MakeDropTarget(ele, { handlers: { drop: this.columnDrop.bind(this) } });
        }
    }

    @undoBatch
    @action
    columnDrop = (e: Event, de: DragManager.DropEvent) => {
        if (de.data instanceof DragManager.DocumentDragData) {
            let key = StrCast(this.props.parent.props.Document.sectionFilter);
            let castedValue = this.getValue(this.props.heading);
            if (castedValue) {
                de.data.droppedDocuments.forEach(d => d[key] = castedValue);
            }
            this.props.parent.drop(e, de);
            e.stopPropagation();
        }
    }

    children(docs: Doc[]) {
        let style = this.props.parent;
        this.props.parent._docXfs.length = 0;
        return docs.map((d, i) => {
            let layoutDoc = Doc.expandTemplateLayout(d, this.props.parent.props.DataDoc);
            let headings = this.props.headings();
            let uniqueHeadings = headings.map((i, idx) => headings.indexOf(i) === idx);
            let width = () => (d.nativeWidth ? Math.min(layoutDoc[WidthSym](), style.columnWidth) : style.columnWidth) / (uniqueHeadings.length + 1);
            let height = () => this.props.parent.getDocHeight(layoutDoc);
            if (style.singleColumn) {
                let dxf;
                let dref = React.createRef<HTMLDivElement>();
                if (uniqueHeadings.length > 0) {
                    dxf = () => this.getDocTransform(layoutDoc, dref.current!);
                    this.props.parent._docXfs.push({ dxf: dxf, width: width, height: height });
                }
                else {
                    //have to add the height of all previous single column sections or the doc decorations will be in the wrong place.
                    dxf = () => this.getSingleDocTransform(layoutDoc, i, width());
                    this.props.parent._docXfs.push({ dxf: dxf, width: width, height: height });
                }
                let rowHgtPcnt = height();
                return <div className="collectionStackingView-columnDoc" key={d[Id]} ref={dref} style={{ width: width(), marginTop: i === 0 ? 0 : style.gridGap, height: `${rowHgtPcnt}` }} >
                    {this.props.parent.getDisplayDoc(layoutDoc, d, dxf)}
                </div>;
            } else {
                let dref = React.createRef<HTMLDivElement>();
                let dxf = () => this.getDocTransform(layoutDoc, dref.current!);
                let rowSpan = Math.ceil((height() + style.gridGap) / style.gridGap);
                this.props.parent._docXfs.push({ dxf: dxf, width: width, height: height });
                return <div className="collectionStackingView-masonryDoc" key={d[Id]} ref={dref} style={{ gridRowEnd: `span ${rowSpan}` }} >
                    {this.props.parent.getDisplayDoc(layoutDoc, d, dxf)}
                </div>;
            }
        });
    }

    getSingleDocTransform(doc: Doc, ind: number, width: number) {
        let localY = this.props.parent.filteredChildren.reduce((height, d, i) =>
            height + (i < ind ? this.props.parent.getDocHeight(Doc.expandTemplateLayout(d, this.props.parent.props.DataDoc)) + this.props.parent.gridGap : 0), this.props.parent.yMargin);
        let translate = this.props.parent.props.ScreenToLocalTransform().inverse().transformPoint((this.props.parent.props.PanelWidth() - width) / 2, localY);
        return this.offsetTransform(doc, translate[0], translate[1]);
    }

    offsetTransform(doc: Doc, translateX: number, translateY: number) {
        let outerXf = Utils.GetScreenTransform(this.props.parent._masonryGridRef!);
        let offset = this.props.parent.props.ScreenToLocalTransform().transformDirection(outerXf.translateX - translateX, outerXf.translateY - translateY);
        return this.props.parent.props.ScreenToLocalTransform().translate(offset[0], offset[1]).scale(NumCast(doc.width, 1) / this.props.parent.columnWidth);
    }

    getDocTransform(doc: Doc, dref: HTMLDivElement) {
        let { scale, translateX, translateY } = Utils.GetScreenTransform(dref);
        return this.offsetTransform(doc, translateX, translateY);
    }

    getValue = (value: string): any => {
        let parsed = parseInt(value);
        if (!isNaN(parsed)) {
            return parsed;
        }
        if (value.toLowerCase().indexOf("true") > -1) {
            return true;
        }
        if (value.toLowerCase().indexOf("false") > -1) {
            return false;
        }
        return value;
    }

    headingChanged = (value: string, shiftDown?: boolean) => {
        let key = StrCast(this.props.parent.props.Document.sectionFilter);
        let castedValue = this.getValue(value);
        if (castedValue) {
            this.props.docList.forEach(d => d[key] = castedValue);
            return true;
        }
        return false;
    }

    @action
    pointerEntered = () => {
        if (SelectionManager.GetIsDragging()) {
            this._background = "#b4b4b4";
        }
    }

    @action
    pointerLeave = () => {
        this._background = "white";
    }

    @action
    addDocument = () => {
        let key = StrCast(this.props.parent.props.Document.sectionFilter);
        let newDoc = Docs.Create.TextDocument({ height: 18, title: "new text document" });
        newDoc[key] = this.getValue(this.props.heading);
        this.props.parent.props.addDocument(newDoc);
    }

    render() {
        let cols = this.props.cols();
        let templatecols = "";
        let headings = this.props.headings();
        let heading = this.props.heading;
        let style = this.props.parent;
        let singleColumn = style.singleColumn;
        let uniqueHeadings = headings.map((i, idx) => headings.indexOf(i) === idx);
        let editableViewProps = {
            GetValue: () => heading,
            SetValue: this.headingChanged,
            contents: heading,
        }
        let headingView = heading ?
            <div key={heading} className="collectionStackingView-sectionHeader"
                style={{ width: (style.columnWidth) / (uniqueHeadings.length + 1) }}>
                <EditableView {...editableViewProps} />
            </div> : (null);
        for (let i = 0; i < cols; i++) templatecols += `${style.columnWidth}px `;
        return (
            <div key={heading} style={{ width: `${100 / (uniqueHeadings.length + 1)}%`, background: this._background }}
                ref={this.createColumnDropRef} onPointerEnter={this.pointerEntered} onPointerLeave={this.pointerLeave}>
                {headingView}
                <div key={`${heading}-stack`} className={`collectionStackingView-masonry${singleColumn ? "Single" : "Grid"}`}
                    style={{
                        padding: singleColumn ? `${style.yMargin}px ${0}px ${style.yMargin}px ${0}px` : `${style.yMargin}px ${0}px`,
                        margin: "auto",
                        width: singleColumn ? undefined : `${cols * (style.columnWidth + style.gridGap) + 2 * style.xMargin - style.gridGap}px`,
                        height: 'max-content',
                        position: "relative",
                        gridGap: style.gridGap,
                        gridTemplateColumns: singleColumn ? undefined : templatecols,
                        gridAutoRows: singleColumn ? undefined : "0px"
                    }}
                >
                    {this.children(this.props.docList)}
                    {singleColumn ? (null) : this.props.parent.columnDragger}
                </div>
                <div key={`${heading}-add-document`} className="collectionStackingView-addDocumentButton"
                    style={{ width: style.columnWidth / (uniqueHeadings.length + 1) }}>
                    <button style={{ width: "100%" }} onClick={this.addDocument}>+ New</button>
                </div>
            </div>
        );
    }
}