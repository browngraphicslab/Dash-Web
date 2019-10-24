import React = require("react");
import { library } from '@fortawesome/fontawesome-svg-core';
import { faPalette } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { action, observable } from "mobx";
import { observer } from "mobx-react";
import Measure from "react-measure";
import { Doc } from "../../../new_fields/Doc";
import { PastelSchemaPalette, SchemaHeaderField } from "../../../new_fields/SchemaHeaderField";
import { ScriptField } from "../../../new_fields/ScriptField";
import { StrCast } from "../../../new_fields/Types";
import { numberRange } from "../../../Utils";
import { Docs } from "../../documents/Documents";
import { DragManager } from "../../util/DragManager";
import { CompileScript } from "../../util/Scripting";
import { SelectionManager } from "../../util/SelectionManager";
import { Transform } from "../../util/Transform";
import { undoBatch } from "../../util/UndoManager";
import { anchorPoints, Flyout } from "../DocumentDecorations";
import { EditableView } from "../EditableView";
import { CollectionStackingView } from "./CollectionStackingView";
import "./CollectionStackingView.scss";

library.add(faPalette);

interface CMVFieldRowProps {
    rows: () => number;
    headings: () => object[];
    heading: string;
    headingObject: SchemaHeaderField | undefined;
    docList: Doc[];
    parent: CollectionStackingView;
    type: "string" | "number" | "bigint" | "boolean" | "symbol" | "undefined" | "object" | "function" | undefined;
    createDropTarget: (ele: HTMLDivElement) => void;
    screenToLocalTransform: () => Transform;
    setDocHeight: (key: string, thisHeight: number) => void;
}

@observer
export class CollectionMasonryViewFieldRow extends React.Component<CMVFieldRowProps> {
    @observable private _background = "inherit";
    @observable private _createAliasSelected: boolean = false;

    private _dropRef: HTMLDivElement | null = null;
    private dropDisposer?: DragManager.DragDropDisposer;
    private _headerRef: React.RefObject<HTMLDivElement> = React.createRef();
    private _startDragPosition: { x: number, y: number } = { x: 0, y: 0 };
    private _contRef: React.RefObject<HTMLDivElement> = React.createRef();
    private _sensitivity: number = 16;

    @observable _heading = this.props.headingObject ? this.props.headingObject.heading : this.props.heading;
    @observable _color = this.props.headingObject ? this.props.headingObject.color : "#f1efeb";

    createRowDropRef = (ele: HTMLDivElement | null) => {
        this._dropRef = ele;
        this.dropDisposer && this.dropDisposer();
        if (ele) {
            this.dropDisposer = DragManager.MakeDropTarget(ele, { handlers: { drop: this.rowDrop.bind(this) } });
        }
    }

    getTrueHeight = () => {
        if (this.collapsed) {
            this.props.setDocHeight(this._heading, 20);
        } else {
            let rawHeight = this._contRef.current!.getBoundingClientRect().height + 15; //+ 15 accounts for the group header
            let transformScale = this.props.screenToLocalTransform().Scale;
            let trueHeight = rawHeight * transformScale;
            this.props.setDocHeight(this._heading, trueHeight);
        }
    }

