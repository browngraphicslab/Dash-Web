import React = require("react");
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { action, computed, observable, runInAction } from "mobx";
import { observer } from "mobx-react";
import { Doc, DocListCast, DataSym } from "../../../fields/Doc";
import { PastelSchemaPalette, SchemaHeaderField } from "../../../fields/SchemaHeaderField";
import { ScriptField } from "../../../fields/ScriptField";
import { StrCast, NumCast } from "../../../fields/Types";
import { numberRange, setupMoveUpEvents, emptyFunction, returnEmptyString } from "../../../Utils";
import { Docs } from "../../documents/Documents";
import { DragManager } from "../../util/DragManager";
import { CompileScript } from "../../util/Scripting";
import { Transform } from "../../util/Transform";
import { undoBatch } from "../../util/UndoManager";
import { EditableView } from "../EditableView";
import { CollectionStackingView } from "./CollectionStackingView";
import "./CollectionStackingView.scss";
import { SnappingManager } from "../../util/SnappingManager";
const higflyout = require("@hig/flyout");
export const { anchorPoints } = higflyout;
export const Flyout = higflyout.default;

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
    @observable private heading: string = "";
    @observable private color: string = "#f1efeb";
    @observable private collapsed: boolean = false;
    @observable private _paletteOn = false;
    private set _heading(value: string) { runInAction(() => this.props.headingObject && (this.props.headingObject.heading = this.heading = value)); }
    private set _color(value: string) { runInAction(() => this.props.headingObject && (this.props.headingObject.color = this.color = value)); }
    private set _collapsed(value: boolean) { runInAction(() => this.props.headingObject && (this.props.headingObject.collapsed = this.collapsed = value)); }

    private _dropDisposer?: DragManager.DragDropDisposer;
    private _headerRef: React.RefObject<HTMLDivElement> = React.createRef();
    private _contRef: React.RefObject<HTMLDivElement> = React.createRef();
    private _ele: any;

    createRowDropRef = (ele: HTMLDivElement | null) => {
        this._dropDisposer?.();
        if (ele) {
            this._ele = ele;
            this.props.observeHeight(ele);
            this._dropDisposer = DragManager.MakeDropTarget(ele, this.rowDrop.bind(this));
        }
    }
    @action
    componentDidMount() {
        this.heading = this.props.headingObject?.heading || "";
        this.color = this.props.headingObject?.color || "#f1efeb";
        this.collapsed = this.props.headingObject?.collapsed || false;
    }
    componentWillUnmount() {
        this.props.unobserveHeight(this._ele);
    }

    getTrueHeight = () => {
        if (this.collapsed) {
            this.props.setDocHeight(this.heading, 20);
        } else {
            const rawHeight = this._contRef.current!.getBoundingClientRect().height + 15; //+ 15 accounts for the group header
            const transformScale = this.props.screenToLocalTransform().Scale;
            const trueHeight = rawHeight * transformScale;
            this.props.setDocHeight(this.heading, trueHeight);
        }
    }

    @undoBatch
    rowDrop = action((e: Event, de: DragManager.DropEvent) => {
        this._createAliasSelected = false;
        if (de.complete.docDragData) {
            (this.props.parent.Document.dropConverter instanceof ScriptField) &&
                this.props.parent.Document.dropConverter.script.run({ dragData: de.complete.docDragData });
            const key = StrCast(this.props.parent.props.Document._pivotField);
            const castedValue = this.getValue(this.heading);
            const onLayoutDoc = this.onLayoutDoc(key);
            de.complete.docDragData.droppedDocuments.forEach(d => Doc.SetInPlace(d, key, castedValue, !onLayoutDoc));
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
            if (this.props.parent.columnHeaders) {
                if (this.props.parent.columnHeaders.map(i => i.heading).indexOf(castedValue.toString()) > -1) {
                    return false;
                }
            }
            this.props.docList.forEach(d => Doc.SetInPlace(d, key, castedValue, true));
            this._heading = castedValue.toString();
            return true;
        }
        return false;
    }

    @action
    changeColumnColor = (color: string) => {
        this._createAliasSelected = false;
        this._color = color;
    }

    pointerEnteredRow = action(() => SnappingManager.GetIsDragging() && (this._background = "#b4b4b4"));

    @action
    pointerLeaveRow = () => {
        this._createAliasSelected = false;
        this._background = "inherit";
    }

    @action
    addDocument = (value: string, shiftDown?: boolean, forceEmptyNote?: boolean) => {
        if (!value && !forceEmptyNote) return false;
        this._createAliasSelected = false;
        const key = StrCast(this.props.parent.props.Document._pivotField);
        const newDoc = Docs.Create.TextDocument(value, { _autoHeight: true, _width: 200, title: value });
        const onLayoutDoc = this.onLayoutDoc(key);
        (onLayoutDoc ? newDoc : newDoc[DataSym])[key] = this.getValue(this.props.heading);
        const docs = this.props.parent.childDocList;
        return docs ? (docs.splice(0, 0, newDoc) ? true : false) : this.props.parent.props.addDocument?.(newDoc) || false;
    }

    deleteRow = undoBatch(action(() => {
        this._createAliasSelected = false;
        const key = StrCast(this.props.parent.props.Document._pivotField);
        this.props.docList.forEach(d => Doc.SetInPlace(d, key, undefined, true));
        if (this.props.parent.columnHeaders && this.props.headingObject) {
            const index = this.props.parent.columnHeaders.indexOf(this.props.headingObject);
            this.props.parent.columnHeaders.splice(index, 1);
        }
    }));

    @action
    collapseSection = (e: any) => {
        this._createAliasSelected = false;
        this.toggleVisibility();
        e.stopPropagation();
    }

    headerMove = (e: PointerEvent) => {
        const alias = Doc.MakeAlias(this.props.parent.props.Document);
        const key = StrCast(this.props.parent.props.Document._pivotField);
        let value = this.getValue(this.heading);
        value = typeof value === "string" ? `"${value}"` : value;
        const script = `return doc.${key} === ${value}`;
        const compiled = CompileScript(script, { params: { doc: Doc.name } });
        if (compiled.compiled) {
            alias.viewSpecScript = new ScriptField(compiled);
            DragManager.StartDocumentDrag([this._headerRef.current!], new DragManager.DocumentDragData([alias]), e.clientX, e.clientY);
        }
        return true;
    }

    @action
    headerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        if (e.button === 0 && !e.ctrlKey) {
            setupMoveUpEvents(this, e, this.headerMove, emptyFunction, e => (this.props.parent.props.Document._chromeStatus === "disabled") && this.collapseSection(e));
            this._createAliasSelected = false;
        }
    }

    /**
     * Returns true if a key is on the layout doc of the documents in the collection.
     */
    onLayoutDoc = (key: string): boolean => {
        DocListCast(this.props.parent.Document.data).forEach(doc => {
            if (Doc.Get(doc, key, true)) return true;
        });
        return false;
    }

    renderColorPicker = () => {
        const selected = this.color;

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
    toggleVisibility = () => this._collapsed = !this.collapsed;

    renderMenu = () => {
        const selected = this._createAliasSelected;
        return (<div className="collectionStackingView-optionPicker">
            <div className="optionOptions">
                <div className={"optionPicker" + (selected === true ? " active" : "")} onClick={this.toggleAlias}>Create Alias</div>
                <div className={"optionPicker" + (selected === true ? " active" : "")} onClick={this.deleteRow}>Delete</div>
            </div>
        </div>);
    }
    @action
    textCallback = (char: string) => {
        return this.addDocument("", false);
    }

    @computed get contentLayout() {
        const rows = Math.max(1, Math.min(this.props.docList.length, Math.floor((this.props.parent.props.PanelWidth() - 2 * this.props.parent.xMargin) / (this.props.parent.columnWidth + this.props.parent.gridGap))));
        const style = this.props.parent;
        const chromeStatus = this.props.parent.props.Document._chromeStatus;
        const showChrome = (chromeStatus !== 'view-mode' && chromeStatus !== 'disabled');
        const stackPad = showChrome ? `0px ${this.props.parent.xMargin}px` : `${this.props.parent.yMargin}px ${this.props.parent.xMargin}px 0px ${this.props.parent.xMargin}px `;
        return this.collapsed ? (null) :
            <div style={{ position: "relative" }}>
                {showChrome ?
                    <div className="collectionStackingView-addDocumentButton"
                        style={{
                            //width: style.columnWidth / style.numGroupColumns,
                            padding: `${NumCast(this.props.parent.layoutDoc._yPadding, this.props.parent.yMargin)}px 0px 0px 0px`
                        }}>
                        <EditableView
                            GetValue={returnEmptyString}
                            SetValue={this.addDocument}
                            textCallback={this.textCallback}
                            contents={"+ NEW"}
                            toggle={this.toggleVisibility} />
                    </div> : null
                }
                <div className={`collectionStackingView-masonryGrid`}
                    ref={this._contRef}
                    style={{
                        padding: stackPad,
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
        const noChrome = this.props.parent.props.Document._chromeStatus === "disabled";
        const key = StrCast(this.props.parent.props.Document._pivotField);
        const evContents = this.heading ? this.heading : this.props.type && this.props.type === "number" ? "0" : `NO ${key.toUpperCase()} VALUE`;
        const editableHeaderView = <EditableView
            GetValue={() => evContents}
            SetValue={this.headingChanged}
            contents={evContents}
            oneLine={true}
            toggle={this.toggleVisibility} />;
        return this.props.parent.props.Document.miniHeaders ?
            <div className="collectionStackingView-miniHeader">
                {editableHeaderView}
            </div> :
            !this.props.headingObject ? (null) :
                <div className="collectionStackingView-sectionHeader" ref={this._headerRef} >
                    <div className="collectionStackingView-sectionHeader-subCont" onPointerDown={this.headerDown}
                        title={evContents === `NO ${key.toUpperCase()} VALUE` ?
                            `Documents that don't have a ${key} value will go here. This column cannot be removed.` : ""}
                        style={{ background: evContents !== `NO ${key.toUpperCase()} VALUE` ? this.color : "lightgrey" }}>
                        {noChrome ? evContents : editableHeaderView}
                        {noChrome || evContents === `NO ${key.toUpperCase()} VALUE` ? (null) :
                            <div className="collectionStackingView-sectionColor">
                                <button className="collectionStackingView-sectionColorButton" onClick={action(e => this._paletteOn = !this._paletteOn)}>
                                    <FontAwesomeIcon icon="palette" size="lg" />
                                </button>
                                {this._paletteOn ? this.renderColorPicker() : (null)}
                            </div>
                        }
                        {noChrome ? (null) : <button className="collectionStackingView-sectionDelete" onClick={noChrome ? undefined : this.collapseSection}>
                            <FontAwesomeIcon icon={this.collapsed ? "chevron-down" : "chevron-up"} size="lg" />
                        </button>}
                        {noChrome || evContents === `NO  ${key.toUpperCase()} VALUE` ? (null) :
                            <div className="collectionStackingView-sectionOptions">
                                <Flyout anchorPoint={anchorPoints.TOP_CENTER} content={this.renderMenu()}>
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
        const background = this._background;
        return <div className="collectionStackingView-masonrySection"
            style={{ width: this.props.parent.NodeWidth, background }}
            ref={this.createRowDropRef}
            onPointerEnter={this.pointerEnteredRow}
            onPointerLeave={this.pointerLeaveRow}
        >
            {this.headingView}
            {this.contentLayout}
        </div >;
    }
}