import React = require("react");
import { library } from '@fortawesome/fontawesome-svg-core';
import { faCog, faPlus, faSortDown, faSortUp, faTable } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { action, computed, observable, untracked } from "mobx";
import { observer } from "mobx-react";
import { Resize } from "react-table";
import "react-table/react-table.css";
import { Doc } from "../../../fields/Doc";
import { List } from "../../../fields/List";
import { listSpec } from "../../../fields/Schema";
import { SchemaHeaderField, PastelSchemaPalette } from "../../../fields/SchemaHeaderField";
import { Cast, NumCast, StrCast } from "../../../fields/Types";
import { Docs, DocumentOptions } from "../../documents/Documents";
import { Transform } from "../../util/Transform";
import { undoBatch } from "../../util/UndoManager";
import { COLLECTION_BORDER_WIDTH } from '../../views/globalCssVariables.scss';
import '../DocumentDecorations.scss';
import { KeysDropdown } from "./CollectionSchemaHeaders";
import "./CollectionSchemaView.scss";
import { CollectionSubView } from "./CollectionSubView";
import { ContentFittingDocumentView } from "../nodes/ContentFittingDocumentView";
import { setupMoveUpEvents, emptyFunction, returnZero, returnOne, returnFalse } from "../../../Utils";
import { SnappingManager } from "../../util/SnappingManager";
import Measure from "react-measure";
import { SchemaTable } from "./SchemaTable";
import { TraceMobx } from "../../../fields/util";

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
    List,
    Date
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

    @observable _menuWidth = 0;
    @observable _headerOpen = false;
    @observable _isOpen = false;
    @observable _node: HTMLDivElement | null = null;
    @observable _headerIsEditing = false;
    @observable _col: any = "";
    @observable _menuHeight = 0;
    @observable _pointerX = 0;
    @observable _pointerY = 0;
    @observable _openTypes: boolean = false;
    @computed get menuCoordinates() {
        const x = Math.max(0, Math.min(document.body.clientWidth - this._menuWidth, this._pointerX));
        const y = Math.max(0, Math.min(document.body.clientHeight - this._menuHeight, this._pointerY));
        return this.props.ScreenToLocalTransform().transformPoint(x, y);
    }

    @observable scale = this.props.ScreenToLocalTransform().Scale;

    @computed get columns() {
        return Cast(this.props.Document._schemaHeaders, listSpec(SchemaHeaderField), []);
    }
    set columns(columns: SchemaHeaderField[]) {
        this.props.Document._schemaHeaders = new List<SchemaHeaderField>(columns);
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
    @computed get possibleKeys() { return this.documentKeys.filter(key => this.columns.findIndex(existingKey => existingKey.heading.toUpperCase() === key.toUpperCase()) === -1); }


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
            this.closeHeader();
        }
    }

    @action
    toggleIsOpen = (): void => {
        this._isOpen = !this._isOpen;
        this.setHeaderIsEditing(this._isOpen);
    }

    @action
    changeColumnType = (type: ColumnType, col: any): void => {
        this._openTypes = false;
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
        node && (this._node = node);
    }

    @action
    typesDropdownChange = (bool: boolean) => {
        this._openTypes = bool;
    }

    renderTypes = (col: any) => {
        if (columnTypes.get(col.heading)) return (null);

        const type = col.type;

        const anyType = <div className={"columnMenu-option" + (type === ColumnType.Any ? " active" : "")} onClick={() => this.changeColumnType(ColumnType.Any, col)}>
            <FontAwesomeIcon icon={"align-justify"} size="sm" />
                Any
            </div>;

        const numType = <div className={"columnMenu-option" + (type === ColumnType.Number ? " active" : "")} onClick={() => this.changeColumnType(ColumnType.Number, col)}>
            <FontAwesomeIcon icon={"hashtag"} size="sm" />
                Number
            </div>;

        const textType = <div className={"columnMenu-option" + (type === ColumnType.String ? " active" : "")} onClick={() => this.changeColumnType(ColumnType.String, col)}>
            <FontAwesomeIcon icon={"font"} size="sm" />
            Text
            </div>;

        const boolType = <div className={"columnMenu-option" + (type === ColumnType.Boolean ? " active" : "")} onClick={() => this.changeColumnType(ColumnType.Boolean, col)}>
            <FontAwesomeIcon icon={"check-square"} size="sm" />
            Checkbox
            </div>;

        const listType = <div className={"columnMenu-option" + (type === ColumnType.List ? " active" : "")} onClick={() => this.changeColumnType(ColumnType.List, col)}>
            <FontAwesomeIcon icon={"list-ul"} size="sm" />
            List
            </div>;

        const docType = <div className={"columnMenu-option" + (type === ColumnType.Doc ? " active" : "")} onClick={() => this.changeColumnType(ColumnType.Doc, col)}>
            <FontAwesomeIcon icon={"file"} size="sm" />
            Document
            </div>;

        const imageType = <div className={"columnMenu-option" + (type === ColumnType.Image ? " active" : "")} onClick={() => this.changeColumnType(ColumnType.Image, col)}>
            <FontAwesomeIcon icon={"image"} size="sm" />
            Image
            </div>;

        const dateType = <div className={"columnMenu-option" + (type === ColumnType.Date ? " active" : "")} onClick={() => this.changeColumnType(ColumnType.Date, col)}>
            <FontAwesomeIcon icon={"calendar"} size="sm" />
                Date
                </div>;


        const allColumnTypes = <div className="columnMenu-types">
            {anyType}
            {numType}
            {textType}
            {boolType}
            {listType}
            {docType}
            {imageType}
            {dateType}
        </div>;

        const justColType = type === ColumnType.Any ? anyType : type === ColumnType.Number ? numType :
            type === ColumnType.String ? textType : type === ColumnType.Boolean ? boolType :
                type === ColumnType.List ? listType : type === ColumnType.Doc ? docType :
                    type === ColumnType.Date ? dateType : imageType;

        return (
            <div className="collectionSchema-headerMenu-group">
                <div onClick={() => this.typesDropdownChange(!this._openTypes)}>
                    <label>Column type:</label>
                    <FontAwesomeIcon icon={"caret-down"} size="sm" style={{ float: "right" }} />
                </div>
                {this._openTypes ? allColumnTypes : justColType}
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
    changeColumns = (oldKey: string, newKey: string, addNew: boolean, filter?: string) => {
        console.log("COL");
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
                    if (filter) {
                        console.log(newKey);
                        console.log(filter);
                        Doc.setDocFilter(this.props.Document, newKey, filter, "match");
                    }
                    else {
                        this.props.Document._docFilters = undefined;
                    }
                }
            }
        }
    }

    @action
    openHeader = (col: any, screenx: number, screeny: number) => {
        console.log("header opening");
        this._col = col;
        this._headerOpen = !this._headerOpen;
        this._pointerX = screenx;
        this._pointerY = screeny;
    }

    @action
    closeHeader = () => { this._headerOpen = false; }

    renderKeysDropDown = (col: any) => {
        return <KeysDropdown
            keyValue={col.heading}
            possibleKeys={this.possibleKeys}
            existingKeys={this.columns.map(c => c.heading)}
            canAddNew={true}
            addNew={false}
            onSelect={this.changeColumns}
            setIsEditing={this.setHeaderIsEditing}
        />;
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
        this.closeHeader();
    }

    getPreviewTransform = (): Transform => {
        return this.props.ScreenToLocalTransform().translate(- this.borderWidth - NumCast(COLLECTION_BORDER_WIDTH) - this.tableWidth, - this.borderWidth);
    }

    @action
    onHeaderClick = (e: React.PointerEvent) => {
        this.props.active(true);
        e.stopPropagation();
    }

    @action
    onWheel(e: React.WheelEvent) {
        const scale = this.props.ScreenToLocalTransform().Scale;
        this.props.active(true) && e.stopPropagation();
        //this.menuCoordinates[0] -= e.screenX / scale;
        //this.menuCoordinates[1] -= e.screenY / scale;
    }

    @computed get renderMenuContent() {
        TraceMobx();
        return <div className="collectionSchema-header-menuOptions">
            <div className="collectionSchema-headerMenu-group">
                <label>Key:</label>
                {this.renderKeysDropDown(this._col)}
            </div>
            {this.renderTypes(this._col)}
            {this.renderSorting(this._col)}
            {this.renderColors(this._col)}
            <div className="collectionSchema-headerMenu-group">
                <button onClick={() => { this.deleteColumn(this._col.heading); }}
                >Delete Column</button>
            </div>
        </div>;
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
    }

    @computed
    get previewDocument(): Doc | undefined { return this.previewDoc; }

    @computed
    get dividerDragger() {
        return this.previewWidth() === 0 ? (null) :
            <div className="collectionSchemaView-dividerDragger"
                onPointerDown={this.onDividerDown}
                style={{ width: `${this.DIVIDER_WIDTH}px` }} />;
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
            changeColumns={this.changeColumns}
            setHeaderIsEditing={this.setHeaderIsEditing}
            changeColumnSort={this.setColumnSort}
        />;
    }

    @computed
    public get schemaToolbar() {
        return <div className="collectionSchemaView-toolbar">
            <div className="collectionSchemaView-toolbar-item">
                <div id="preview-schema-checkbox-div">
                    <input type="checkbox"
                        key={"Show Preview"} checked={this.previewWidth() !== 0}
                        onChange={this.toggleExpander} />Show Preview</div>
            </div>
        </div>;
    }

    @action
    onTablePointerDown = (e: React.PointerEvent): void => {
        this.setFocused(this.props.Document);
        if (e.button === 0 && !e.altKey && !e.ctrlKey && !e.metaKey && this.props.isSelected(true)) {
            e.stopPropagation();
        }
        this._pointerY = e.screenY;
        this._pointerX = e.screenX;
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

    onZoomMenu = (e: React.WheelEvent) => {
        this.props.active(true) && e.stopPropagation();
        if (this.menuCoordinates[0] > e.screenX) {
            this.menuCoordinates[0] -= e.screenX; //* this.scale;
        } else {
            this.menuCoordinates[0] += e.screenX; //* this.scale;
        }
        if (this.menuCoordinates[1] > e.screenY) {
            this.menuCoordinates[1] -= e.screenY; //* this.scale;
        } else {
            this.menuCoordinates[1] += e.screenY; //* this.scale;
        }
    }

    render() {
        TraceMobx();
        const menuContent = this.renderMenuContent;
        const menu = <div className="collectionSchema-header-menu" ref={this.setNode}
            onWheel={e => this.onZoomMenu(e)}
            onPointerDown={e => this.onHeaderClick(e)}
            style={{
                position: "fixed", background: "white",
                transform: `translate(${this.menuCoordinates[0] / this.scale}px, ${this.menuCoordinates[1] / this.scale}px)`
            }}>
            <Measure offset onResize={action((r: any) => {
                const dim = this.props.ScreenToLocalTransform().inverse().transformDirection(r.offset.width, r.offset.height);
                this._menuWidth = dim[0]; this._menuHeight = dim[1];
            })}>
                {({ measureRef }) => <div ref={measureRef}> {menuContent} </div>}
            </Measure>
        </div>;

        return <div className="collectionSchemaView-container"
            style={{
                pointerEvents: !this.props.active() && !SnappingManager.GetIsDragging() ? "none" : undefined,
                width: this.props.PanelWidth() || "100%", height: this.props.PanelHeight() || "100%"
            }}  >
            <div className="collectionSchemaView-tableContainer"
                style={{ width: `calc(100% - ${this.previewWidth()}px)` }}
                onPointerDown={this.onPointerDown}
                onWheel={e => this.props.active(true) && e.stopPropagation()}
                onDrop={e => this.onExternalDrop(e, {})}
                ref={this.createTarget}>
                {this.schemaTable}
            </div>
            {this.dividerDragger}
            {!this.previewWidth() ? (null) : this.previewPanel}
            {this._headerOpen ? menu : null}
        </div>;
    }
}