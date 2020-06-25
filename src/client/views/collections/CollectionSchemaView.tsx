import React = require("react");
import { library, IconProp } from '@fortawesome/fontawesome-svg-core';
import { faCog, faPlus, faSortDown, faSortUp, faTable } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { action, computed, observable, untracked } from "mobx";
import { observer } from "mobx-react";
import ReactTable, { CellInfo, Column, ComponentPropsGetterR, Resize, SortingRule } from "react-table";
import "react-table/react-table.css";
import { Doc, DocListCast, Field, Opt } from "../../../fields/Doc";
import { Id } from "../../../fields/FieldSymbols";
import { List } from "../../../fields/List";
import { listSpec } from "../../../fields/Schema";
import { SchemaHeaderField, PastelSchemaPalette } from "../../../fields/SchemaHeaderField";
import { ComputedField } from "../../../fields/ScriptField";
import { Cast, FieldValue, NumCast, StrCast, BoolCast } from "../../../fields/Types";
import { Docs, DocumentOptions } from "../../documents/Documents";
import { CompileScript, Transformer, ts } from "../../util/Scripting";
import { Transform } from "../../util/Transform";
import { undoBatch } from "../../util/UndoManager";
import { COLLECTION_BORDER_WIDTH } from '../../views/globalCssVariables.scss';
import { ContextMenu } from "../ContextMenu";
import '../DocumentDecorations.scss';
import { CellProps, CollectionSchemaCell, CollectionSchemaCheckboxCell, CollectionSchemaDocCell, CollectionSchemaNumberCell, CollectionSchemaStringCell, CollectionSchemaImageCell, CollectionSchemaListCell } from "./CollectionSchemaCells";
import { CollectionSchemaAddColumnHeader, CollectionSchemaHeader, CollectionSchemaColumnMenu, KeysDropdown } from "./CollectionSchemaHeaders";
import { MovableColumn, MovableRow } from "./CollectionSchemaMovableTableHOC";
import "./CollectionSchemaView.scss";
import { CollectionSubView } from "./CollectionSubView";
import { CollectionView } from "./CollectionView";
import { ContentFittingDocumentView } from "../nodes/ContentFittingDocumentView";
import { setupMoveUpEvents, emptyFunction, returnZero, returnOne, returnFalse, returnEmptyFilter, emptyPath } from "../../../Utils";
import { SnappingManager } from "../../util/SnappingManager";

library.add(faCog, faPlus, faSortUp, faSortDown);
library.add(faTable);
// bcz: need to add drag and drop of rows and columns.  This seems like it might work for rows: https://codesandbox.io/s/l94mn1q657

export enum ColumnType {
    Any,
    Number,
    String,
    Boolean,
    Doc,
    Image,
    List
}
// this map should be used for keys that should have a const type of value
const columnTypes: Map<string, ColumnType> = new Map([
    ["title", ColumnType.String],
    ["x", ColumnType.Number], ["y", ColumnType.Number], ["_width", ColumnType.Number], ["_height", ColumnType.Number],
    ["_nativeWidth", ColumnType.Number], ["_nativeHeight", ColumnType.Number], ["isPrototype", ColumnType.Boolean],
    ["page", ColumnType.Number], ["curPage", ColumnType.Number], ["currentTimecode", ColumnType.Number], ["zIndex", ColumnType.Number]
]);

@observer
export class CollectionSchemaView extends CollectionSubView(doc => doc) {
    private _previewCont?: HTMLDivElement;
    private DIVIDER_WIDTH = 4;

    @observable previewDoc: Doc | undefined = undefined;
    @observable private _focusedTable: Doc = this.props.Document;

    @computed get previewWidth() { return () => NumCast(this.props.Document.schemaPreviewWidth); }
    @computed get previewHeight() { return () => this.props.PanelHeight() - 2 * this.borderWidth; }
    @computed get tableWidth() { return this.props.PanelWidth() - 2 * this.borderWidth - this.DIVIDER_WIDTH - this.previewWidth(); }
    @computed get borderWidth() { return Number(COLLECTION_BORDER_WIDTH); }

    @observable pointerX: number = 0;
    @observable pointerY: number = 0;
    @computed get menuCoordinates() { return this.props.ScreenToLocalTransform().transformPoint(this.pointerX, this.pointerY); }

    @computed get columns() {
        return Cast(this.props.Document.schemaColumns, listSpec(SchemaHeaderField), []);
    }
    set columns(columns: SchemaHeaderField[]) {
        this.props.Document.schemaColumns = new List<SchemaHeaderField>(columns);
    }

    get documentKeys() {
        const docs = this.childDocs;
        const keys: { [key: string]: boolean } = {};
        // bcz: ugh.  this is untracked since otherwise a large collection of documents will blast the server for all their fields.
        //  then as each document's fields come back, we update the documents _proxies.  Each time we do this, the whole schema will be
        //  invalidated and re-rendered.   This workaround will inquire all of the document fields before the options button is clicked.
        //  then by the time the options button is clicked, all of the fields should be in place.  If a new field is added while this menu
        //  is displayed (unlikely) it won't show up until something else changes.
        //TODO Types
        untracked(() => docs.map(doc => Doc.GetAllPrototypes(doc).map(proto => Object.keys(proto).forEach(key => keys[key] = false))));

        this.columns.forEach(key => keys[key.heading] = true);
        return Array.from(Object.keys(keys));
    }

    @observable col: any = "";
    @computed get possibleKeys() { return this.documentKeys.filter(key => this.columns.findIndex(existingKey => existingKey.heading.toUpperCase() === key.toUpperCase()) === -1); }

