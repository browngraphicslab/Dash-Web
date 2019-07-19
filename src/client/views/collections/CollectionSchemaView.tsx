import React = require("react");
import { library } from '@fortawesome/fontawesome-svg-core';
import { faCog, faPlus } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { action, computed, observable, trace, untracked } from "mobx";
import { observer } from "mobx-react";
import ReactTable, { CellInfo, ComponentPropsGetterR, ReactTableDefaults, TableCellRenderer, Column } from "react-table";
import "react-table/react-table.css";
import { emptyFunction, returnFalse, returnZero, returnOne } from "../../../Utils";
import { Doc, DocListCast, DocListCastAsync, Field, FieldResult } from "../../../new_fields/Doc";
import { Id } from "../../../new_fields/FieldSymbols";
import { List } from "../../../new_fields/List";
import { listSpec } from "../../../new_fields/Schema";
import { Cast, FieldValue, NumCast, StrCast, BoolCast } from "../../../new_fields/Types";
import { Docs } from "../../documents/Documents";
import { Gateway } from "../../northstar/manager/Gateway";
import { SetupDrag, DragManager } from "../../util/DragManager";
import { CompileScript } from "../../util/Scripting";
import { Transform } from "../../util/Transform";
import { COLLECTION_BORDER_WIDTH, MAX_ROW_HEIGHT } from '../../views/globalCssVariables.scss';
import { ContextMenu } from "../ContextMenu";
import { anchorPoints, Flyout } from "../DocumentDecorations";
import '../DocumentDecorations.scss';
import { EditableView } from "../EditableView";
import { DocumentView } from "../nodes/DocumentView";
import { FieldView, FieldViewProps } from "../nodes/FieldView";
import { CollectionPDFView } from "./CollectionPDFView";
import "./CollectionSchemaView.scss";
import { CollectionSubView } from "./CollectionSubView";
import { CollectionVideoView } from "./CollectionVideoView";
import { CollectionView } from "./CollectionView";
import { undoBatch } from "../../util/UndoManager";
import { timesSeries } from "async";
import { CollectionSchemaHeader, CollectionSchemaAddColumnHeader } from "./CollectionSchemaHeaders";
import { CellProps, CollectionSchemaCell, CollectionSchemaNumberCell, CollectionSchemaStringCell, CollectionSchemaBooleanCell, CollectionSchemaCheckboxCell, CollectionSchemaDocCell } from "./CollectionSchemaCells";
import { MovableColumn, MovableRow } from "./CollectionSchemaMovableTableHOC";

library.add(faCog);
library.add(faPlus);
// bcz: need to add drag and drop of rows and columns.  This seems like it might work for rows: https://codesandbox.io/s/l94mn1q657

export enum ColumnType {
    Any,
    Number,
    String,
    Boolean,
    Doc,
    // Checkbox
}
// this map should be used for keys that should have a const type of value
const columnTypes: Map<string, ColumnType> = new Map([
    ["x", ColumnType.Number], ["y", ColumnType.Number], ["width", ColumnType.Number], ["height", ColumnType.Number],
    ["nativeWidth", ColumnType.Number], ["nativeHeight", ColumnType.Number], ["isPrototype", ColumnType.Boolean],
    ["page", ColumnType.Number], ["curPage", ColumnType.Number], ["libraryBrush", ColumnType.Boolean], ["zIndex", ColumnType.Number]
]);

@observer
export class CollectionSchemaView extends CollectionSubView(doc => doc) {
    private _mainCont?: HTMLDivElement;
    private _startPreviewWidth = 0;
    private DIVIDER_WIDTH = 4;

    @observable _selectedIndex = 0;
    @observable _columnsPercentage = 0;
    @observable _keys: string[] = [];
    @observable _newKeyName: string = "";
    @observable previewScript: string = "";
    @observable _headerIsEditing: boolean = false;
    @observable _cellIsEditing: boolean = false;
    @observable _focusedCell: {row: number, col: number} = {row: 0, col: 0};
    @observable _sortedColumns: Map<string, {id: string, desc: boolean}> = new Map();

