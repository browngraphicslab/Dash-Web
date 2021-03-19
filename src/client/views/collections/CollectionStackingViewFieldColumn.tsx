import React = require("react");
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { action, computed, observable } from "mobx";
import { observer } from "mobx-react";
import { Doc, DocListCast, Opt } from "../../../fields/Doc";
import { RichTextField } from "../../../fields/RichTextField";
import { PastelSchemaPalette, SchemaHeaderField } from "../../../fields/SchemaHeaderField";
import { ScriptField } from "../../../fields/ScriptField";
import { Cast, NumCast, StrCast } from "../../../fields/Types";
import { ImageField } from "../../../fields/URLField";
import { TraceMobx } from "../../../fields/util";
import { emptyFunction, setupMoveUpEvents, returnFalse, returnEmptyString } from "../../../Utils";
import { Docs, DocUtils } from "../../documents/Documents";
import { DocumentType } from "../../documents/DocumentTypes";
import { DragManager } from "../../util/DragManager";
import { SnappingManager } from "../../util/SnappingManager";
import { Transform } from "../../util/Transform";
import { undoBatch } from "../../util/UndoManager";
import { ContextMenu } from "../ContextMenu";
import { ContextMenuProps } from "../ContextMenuItem";
import { EditableView } from "../EditableView";
import "./CollectionStackingView.scss";
import { FormattedTextBox } from "../nodes/formattedText/FormattedTextBox";
import { Id } from "../../../fields/FieldSymbols";
const higflyout = require("@hig/flyout");
export const { anchorPoints } = higflyout;
export const Flyout = higflyout.default;

interface CSVFieldColumnProps {
    Document: Doc;
    DataDoc: Opt<Doc>;
    docList: Doc[];
    heading: string;
    pivotField: string;
    chromeHidden?: boolean;
    columnHeaders: SchemaHeaderField[] | undefined;
    headingObject: SchemaHeaderField | undefined;
    yMargin: number;
    columnWidth: number;
    numGroupColumns: number;
    gridGap: number;
    type: "string" | "number" | "bigint" | "boolean" | "symbol" | "undefined" | "object" | "function" | undefined;
    headings: () => object[];
    renderChildren: (docs: Doc[]) => JSX.Element[];
    addDocument: (doc: Doc | Doc[]) => boolean;
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

    @observable _paletteOn = false;
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
        const drop = { docs: de.complete.docDragData?.droppedDocuments, val: this.getValue(this._heading) };
        drop.docs?.forEach(d => Doc.SetInPlace(d, this.props.pivotField, drop.val, false));
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
        const castedValue = this.getValue(value);
        if (castedValue) {
            if (this.props.columnHeaders?.map(i => i.heading).indexOf(castedValue.toString()) !== -1) {
                return false;
            }
            this.props.docList.forEach(d => d[this.props.pivotField] = castedValue);
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
        this.props.headingObject?.setColor(color);
        this._color = color;
    }

    @action pointerEntered = () => SnappingManager.GetIsDragging() && (this._background = "#b4b4b4");
    @action pointerLeave = () => this._background = "inherit";
    textCallback = (char: string) => this.addNewTextDoc("", false, true);

    @action
    addNewTextDoc = (value: string, shiftDown?: boolean, forceEmptyNote?: boolean) => {
        if (!value && !forceEmptyNote) return false;
        const key = this.props.pivotField;
        const newDoc = Docs.Create.TextDocument(value, { _height: 18, _width: 200, _fitWidth: true, title: value, _autoHeight: true });
        newDoc[key] = this.getValue(this.props.heading);
        const maxHeading = this.props.docList.reduce((maxHeading, doc) => NumCast(doc.heading) > maxHeading ? NumCast(doc.heading) : maxHeading, 0);
        const heading = maxHeading === 0 || this.props.docList.length === 0 ? 1 : maxHeading === 1 ? 2 : 3;
        newDoc.heading = heading;
        FormattedTextBox.SelectOnLoad = newDoc[Id];
        FormattedTextBox.SelectOnLoadChar = forceEmptyNote ? "" : " ";
        return this.props.addDocument?.(newDoc) || false;
    }

    @action
    deleteColumn = () => {
        this.props.docList.forEach(d => d[this.props.pivotField] = undefined);
        if (this.props.columnHeaders && this.props.headingObject) {
            const index = this.props.columnHeaders.indexOf(this.props.headingObject);
            this.props.columnHeaders.splice(index, 1);
        }
    }

    @action
    collapseSection = () => {
        this.props.headingObject?.setCollapsed(!this.props.headingObject.collapsed);
        this.toggleVisibility();
    }