    @observable menuContent: any = "";
    @observable headerOpen: boolean = false;

    @observable private _isOpen: boolean = false;
    @observable private _node: HTMLDivElement | null = null;

    @observable _headerIsEditing: boolean = false;

    componentDidMount() {
        document.addEventListener("pointerdown", this.detectClick);
    }

    componentWillUnmount() {
        document.removeEventListener("pointerdown", this.detectClick);
    }

    @action setHeaderIsEditing = (isEditing: boolean) => this._headerIsEditing = isEditing;

    detectClick = (e: PointerEvent): void => {
        if (this._node && this._node.contains(e.target as Node)) {
        } else {
            this._isOpen = false;
            this.setHeaderIsEditing(false);
        }
    }

    @action
    toggleIsOpen = (): void => {
        this._isOpen = !this._isOpen;
        this.setHeaderIsEditing(this._isOpen);
    }




    changeColumnType = (type: ColumnType, col: any): void => {
        this.setColumnType(col, type);
    }

    changeColumnSort = (desc: boolean | undefined, col: any): void => {
        this.setColumnSort(col, desc);
    }

    changeColumnColor = (color: string, col: any): void => {
        this.setColumnColor(col, color);
    }

    @undoBatch
    setColumnType = (columnField: SchemaHeaderField, type: ColumnType): void => {
        if (columnTypes.get(columnField.heading)) return;

        const columns = this.columns;
        const index = columns.indexOf(columnField);
        if (index > -1) {
            columnField.setType(NumCast(type));
            columns[index] = columnField;
            this.columns = columns;
        }
    }

    @undoBatch
    setColumnColor = (columnField: SchemaHeaderField, color: string): void => {
        const columns = this.columns;
        const index = columns.indexOf(columnField);
        if (index > -1) {
            columnField.setColor(color);
            columns[index] = columnField;
            this.columns = columns; // need to set the columns to trigger rerender
        }
    }

    @undoBatch
    @action
    setColumnSort = (columnField: SchemaHeaderField, descending: boolean | undefined) => {
        const columns = this.columns;
        const index = columns.findIndex(c => c.heading === columnField.heading);
        const column = columns[index];
        column.setDesc(descending);
        columns[index] = column;
        this.columns = columns;
    }



    @action
    setNode = (node: HTMLDivElement): void => {
        if (node) {
            this._node = node;
        }
    }

    renderTypes = (col: any) => {
        if (columnTypes.get(col.heading)) return <></>;

        const type = col.type;
        return (
            <div className="collectionSchema-headerMenu-group">
                <label>Column type:</label>
                <div className="columnMenu-types">
                    <div className={"columnMenu-option" + (type === ColumnType.Any ? " active" : "")} onClick={() => this.changeColumnType(ColumnType.Any, col)}>
                        <FontAwesomeIcon icon={"align-justify"} size="sm" />
                        Any
                    </div>
                    <div className={"columnMenu-option" + (type === ColumnType.Number ? " active" : "")} onClick={() => this.changeColumnType(ColumnType.Number, col)}>
                        <FontAwesomeIcon icon={"hashtag"} size="sm" />
                        Number
                    </div>
                    <div className={"columnMenu-option" + (type === ColumnType.String ? " active" : "")} onClick={() => this.changeColumnType(ColumnType.String, col)}>
                        <FontAwesomeIcon icon={"font"} size="sm" />
                        Text
                    </div>
                    <div className={"columnMenu-option" + (type === ColumnType.Boolean ? " active" : "")} onClick={() => this.changeColumnType(ColumnType.Boolean, col)}>
                        <FontAwesomeIcon icon={"check-square"} size="sm" />
                        Checkbox
                    </div>
                    <div className={"columnMenu-option" + (type === ColumnType.List ? " active" : "")} onClick={() => this.changeColumnType(ColumnType.List, col)}>
                        <FontAwesomeIcon icon={"list-ul"} size="sm" />
                        List
                    </div>
                    <div className={"columnMenu-option" + (type === ColumnType.Doc ? " active" : "")} onClick={() => this.changeColumnType(ColumnType.Doc, col)}>
                        <FontAwesomeIcon icon={"file"} size="sm" />
                        Document
                    </div>
                    <div className={"columnMenu-option" + (type === ColumnType.Image ? " active" : "")} onClick={() => this.changeColumnType(ColumnType.Image, col)}>
                        <FontAwesomeIcon icon={"image"} size="sm" />
                        Image
                    </div>
                </div>
            </div >
        );
    }

    renderSorting = (col: any) => {
        const sort = col.desc;
        return (
            <div className="collectionSchema-headerMenu-group">
                <label>Sort by:</label>
                <div className="columnMenu-sort">
                    <div className={"columnMenu-option" + (sort === true ? " active" : "")} onClick={() => this.changeColumnSort(true, col)}>
                        <FontAwesomeIcon icon="sort-amount-down" size="sm" />
                        Sort descending
                    </div>
                    <div className={"columnMenu-option" + (sort === false ? " active" : "")} onClick={() => this.changeColumnSort(false, col)}>
                        <FontAwesomeIcon icon="sort-amount-up" size="sm" />
                        Sort ascending
                    </div>
                    <div className="columnMenu-option" onClick={() => this.changeColumnSort(undefined, col)}>
                        <FontAwesomeIcon icon="times" size="sm" />
                        Clear sorting
                    </div>
                </div>
            </div>
        );
    }