    @computed get previewWidth() { return () => NumCast(this.props.Document.schemaPreviewWidth); }
    @computed get previewHeight() { return () => this.props.PanelHeight() - 2 * this.borderWidth; }
    @computed get tableWidth() { return this.props.PanelWidth() - 2 * this.borderWidth - this.DIVIDER_WIDTH - this.previewWidth(); }
    @computed get columns() { return Cast(this.props.Document.schemaColumns, listSpec("string"), []); }
    set columns(columns: string[]) {this.props.Document.schemaColumns = new List<string>(columns); }
    @computed get borderWidth() { return Number(COLLECTION_BORDER_WIDTH); }
    @computed get tableColumns(): Column<Doc>[] {
        let possibleKeys = this.documentKeys.filter(key => this.columns.findIndex(existingKey => existingKey.toUpperCase() === key.toUpperCase()) === -1);
        let cols = this.columns.map(col => {
            let focusedRow = this._focusedCell.row;
            let focusedCol = this._focusedCell.col;
            let isEditable = !this._headerIsEditing;
            let header = <CollectionSchemaHeader 
                keyValue={col}
                possibleKeys={possibleKeys}
                existingKeys={this.columns}
                keyType={this.getColumnType(col)}
                typeConst={columnTypes.get(col) !== undefined}
                onSelect={this.changeColumns}
                setIsEditing={this.setHeaderIsEditing}
                deleteColumn={this.deleteColumn}
                setColumnType={this.setColumnType}
                setColumnSort={this.setColumnSort}
                removeColumnSort={this.removeColumnSort}
            />;

            return {
                Header: <MovableColumn columnRenderer={header} columnValue={col} allColumns={this.columns} reorderColumns={this.reorderColumns} ScreenToLocalTransform={this.props.ScreenToLocalTransform} />,
                accessor: (doc: Doc) => doc ? doc[col] : 0,
                id: col,
                Cell: (rowProps: CellInfo) => {
                    let row = rowProps.index;
                    let column = this.columns.indexOf(rowProps.column.id!);
                    let isFocused = focusedRow === row && focusedCol === column;

                    let props: CellProps = {
                        row: row,
                        col: column,
                        rowProps: rowProps,
                        isFocused: isFocused,
                        changeFocusedCellByDirection: this.changeFocusedCellByDirection,
                        changeFocusedCellByIndex: this.changeFocusedCellByIndex,
                        CollectionView: this.props.CollectionView,
                        ContainingCollection: this.props.ContainingCollectionView,
                        Document: this.props.Document,
                        fieldKey: this.props.fieldKey,
                        renderDepth: this.props.renderDepth, addDocTab: this.props.addDocTab,
                        moveDocument: this.props.moveDocument,
                        setIsEditing: this.setCellIsEditing,
                        isEditable: isEditable
                    };

                    let colType = this.getColumnType(col);
                    if (colType === ColumnType.Number) return <CollectionSchemaNumberCell {...props}/>;
                    if (colType === ColumnType.String) return <CollectionSchemaStringCell {...props}/>;
                    // if (colType === ColumnType.Boolean) return <CollectionSchemaBooleanCell {...props} />;
                    // if (colType === ColumnType.Checkbox) return <CollectionSchemaCheckboxCell {...props} />;
                    if (colType === ColumnType.Boolean) return <CollectionSchemaCheckboxCell {...props} />;
                    if (colType === ColumnType.Doc) return <CollectionSchemaDocCell {...props} />;
                    return <CollectionSchemaCell {...props}/>;
                }
            };
        }) as {Header: TableCellRenderer, accessor: (doc: Doc) => FieldResult<Field>, id: string, Cell: (rowProps: CellInfo) => JSX.Element, width?: number, resizable?: boolean}[];

        cols.push({
            Header: <CollectionSchemaAddColumnHeader
                createColumn={this.createColumn}
                // possibleKeys={possibleKeys}
                // existingKeys={this.columns}
                // onSelect={this.changeColumns}
                // setIsEditing={this.setHeaderIsEditing}
            />,
            accessor: (doc: Doc) => 0,
            id: "add",
            Cell: (rowProps: CellInfo) => <></>,
            width: 45,
            resizable: false
        });

        return cols;
    }

