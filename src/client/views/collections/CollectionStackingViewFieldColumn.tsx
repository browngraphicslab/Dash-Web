import React = require("react");
import { observer } from "mobx-react";
import { number } from "prop-types";
import { Doc, WidthSym } from "../../../new_fields/Doc";
import { CollectionStackingView } from "./CollectionStackingView";
import { Id } from "../../../new_fields/FieldSymbols";
import { Utils } from "../../../Utils";
import { NumCast, StrCast, BoolCast } from "../../../new_fields/Types";
import { EditableView } from "../EditableView";
import { action, observable, computed } from "mobx";
import { undoBatch } from "../../util/UndoManager";
import { DragManager } from "../../util/DragManager";
import { DocumentManager } from "../../util/DocumentManager";
import { SelectionManager } from "../../util/SelectionManager";
import "./CollectionStackingView.scss";
import { Docs } from "../../documents/Documents";
import { SchemaHeaderField, PastelSchemaPalette } from "../../../new_fields/SchemaHeaderField";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { ScriptField } from "../../../new_fields/ScriptField";
import { CompileScript } from "../../util/Scripting";
import { RichTextField } from "../../../new_fields/RichTextField";
import { Transform } from "../../util/Transform";
import { Flyout, anchorPoints } from "../DocumentDecorations";
import { library } from '@fortawesome/fontawesome-svg-core';
import { faPalette } from '@fortawesome/free-solid-svg-icons';

library.add(faPalette);


interface CSVFieldColumnProps {
    cols: () => number;
    headings: () => object[];
    heading: string;
    headingObject: SchemaHeaderField | undefined;
    docList: Doc[];
    parent: CollectionStackingView;
    type: "string" | "number" | "bigint" | "boolean" | "symbol" | "undefined" | "object" | "function" | undefined;
    createDropTarget: (ele: HTMLDivElement) => void;
    screenToLocalTransform: () => Transform;
}

@observer
export class CollectionStackingViewFieldColumn extends React.Component<CSVFieldColumnProps> {
    @observable private _background = "inherit";

    private _dropRef: HTMLDivElement | null = null;
    private dropDisposer?: DragManager.DragDropDisposer;
    private _headerRef: React.RefObject<HTMLDivElement> = React.createRef();
    private _startDragPosition: { x: number, y: number } = { x: 0, y: 0 };
    private _sensitivity: number = 16;