    renderColors = (col: any) => {
        const selected = col.color;

        const pink = PastelSchemaPalette.get("pink2");
        const purple = PastelSchemaPalette.get("purple2");
        const blue = PastelSchemaPalette.get("bluegreen1");
        const yellow = PastelSchemaPalette.get("yellow4");
        const red = PastelSchemaPalette.get("red2");
        const gray = "#f1efeb";

        return (
            <div className="collectionSchema-headerMenu-group">
                <label>Color:</label>
                <div className="columnMenu-colors">
                    <div className={"columnMenu-colorPicker" + (selected === pink ? " active" : "")} style={{ backgroundColor: pink }} onClick={() => this.changeColumnColor(pink!, col)}></div>
                    <div className={"columnMenu-colorPicker" + (selected === purple ? " active" : "")} style={{ backgroundColor: purple }} onClick={() => this.changeColumnColor(purple!, col)}></div>
                    <div className={"columnMenu-colorPicker" + (selected === blue ? " active" : "")} style={{ backgroundColor: blue }} onClick={() => this.changeColumnColor(blue!, col)}></div>
                    <div className={"columnMenu-colorPicker" + (selected === yellow ? " active" : "")} style={{ backgroundColor: yellow }} onClick={() => this.changeColumnColor(yellow!, col)}></div>
                    <div className={"columnMenu-colorPicker" + (selected === red ? " active" : "")} style={{ backgroundColor: red }} onClick={() => this.changeColumnColor(red!, col)}></div>
                    <div className={"columnMenu-colorPicker" + (selected === gray ? " active" : "")} style={{ backgroundColor: gray }} onClick={() => this.changeColumnColor(gray, col)}></div>
                </div>
            </div>
        );
    }

    @undoBatch
    @action
    changeColumns = (oldKey: string, newKey: string, addNew: boolean) => {
        const columns = this.columns;
        if (columns === undefined) {
            this.columns = new List<SchemaHeaderField>([new SchemaHeaderField(newKey, "f1efeb")]);
        } else {
            if (addNew) {
                columns.push(new SchemaHeaderField(newKey, "f1efeb"));
                this.columns = columns;
            } else {
                const index = columns.map(c => c.heading).indexOf(oldKey);
                if (index > -1) {
                    const column = columns[index];
                    column.setHeading(newKey);
                    columns[index] = column;
                    this.columns = columns;
                }
            }
        }
    }

    @action
    openHeader = (col: any, menu: any) => {
        this.menuContent = menu;
        this.col = col;
        this.headerOpen = !this.headerOpen;
    }

    renderContent = (col: any) => {
        return (
            <div className="collectionSchema-header-menuOptions">
                <div className="collectionSchema-headerMenu-group">
                    <label>Key:</label>
                    <KeysDropdown
                        keyValue={col.heading}
                        possibleKeys={this.possibleKeys}
                        existingKeys={this.columns.map(c => c.heading)}
                        canAddNew={true}
                        addNew={false}
                        onSelect={this.changeColumns}
                        setIsEditing={this.setHeaderIsEditing}
                    />
                </div>
                {false ? <></> :
                    <>
                        {this.renderTypes(col)}
                        {this.renderSorting(col)}
                        {this.renderColors(col)}
                        <div className="collectionSchema-headerMenu-group">
                            <button onClick={() => this.deleteColumn(col.heading)}>Delete Column</button>
                        </div>
                    </>
                }
            </div>
        );
    }

    @undoBatch
    @action
    deleteColumn = (key: string) => {
        const columns = this.columns;
        if (columns === undefined) {
            this.columns = new List<SchemaHeaderField>([]);
        } else {
            const index = columns.map(c => c.heading).indexOf(key);
            if (index > -1) {
                columns.splice(index, 1);
                this.columns = columns;
            }
        }
    }

    getPreviewTransform = (): Transform => {
        return this.props.ScreenToLocalTransform().translate(- this.borderWidth - 4 - this.tableWidth, - this.borderWidth);
    }

    //anchorPoints.TOP_CENTER 

    @computed get renderMenu() {
        return (
            <div className="collectionSchema-header-menu" ref={this.setNode}
                style={{
                    position: "absolute", background: "white",
                    transform: `translate(${this.menuCoordinates[0]}px, ${this.menuCoordinates[1] - 150}px)`
                }}>
                {/* <Flyout anchorPoint={anchorPoints.TOP_CENTER} content={this.renderContent(this.col)}>
                    <div className="collectionSchema-header-toggler" onClick={() => this.toggleIsOpen()}>{this.menuContent}</div>
                </ Flyout > */}
                {this.renderContent(this.col)}
            </div>
        );
    }

    private createTarget = (ele: HTMLDivElement) => {
        this._previewCont = ele;
        super.CreateDropTarget(ele);
    }

    isFocused = (doc: Doc): boolean => this.props.isSelected() && doc === this._focusedTable;

    @action setFocused = (doc: Doc) => this._focusedTable = doc;

    @action setPreviewDoc = (doc: Doc) => this.previewDoc = doc;

    //toggles preview side-panel of schema
    @action
    toggleExpander = () => {
        this.props.Document.schemaPreviewWidth = this.previewWidth() === 0 ? Math.min(this.tableWidth / 3, 200) : 0;
    }

    onDividerDown = (e: React.PointerEvent) => {
        setupMoveUpEvents(this, e, this.onDividerMove, emptyFunction, action(() => this.toggleExpander()));
    }
    @action
    onDividerMove = (e: PointerEvent, down: number[], delta: number[]) => {
        const nativeWidth = this._previewCont!.getBoundingClientRect();
        const minWidth = 40;
        const maxWidth = 1000;
        const movedWidth = this.props.ScreenToLocalTransform().transformDirection(nativeWidth.right - e.clientX, 0)[0];
        const width = movedWidth < minWidth ? minWidth : movedWidth > maxWidth ? maxWidth : movedWidth;
        this.props.Document.schemaPreviewWidth = width;
        return false;
    }