    @undoBatch
    rowDrop = action((e: Event, de: DragManager.DropEvent) => {
        this._createAliasSelected = false;
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
    });

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
        this._createAliasSelected = false;
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
        this._createAliasSelected = false;
        if (this.props.headingObject) {
            this.props.headingObject.setColor(color);
            this._color = color;
        }
    }

    @action
    pointerEnteredRow = () => {
        if (SelectionManager.GetIsDragging()) {
            this._background = "#b4b4b4";
        }
    }

    @action
    pointerLeaveRow = () => {
        this._createAliasSelected = false;
        this._background = "inherit";
        document.removeEventListener("pointermove", this.startDrag);
    }

    @action
    addDocument = (value: string, shiftDown?: boolean) => {
        this._createAliasSelected = false;
        let key = StrCast(this.props.parent.props.Document.sectionFilter);
        let newDoc = Docs.Create.TextDocument({ height: 18, width: 200, title: value });
        newDoc[key] = this.getValue(this.props.heading);
        return this.props.parent.props.addDocument(newDoc);
    }

    @action
    deleteRow = () => {
        this._createAliasSelected = false;
        let key = StrCast(this.props.parent.props.Document.sectionFilter);
        this.props.docList.forEach(d => d[key] = undefined);
        if (this.props.parent.sectionHeaders && this.props.headingObject) {
            let index = this.props.parent.sectionHeaders.indexOf(this.props.headingObject);
            this.props.parent.sectionHeaders.splice(index, 1);
        }
    }

    @action
    collapseSection = () => {
        this._createAliasSelected = false;
        if (this.props.headingObject) {
            this._headingsHack++;
            this.props.headingObject.setCollapsed(!this.props.headingObject.collapsed);
            this.toggleVisibility();
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
                let dragData = new DragManager.DocumentDragData([alias]);
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

        if (this._createAliasSelected) {
            document.removeEventListener("pointermove", this.startDrag);
            document.addEventListener("pointermove", this.startDrag);
            document.removeEventListener("pointerup", this.pointerUp);
            document.addEventListener("pointerup", this.pointerUp);
        }
        this._createAliasSelected = false;
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

    @action
    toggleAlias = () => {
        this._createAliasSelected = true;
    }

    renderMenu = () => {
        let selected = this._createAliasSelected;
        return (
            <div className="collectionStackingView-optionPicker">
                <div className="optionOptions">
                    <div className={"optionPicker" + (selected === true ? " active" : "")} onClick={this.toggleAlias}>Create Alias</div>
                </div>
            </div>
        );
    }

    @observable private collapsed: boolean = false;

    private toggleVisibility = action(() => {
        this.collapsed = !this.collapsed;
    });

    @observable _headingsHack: number = 1;

    handleResize = (size: any) => {
        this.counter += 1;
        if (this.counter !== 1) {
            this.getTrueHeight();
        }
    }

    private counter: number = 0;

    render() {
        let cols = this.props.rows();
        let rows = Math.max(1, Math.min(this.props.docList.length, Math.floor((this.props.parent.props.PanelWidth() - 2 * this.props.parent.xMargin) / (this.props.parent.columnWidth + this.props.parent.gridGap))));
        let key = StrCast(this.props.parent.props.Document.sectionFilter);
        let templatecols = "";
        let headings = this.props.headings();
        let heading = this._heading;
        let style = this.props.parent;
        let uniqueHeadings = headings.map((i, idx) => headings.indexOf(i) === idx);
        let evContents = heading ? heading : this.props.type && this.props.type === "number" ? "0" : `NO ${key.toUpperCase()} VALUE`;
        let headerEditableViewProps = {
            GetValue: () => evContents,
            SetValue: this.headingChanged,
            contents: evContents,
            oneLine: true,
            HeadingObject: this.props.headingObject,
            HeadingsHack: this._headingsHack,
            toggle: this.toggleVisibility,
            color: this._color
        };
        let newEditableViewProps = {
            GetValue: () => "",
            SetValue: this.addDocument,
            contents: "+ NEW",
            HeadingObject: this.props.headingObject,
            HeadingsHack: this._headingsHack,
            toggle: this.toggleVisibility,
            color: this._color
        };
        let headingView = this.props.headingObject ?
            <div className="collectionStackingView-sectionHeader" ref={this._headerRef} >
                <div className={"collectionStackingView-collapseBar" + (this.props.headingObject.collapsed === true ? " active" : "")} onClick={this.collapseSection}></div>
                <div className="collectionStackingView-sectionHeader-subCont" onPointerDown={this.headerDown}
                    title={evContents === `NO ${key.toUpperCase()} VALUE` ?
                        `Documents that don't have a ${key} value will go here. This column cannot be removed.` : ""}
                    style={{
                        width: "100%",
                        background: evContents !== `NO ${key.toUpperCase()} VALUE` ? this._color : "lightgrey",
                        color: "grey"
                    }}>
                    {<EditableView {...headerEditableViewProps} />}
                    {evContents === `NO ${key.toUpperCase()} VALUE` ? (null) :
                        <div className="collectionStackingView-sectionColor">
                            <Flyout anchorPoint={anchorPoints.CENTER_RIGHT} content={this.renderColorPicker()}>
                                <button className="collectionStackingView-sectionColorButton">
                                    <FontAwesomeIcon icon="palette" size="lg" />
                                </button>
                            </ Flyout >
                        </div>
                    }
                    {evContents === `NO ${key.toUpperCase()} VALUE` ?
                        (null) :
                        <button className="collectionStackingView-sectionDelete" onClick={this.deleteRow}>
                            <FontAwesomeIcon icon="trash" size="lg" />
                        </button>}
                    {evContents === `NO  ${key.toUpperCase()} VALUE` ? (null) :
                        <div className="collectionStackingView-sectionOptions">
                            <Flyout anchorPoint={anchorPoints.TOP_RIGHT} content={this.renderMenu()}>
                                <button className="collectionStackingView-sectionOptionButton">
                                    <FontAwesomeIcon icon="ellipsis-v" size="lg"></FontAwesomeIcon>
                                </button>
                            </Flyout>
                        </div>
                    }
                </div>
            </div > : (null);
        const background = this._background; //to account for observables in Measure
        const collapsed = this.collapsed;
        let chromeStatus = this.props.parent.props.Document.chromeStatus;
        return (
            <Measure offset onResize={this.handleResize}>
                {({ measureRef }) => {
                    return <div ref={measureRef}>
                        <div className="collectionStackingView-masonrySection"
                            key={heading = "empty"}
                            style={{ width: this.props.parent.NodeWidth, background }}
                            ref={this.createRowDropRef}
                            onPointerEnter={this.pointerEnteredRow}
                            onPointerLeave={this.pointerLeaveRow}
                        >
                            {headingView}
                            {collapsed ? (null) :
                                < div >
                                    <div key={`${heading}-stack`} className={`collectionStackingView-masonryGrid`}
                                        ref={this._contRef}
                                        style={{
                                            padding: `${this.props.parent.yMargin}px ${this.props.parent.xMargin}px`,
                                            width: this.props.parent.NodeWidth,
                                            gridGap: this.props.parent.gridGap,
                                            gridTemplateColumns: numberRange(rows).reduce((list: string, i: any) => list + ` ${this.props.parent.columnWidth}px`, ""),
                                        }}>
                                        {this.props.parent.children(this.props.docList)}
                                        {this.props.parent.columnDragger}
                                    </div>
                                    {(chromeStatus !== 'view-mode' && chromeStatus !== 'disabled') ?
                                        <div key={`${heading}-add-document`} className="collectionStackingView-addDocumentButton"
                                            style={{ width: style.columnWidth / style.numGroupColumns }}>
                                            <EditableView {...newEditableViewProps} />
                                        </div> : null
                                    }
                                </div>
                            }
                        </div >
                    </div>;
                }}
            </Measure>
        );
    }
}