    // onHeaderDrag = (columnName: string) => {
    //     let schemaDoc = Cast(this.props.Document.schemaDoc, Doc);
    //     if (schemaDoc instanceof Doc) {
    //         let columnDocs = DocListCast(schemaDoc.data);
    //         if (columnDocs) {
    //             let ddoc = columnDocs.find(doc => doc.title === columnName);
    //             if (ddoc) {
    //                 return ddoc;
    //             }
    //         }
    //     }
    //     return this.props.Document;
    // }

    componentDidMount() {
        document.addEventListener("keydown", this.onKeyDown);
    }

    componentWillUnmount() {
        document.removeEventListener("keydown", this.onKeyDown);
    }

    private getTrProps: ComponentPropsGetterR = (state, rowInfo) => {
        const that = this;
        if (!rowInfo) {
            return {};
        }
        return {
            ScreenToLocalTransform: this.props.ScreenToLocalTransform,
            addDoc: (doc: Doc, relativeTo?: Doc, before?: boolean) => Doc.AddDocToList(this.props.Document, this.props.fieldKey, doc, relativeTo, before),
            moveDoc: (d: Doc, target: Doc, addDoc: (doc: Doc) => boolean) => this.props.moveDocument(d, target, addDoc),
            rowInfo, 
            onClick: action((e: React.MouseEvent, handleOriginal: Function) => {
                that.props.select(e.ctrlKey);
                that._selectedIndex = rowInfo.index;

                if (handleOriginal) {
                    handleOriginal();
                }
            }),
        };
    }

    private createTarget = (ele: HTMLDivElement) => {
        this._mainCont = ele;
        super.CreateDropTarget(ele);
    }

    @action
    setCellIsEditing = (isEditing: boolean): void => {
        this._cellIsEditing = isEditing;
    }

    @action
    setHeaderIsEditing = (isEditing: boolean): void => {
        this._headerIsEditing = isEditing;
    }

    //toggles preview side-panel of schema
    @action
    toggleExpander = () => {
        this.props.Document.schemaPreviewWidth = this.previewWidth() === 0 ? Math.min(this.tableWidth / 3, 200) : 0;
    }

    onDividerDown = (e: React.PointerEvent) => {
        this._startPreviewWidth = this.previewWidth();
        e.stopPropagation();
        e.preventDefault();
        document.addEventListener("pointermove", this.onDividerMove);
        document.addEventListener('pointerup', this.onDividerUp);
    }
    @action
    onDividerMove = (e: PointerEvent): void => {
        let nativeWidth = this._mainCont!.getBoundingClientRect();
        this.props.Document.schemaPreviewWidth = Math.min(nativeWidth.right - nativeWidth.left - 40,
            this.props.ScreenToLocalTransform().transformDirection(nativeWidth.right - e.clientX, 0)[0]);
    }
    @action
    onDividerUp = (e: PointerEvent): void => {
        document.removeEventListener("pointermove", this.onDividerMove);
        document.removeEventListener('pointerup', this.onDividerUp);
        if (this._startPreviewWidth === this.previewWidth()) {
            this.toggleExpander();
        }
    }

    onPointerDown = (e: React.PointerEvent): void => {
        if (e.button === 0 && !e.altKey && !e.ctrlKey && !e.metaKey) {
            if (this.props.isSelected()) e.stopPropagation();
        }
    }

    onWheel = (e: React.WheelEvent): void => {
        if (this.props.active()) {
            e.stopPropagation();
        }
    }

    onContextMenu = (e: React.MouseEvent): void => {
        if (!e.isPropagationStopped() && this.props.Document[Id] !== "mainDoc") { // need to test this because GoldenLayout causes a parallel hierarchy in the React DOM for its children and the main document view7
            ContextMenu.Instance.addItem({ description: "Make DB", event: this.makeDB });
        }
    }