    onPointerDown = (e: React.PointerEvent): void => {
        if (e.button === 0 && !e.altKey && !e.ctrlKey && !e.metaKey) {
            if (this.props.isSelected(true)) e.stopPropagation();
            else {
                this.props.select(false);
            }
        }
        this.headerOpen = false;
    }

    @computed
    get previewDocument(): Doc | undefined { return this.previewDoc; }

    @computed
    get dividerDragger() {
        return this.previewWidth() === 0 ? (null) :
            <div className="collectionSchemaView-dividerDragger" onPointerDown={this.onDividerDown} style={{ width: `${this.DIVIDER_WIDTH}px` }} />;
    }

    @computed
    get previewPanel() {
        return <div ref={this.createTarget} style={{ width: `${this.previewWidth()}px` }}>
            {!this.previewDocument ? (null) :
                <ContentFittingDocumentView
                    Document={this.previewDocument}
                    DataDoc={undefined}
                    NativeHeight={returnZero}
                    NativeWidth={returnZero}
                    fitToBox={true}
                    FreezeDimensions={true}
                    focus={emptyFunction}
                    LibraryPath={this.props.LibraryPath}
                    renderDepth={this.props.renderDepth}
                    rootSelected={this.rootSelected}
                    PanelWidth={this.previewWidth}
                    PanelHeight={this.previewHeight}
                    ScreenToLocalTransform={this.getPreviewTransform}
                    docFilters={this.docFilters}
                    ContainingCollectionDoc={this.props.CollectionView?.props.Document}
                    ContainingCollectionView={this.props.CollectionView}
                    moveDocument={this.props.moveDocument}
                    addDocument={this.props.addDocument}
                    removeDocument={this.props.removeDocument}
                    parentActive={this.props.active}
                    whenActiveChanged={this.props.whenActiveChanged}
                    addDocTab={this.props.addDocTab}
                    pinToPres={this.props.pinToPres}
                    bringToFront={returnFalse}
                    ContentScaling={returnOne}
                />}
        </div>;
    }

    @computed
    get schemaTable() {
        const preview = "";
        return <SchemaTable
            Document={this.props.Document}
            PanelHeight={this.props.PanelHeight}
            PanelWidth={this.props.PanelWidth}
            childDocs={this.childDocs}
            CollectionView={this.props.CollectionView}
            ContainingCollectionView={this.props.ContainingCollectionView}
            ContainingCollectionDoc={this.props.ContainingCollectionDoc}
            fieldKey={this.props.fieldKey}
            renderDepth={this.props.renderDepth}
            moveDocument={this.props.moveDocument}
            ScreenToLocalTransform={this.props.ScreenToLocalTransform}
            active={this.props.active}
            onDrop={this.onExternalDrop}
            addDocTab={this.props.addDocTab}
            pinToPres={this.props.pinToPres}
            isSelected={this.props.isSelected}
            isFocused={this.isFocused}
            setFocused={this.setFocused}
            setPreviewDoc={this.setPreviewDoc}
            deleteDocument={this.props.removeDocument}
            addDocument={this.props.addDocument}
            dataDoc={this.props.DataDoc}
            columns={this.columns}
            documentKeys={this.documentKeys}
            headerIsEditing={this._headerIsEditing}
            openHeader={this.openHeader}
            onPointerDown={this.onTablePointerDown}
            onResizedChange={this.onResizedChange}
            setColumns={this.setColumns}
            reorderColumns={this.reorderColumns}
        />;
    }

    @computed
    public get schemaToolbar() {
        return <div className="collectionSchemaView-toolbar">
            <div className="collectionSchemaView-toolbar-item">
                <div id="preview-schema-checkbox-div"><input type="checkbox" key={"Show Preview"} checked={this.previewWidth() !== 0} onChange={this.toggleExpander} />Show Preview</div>
            </div>
        </div>;
    }

    @action
    onTablePointerDown = (e: React.PointerEvent): void => {
        this.setFocused(this.props.Document);
        if (e.button === 0 && !e.altKey && !e.ctrlKey && !e.metaKey && this.props.isSelected(true)) {
            e.stopPropagation();
        }
        this.pointerY = e.screenY;
        this.pointerX = e.screenX;
        this.headerOpen = false;
    }

    onResizedChange = (newResized: Resize[], event: any) => {
        const columns = this.columns;
        newResized.forEach(resized => {
            const index = columns.findIndex(c => c.heading === resized.id);
            const column = columns[index];
            column.setWidth(resized.value);
            columns[index] = column;
        });
        this.columns = columns;
    }

    @action
    setColumns = (columns: SchemaHeaderField[]) => this.columns = columns

    @undoBatch
    reorderColumns = (toMove: SchemaHeaderField, relativeTo: SchemaHeaderField, before: boolean, columnsValues: SchemaHeaderField[]) => {
        const columns = [...columnsValues];
        const oldIndex = columns.indexOf(toMove);
        const relIndex = columns.indexOf(relativeTo);
        const newIndex = (oldIndex > relIndex && !before) ? relIndex + 1 : (oldIndex < relIndex && before) ? relIndex - 1 : relIndex;

        if (oldIndex === newIndex) return;

        columns.splice(newIndex, 0, columns.splice(oldIndex, 1)[0]);
        this.columns = columns;
    }