    headerDown = (e: React.PointerEvent<HTMLDivElement>) => setupMoveUpEvents(this, e, this.startDrag, emptyFunction, emptyFunction);

    startDrag = (e: PointerEvent, down: number[], delta: number[]) => {
        const alias = Doc.MakeAlias(this.props.Document);
        alias._width = this.props.columnWidth / (this.props.columnHeaders?.length || 1);
        alias._pivotField = undefined;
        let value = this.getValue(this._heading);
        value = typeof value === "string" ? `"${value}"` : value;
        alias.viewSpecScript = ScriptField.MakeFunction(`doc.${this.props.pivotField} === ${value}`, { doc: Doc.name });
        if (alias.viewSpecScript) {
            DragManager.StartDocumentDrag([this._headerRef.current!], new DragManager.DocumentDragData([alias]), e.clientX, e.clientY);
            return true;
        }
        return false;
    }

    renderColorPicker = () => {
        const gray = "#f1efeb";
        const selected = this.props.headingObject ? this.props.headingObject.color : gray;
        const colors = ["pink2", "purple4", "bluegreen1", "yellow4", "gray", "red2", "bluegreen7", "bluegreen5", "orange1"];
        return <div className="collectionStackingView-colorPicker">
            <div className="colorOptions">
                {colors.map(col => {
                    const palette = PastelSchemaPalette.get(col);
                    return <div className={"colorPicker" + (selected === palette ? " active" : "")} style={{ backgroundColor: palette }} onClick={() => this.changeColumnColor(palette!)} />
                })}
            </div>
        </div>;
    }

    renderMenu = () => {
        return <div className="collectionStackingView-optionPicker">
            <div className="optionOptions">
                <div className={"optionPicker" + (true ? " active" : "")} onClick={action(() => { })}>Add options here</div>
            </div>
        </div >;
    }

    @observable private collapsed: boolean = false;

    private toggleVisibility = action(() => this.collapsed = !this.collapsed);