    onKeyDown = (e: KeyboardEvent): void => {
        if (!this._cellIsEditing && !this._headerIsEditing) {
            let direction = e.key === "Tab" ? "tab" : e.which === 39 ? "right" : e.which === 37 ? "left" : e.which === 38 ? "up" : e.which === 40 ? "down" : "";
            this.changeFocusedCellByDirection(direction);
        }
    }

    @action
    changeFocusedCellByDirection = (direction: string): void => {
        switch (direction) {
            case "tab":
                if (this._focusedCell.col + 1 === this.columns.length && this._focusedCell.row + 1 === this.childDocs.length) {
                    this._focusedCell = { row: 0, col: 0 };
                } else if (this._focusedCell.col + 1 === this.columns.length) {
                    this._focusedCell = { row: this._focusedCell.row + 1, col: 0 };
                } else {
                    this._focusedCell = { row: this._focusedCell.row, col: this._focusedCell.col + 1 };
                }
                break;
            case "right":
                this._focusedCell = { row: this._focusedCell.row, col: this._focusedCell.col + 1 === this.columns.length ? this._focusedCell.col : this._focusedCell.col + 1 };
                break;
            case "left":
                this._focusedCell = { row: this._focusedCell.row, col: this._focusedCell.col === 0 ? this._focusedCell.col : this._focusedCell.col - 1 };
                break;
            case "up":
                this._focusedCell = { row: this._focusedCell.row === 0 ? this._focusedCell.row : this._focusedCell.row - 1, col: this._focusedCell.col };
                break;
            case "down":
                this._focusedCell = { row: this._focusedCell.row + 1 === this.childDocs.length ? this._focusedCell.row : this._focusedCell.row + 1, col: this._focusedCell.col };
                break;
        }
    }

    @action
    changeFocusedCellByIndex = (row: number, col: number): void => {
        this._focusedCell = { row: row, col: col };
    }

    @action
    makeDB = async () => {
        let csv: string = this.columns.reduce((val, col) => val + col + ",", "");
        csv = csv.substr(0, csv.length - 1) + "\n";
        let self = this;
        DocListCast(this.props.Document.data).map(doc => {
            csv += self.columns.reduce((val, col) => val + (doc[col] ? doc[col]!.toString() : "0") + ",", "");
            csv = csv.substr(0, csv.length - 1) + "\n";
        });
        csv.substring(0, csv.length - 1);
        let dbName = StrCast(this.props.Document.title);
        let res = await Gateway.Instance.PostSchema(csv, dbName);
        if (self.props.CollectionView.props.addDocument) {
            let schemaDoc = await Docs.Create.DBDocument("https://www.cs.brown.edu/" + dbName, { title: dbName }, { dbDoc: self.props.Document });
            if (schemaDoc) {
                //self.props.CollectionView.props.addDocument(schemaDoc, false);
                self.props.Document.schemaDoc = schemaDoc;
            }
        }
    }

    @action
    createColumn = () => {  
        let index = 0;
        let found = this.columns.findIndex(col => col.toUpperCase() === "New field".toUpperCase()) > -1;
        if (!found) {
            this.columns.push("New field");
            return;
        }
        while (found) {
            index ++;
            found = this.columns.findIndex(col => col.toUpperCase() === ("New field (" + index + ")").toUpperCase()) > -1;
        }
        this.columns.push("New field (" + index + ")");
    }

    @action
    addColumn = () => {
        this.columns.push(this._newKeyName);
        this._newKeyName = "";
    }

    @action
    deleteColumn = (key: string) => {
        let list = Cast(this.props.Document.schemaColumns, listSpec("string"));
        if (list === undefined) {
            this.props.Document.schemaColumns = list = new List<string>([]);
        } else {
            const index = list.indexOf(key);
            if (index > -1) {
                list.splice(index, 1);
            }
        }
    }

    @action
    changeColumns = (oldKey: string, newKey: string, addNew: boolean) => {
        let list = Cast(this.props.Document.schemaColumns, listSpec("string"));
        if (list === undefined) {
            this.props.Document.schemaColumns = list = new List<string>([newKey]);
        } else {
            if (addNew) {
                this.columns.push(newKey);
            } else {
                const index = list.indexOf(oldKey);
                if (index > -1) {
                    list[index] = newKey;
                }
            }
        }
    }