    render() {
        return <div className="collectionSchemaView-container"
            style={{
                pointerEvents: !this.props.active() && !SnappingManager.GetIsDragging() ? "none" : undefined,
                width: this.props.PanelWidth() || "100%", height: this.props.PanelHeight() || "100%"
            }}  >
            <div className="collectionSchemaView-tableContainer" style={{ width: `calc(100% - ${this.previewWidth()}px)` }} onPointerDown={this.onPointerDown} onWheel={e => this.props.active(true) && e.stopPropagation()} onDrop={e => this.onExternalDrop(e, {})} ref={this.createTarget}>
                {this.schemaTable}
            </div>
            {this.dividerDragger}
            {!this.previewWidth() ? (null) : this.previewPanel}
            {this.headerOpen ? this.renderMenu : null}
        </div>;
    }
}



export interface SchemaTableProps {
    Document: Doc; // child doc
    dataDoc?: Doc;
    PanelHeight: () => number;
    PanelWidth: () => number;
    childDocs?: Doc[];
    CollectionView: Opt<CollectionView>;
    ContainingCollectionView: Opt<CollectionView>;
    ContainingCollectionDoc: Opt<Doc>;
    fieldKey: string;
    renderDepth: number;
    deleteDocument: (document: Doc | Doc[]) => boolean;
    addDocument: (document: Doc | Doc[]) => boolean;
    moveDocument: (document: Doc | Doc[], targetCollection: Doc | undefined, addDocument: (document: Doc | Doc[]) => boolean) => boolean;
    ScreenToLocalTransform: () => Transform;
    active: (outsideReaction: boolean) => boolean;
    onDrop: (e: React.DragEvent<Element>, options: DocumentOptions, completed?: (() => void) | undefined) => void;
    addDocTab: (document: Doc, where: string) => boolean;
    pinToPres: (document: Doc) => void;
    isSelected: (outsideReaction?: boolean) => boolean;
    isFocused: (document: Doc) => boolean;
    setFocused: (document: Doc) => void;
    setPreviewDoc: (document: Doc) => void;
    columns: SchemaHeaderField[];
    documentKeys: any[];
    headerIsEditing: boolean;
    openHeader: (column: any, menu: any) => void;
    onPointerDown: (e: React.PointerEvent) => void;
    onResizedChange: (newResized: Resize[], event: any) => void;
    setColumns: (columns: SchemaHeaderField[]) => void;
    reorderColumns: (toMove: SchemaHeaderField, relativeTo: SchemaHeaderField, before: boolean, columnsValues: SchemaHeaderField[]) => void;
}

@observer
export class SchemaTable extends React.Component<SchemaTableProps> {
    private DIVIDER_WIDTH = 4;

    @observable _cellIsEditing: boolean = false;
    @observable _focusedCell: { row: number, col: number } = { row: 0, col: 0 };
    @observable _openCollections: Array<string> = [];

    @observable _showDoc: Doc | undefined;
    @observable _showDataDoc: any = "";
    @observable _showDocPos: number[] = [];

    @computed get previewWidth() { return () => NumCast(this.props.Document.schemaPreviewWidth); }
    @computed get previewHeight() { return () => this.props.PanelHeight() - 2 * this.borderWidth; }
    @computed get tableWidth() { return this.props.PanelWidth() - 2 * this.borderWidth - this.DIVIDER_WIDTH - this.previewWidth(); }

    @computed get childDocs() {
        if (this.props.childDocs) return this.props.childDocs;

        const doc = this.props.dataDoc ? this.props.dataDoc : this.props.Document;
        return DocListCast(doc[this.props.fieldKey]);
    }
    set childDocs(docs: Doc[]) {
        const doc = this.props.dataDoc ? this.props.dataDoc : this.props.Document;
        doc[this.props.fieldKey] = new List<Doc>(docs);
    }

    @computed get textWrappedRows() {
        return Cast(this.props.Document.textwrappedSchemaRows, listSpec("string"), []);
    }
    set textWrappedRows(textWrappedRows: string[]) {
        this.props.Document.textwrappedSchemaRows = new List<string>(textWrappedRows);
    }

    @computed get resized(): { id: string, value: number }[] {
        return this.props.columns.reduce((resized, shf) => {
            (shf.width > -1) && resized.push({ id: shf.heading, value: shf.width });
            return resized;
        }, [] as { id: string, value: number }[]);
    }
    @computed get sorted(): SortingRule[] {
        return this.props.columns.reduce((sorted, shf) => {
            shf.desc && sorted.push({ id: shf.heading, desc: shf.desc });
            return sorted;
        }, [] as SortingRule[]);
    }