    @observable _heading = this.props.headingObject ? this.props.headingObject.heading : this.props.heading;
    @observable _color = this.props.headingObject ? this.props.headingObject.color : "#f1efeb";

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
            let castedValue = this.getValue(this._heading);
            if (castedValue) {
                de.data.droppedDocuments.forEach(d => d[key] = castedValue);
            }
            else {
                de.data.droppedDocuments.forEach(d => d[key] = undefined);
            }
            this.props.parent.drop(e, de);
            e.stopPropagation();
        }
    }

    children(docs: Doc[]) {
        let parent = this.props.parent;
        parent._docXfs.length = 0;
        return docs.map((d, i) => {
            let headings = this.props.headings();
            let uniqueHeadings = headings.map((i, idx) => headings.indexOf(i) === idx);
            let pair = Doc.GetLayoutDataDocPair(parent.props.Document, parent.props.DataDoc, parent.props.fieldKey, d);
            let width = () => (d.nativeWidth && !BoolCast(d.ignoreAspect) ? Math.min(pair.layout[WidthSym](), parent.columnWidth / (uniqueHeadings.length + 1)) : parent.columnWidth / (uniqueHeadings.length + 1));/// (uniqueHeadings.length + 1);
            let height = () => parent.getDocHeight(pair.layout, uniqueHeadings.length + 1);// / (d.nativeWidth && !BoolCast(d.ignoreAspect) ? uniqueHeadings.length + 1 : 1);
            let dref = React.createRef<HTMLDivElement>();
            // if (uniqueHeadings.length > 0) {
            let dxf = () => this.getDocTransform(pair.layout, dref.current!);
            this.props.parent._docXfs.push({ dxf: dxf, width: width, height: height });
            // }
            // else {
            //     //have to add the height of all previous single column sections or the doc decorations will be in the wrong place.
            //     let dxf = () => this.getDocTransform(layoutDoc, i, width());
            //     this.props.parent._docXfs.push({ dxf: dxf, width: width, height: height });
            // }
            let rowHgtPcnt = height();
            let rowSpan = Math.ceil((height() + parent.gridGap) / parent.gridGap);
            let style = parent.singleColumn ? { width: width(), margin: "auto", marginTop: i === 0 ? 0 : parent.gridGap, height: `${rowHgtPcnt}` } : { gridRowEnd: `span ${rowSpan}` };
            return <div className={`collectionStackingView-${parent.singleColumn ? "columnDoc" : "masonryDoc"}`} key={d[Id]} ref={dref} style={style} >
                {this.props.parent.getDisplayDoc(pair.layout, pair.data, dxf, width)}
            </div>;
            // } else {
            // let dref = React.createRef<HTMLDivElement>();
            // let dxf = () => this.getDocTransform(layoutDoc, dref.current!);
            // this.props.parent._docXfs.push({ dxf: dxf, width: width, height: height });
            // let rowHgtPcnt = height();
            // let rowSpan = Math.ceil((height() + parent.gridGap) / parent.gridGap);
            // let divStyle = parent.singleColumn ? { width: width(), marginTop: i === 0 ? 0 : parent.gridGap, height: `${rowHgtPcnt}` } : { gridRowEnd: `span ${rowSpan}` };
            // return <div className="collectionStackingView-masonryDoc" key={d[Id]} ref={dref} style={divStyle} >
            //     {this.props.parent.getDisplayDoc(layoutDoc, d, dxf, width)}
            // </div>;
            // }
        });
    }

    getDocTransform(doc: Doc, dref: HTMLDivElement) {
        let { scale, translateX, translateY } = Utils.GetScreenTransform(dref);
        let outerXf = Utils.GetScreenTransform(this.props.parent._masonryGridRef!);
        let offset = this.props.parent.props.ScreenToLocalTransform().transformDirection(outerXf.translateX - translateX, outerXf.translateY - translateY);
        return this.props.parent.props.ScreenToLocalTransform().
            translate(offset[0], offset[1]).
            scale(NumCast(doc.width, 1) / this.props.parent.columnWidth);
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

    @action
    headingChanged = (value: string, shiftDown?: boolean) => {
        let key = StrCast(this.props.parent.props.Document.sectionFilter);
        let castedValue = this.getValue(value);
        if (castedValue) {
            if (this.props.parent.sectionHeaders) {
                if (this.props.parent.sectionHeaders.map(i => i.heading).indexOf(castedValue.toString()) > -1) {
                    return false;
                }
            }
            this.props.docList.forEach(d => d[key] = castedValue);
            if (this.props.headingObject) {
                this.props.headingObject.setHeading(castedValue.toString());
                this._heading = this.props.headingObject.heading;
            }
            return true;
        }
        return false;
    }

    @action
    changeColumnColor = (color: string) => {
        if (this.props.headingObject) {
            this.props.headingObject.setColor(color);
            this._color = color;
        }
    }

    @action
    pointerEntered = () => {
        if (SelectionManager.GetIsDragging()) {
            this._background = "#b4b4b4";
        }
    }

    @action
    pointerLeave = () => {
        this._background = "inherit";
        document.removeEventListener("pointermove", this.startDrag);
    }

    @action
    addDocument = (value: string, shiftDown?: boolean) => {
        let key = StrCast(this.props.parent.props.Document.sectionFilter);
        let newDoc = Docs.Create.TextDocument({ height: 18, width: 200, title: value });
        newDoc[key] = this.getValue(this.props.heading);
        return this.props.parent.props.addDocument(newDoc);
    }

    @action
    deleteColumn = () => {
        let key = StrCast(this.props.parent.props.Document.sectionFilter);
        this.props.docList.forEach(d => d[key] = undefined);
        if (this.props.parent.sectionHeaders && this.props.headingObject) {
            let index = this.props.parent.sectionHeaders.indexOf(this.props.headingObject);
            this.props.parent.sectionHeaders.splice(index, 1);
        }
    }

    startDrag = (e: PointerEvent) => {
        let [dx, dy] = this.props.screenToLocalTransform().transformDirection(e.clientX - this._startDragPosition.x, e.clientY - this._startDragPosition.y);
        if (Math.abs(dx) + Math.abs(dy) > this._sensitivity) {
            let alias = Doc.MakeAlias(this.props.parent.props.Document);
            let key = StrCast(this.props.parent.props.Document.sectionFilter);
            let value = this.getValue(this._heading);
            value = typeof value === "string" ? `"${value}"` : value;
            let script = `return doc.${key} === ${value}`;
            let compiled = CompileScript(script, { params: { doc: Doc.name } });
            if (compiled.compiled) {
                let scriptField = new ScriptField(compiled);
                alias.viewSpecScript = scriptField;
                let dragData = new DragManager.DocumentDragData([alias], [alias.proto]);
                DragManager.StartDocumentDrag([this._headerRef.current!], dragData, e.clientX, e.clientY);
            }

            e.stopPropagation();
            document.removeEventListener("pointermove", this.startDrag);
            document.removeEventListener("pointerup", this.pointerUp);
        }
    }

    pointerUp = (e: PointerEvent) => {
        e.stopPropagation();
        e.preventDefault();

        document.removeEventListener("pointermove", this.startDrag);
        document.removeEventListener("pointerup", this.pointerUp);
    }

    headerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        e.stopPropagation();
        e.preventDefault();

        let [dx, dy] = this.props.screenToLocalTransform().transformDirection(e.clientX, e.clientY);
        this._startDragPosition = { x: dx, y: dy };

        document.removeEventListener("pointermove", this.startDrag);
        document.addEventListener("pointermove", this.startDrag);
        document.removeEventListener("pointerup", this.pointerUp);
        document.addEventListener("pointerup", this.pointerUp);
    }

    renderColorPicker = () => {
        let selected = this.props.headingObject ? this.props.headingObject.color : "#f1efeb";

        let pink = PastelSchemaPalette.get("pink2");
        let purple = PastelSchemaPalette.get("purple4");
        let blue = PastelSchemaPalette.get("bluegreen1");
        let yellow = PastelSchemaPalette.get("yellow4");
        let red = PastelSchemaPalette.get("red2");
        let green = PastelSchemaPalette.get("bluegreen7");
        let cyan = PastelSchemaPalette.get("bluegreen5");
        let orange = PastelSchemaPalette.get("orange1");
        let gray = "#f1efeb";

        return (
            <div className="collectionStackingView-colorPicker">
                <div className="colorOptions">
                    <div className={"colorPicker" + (selected === pink ? " active" : "")} style={{ backgroundColor: pink }} onClick={() => this.changeColumnColor(pink!)}></div>
                    <div className={"colorPicker" + (selected === purple ? " active" : "")} style={{ backgroundColor: purple }} onClick={() => this.changeColumnColor(purple!)}></div>
                    <div className={"colorPicker" + (selected === blue ? " active" : "")} style={{ backgroundColor: blue }} onClick={() => this.changeColumnColor(blue!)}></div>
                    <div className={"colorPicker" + (selected === yellow ? " active" : "")} style={{ backgroundColor: yellow }} onClick={() => this.changeColumnColor(yellow!)}></div>
                    <div className={"colorPicker" + (selected === red ? " active" : "")} style={{ backgroundColor: red }} onClick={() => this.changeColumnColor(red!)}></div>
                    <div className={"colorPicker" + (selected === gray ? " active" : "")} style={{ backgroundColor: gray }} onClick={() => this.changeColumnColor(gray)}></div>
                    <div className={"colorPicker" + (selected === green ? " active" : "")} style={{ backgroundColor: green }} onClick={() => this.changeColumnColor(green!)}></div>
                    <div className={"colorPicker" + (selected === cyan ? " active" : "")} style={{ backgroundColor: cyan }} onClick={() => this.changeColumnColor(cyan!)}></div>
                    <div className={"colorPicker" + (selected === orange ? " active" : "")} style={{ backgroundColor: orange }} onClick={() => this.changeColumnColor(orange!)}></div>
                </div>
            </div>
        );
    }

    render() {
        let cols = this.props.cols();
        let key = StrCast(this.props.parent.props.Document.sectionFilter);
        let templatecols = "";
        let headings = this.props.headings();
        let heading = this._heading;
        let style = this.props.parent;
        let singleColumn = style.singleColumn;
        let uniqueHeadings = headings.map((i, idx) => headings.indexOf(i) === idx);
        let evContents = heading ? heading : this.props.type && this.props.type === "number" ? "0" : `NO ${key.toUpperCase()} VALUE`;
        let headerEditableViewProps = {
            GetValue: () => evContents,
            SetValue: this.headingChanged,
            contents: evContents,
            oneLine: true
        };
        let newEditableViewProps = {
            GetValue: () => "",
            SetValue: this.addDocument,
            contents: "+ NEW"
        };
        let headingView = this.props.headingObject ?
            <div key={heading} className="collectionStackingView-sectionHeader" ref={this._headerRef}
                style={{
                    width: (style.columnWidth) /
                        ((uniqueHeadings.length +
                            (this.props.parent.props.CollectionView.props.Document.chromeStatus !== 'view-mode' ? 1 : 0)) || 1)
                }}>
                {/* the default bucket (no key value) has a tooltip that describes what it is.
                    Further, it does not have a color and cannot be deleted. */}
                <div className="collectionStackingView-sectionHeader-subCont" onPointerDown={this.headerDown}
                    title={evContents === `NO ${key.toUpperCase()} VALUE` ?
                        `Documents that don't have a ${key} value will go here. This column cannot be removed.` : ""}
                    style={{
                        width: "100%",
                        background: evContents !== `NO ${key.toUpperCase()} VALUE` ? this._color : "lightgrey",
                        color: "grey"
                    }}>
                    <EditableView {...headerEditableViewProps} />
                    {evContents === `NO ${key.toUpperCase()} VALUE` ? (null) :
                        <div className="collectionStackingView-sectionColor">
                            <Flyout anchorPoint={anchorPoints.TOP_CENTER} content={this.renderColorPicker()}>
                                <button className="collectionStackingView-sectionColorButton">
                                    <FontAwesomeIcon icon="palette" size="sm" />
                                </button>
                            </ Flyout >
                        </div>
                    }
                    {evContents === `NO ${key.toUpperCase()} VALUE` ?
                        (null) :
                        <button className="collectionStackingView-sectionDelete" onClick={this.deleteColumn}>
                            <FontAwesomeIcon icon="trash" />
                        </button>}
                </div>
            </div> : (null);
        for (let i = 0; i < cols; i++) templatecols += `${style.columnWidth}px `;
        return (
            <div key={heading} style={{ width: `${100 / ((uniqueHeadings.length + (this.props.parent.props.CollectionView.props.Document.chromeStatus !== 'view-mode' ? 1 : 0)) || 1)}%`, background: this._background }}
                ref={this.createColumnDropRef} onPointerEnter={this.pointerEntered} onPointerLeave={this.pointerLeave}>
                {headingView}
                <div key={`${heading}-stack`} className={`collectionStackingView-masonry${singleColumn ? "Single" : "Grid"}`}
                    style={{
                        padding: singleColumn ? `${style.yMargin}px ${0}px ${style.yMargin}px ${0}px` : `${style.yMargin}px ${0}px`,
                        margin: "auto",
                        width: "max-content", //singleColumn ? undefined : `${cols * (style.columnWidth + style.gridGap) + 2 * style.xMargin - style.gridGap}px`,
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
                {(this.props.parent.props.CollectionView.props.Document.chromeStatus !== 'view-mode') ?
                    <div key={`${heading}-add-document`} className="collectionStackingView-addDocumentButton"
                        style={{ width: style.columnWidth / (uniqueHeadings.length + (this.props.parent.props.CollectionView.props.Document.chromeStatus !== 'view-mode' ? 1 : 0)) }}>
                        <EditableView {...newEditableViewProps} />
                    </div> : null}
            </div>
        );
    }
}