    getColumnType = (key: string): ColumnType => {
        if (columnTypes.get(key)) return columnTypes.get(key)!;
        const typesDoc = FieldValue(Cast(this.props.Document.schemaColumnTypes, Doc));
        if (!typesDoc) return ColumnType.Any;
        return NumCast(typesDoc[key]);
    }

    setColumnType = (key: string, type: ColumnType): void => {
        if (columnTypes.get(key)) return;
        const typesDoc = FieldValue(Cast(this.props.Document.schemaColumnTypes, Doc));
        if (!typesDoc) {
            let newTypesDoc = new Doc();
            newTypesDoc[key] = type;
            this.props.Document.schemaColumnTypes  = newTypesDoc;
            return;
        } else {
            typesDoc[key] = type;
        }
    }

    @action
    setColumns = (columns: string[]) => {
        this.columns = columns;
    }

    reorderColumns = (toMove: string, relativeTo: string, before: boolean, columnsValues: string[]) => {
        let columns = [...columnsValues];
        let oldIndex = columns.indexOf(toMove);
        let relIndex = columns.indexOf(relativeTo);
        let newIndex = (oldIndex > relIndex && !before) ? relIndex + 1 : (oldIndex < relIndex && before) ? relIndex - 1 : relIndex;

        if (oldIndex === newIndex) return;

        columns.splice(newIndex, 0, columns.splice(oldIndex, 1)[0]);
        this.setColumns(columns);
    }

    @action
    setColumnSort = (column: string, descending: boolean) => {
        this._sortedColumns.set(column, {id: column, desc: descending});
    }

    @action
    removeColumnSort = (column: string) => {
        this._sortedColumns.delete(column);
    } 

    @computed
    get previewDocument(): Doc | undefined {
        const selected = this.childDocs.length > this._selectedIndex ? this.childDocs[this._selectedIndex] : undefined;
        let pdc = selected ? (this.previewScript && this.previewScript !== "this" ? FieldValue(Cast(selected[this.previewScript], Doc)) : selected) : undefined;
        return pdc;
    }

    getPreviewTransform = (): Transform => this.props.ScreenToLocalTransform().translate(- this.borderWidth - this.DIVIDER_WIDTH - this.tableWidth, - this.borderWidth);


    get documentKeys() {
        const docs = DocListCast(this.props.Document[this.props.fieldKey]);
        let keys: { [key: string]: boolean } = {};
        // bcz: ugh.  this is untracked since otherwise a large collection of documents will blast the server for all their fields.
        //  then as each document's fields come back, we update the documents _proxies.  Each time we do this, the whole schema will be
        //  invalidated and re-rendered.   This workaround will inquire all of the document fields before the options button is clicked.
        //  then by the time the options button is clicked, all of the fields should be in place.  If a new field is added while this menu
        //  is displayed (unlikely) it won't show up until something else changes.
        //TODO Types
        untracked(() => docs.map(doc => Doc.GetAllPrototypes(doc).map(proto => Object.keys(proto).forEach(key => keys[key] = false))));

        this.columns.forEach(key => keys[key] = true);
        return Array.from(Object.keys(keys));
    }

    @computed
    get reactTable() {
        let previewWidth = this.previewWidth() + 2 * this.borderWidth + this.DIVIDER_WIDTH + 1;
        return <ReactTable 
            style={{ position: "relative", float: "left", width: `calc(100% - ${previewWidth}px` }} 
            data={this.childDocs} 
            page={0} 
            pageSize={this.childDocs.length} 
            showPagination={false}
            columns={this.tableColumns}
            getTrProps={this.getTrProps}
            sortable={false}
            TrComponent={MovableRow}
            sorted={Array.from(this._sortedColumns.values())}
        />;
    }