    @computed get borderWidth() { return Number(COLLECTION_BORDER_WIDTH); }
    @computed get tableColumns(): Column<Doc>[] {

        const possibleKeys = this.props.documentKeys.filter(key => this.props.columns.findIndex(existingKey => existingKey.heading.toUpperCase() === key.toUpperCase()) === -1);
        const columns: Column<Doc>[] = [];
        const tableIsFocused = this.props.isFocused(this.props.Document);
        const focusedRow = this._focusedCell.row;
        const focusedCol = this._focusedCell.col;
        const isEditable = !this.props.headerIsEditing;

        if (this.childDocs.reduce((found, doc) => found || doc.type === "collection", false)) {
            columns.push(
                {
                    expander: true,
                    Header: "",
                    width: 30,
                    Expander: (rowInfo) => {
                        if (rowInfo.original.type === "collection") {
                            if (rowInfo.isExpanded) return <div className="collectionSchemaView-expander" onClick={() => this.onCloseCollection(rowInfo.original)}><FontAwesomeIcon icon={"sort-up"} size="sm" /></div>;
                            if (!rowInfo.isExpanded) return <div className="collectionSchemaView-expander" onClick={() => this.onExpandCollection(rowInfo.original)}><FontAwesomeIcon icon={"sort-down"} size="sm" /></div>;
                        } else {
                            return null;
                        }
                    }
                }
            );
        }

        const cols = this.props.columns.map(col => {

            const icon: IconProp = this.getColumnType(col) === ColumnType.Number ? "hashtag" : this.getColumnType(col) === ColumnType.String ? "font" :
                this.getColumnType(col) === ColumnType.Boolean ? "check-square" : this.getColumnType(col) === ColumnType.Doc ? "file" :
                    this.getColumnType(col) === ColumnType.Image ? "image" : this.getColumnType(col) === ColumnType.List ? "list-ul" : "align-justify";



            const menuContent = <div><FontAwesomeIcon icon={icon} size="sm" />{col.heading}</div>;
            const header =
                <div className="collectionSchemaView-header"
                    onClick={e => { this.props.openHeader(col, menuContent); }}
                    style={{ background: col.color }}>
                    {menuContent}
                </div>;

            return {
                Header: <MovableColumn columnRenderer={header} columnValue={col} allColumns={this.props.columns} reorderColumns={this.props.reorderColumns} ScreenToLocalTransform={this.props.ScreenToLocalTransform} />,
                accessor: (doc: Doc) => doc ? doc[col.heading] : 0,
                id: col.heading,
                Cell: (rowProps: CellInfo) => {
                    const rowIndex = rowProps.index;
                    const columnIndex = this.props.columns.map(c => c.heading).indexOf(rowProps.column.id!);
                    const isFocused = focusedRow === rowIndex && focusedCol === columnIndex && tableIsFocused;

                    const props: CellProps = {
                        row: rowIndex,
                        col: columnIndex,
                        rowProps: rowProps,
                        isFocused: isFocused,
                        changeFocusedCellByIndex: this.changeFocusedCellByIndex,
                        CollectionView: this.props.CollectionView,
                        ContainingCollection: this.props.ContainingCollectionView,
                        Document: this.props.Document,
                        fieldKey: this.props.fieldKey,
                        renderDepth: this.props.renderDepth,
                        addDocTab: this.props.addDocTab,
                        pinToPres: this.props.pinToPres,
                        moveDocument: this.props.moveDocument,
                        setIsEditing: this.setCellIsEditing,
                        isEditable: isEditable,
                        setPreviewDoc: this.props.setPreviewDoc,
                        setComputed: this.setComputed,
                        getField: this.getField,
                        showDoc: this.showDoc,
                    };

                    const colType = this.getColumnType(col);
                    if (colType === ColumnType.Number) return <CollectionSchemaNumberCell {...props} />;
                    if (colType === ColumnType.String) return <CollectionSchemaStringCell {...props} />;
                    if (colType === ColumnType.Boolean) return <CollectionSchemaCheckboxCell {...props} />;
                    if (colType === ColumnType.Doc) return <CollectionSchemaDocCell {...props} />;
                    if (colType === ColumnType.Image) return <CollectionSchemaImageCell {...props} />;
                    if (colType === ColumnType.List) return <CollectionSchemaListCell {...props} />;
                    return <CollectionSchemaCell {...props} />;
                },
                minWidth: 200,
            };
        });
        columns.push(...cols);

        columns.push({
            Header: <CollectionSchemaAddColumnHeader createColumn={this.createColumn} />,
            accessor: (doc: Doc) => 0,
            id: "add",
            Cell: (rowProps: CellInfo) => <></>,
            width: 28,
            resizable: false
        });
        return columns;
    }

    constructor(props: SchemaTableProps) {
        super(props);
        // convert old schema columns (list of strings) into new schema columns (list of schema header fields)
        const oldSchemaColumns = Cast(this.props.Document.schemaColumns, listSpec("string"), []);
        if (oldSchemaColumns && oldSchemaColumns.length && typeof oldSchemaColumns[0] !== "object") {
            const newSchemaColumns = oldSchemaColumns.map(i => typeof i === "string" ? new SchemaHeaderField(i, "#f1efeb") : i);
            this.props.Document.schemaColumns = new List<SchemaHeaderField>(newSchemaColumns);
        }
    }

    componentDidMount() {
        document.addEventListener("keydown", this.onKeyDown);
    }

    componentWillUnmount() {
        document.removeEventListener("keydown", this.onKeyDown);
    }

    tableAddDoc = (doc: Doc, relativeTo?: Doc, before?: boolean) => {
        return Doc.AddDocToList(this.props.Document, this.props.fieldKey, doc, relativeTo, before);
    }

    private getTrProps: ComponentPropsGetterR = (state, rowInfo) => {
        return !rowInfo ? {} : {
            ScreenToLocalTransform: this.props.ScreenToLocalTransform,
            addDoc: this.tableAddDoc,
            removeDoc: this.props.deleteDocument,
            rowInfo,
            rowFocused: !this.props.headerIsEditing && rowInfo.index === this._focusedCell.row && this.props.isFocused(this.props.Document),
            textWrapRow: this.toggleTextWrapRow,
            rowWrapped: this.textWrappedRows.findIndex(id => rowInfo.original[Id] === id) > -1,
            dropAction: StrCast(this.props.Document.childDropAction),
            addDocTab: this.props.addDocTab
        };
    }

    private getTdProps: ComponentPropsGetterR = (state, rowInfo, column, instance) => {
        if (!rowInfo || column) return {};

        const row = rowInfo.index;
        //@ts-ignore
        const col = this.columns.map(c => c.heading).indexOf(column!.id);
        const isFocused = this._focusedCell.row === row && this._focusedCell.col === col && this.props.isFocused(this.props.Document);
        // TODO: editing border doesn't work :(
        return {
            style: {
                border: !this.props.headerIsEditing && isFocused ? "2px solid rgb(255, 160, 160)" : "1px solid #f1efeb"
            }
        };
    }

