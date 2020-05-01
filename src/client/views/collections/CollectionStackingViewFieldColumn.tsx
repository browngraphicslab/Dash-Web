import React = require("react");
import { library } from '@fortawesome/fontawesome-svg-core';
import { faPalette } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { action, observable, runInAction } from "mobx";
import { observer } from "mobx-react";
import { Doc, DocListCast } from "../../../new_fields/Doc";
import { RichTextField } from "../../../new_fields/RichTextField";
import { PastelSchemaPalette, SchemaHeaderField } from "../../../new_fields/SchemaHeaderField";
import { ScriptField } from "../../../new_fields/ScriptField";
import { NumCast, StrCast, Cast } from "../../../new_fields/Types";
import { ImageField } from "../../../new_fields/URLField";
import { TraceMobx } from "../../../new_fields/util";
import { Docs, DocUtils } from "../../documents/Documents";
import { DragManager } from "../../util/DragManager";
import { SelectionManager } from "../../util/SelectionManager";
import { Transform } from "../../util/Transform";
import { undoBatch } from "../../util/UndoManager";
import { ContextMenu } from "../ContextMenu";
import { ContextMenuProps } from "../ContextMenuItem";
import { EditableView } from "../EditableView";
import { CollectionStackingView } from "./CollectionStackingView";
import { setupMoveUpEvents, emptyFunction } from "../../../Utils";
import "./CollectionStackingView.scss";
import { listSpec } from "../../../new_fields/Schema";
const higflyout = require("@hig/flyout");
export const { anchorPoints } = higflyout;
export const Flyout = higflyout.default;

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
    observeHeight: (myref: any) => void;
    unobserveHeight: (myref: any) => void;
}

@observer
export class CollectionStackingViewFieldColumn extends React.Component<CSVFieldColumnProps> {
    @observable private _background = "inherit";

    private dropDisposer?: DragManager.DragDropDisposer;
    private _headerRef: React.RefObject<HTMLDivElement> = React.createRef();

    @observable _heading = this.props.headingObject ? this.props.headingObject.heading : this.props.heading;
    @observable _color = this.props.headingObject ? this.props.headingObject.color : "#f1efeb";
    _ele: HTMLElement | null = null;

    createColumnDropRef = (ele: HTMLDivElement | null) => {
        this.dropDisposer?.();
        if (ele) {
            this._ele = ele;
            this.props.observeHeight(ele);
            this.dropDisposer = DragManager.MakeDropTarget(ele, this.columnDrop.bind(this));
        }
    }
    componentWillUnmount() {
        this.props.unobserveHeight(this._ele);
    }