    @computed
    get dividerDragger() {
        return this.previewWidth() === 0 ? (null) :
            <div className="collectionSchemaView-dividerDragger" onPointerDown={this.onDividerDown} style={{ width: `${this.DIVIDER_WIDTH}px` }} />;
    }


    @computed
    get previewPanel() {
        // let layoutDoc = this.previewDocument;
        // let resolvedDataDoc = (layoutDoc !== this.props.DataDoc) ? this.props.DataDoc : undefined;
        // if (layoutDoc && !(Cast(layoutDoc.layout, Doc) instanceof Doc) &&
        //     resolvedDataDoc && resolvedDataDoc !== layoutDoc) {
        //     // ... so change the layout to be an expanded view of the template layout.  This allows the view override the template's properties and be referenceable as its own document.
        //     layoutDoc = Doc.expandTemplateLayout(layoutDoc, resolvedDataDoc);
        // }

        let layoutDoc = this.previewDocument ? Doc.expandTemplateLayout(this.previewDocument, this.props.DataDoc) : undefined;
        return <div ref={this.createTarget}>
            <CollectionSchemaPreview
                Document={layoutDoc}
                DataDocument={this.previewDocument !== this.props.DataDoc ? this.props.DataDoc : undefined}
                childDocs={this.childDocs}
                renderDepth={this.props.renderDepth}
                width={this.previewWidth}
                height={this.previewHeight}
                getTransform={this.getPreviewTransform}
                CollectionView={this.props.CollectionView}
                moveDocument={this.props.moveDocument}
                addDocument={this.props.addDocument}
                removeDocument={this.props.removeDocument}
                active={this.props.active}
                whenActiveChanged={this.props.whenActiveChanged}
                addDocTab={this.props.addDocTab}
                setPreviewScript={this.setPreviewScript}
                previewScript={this.previewScript}
            />
        </div>;
    }
    @action
    setPreviewScript = (script: string) => {
        this.previewScript = script;
    }

    @computed
    get schemaToolbar() {
        return (
            <div className="collectionSchemaView-toolbar">
                <div id="preview-schema-checkbox-div"><input type="checkbox" key={"Show Preview"} checked={this.previewWidth() !== 0} onChange={this.toggleExpander} />Show Preview</div>
            </div>
        );
    }

    render() {
        return (
            <div className="collectionSchemaView-container" onPointerDown={this.onPointerDown} onWheel={this.onWheel}
                onDrop={(e: React.DragEvent) => this.onDrop(e, {})} onContextMenu={this.onContextMenu} ref={this.createTarget}>
                {this.schemaToolbar}
                {this.reactTable}
                {this.dividerDragger}
                {!this.previewWidth() ? (null) : this.previewPanel}
                {/* {this.tableOptionsPanel} */}
            </div>
        );
    }
}


interface CollectionSchemaPreviewProps {
    Document?: Doc;
    DataDocument?: Doc;
    childDocs?: Doc[];
    renderDepth: number;
    fitToBox?: boolean;
    width: () => number;
    height: () => number;
    showOverlays?: (doc: Doc) => { title?: string, caption?: string };
    CollectionView?: CollectionView | CollectionPDFView | CollectionVideoView;
    getTransform: () => Transform;
    addDocument: (document: Doc, allowDuplicates?: boolean) => boolean;
    moveDocument: (document: Doc, target: Doc, addDoc: ((doc: Doc) => boolean)) => boolean;
    removeDocument: (document: Doc) => boolean;
    active: () => boolean;
    whenActiveChanged: (isActive: boolean) => void;
    addDocTab: (document: Doc, dataDoc: Doc | undefined, where: string) => void;
    setPreviewScript: (script: string) => void;
    previewScript?: string;
}