    @action
    onCloseCollection = (collection: Doc): void => {
        const index = this._openCollections.findIndex(col => col === collection[Id]);
        if (index > -1) this._openCollections.splice(index, 1);
    }

    @action onExpandCollection = (collection: Doc) => this._openCollections.push(collection[Id]);
    @action setCellIsEditing = (isEditing: boolean) => this._cellIsEditing = isEditing;

    @action
    onKeyDown = (e: KeyboardEvent): void => {
        if (!this._cellIsEditing && !this.props.headerIsEditing && this.props.isFocused(this.props.Document)) {// && this.props.isSelected(true)) {
            const direction = e.key === "Tab" ? "tab" : e.which === 39 ? "right" : e.which === 37 ? "left" : e.which === 38 ? "up" : e.which === 40 ? "down" : "";
            this._focusedCell = this.changeFocusedCellByDirection(direction, this._focusedCell.row, this._focusedCell.col);

            const pdoc = FieldValue(this.childDocs[this._focusedCell.row]);
            pdoc && this.props.setPreviewDoc(pdoc);
        }
    }

    changeFocusedCellByDirection = (direction: string, curRow: number, curCol: number) => {
        switch (direction) {
            case "tab": return { row: (curRow + 1 === this.childDocs.length ? 0 : curRow + 1), col: curCol + 1 === this.props.columns.length ? 0 : curCol + 1 };
            case "right": return { row: curRow, col: curCol + 1 === this.props.columns.length ? curCol : curCol + 1 };
            case "left": return { row: curRow, col: curCol === 0 ? curCol : curCol - 1 };
            case "up": return { row: curRow === 0 ? curRow : curRow - 1, col: curCol };
            case "down": return { row: curRow + 1 === this.childDocs.length ? curRow : curRow + 1, col: curCol };
        }
        return this._focusedCell;
    }

    @action
    changeFocusedCellByIndex = (row: number, col: number): void => {
        if (this._focusedCell.row !== row || this._focusedCell.col !== col) {
            this._focusedCell = { row: row, col: col };
        }
        this.props.setFocused(this.props.Document);
    }

    @undoBatch
    createRow = () => {
        this.props.addDocument(Docs.Create.TextDocument("", { title: "", _width: 100, _height: 30 }));
    }

    @undoBatch
    @action
    createColumn = () => {
        let index = 0;
        let found = this.props.columns.findIndex(col => col.heading.toUpperCase() === "New field".toUpperCase()) > -1;
        while (found) {
            index++;
            found = this.props.columns.findIndex(col => col.heading.toUpperCase() === ("New field (" + index + ")").toUpperCase()) > -1;
        }
        this.props.columns.push(new SchemaHeaderField(`New field ${index ? "(" + index + ")" : ""}`, "#f1efeb"));
    }

    getColumnType = (column: SchemaHeaderField): ColumnType => {
        // added functionality to convert old column type stuff to new column type stuff -syip
        if (column.type && column.type !== 0) {
            return column.type;
        }
        if (columnTypes.get(column.heading)) {
            column.type = columnTypes.get(column.heading)!;
            return columnTypes.get(column.heading)!;
        }
        const typesDoc = FieldValue(Cast(this.props.Document.schemaColumnTypes, Doc));
        if (!typesDoc) {
            column.type = ColumnType.Any;
            return ColumnType.Any;
        }
        column.type = NumCast(typesDoc[column.heading]);
        return NumCast(typesDoc[column.heading]);
    }

    @undoBatch
    @action
    toggleTextwrap = async () => {
        const textwrappedRows = Cast(this.props.Document.textwrappedSchemaRows, listSpec("string"), []);
        if (textwrappedRows.length) {
            this.props.Document.textwrappedSchemaRows = new List<string>([]);
        } else {
            const docs = DocListCast(this.props.Document[this.props.fieldKey]);
            const allRows = docs instanceof Doc ? [docs[Id]] : docs.map(doc => doc[Id]);
            this.props.Document.textwrappedSchemaRows = new List<string>(allRows);
        }
    }

    @action
    toggleTextWrapRow = (doc: Doc): void => {
        const textWrapped = this.textWrappedRows;
        const index = textWrapped.findIndex(id => doc[Id] === id);

        index > -1 ? textWrapped.splice(index, 1) : textWrapped.push(doc[Id]);

        this.textWrappedRows = textWrapped;
    }

    @computed
    get reactTable() {
        const children = this.childDocs;
        const hasCollectionChild = children.reduce((found, doc) => found || doc.type === "collection", false);
        const expandedRowsList = this._openCollections.map(col => children.findIndex(doc => doc[Id] === col).toString());
        const expanded = {};
        //@ts-ignore
        expandedRowsList.forEach(row => expanded[row] = true);
        const rerender = [...this.textWrappedRows]; // TODO: get component to rerender on text wrap change without needign to console.log :((((

        return <ReactTable
            style={{ position: "relative" }}
            data={children}
            page={0}
            pageSize={children.length}
            showPagination={false}
            columns={this.tableColumns}
            getTrProps={this.getTrProps}
            getTdProps={this.getTdProps}
            sortable={false}
            TrComponent={MovableRow}
            sorted={this.sorted}
            expanded={expanded}
            resized={this.resized}
            onResizedChange={this.props.onResizedChange}
            SubComponent={!hasCollectionChild ? undefined : row => (row.original.type !== "collection") ? (null) :
                <div className="reactTable-sub"><SchemaTable {...this.props} Document={row.original} dataDoc={undefined} childDocs={undefined} /></div>}

        />;
    }

