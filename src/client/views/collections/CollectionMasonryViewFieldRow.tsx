import React = require("react");
import { library } from '@fortawesome/fontawesome-svg-core';
import { faPalette } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { action, computed, observable } from "mobx";
import { observer } from "mobx-react";
import Measure from "react-measure";
import { Doc } from "../../../new_fields/Doc";
import { PastelSchemaPalette, SchemaHeaderField } from "../../../new_fields/SchemaHeaderField";
import { ScriptField } from "../../../new_fields/ScriptField";
import { StrCast, NumCast } from "../../../new_fields/Types";
import { numberRange } from "../../../Utils";
import { Docs } from "../../documents/Documents";
import { DragManager } from "../../util/DragManager";
import { CompileScript } from "../../util/Scripting";
import { SelectionManager } from "../../util/SelectionManager";
import { Transform } from "../../util/Transform";
import { undoBatch } from "../../util/UndoManager";
import { EditableView } from "../EditableView";
import { CollectionStackingView } from "./CollectionStackingView";
import "./CollectionStackingView.scss";
const higflyout = require("@hig/flyout");
export const { anchorPoints } = higflyout;
export const Flyout = higflyout.default;

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
    observeHeight: (myref: any) => void;
    unobserveHeight: (myref: any) => void;
    showHandle: boolean;
}

@observer
export class CollectionMasonryViewFieldRow extends React.Component<CMVFieldRowProps> {
    @observable private _background = "inherit";
    @observable private _createAliasSelected: boolean = false;
    @observable private _collapsed: boolean = false;
    @observable private _headingsHack: number = 1;
    @observable private _heading = this.props.headingObject ? this.props.headingObject.heading : this.props.heading;
    @observable private _color = this.props.headingObject ? this.props.headingObject.color : "#f1efeb";

    private _dropDisposer?: DragManager.DragDropDisposer;
    private _headerRef: React.RefObject<HTMLDivElement> = React.createRef();
    private _startDragPosition: { x: number, y: number } = { x: 0, y: 0 };
    private _contRef: React.RefObject<HTMLDivElement> = React.createRef();
    private _sensitivity: number = 16;
    private _counter: number = 0;
    private _ele: any;

    createRowDropRef = (ele: HTMLDivElement | null) => {
        this._dropDisposer && this._dropDisposer();
        if (ele) {
            this._ele = ele;
            this.props.observeHeight(ele);
            this._dropDisposer = DragManager.MakeDropTarget(ele, this.rowDrop.bind(this));
        }
    }
    componentWillUnmount() {
        this.props.unobserveHeight(this._ele);
    }

    getTrueHeight = () => {
        if (this._collapsed) {
            this.props.setDocHeight(this._heading, 20);
        } else {
            const rawHeight = this._contRef.current!.getBoundingClientRect().height + 15; //+ 15 accounts for the group header
            const transformScale = this.props.screenToLocalTransform().Scale;
            const trueHeight = rawHeight * transformScale;
            this.props.setDocHeight(this._heading, trueHeight);
        }
    }

    @undoBatch
    rowDrop = action((e: Event, de: DragManager.DropEvent) => {
        console.log("masronry row drop");
        this._createAliasSelected = false;
        if (de.complete.docDragData) {
            (this.props.parent.Document.dropConverter instanceof ScriptField) &&
                this.props.parent.Document.dropConverter.script.run({ dragData: de.complete.docDragData });
            const key = StrCast(this.props.parent.props.Document._pivotField);
            const castedValue = this.getValue(this._heading);
            de.complete.docDragData.droppedDocuments.forEach(d => d[key] = castedValue);
            this.props.parent.onInternalDrop(e, de);
            e.stopPropagation();
        }
    });

    getValue = (value: string): any => {
        const parsed = parseInt(value);
        if (!isNaN(parsed)) return parsed;
        if (value.toLowerCase().indexOf("true") > -1) return true;
        if (value.toLowerCase().indexOf("false") > -1) return false;
        return value;
    }