@observer
export class CollectionSchemaPreview extends React.Component<CollectionSchemaPreviewProps>{
    private dropDisposer?: DragManager.DragDropDisposer;
    _mainCont?: HTMLDivElement;
    private get nativeWidth() { return NumCast(this.props.Document!.nativeWidth, this.props.width()); }
    private get nativeHeight() { return NumCast(this.props.Document!.nativeHeight, this.props.height()); }
    private contentScaling = () => {
        let wscale = this.props.width() / (this.nativeWidth ? this.nativeWidth : this.props.width());
        if (wscale * this.nativeHeight > this.props.height()) {
            return this.props.height() / (this.nativeHeight ? this.nativeHeight : this.props.height());
        }
        return wscale;
    }
    protected createDropTarget = (ele: HTMLDivElement) => {
    }
    private createTarget = (ele: HTMLDivElement) => {
        this._mainCont = ele;
        this.dropDisposer && this.dropDisposer();
        if (ele) {
            this.dropDisposer = DragManager.MakeDropTarget(ele, { handlers: { drop: this.drop.bind(this) } });
        }
    }

    @undoBatch
    @action
    drop = (e: Event, de: DragManager.DropEvent) => {
        if (de.data instanceof DragManager.DocumentDragData) {
            let docDrag = de.data;
            this.props.childDocs && this.props.childDocs.map(otherdoc => {
                Doc.GetProto(otherdoc).layout = Doc.MakeDelegate(docDrag.draggedDocuments[0]);
            });
            e.stopPropagation();
        }
        return true;
    }
    private PanelWidth = () => this.nativeWidth ? this.nativeWidth * this.contentScaling() : this.props.width();
    private PanelHeight = () => this.nativeHeight ? this.nativeHeight * this.contentScaling() : this.props.height();
    private getTransform = () => this.props.getTransform().translate(-this.centeringOffset, 0).scale(1 / this.contentScaling());
    get centeringOffset() { return this.nativeWidth ? (this.props.width() - this.nativeWidth * this.contentScaling()) / 2 : 0; }
    @action
    onPreviewScriptChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        this.props.setPreviewScript(e.currentTarget.value);
    }
    @computed get borderRounding() {
        let br = StrCast(this.props.Document!.borderRounding);
        if (br.endsWith("%")) {
            let percent = Number(br.substr(0, br.length - 1)) / 100;
            let nativeDim = Math.min(NumCast(this.props.Document!.nativeWidth), NumCast(this.props.Document!.nativeHeight));
            let minDim = percent * (nativeDim ? nativeDim : Math.min(this.PanelWidth(), this.PanelHeight()));
            return minDim;
        }
        return undefined;
    }

    
    render() {
        let input = this.props.previewScript === undefined ? (null) :
            <div ref={this.createTarget}><input className="collectionSchemaView-input" value={this.props.previewScript} onChange={this.onPreviewScriptChange}
                style={{ left: `calc(50% - ${Math.min(75, (this.props.Document ? this.PanelWidth() / 2 : 75))}px)` }} /></div>;
        return (<div className="collectionSchemaView-previewRegion" style={{ width: this.props.width(), height: "100%" }}>
            {!this.props.Document || !this.props.width ? (null) : (
                <div className="collectionSchemaView-previewDoc"
                    style={{
                        transform: `translate(${this.centeringOffset}px, 0px)`,
                        borderRadius: this.borderRounding,
                        height: "100%"
                    }}>
                    <DocumentView
                        DataDoc={this.props.Document.layout instanceof Doc ? this.props.Document : this.props.DataDocument}
                        Document={this.props.Document}
                        fitToBox={this.props.fitToBox}
                        renderDepth={this.props.renderDepth + 1}
                        selectOnLoad={false}
                        showOverlays={this.props.showOverlays}
                        addDocument={this.props.addDocument}
                        removeDocument={this.props.removeDocument}
                        moveDocument={this.props.moveDocument}
                        ScreenToLocalTransform={this.getTransform}
                        ContentScaling={this.contentScaling}
                        PanelWidth={this.PanelWidth}
                        PanelHeight={this.PanelHeight}
                        ContainingCollectionView={this.props.CollectionView}
                        focus={emptyFunction}
                        parentActive={this.props.active}
                        whenActiveChanged={this.props.whenActiveChanged}
                        bringToFront={emptyFunction}
                        addDocTab={this.props.addDocTab}
                        zoomToScale={emptyFunction}
                        getScale={returnOne}
                    />
                </div>)}
            {input}
        </div>);
    }
}