    onContextMenu = (e: React.MouseEvent): void => {
        if (!e.isPropagationStopped() && this.props.Document[Id] !== "mainDoc") { // need to test this because GoldenLayout causes a parallel hierarchy in the React DOM for its children and the main document view7
            // ContextMenu.Instance.addItem({ description: "Make DB", event: this.makeDB, icon: "table" });
            ContextMenu.Instance.addItem({ description: "Toggle text wrapping", event: this.toggleTextwrap, icon: "table" });
        }
    }

    getField = (row: number, col?: number) => {
        const docs = this.childDocs;

        row = row % docs.length;
        while (row < 0) row += docs.length;
        const columns = this.props.columns;
        const doc = docs[row];
        if (col === undefined) {
            return doc;
        }
        if (col >= 0 && col < columns.length) {
            const column = this.props.columns[col].heading;
            return doc[column];
        }
        return undefined;
    }

    createTransformer = (row: number, col: number): Transformer => {
        const self = this;
        const captures: { [name: string]: Field } = {};

        const transformer: ts.TransformerFactory<ts.SourceFile> = context => {
            return root => {
                function visit(node: ts.Node) {
                    node = ts.visitEachChild(node, visit, context);
                    if (ts.isIdentifier(node)) {
                        const isntPropAccess = !ts.isPropertyAccessExpression(node.parent) || node.parent.expression === node;
                        const isntPropAssign = !ts.isPropertyAssignment(node.parent) || node.parent.name !== node;
                        if (isntPropAccess && isntPropAssign) {
                            if (node.text === "$r") {
                                return ts.createNumericLiteral(row.toString());
                            } else if (node.text === "$c") {
                                return ts.createNumericLiteral(col.toString());
                            } else if (node.text === "$") {
                                if (ts.isCallExpression(node.parent)) {
                                    // captures.doc = self.props.Document;
                                    // captures.key = self.props.fieldKey;
                                }
                            }
                        }
                    }

                    return node;
                }
                return ts.visitNode(root, visit);
            };
        };

        // const getVars = () => {
        //     return { capturedVariables: captures };
        // };

        return { transformer, /*getVars*/ };
    }

    setComputed = (script: string, doc: Doc, field: string, row: number, col: number): boolean => {
        script =
            `const $ = (row:number, col?:number) => {
                if(col === undefined) {
                    return (doc as any)[key][row + ${row}];
                }
                return (doc as any)[key][row + ${row}][(doc as any).schemaColumns[col + ${col}].heading];
            }
            return ${script}`;
        const compiled = CompileScript(script, { params: { this: Doc.name }, capturedVariables: { doc: this.props.Document, key: this.props.fieldKey }, typecheck: false, transformer: this.createTransformer(row, col) });
        if (compiled.compiled) {
            doc[field] = new ComputedField(compiled);
            return true;
        }
        return false;
    }

    @action
    showDoc = (doc: Doc | undefined, dataDoc?: Doc, screenX?: number, screenY?: number) => {
        this._showDoc = doc;
        if (dataDoc && screenX && screenY) {
            this._showDocPos = this.props.ScreenToLocalTransform().transformPoint(screenX, screenY);
        }
    }

    onOpenClick = () => {
        if (this._showDoc) {
            this.props.addDocTab(this._showDoc, "onRight");
        }
    }

    getPreviewTransform = (): Transform => {
        return this.props.ScreenToLocalTransform().translate(- this.borderWidth - 4 - this.tableWidth, - this.borderWidth);
    }

    render() {
        const preview = "";
        return <div className="collectionSchemaView-table" onPointerDown={this.props.onPointerDown} onWheel={e => this.props.active(true) && e.stopPropagation()} onDrop={e => this.props.onDrop(e, {})} onContextMenu={this.onContextMenu} >
            {this.reactTable}
            <div className="collectionSchemaView-addRow" onClick={() => this.createRow()}>+ new</div>
            {!this._showDoc ? (null) :
                <div className="collectionSchemaView-documentPreview" //onClick={() => { this.onOpenClick(); }}
                    style={{
                        position: "absolute", width: 150, height: 150,
                        background: "dimGray", display: "block", top: 0, left: 0,
                        transform: `translate(${this._showDocPos[0]}px, ${this._showDocPos[1] - 180}px)`
                    }}
                    ref="overlay"><ContentFittingDocumentView
                        Document={this._showDoc}
                        DataDoc={this._showDataDoc}
                        NativeHeight={returnZero}
                        NativeWidth={returnZero}
                        fitToBox={true}
                        FreezeDimensions={true}
                        focus={emptyFunction}
                        LibraryPath={emptyPath}
                        renderDepth={this.props.renderDepth}
                        rootSelected={() => false}
                        PanelWidth={() => 150}
                        PanelHeight={() => 150}
                        ScreenToLocalTransform={this.getPreviewTransform}
                        docFilters={returnEmptyFilter}
                        ContainingCollectionDoc={this.props.CollectionView?.props.Document}
                        ContainingCollectionView={this.props.CollectionView}
                        moveDocument={this.props.moveDocument}
                        parentActive={this.props.active}
                        whenActiveChanged={emptyFunction}
                        addDocTab={this.props.addDocTab}
                        pinToPres={this.props.pinToPres}
                        bringToFront={returnFalse}
                        ContentScaling={returnOne}>
                    </ContentFittingDocumentView>
                </div>}
        </div>;
    }
}