    @action
    headingChanged = (value: string, shiftDown?: boolean) => {
        this._createAliasSelected = false;
        const key = StrCast(this.props.parent.props.Document._pivotField);
        const castedValue = this.getValue(value);
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

    pointerEnteredRow = action(() => SelectionManager.GetIsDragging() && (this._background = "#b4b4b4"));

    @action
    pointerLeaveRow = () => {
        this._createAliasSelected = false;
        this._background = "inherit";
        document.removeEventListener("pointermove", this.startDrag);
    }

    @action
    addDocument = (value: string, shiftDown?: boolean) => {
        this._createAliasSelected = false;
        const key = StrCast(this.props.parent.props.Document._pivotField);
        const newDoc = Docs.Create.TextDocument(value, { _autoHeight: true, _width: 200, title: value });
        newDoc[key] = this.getValue(this.props.heading);
        const docs = this.props.parent.childDocList;
        return docs ? (docs.splice(0, 0, newDoc) ? true : false) : this.props.parent.props.addDocument(newDoc);
    }

    deleteRow = undoBatch(action(() => {
        this._createAliasSelected = false;
        const key = StrCast(this.props.parent.props.Document._pivotField);
        this.props.docList.forEach(d => d[key] = undefined);
        if (this.props.parent.sectionHeaders && this.props.headingObject) {
            const index = this.props.parent.sectionHeaders.indexOf(this.props.headingObject);
            this.props.parent.sectionHeaders.splice(index, 1);
        }
    }));

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
        const [dx, dy] = this.props.screenToLocalTransform().transformDirection(e.clientX - this._startDragPosition.x, e.clientY - this._startDragPosition.y);
        if (Math.abs(dx) + Math.abs(dy) > this._sensitivity) {
            const alias = Doc.MakeAlias(this.props.parent.props.Document);
            const key = StrCast(this.props.parent.props.Document._pivotField);
            let value = this.getValue(this._heading);
            value = typeof value === "string" ? `"${value}"` : value;
            const script = `return doc.${key} === ${value}`;
            const compiled = CompileScript(script, { params: { doc: Doc.name } });
            if (compiled.compiled) {
                alias.viewSpecScript = new ScriptField(compiled);
                DragManager.StartDocumentDrag([this._headerRef.current!], new DragManager.DocumentDragData([alias]), e.clientX, e.clientY);
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

    @action
    headerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        e.stopPropagation();
        e.preventDefault();

        const [dx, dy] = this.props.screenToLocalTransform().transformDirection(e.clientX, e.clientY);
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
        const selected = this.props.headingObject ? this.props.headingObject.color : "#f1efeb";

        const pink = PastelSchemaPalette.get("pink2");
        const purple = PastelSchemaPalette.get("purple4");
        const blue = PastelSchemaPalette.get("bluegreen1");
        const yellow = PastelSchemaPalette.get("yellow4");
        const red = PastelSchemaPalette.get("red2");
        const green = PastelSchemaPalette.get("bluegreen7");
        const cyan = PastelSchemaPalette.get("bluegreen5");
        const orange = PastelSchemaPalette.get("orange1");
        const gray = "#f1efeb";

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

    toggleAlias = action(() => this._createAliasSelected = true);
    toggleVisibility = action(() => this._collapsed = !this._collapsed);

    renderMenu = () => {
        const selected = this._createAliasSelected;
        return (<div className="collectionStackingView-optionPicker">
            <div className="optionOptions">
                <div className={"optionPicker" + (selected === true ? " active" : "")} onClick={this.toggleAlias}>Create Alias</div>
                <div className={"optionPicker" + (selected === true ? " active" : "")} onClick={this.deleteRow}>Delete</div>
            </div>
        </div>);
    }

    handleResize = (size: any) => {
        if (++this._counter !== 1) {
            this.getTrueHeight();
        }
    }

    @computed get contentLayout() {
        const rows = Math.max(1, Math.min(this.props.docList.length, Math.floor((this.props.parent.props.PanelWidth() - 2 * this.props.parent.xMargin) / (this.props.parent.columnWidth + this.props.parent.gridGap))));
        const style = this.props.parent;
        const collapsed = this._collapsed;
        const chromeStatus = this.props.parent.props.Document._chromeStatus;
        const newEditableViewProps = {
            GetValue: () => "",
            SetValue: this.addDocument,
            contents: "+ NEW",
            HeadingObject: this.props.headingObject,
            HeadingsHack: this._headingsHack,
            toggle: this.toggleVisibility,
            color: this._color
        };
        return collapsed ? (null) :
            <div style={{ position: "relative" }}>
                {(chromeStatus !== 'view-mode' && chromeStatus !== 'disabled') ?
                    <div className="collectionStackingView-addDocumentButton"
                        style={{
                            width: style.columnWidth / style.numGroupColumns,
                            padding: NumCast(this.props.parent.layoutDoc._yPadding)
                        }}>
                        <EditableView {...newEditableViewProps} />
                    </div> : null
                }
                <div className={`collectionStackingView-masonryGrid`}
                    ref={this._contRef}
                    style={{
                        padding: `${this.props.parent.yMargin}px ${this.props.parent.xMargin}px`,
                        width: this.props.parent.NodeWidth,
                        gridGap: this.props.parent.gridGap,
                        gridTemplateColumns: numberRange(rows).reduce((list: string, i: any) => list + ` ${this.props.parent.columnWidth}px`, ""),
                    }}>
                    {this.props.parent.children(this.props.docList)}
                    {this.props.showHandle && this.props.parent.props.active() ? this.props.parent.columnDragger : (null)}
                </div>
            </div>;
    }

    @computed get headingView() {
        const heading = this._heading;
        const key = StrCast(this.props.parent.props.Document._pivotField);
        const evContents = heading ? heading : this.props.type && this.props.type === "number" ? "0" : `NO ${key.toUpperCase()} VALUE`;
        const headerEditableViewProps = {
            GetValue: () => evContents,
            SetValue: this.headingChanged,
            contents: evContents,
            oneLine: true,
            HeadingObject: this.props.headingObject,
            HeadingsHack: this._headingsHack,
            toggle: this.toggleVisibility,
            color: this._color
        };
        return this.props.parent.props.Document.miniHeaders ?
            <div className="collectionStackingView-miniHeader">
                <EditableView {...headerEditableViewProps} />
            </div> :
            !this.props.headingObject ? (null) :
                <div className="collectionStackingView-sectionHeader" ref={this._headerRef} >
                    <div className="collectionStackingView-sectionHeader-subCont" onPointerDown={this.headerDown}
                        title={evContents === `NO ${key.toUpperCase()} VALUE` ?
                            `Documents that don't have a ${key} value will go here. This column cannot be removed.` : ""}
                        style={{ background: evContents !== `NO ${key.toUpperCase()} VALUE` ? this._color : "lightgrey" }}>
                        <EditableView {...headerEditableViewProps} />
                        {evContents === `NO ${key.toUpperCase()} VALUE` ? (null) :
                            <div className="collectionStackingView-sectionColor">
                                <Flyout anchorPoint={anchorPoints.CENTER_RIGHT} content={this.renderColorPicker()}>
                                    <button className="collectionStackingView-sectionColorButton">
                                        <FontAwesomeIcon icon="palette" size="lg" />
                                    </button>
                                </ Flyout >
                            </div>
                        }
                        <button className="collectionStackingView-sectionDelete" onClick={this.collapseSection}>
                            <FontAwesomeIcon icon={this._collapsed ? "chevron-down" : "chevron-up"} size="lg" />
                        </button>
                        {evContents === `NO  ${key.toUpperCase()} VALUE` ? (null) :
                            <div className="collectionStackingView-sectionOptions">
                                <Flyout anchorPoint={anchorPoints.TOP_RIGHT} content={this.renderMenu()}>
                                    <button className="collectionStackingView-sectionOptionButton">
                                        <FontAwesomeIcon icon="ellipsis-v" size="lg" />
                                    </button>
                                </Flyout>
                            </div>
                        }
                    </div>
                </div>;
    }
    render() {
        const background = this._background; //to account for observables in Measure
        const contentlayout = this.contentLayout;
        const headingview = this.headingView;
        return <Measure offset onResize={this.handleResize}>
            {({ measureRef }) => {
                return <div ref={measureRef}>
                    <div className="collectionStackingView-masonrySection"
                        style={{ width: this.props.parent.NodeWidth, background }}
                        ref={this.createRowDropRef}
                        onPointerEnter={this.pointerEnteredRow}
                        onPointerLeave={this.pointerLeaveRow}
                    >
                        {headingview}
                        {contentlayout}
                    </div >
                </div>;
            }}
        </Measure>;
    }
}