    @undoBatch
    columnDrop = action((e: Event, de: DragManager.DropEvent) => {
        if (de.complete.docDragData) {
            const key = StrCast(this.props.parent.props.Document._pivotField);
            const castedValue = this.getValue(this._heading);
            de.complete.docDragData.droppedDocuments.forEach(d => Doc.SetInPlace(d, key, castedValue, false));
            this.props.parent.onInternalDrop(e, de);
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
    }

    @action
    addDocument = (value: string, shiftDown?: boolean) => {
        if (!value) return false;
        const key = StrCast(this.props.parent.props.Document._pivotField);
        const newDoc = Docs.Create.TextDocument(value, { _height: 18, _width: 200, title: value, _autoHeight: true });
        newDoc[key] = this.getValue(this.props.heading);
        const maxHeading = this.props.docList.reduce((maxHeading, doc) => NumCast(doc.heading) > maxHeading ? NumCast(doc.heading) : maxHeading, 0);
        const heading = maxHeading === 0 || this.props.docList.length === 0 ? 1 : maxHeading === 1 ? 2 : 3;
        newDoc.heading = heading;
        this.props.parent.props.addDocument(newDoc);
        return false;
    }

    @action
    deleteColumn = () => {
        const key = StrCast(this.props.parent.props.Document._pivotField);
        this.props.docList.forEach(d => d[key] = undefined);
        if (this.props.parent.sectionHeaders && this.props.headingObject) {
            const index = this.props.parent.sectionHeaders.indexOf(this.props.headingObject);
            this.props.parent.sectionHeaders.splice(index, 1);
        }
    }

    @action
    collapseSection = () => {
        if (this.props.headingObject) {
            this.props.headingObject.setCollapsed(!this.props.headingObject.collapsed);
            this.toggleVisibility();
        }
    }

    headerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        setupMoveUpEvents(this, e, this.startDrag, emptyFunction, emptyFunction);
    }

    startDrag = (e: PointerEvent, down: number[], delta: number[]) => {
        const alias = Doc.MakeAlias(this.props.parent.props.Document);
        alias._width = this.props.parent.props.PanelWidth() / (Cast(this.props.parent.props.Document.sectionHeaders, listSpec(SchemaHeaderField))?.length || 1);
        alias._pivotField = undefined;
        const key = StrCast(this.props.parent.props.Document._pivotField);
        let value = this.getValue(this._heading);
        value = typeof value === "string" ? `"${value}"` : value;
        alias.viewSpecScript = ScriptField.MakeFunction(`doc.${key} === ${value}`, { doc: Doc.name });
        if (alias.viewSpecScript) {
            DragManager.StartDocumentDrag([this._headerRef.current!], new DragManager.DocumentDragData([alias]), e.clientX, e.clientY);
            return true;
        }
        return false;
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

    renderMenu = () => {
        return (
            <div className="collectionStackingView-optionPicker">
                <div className="optionOptions">
                    <div className={"optionPicker" + (true ? " active" : "")} onClick={action(() => { })}>Add options here</div>
                </div>
            </div >
        );
    }

    @observable private collapsed: boolean = false;

    private toggleVisibility = action(() => this.collapsed = !this.collapsed);

    menuCallback = (x: number, y: number) => {
        ContextMenu.Instance.clearItems();
        const layoutItems: ContextMenuProps[] = [];
        const docItems: ContextMenuProps[] = [];
        const dataDoc = this.props.parent.props.DataDoc || this.props.parent.Document;

        DocUtils.addDocumentCreatorMenuItems(this.props.parent.props.addDocument, this.props.parent.props.addDocument, x, y);

        Array.from(Object.keys(Doc.GetProto(dataDoc))).filter(fieldKey => dataDoc[fieldKey] instanceof RichTextField || dataDoc[fieldKey] instanceof ImageField || typeof (dataDoc[fieldKey]) === "string").map(fieldKey =>
            docItems.push({
                description: ":" + fieldKey, event: () => {
                    const created = Docs.Get.DocumentFromField(dataDoc, fieldKey, Doc.GetProto(this.props.parent.props.Document));
                    if (created) {
                        if (this.props.parent.Document.isTemplateDoc) {
                            Doc.MakeMetadataFieldTemplate(created, this.props.parent.props.Document);
                        }
                        return this.props.parent.props.addDocument(created);
                    }
                }, icon: "compress-arrows-alt"
            }));
        Array.from(Object.keys(Doc.GetProto(dataDoc))).filter(fieldKey => DocListCast(dataDoc[fieldKey]).length).map(fieldKey =>
            docItems.push({
                description: ":" + fieldKey, event: () => {
                    const created = Docs.Create.CarouselDocument([], { _width: 400, _height: 200, title: fieldKey });
                    if (created) {
                        const container = this.props.parent.Document.resolvedDataDoc ? Doc.GetProto(this.props.parent.Document) : this.props.parent.Document;
                        if (container.isTemplateDoc) {
                            Doc.MakeMetadataFieldTemplate(created, container);
                            return Doc.AddDocToList(container, Doc.LayoutFieldKey(container), created);
                        }
                        return this.props.parent.props.addDocument(created);
                    }
                }, icon: "compress-arrows-alt"
            }));
        layoutItems.push({ description: ":freeform", event: () => this.props.parent.props.addDocument(Docs.Create.FreeformDocument([], { _width: 200, _height: 200, _LODdisable: true })), icon: "compress-arrows-alt" });
        layoutItems.push({ description: ":carousel", event: () => this.props.parent.props.addDocument(Docs.Create.CarouselDocument([], { _width: 400, _height: 200, _LODdisable: true })), icon: "compress-arrows-alt" });
        layoutItems.push({ description: ":columns", event: () => this.props.parent.props.addDocument(Docs.Create.MulticolumnDocument([], { _width: 200, _height: 200 })), icon: "compress-arrows-alt" });
        layoutItems.push({ description: ":image", event: () => this.props.parent.props.addDocument(Docs.Create.ImageDocument("http://www.cs.brown.edu/~bcz/face.gif", { _width: 200, _height: 200 })), icon: "compress-arrows-alt" });

        ContextMenu.Instance.addItem({ description: "Doc Fields ...", subitems: docItems, icon: "eye" });
        ContextMenu.Instance.addItem({ description: "Containers ...", subitems: layoutItems, icon: "eye" });
        ContextMenu.Instance.setDefaultItem("::", (name: string): void => {
            Doc.GetProto(this.props.parent.props.Document)[name] = "";
            const created = Docs.Create.TextDocument("", { title: name, _width: 250, _autoHeight: true });
            if (created) {
                if (this.props.parent.Document.isTemplateDoc) {
                    Doc.MakeMetadataFieldTemplate(created, this.props.parent.props.Document);
                }
                this.props.parent.props.addDocument(created);
            }
        });
        const pt = this.props.screenToLocalTransform().inverse().transformPoint(x, y);
        ContextMenu.Instance.displayMenu(x, y);
    }

    render() {
        TraceMobx();
        const cols = this.props.cols();
        const key = StrCast(this.props.parent.props.Document._pivotField);
        let templatecols = "";
        const headings = this.props.headings();
        const heading = this._heading;
        const style = this.props.parent;
        const singleColumn = style.isStackingView;
        const columnYMargin = this.props.headingObject ? 0 : NumCast(this.props.parent.props.Document._yMargin);
        const uniqueHeadings = headings.map((i, idx) => headings.indexOf(i) === idx);
        const evContents = heading ? heading : this.props.type && this.props.type === "number" ? "0" : `NO ${key.toUpperCase()} VALUE`;
        const headerEditableViewProps = {
            GetValue: () => evContents,
            SetValue: this.headingChanged,
            contents: evContents,
            oneLine: true,
            HeadingObject: this.props.headingObject,
            toggle: this.toggleVisibility,
            color: this._color
        };
        const newEditableViewProps = {
            GetValue: () => "",
            SetValue: this.addDocument,
            contents: "+ NEW",
            HeadingObject: this.props.headingObject,
            toggle: this.toggleVisibility,
            color: this._color
        };
        const headingView = this.props.headingObject ?
            <div key={heading} className="collectionStackingView-sectionHeader" ref={this._headerRef}
                style={{
                    marginTop: NumCast(this.props.parent.props.Document._yMargin),
                    width: (style.columnWidth) /
                        ((uniqueHeadings.length +
                            ((this.props.parent.props.Document._chromeStatus !== 'view-mode' && this.props.parent.props.Document._chromeStatus !== 'disabled') ? 1 : 0)) || 1)
                }}>
                <div className={"collectionStackingView-collapseBar" + (this.props.headingObject.collapsed === true ? " active" : "")} onClick={this.collapseSection}></div>
                {/* the default bucket (no key value) has a tooltip that describes what it is.
                    Further, it does not have a color and cannot be deleted. */}
                <div className="collectionStackingView-sectionHeader-subCont" onPointerDown={this.headerDown}
                    title={evContents === `NO ${key.toUpperCase()} VALUE` ?
                        `Documents that don't have a ${key} value will go here. This column cannot be removed.` : ""}
                    style={{ background: evContents !== `NO ${key.toUpperCase()} VALUE` ? this._color : "inherit" }}>
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
        const chromeStatus = this.props.parent.props.Document._chromeStatus;
        return (
            <div className="collectionStackingViewFieldColumn" key={heading}
                style={{
                    width: `${100 / ((uniqueHeadings.length + ((chromeStatus !== 'view-mode' && chromeStatus !== 'disabled') ? 1 : 0)) || 1)}%`,
                    height: undefined, // SelectionManager.GetIsDragging() ? "100%" : undefined,
                    background: this._background
                }}
                ref={this.createColumnDropRef} onPointerEnter={this.pointerEntered} onPointerLeave={this.pointerLeave}>
                {this.props.parent.Document.hideHeadings ? (null) : headingView}
                {
                    this.collapsed ? (null) :
                        <div>
                            <div key={`${heading}-stack`} className={`collectionStackingView-masonry${singleColumn ? "Single" : "Grid"}`}
                                style={{
                                    padding: singleColumn ? `${columnYMargin}px ${0}px ${style.yMargin}px ${0}px` : `${columnYMargin}px ${0}px`,
                                    margin: "auto",
                                    width: "max-content", //singleColumn ? undefined : `${cols * (style.columnWidth + style.gridGap) + 2 * style.xMargin - style.gridGap}px`,
                                    height: 'max-content',
                                    position: "relative",
                                    gridGap: style.gridGap,
                                    gridTemplateColumns: singleColumn ? undefined : templatecols,
                                    gridAutoRows: singleColumn ? undefined : "0px"
                                }}>
                                {this.props.parent.children(this.props.docList, uniqueHeadings.length)}
                                {singleColumn ? (null) : this.props.parent.columnDragger}
                            </div>
                            {(chromeStatus !== 'view-mode' && chromeStatus !== 'disabled') ?
                                <div key={`${heading}-add-document`} className="collectionStackingView-addDocumentButton"
                                    style={{ width: style.columnWidth / style.numGroupColumns }}>
                                    <EditableView {...newEditableViewProps} menuCallback={this.menuCallback} />
                                </div> : null}
                        </div>
                }
            </div >
        );
    }
}