import React = require("react");
import { library } from '@fortawesome/fontawesome-svg-core';
import { faPalette } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { action, observable, runInAction } from "mobx";
import { observer } from "mobx-react";
import { Doc } from "../../../new_fields/Doc";
import { PastelSchemaPalette, SchemaHeaderField } from "../../../new_fields/SchemaHeaderField";
import { ScriptField } from "../../../new_fields/ScriptField";
import { NumCast, StrCast } from "../../../new_fields/Types";
import { Docs } from "../../documents/Documents";
import { DragManager } from "../../util/DragManager";
import { SelectionManager } from "../../util/SelectionManager";
import { Transform } from "../../util/Transform";
import { undoBatch } from "../../util/UndoManager";
import { anchorPoints, Flyout } from "../DocumentDecorations";
import { EditableView } from "../EditableView";
import { CollectionStackingView } from "./CollectionStackingView";
import "./CollectionStackingView.scss";
import { TraceMobx } from "../../../new_fields/util";

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
    @observable private _createAliasSelected: boolean = false;

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
            this.dropDisposer = DragManager.MakeDropTarget(ele, this.columnDrop.bind(this));
        }
    }

    @undoBatch
    columnDrop = action((e: Event, de: DragManager.DropEvent) => {
        console.log("column drop stacking");
        this._createAliasSelected = false;
        if (de.complete.docDragData) {
            const key = StrCast(this.props.parent.props.Document.sectionFilter);
            const castedValue = this.getValue(this._heading);
            if (castedValue) {
                de.complete.docDragData.droppedDocuments.forEach(d => d[key] = castedValue);
            }
            else {
                de.complete.docDragData.droppedDocuments.forEach(d => d[key] = undefined);
            }
            this.props.parent.drop(e, de);
            e.stopPropagation();
        }
    });
    getValue = (value: string): any => {
        const parsed = parseInt(value);
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
        const key = StrCast(this.props.parent.props.Document.sectionFilter);
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

    @action
    pointerEntered = () => {
        if (SelectionManager.GetIsDragging()) {
            this._createAliasSelected = false;
            this._background = "#b4b4b4";
        }
    }

    @action
    pointerLeave = () => {
        this._createAliasSelected = false;
        this._background = "inherit";
        document.removeEventListener("pointermove", this.startDrag);
    }

    @action
    addDocument = (value: string, shiftDown?: boolean) => {
        this._createAliasSelected = false;
        const key = StrCast(this.props.parent.props.Document.sectionFilter);
        const newDoc = Docs.Create.TextDocument({ height: 18, width: 200, documentText: "@@@" + value, title: value, autoHeight: true });
        newDoc[key] = this.getValue(this.props.heading);
        const maxHeading = this.props.docList.reduce((maxHeading, doc) => NumCast(doc.heading) > maxHeading ? NumCast(doc.heading) : maxHeading, 0);
        const heading = maxHeading === 0 || this.props.docList.length === 0 ? 1 : maxHeading === 1 ? 2 : 3;
        newDoc.heading = heading;
        return this.props.parent.props.addDocument(newDoc);
    }

    @action
    deleteColumn = () => {
        this._createAliasSelected = false;
        const key = StrCast(this.props.parent.props.Document.sectionFilter);
        this.props.docList.forEach(d => d[key] = undefined);
        if (this.props.parent.sectionHeaders && this.props.headingObject) {
            const index = this.props.parent.sectionHeaders.indexOf(this.props.headingObject);
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
        const [dx, dy] = this.props.screenToLocalTransform().transformDirection(e.clientX - this._startDragPosition.x, e.clientY - this._startDragPosition.y);
        if (Math.abs(dx) + Math.abs(dy) > this._sensitivity) {
            const alias = Doc.MakeAlias(this.props.parent.props.Document);
            const key = StrCast(this.props.parent.props.Document.sectionFilter);
            let value = this.getValue(this._heading);
            value = typeof value === "string" ? `"${value}"` : value;
            alias.viewSpecScript = ScriptField.MakeFunction(`doc.${key} === ${value}`, { doc: Doc.name });
            if (alias.viewSpecScript) {
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
        runInAction(() => this._createAliasSelected = false);
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

    @action
    toggleAlias = () => {
        this._createAliasSelected = true;
    }

    renderMenu = () => {
        const selected = this._createAliasSelected;
        return (
            <div className="collectionStackingView-optionPicker">
                <div className="optionOptions">
                    <div className={"optionPicker" + (selected === true ? " active" : "")} onClick={this.toggleAlias}>Create Alias</div>
                </div>
            </div >
        );
    }

    @observable private collapsed: boolean = false;

    private toggleVisibility = action(() => this.collapsed = !this.collapsed);

    @observable _headingsHack: number = 1;

    render() {
        TraceMobx();
        const cols = this.props.cols();
        const key = StrCast(this.props.parent.props.Document.sectionFilter);
        let templatecols = "";
        const headings = this.props.headings();
        const heading = this._heading;
        const style = this.props.parent;
        const singleColumn = style.isStackingView;
        const uniqueHeadings = headings.map((i, idx) => headings.indexOf(i) === idx);
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
        const newEditableViewProps = {
            GetValue: () => "",
            SetValue: this.addDocument,
            contents: "+ NEW",
            HeadingObject: this.props.headingObject,
            HeadingsHack: this._headingsHack,
            toggle: this.toggleVisibility,
            color: this._color
        };
        const headingView = this.props.headingObject ?
            <div key={heading} className="collectionStackingView-sectionHeader" ref={this._headerRef}
                style={{
                    width: (style.columnWidth) /
                        ((uniqueHeadings.length +
                            ((this.props.parent.props.Document.chromeStatus !== 'view-mode' && this.props.parent.props.Document.chromeStatus !== 'disabled') ? 1 : 0)) || 1)
                }}>
                <div className={"collectionStackingView-collapseBar" + (this.props.headingObject.collapsed === true ? " active" : "")} onClick={this.collapseSection}></div>
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
                            <Flyout anchorPoint={anchorPoints.CENTER_RIGHT} content={this.renderColorPicker()}>
                                <button className="collectionStackingView-sectionColorButton">
                                    <FontAwesomeIcon icon="palette" size="lg" />
                                </button>
                            </ Flyout >
                        </div>
                    }
                    {evContents === `NO ${key.toUpperCase()} VALUE` ?
                        (null) :
                        <button className="collectionStackingView-sectionDelete" onClick={this.deleteColumn}>
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
            </div> : (null);
        for (let i = 0; i < cols; i++) templatecols += `${style.columnWidth / style.numGroupColumns}px `;
        const chromeStatus = this.props.parent.props.Document.chromeStatus;
        return (
            <div className="collectionStackingViewFieldColumn" key={heading} style={{ width: `${100 / ((uniqueHeadings.length + ((chromeStatus !== 'view-mode' && chromeStatus !== 'disabled') ? 1 : 0)) || 1)}%`, background: this._background }}
                ref={this.createColumnDropRef} onPointerEnter={this.pointerEntered} onPointerLeave={this.pointerLeave}>
                {this.props.parent.Document.hideHeadings ? (null) : headingView}
                {
                    this.collapsed ? (null) :
                        <div>
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
                                }}>
                                {this.props.parent.children(this.props.docList)}
                                {singleColumn ? (null) : this.props.parent.columnDragger}
                            </div>
                            {(chromeStatus !== 'view-mode' && chromeStatus !== 'disabled') ?
                                <div key={`${heading}-add-document`} className="collectionStackingView-addDocumentButton"
                                    style={{ width: style.columnWidth / style.numGroupColumns }}>
                                    <EditableView {...newEditableViewProps} />
                                </div> : null}
                        </div>
                }
            </div >
        );
    }
}