    menuCallback = (x: number, y: number) => {
        ContextMenu.Instance.clearItems();
        const layoutItems: ContextMenuProps[] = [];
        const docItems: ContextMenuProps[] = [];
        const dataDoc = this.props.DataDoc || this.props.Document;

        DocUtils.addDocumentCreatorMenuItems((doc) => {
            FormattedTextBox.SelectOnLoad = doc[Id];
            return this.props.addDocument?.(doc);
        }, this.props.addDocument, x, y, true);

        Array.from(Object.keys(Doc.GetProto(dataDoc))).filter(fieldKey => dataDoc[fieldKey] instanceof RichTextField || dataDoc[fieldKey] instanceof ImageField || typeof (dataDoc[fieldKey]) === "string").map(fieldKey =>
            docItems.push({
                description: ":" + fieldKey, event: () => {
                    const created = DocUtils.DocumentFromField(dataDoc, fieldKey, Doc.GetProto(this.props.Document));
                    if (created) {
                        if (this.props.Document.isTemplateDoc) {
                            Doc.MakeMetadataFieldTemplate(created, this.props.Document);
                        }
                        return this.props.addDocument?.(created);
                    }
                }, icon: "compress-arrows-alt"
            }));
        Array.from(Object.keys(Doc.GetProto(dataDoc))).filter(fieldKey => DocListCast(dataDoc[fieldKey]).length).map(fieldKey =>
            docItems.push({
                description: ":" + fieldKey, event: () => {
                    const created = Docs.Create.CarouselDocument([], { _width: 400, _height: 200, title: fieldKey });
                    if (created) {
                        const container = this.props.Document.resolvedDataDoc ? Doc.GetProto(this.props.Document) : this.props.Document;
                        if (container.isTemplateDoc) {
                            Doc.MakeMetadataFieldTemplate(created, container);
                            return Doc.AddDocToList(container, Doc.LayoutFieldKey(container), created);
                        }
                        return this.props.addDocument?.(created) || false;
                    }
                }, icon: "compress-arrows-alt"
            }));
        !Doc.UserDoc().noviceMode && ContextMenu.Instance.addItem({ description: "Doc Fields ...", subitems: docItems, icon: "eye" });
        !Doc.UserDoc().noviceMode && ContextMenu.Instance.addItem({ description: "Containers ...", subitems: layoutItems, icon: "eye" });
        ContextMenu.Instance.setDefaultItem("::", (name: string): void => {
            Doc.GetProto(this.props.Document)[name] = "";
            const created = Docs.Create.TextDocument("", { title: name, _width: 250, _autoHeight: true });
            if (created) {
                if (this.props.Document.isTemplateDoc) {
                    Doc.MakeMetadataFieldTemplate(created, this.props.Document);
                }
                this.props.addDocument?.(created);
            }
        });
        const pt = this.props.screenToLocalTransform().inverse().transformPoint(x, y);
        ContextMenu.Instance.displayMenu(x, y);
    }
    @computed get innards() {
        TraceMobx();
        const key = this.props.pivotField;
        const headings = this.props.headings();
        const heading = this._heading;
        const columnYMargin = this.props.headingObject ? 0 : this.props.yMargin;
        const uniqueHeadings = headings.map((i, idx) => headings.indexOf(i) === idx);
        const evContents = heading ? heading : this.props?.type === "number" ? "0" : `NO ${key.toUpperCase()} VALUE`;
        const headingView = this.props.headingObject ?
            <div key={heading} className="collectionStackingView-sectionHeader" ref={this._headerRef}
                style={{
                    marginTop: this.props.yMargin,
                    width: (this.props.columnWidth) /
                        ((uniqueHeadings.length + (this.props.chromeHidden ? 0 : 1)) || 1)
                }}>
                <div className={"collectionStackingView-collapseBar" + (this.props.headingObject.collapsed === true ? " active" : "")} onClick={this.collapseSection}></div>
                {/* the default bucket (no key value) has a tooltip that describes what it is.
                    Further, it does not have a color and cannot be deleted. */}
                <div className="collectionStackingView-sectionHeader-subCont" onPointerDown={this.headerDown}
                    title={evContents === `NO ${key.toUpperCase()} VALUE` ?
                        `Documents that don't have a ${key} value will go here. This column cannot be removed.` : ""}
                    style={{ background: evContents !== `NO ${key.toUpperCase()} VALUE` ? this._color : "inherit" }}>
                    <EditableView
                        GetValue={() => evContents}
                        SetValue={this.headingChanged}
                        contents={evContents}
                        oneLine={true}
                        toggle={this.toggleVisibility} />
                    {evContents === `NO ${key.toUpperCase()} VALUE` ? (null) :
                        <div className="collectionStackingView-sectionColor">
                            <button className="collectionStackingView-sectionColorButton" onClick={action(e => this._paletteOn = !this._paletteOn)}>
                                <FontAwesomeIcon icon="palette" size="lg" />
                            </button>
                            {this._paletteOn ? this.renderColorPicker() : (null)}
                        </div>
                    }
                    {<button className="collectionStackingView-sectionDelete" onClick={this.deleteColumn}>
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
        const templatecols = `${this.props.columnWidth / this.props.numGroupColumns}px `;
        const type = this.props.Document.type;
        return <>
            {this.props.Document._columnsHideIfEmpty ? (null) : headingView}
            {
                this.collapsed ? (null) :
                    <div>
                        <div key={`${heading}-stack`} className={`collectionStackingView-masonrySingle`}
                            style={{
                                padding: `${columnYMargin}px ${0}px ${this.props.yMargin}px ${0}px`,
                                margin: "auto",
                                width: "max-content", //singleColumn ? undefined : `${cols * (style.columnWidth + style.gridGap) + 2 * style.xMargin - style.gridGap}px`,
                                height: 'max-content',
                                position: "relative",
                                gridGap: this.props.gridGap,
                                gridTemplateColumns: templatecols,
                                gridAutoRows: "0px"
                            }}>
                            {this.props.renderChildren(this.props.docList)}
                        </div>
                        {!this.props.chromeHidden && type !== DocumentType.PRES ?
                            <div key={`${heading}-add-document`} className="collectionStackingView-addDocumentButton"
                                style={{ width: this.props.columnWidth / this.props.numGroupColumns, marginBottom: 10 }}>
                                <EditableView
                                    GetValue={returnEmptyString}
                                    SetValue={this.addNewTextDoc}
                                    textCallback={this.textCallback}
                                    contents={"+ NEW"}
                                    toggle={this.toggleVisibility}
                                    menuCallback={this.menuCallback} />
                            </div> : null}
                    </div>
            }
        </>;
    }


    render() {
        TraceMobx();
        const headings = this.props.headings();
        const heading = this._heading;
        const uniqueHeadings = headings.map((i, idx) => headings.indexOf(i) === idx);
        return (
            <div className={"collectionStackingViewFieldColumn" + (SnappingManager.GetIsDragging() ? "Dragging" : "")} key={heading}
                style={{
                    width: `${100 / (uniqueHeadings.length + (this.props.chromeHidden ? 0 : 1) || 1)}%`,
                    height: undefined, // DraggingManager.GetIsDragging() ? "100%" : undefined,
                    background: this._background
                }}
                ref={this.createColumnDropRef} onPointerEnter={this.pointerEntered} onPointerLeave={this.pointerLeave}>
                {this.innards}
            </div >
        );
    }
}