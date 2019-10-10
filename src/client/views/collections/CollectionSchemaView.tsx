import React = require("react");
import { library } from '@fortawesome/fontawesome-svg-core';
import { faCog, faPlus, faTable, faSortUp, faSortDown } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { action, computed, observable, trace, untracked } from "mobx";
import { observer } from "mobx-react";
import ReactTable, { CellInfo, ComponentPropsGetterR, Column, RowInfo, ResizedChangeFunction, Resize } from "react-table";
import "react-table/react-table.css";
import { emptyFunction, returnOne, returnEmptyString } from "../../../Utils";
import { Doc, DocListCast, Field, Opt } from "../../../new_fields/Doc";
import { Id } from "../../../new_fields/FieldSymbols";
import { List } from "../../../new_fields/List";
import { listSpec } from "../../../new_fields/Schema";
import { Docs, DocumentOptions } from "../../documents/Documents";
import { Cast, FieldValue, NumCast, StrCast } from "../../../new_fields/Types";
import { Gateway } from "../../northstar/manager/Gateway";
import { DragManager } from "../../util/DragManager";
import { CompileScript, ts, Transformer } from "../../util/Scripting";
import { Transform } from "../../util/Transform";
import { COLLECTION_BORDER_WIDTH } from '../../views/globalCssVariables.scss';
import { ContextMenu } from "../ContextMenu";
import '../DocumentDecorations.scss';
import { DocumentView } from "../nodes/DocumentView";
import "./CollectionSchemaView.scss";
import { CollectionSubView } from "./CollectionSubView";
import { CollectionVideoView } from "./CollectionVideoView";
import { CollectionView } from "./CollectionView";
import { undoBatch } from "../../util/UndoManager";
import { CollectionSchemaHeader, CollectionSchemaAddColumnHeader } from "./CollectionSchemaHeaders";
import { CellProps, CollectionSchemaCell, CollectionSchemaNumberCell, CollectionSchemaStringCell, CollectionSchemaBooleanCell, CollectionSchemaCheckboxCell, CollectionSchemaDocCell } from "./CollectionSchemaCells";
import { MovableColumn, MovableRow } from "./CollectionSchemaMovableTableHOC";
import { ComputedField, ScriptField } from "../../../new_fields/ScriptField";
import { SchemaHeaderField } from "../../../new_fields/SchemaHeaderField";
import { DocumentType } from "../../documents/DocumentTypes";


library.add(faCog, faPlus, faSortUp, faSortDown);
library.add(faTable);
// bcz: need to add drag and drop of rows and columns.  This seems like it might work for rows: https://codesandbox.io/s/l94mn1q657

export enum ColumnType {
    Any,
    Number,
    String,
    Boolean,
    Doc,
}
// this map should be used for keys that should have a const type of value
const columnTypes: Map<string, ColumnType> = new Map([
    ["title", ColumnType.String],
    ["x", ColumnType.Number], ["y", ColumnType.Number], ["width", ColumnType.Number], ["height", ColumnType.Number],
    ["nativeWidth", ColumnType.Number], ["nativeHeight", ColumnType.Number], ["isPrototype", ColumnType.Boolean],
    ["page", ColumnType.Number], ["curPage", ColumnType.Number], ["currentTimecode", ColumnType.Number], ["zIndex", ColumnType.Number]
]);

@observer
export class CollectionSchemaView extends CollectionSubView(doc => doc) {
    private _mainCont?: HTMLDivElement;
    private _startPreviewWidth = 0;
    private DIVIDER_WIDTH = 4;

    @observable previewScript: string = "";
    @observable previewDoc: Doc | undefined = undefined;
    @observable private _node: HTMLDivElement | null = null;
    @observable private _focusedTable: Doc = this.props.Document;

    @computed get previewWidth() { return () => NumCast(this.props.Document.schemaPreviewWidth); }
    @computed get previewHeight() { return () => this.props.PanelHeight() - 2 * this.borderWidth; }
    @computed get tableWidth() { return this.props.PanelWidth() - 2 * this.borderWidth - this.DIVIDER_WIDTH - this.previewWidth(); }
    @computed get borderWidth() { return Number(COLLECTION_BORDER_WIDTH); }

    private createTarget = (ele: HTMLDivElement) => {
        this._mainCont = ele;
        super.CreateDropTarget(ele);
    }

    isFocused = (doc: Doc): boolean => {
        if (!this.props.isSelected()) return false;
        return doc === this._focusedTable;
    }

    @action
    setFocused = (doc: Doc): void => {
        this._focusedTable = doc;
    }

    @action
    setPreviewDoc = (doc: Doc): void => {
        this.previewDoc = doc;
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
        let minWidth = 40;
        let maxWidth = 1000;
        let movedWidth = this.props.ScreenToLocalTransform().transformDirection(nativeWidth.right - e.clientX, 0)[0];
        let width = movedWidth < minWidth ? minWidth : movedWidth > maxWidth ? maxWidth : movedWidth;
        this.props.Document.schemaPreviewWidth = width;
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
            else {
                this.props.select(false);
            }
        }
    }

    onWheel = (e: React.WheelEvent): void => {
        if (this.props.active()) {
            e.stopPropagation();
        }
    }

    @computed
    get previewDocument(): Doc | undefined {
        let selected = this.previewDoc;
        let pdc = selected ? (this.previewScript && this.previewScript !== "this" ? FieldValue(Cast(selected[this.previewScript], Doc)) : selected) : undefined;
        return pdc;
    }

    getPreviewTransform = (): Transform => {
        return this.props.ScreenToLocalTransform().translate(- this.borderWidth - this.DIVIDER_WIDTH - this.tableWidth, - this.borderWidth);
    }

    @computed
    get dividerDragger() {
        return this.previewWidth() === 0 ? (null) :
            <div className="collectionSchemaView-dividerDragger" onPointerDown={this.onDividerDown} style={{ width: `${this.DIVIDER_WIDTH}px` }} />;
    }

    @computed
    get previewPanel() {
        let layoutDoc = this.previewDocument ? Doc.expandTemplateLayout(this.previewDocument, this.props.DataDoc) : undefined;
        return <div ref={this.createTarget}>
            <CollectionSchemaPreview
                Document={layoutDoc}
                DataDocument={this.previewDocument !== this.props.DataDoc ? this.props.DataDoc : undefined}
                childDocs={this.childDocs}
                renderDepth={this.props.renderDepth}
                ruleProvider={this.props.Document.isRuleProvider && layoutDoc && layoutDoc.type !== DocumentType.TEXT ? this.props.Document : this.props.ruleProvider}
                PanelWidth={this.previewWidth}
                PanelHeight={this.previewHeight}
                getTransform={this.getPreviewTransform}
                CollectionDoc={this.props.CollectionView && this.props.CollectionView.props.Document}
                CollectionView={this.props.CollectionView}
                moveDocument={this.props.moveDocument}
                addDocument={this.props.addDocument}
                removeDocument={this.props.removeDocument}
                active={this.props.active}
                whenActiveChanged={this.props.whenActiveChanged}
                addDocTab={this.props.addDocTab}
                pinToPres={this.props.pinToPres}
                setPreviewScript={this.setPreviewScript}
                previewScript={this.previewScript}
            />
        </div>;
    }

    @undoBatch
    @action
    setPreviewScript = (script: string) => {
        this.previewScript = script;
    }

    @computed
    get schemaTable() {
        return (
            <SchemaTable
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
                onDrop={this.onDrop}
                addDocTab={this.props.addDocTab}
                pinToPres={this.props.pinToPres}
                isSelected={this.props.isSelected}
                isFocused={this.isFocused}
                setFocused={this.setFocused}
                setPreviewDoc={this.setPreviewDoc}
                deleteDocument={this.props.removeDocument}
                dataDoc={this.props.DataDoc}
            />
        );
    }

    @computed
    public get schemaToolbar() {
        return (
            <div className="collectionSchemaView-toolbar">
                <div className="collectionSchemaView-toolbar-item">
                    <div id="preview-schema-checkbox-div"><input type="checkbox" key={"Show Preview"} checked={this.previewWidth() !== 0} onChange={this.toggleExpander} />Show Preview</div>
                </div>
            </div>
        );
    }

    render() {
        Doc.UpdateDocumentExtensionForField(this.props.DataDoc ? this.props.DataDoc : this.props.Document, this.props.fieldKey);
        return (
            <div className="collectionSchemaView-container" style={{ height: "100%", marginTop: "0", }}>
                <div className="collectionSchemaView-tableContainer" onPointerDown={this.onPointerDown} onWheel={this.onWheel} onDrop={(e: React.DragEvent) => this.onDrop(e, {})} ref={this.createTarget}>
                    {this.schemaTable}
                </div>
                {this.dividerDragger}
                {!this.previewWidth() ? (null) : this.previewPanel}
            </div>
        );
    }
}

export interface SchemaTableProps {
    Document: Doc; // child doc
    dataDoc?: Doc;
    PanelHeight: () => number;
    PanelWidth: () => number;
    childDocs?: Doc[];
    CollectionView: Opt<CollectionView | CollectionVideoView>;
    ContainingCollectionView: Opt<CollectionView | CollectionVideoView>;
    ContainingCollectionDoc: Opt<Doc>;
    fieldKey: string;
    renderDepth: number;
    deleteDocument: (document: Doc) => boolean;
    moveDocument: (document: Doc, targetCollection: Doc, addDocument: (document: Doc) => boolean) => boolean;
    ScreenToLocalTransform: () => Transform;
    active: () => boolean;
    onDrop: (e: React.DragEvent<Element>, options: DocumentOptions, completed?: (() => void) | undefined) => void;
    addDocTab: (document: Doc, dataDoc: Doc | undefined, where: string) => boolean;
    pinToPres: (document: Doc) => void;
    isSelected: () => boolean;
    isFocused: (document: Doc) => boolean;
    setFocused: (document: Doc) => void;
    setPreviewDoc: (document: Doc) => void;
}

@observer
export class SchemaTable extends React.Component<SchemaTableProps> {
    private DIVIDER_WIDTH = 4;

    @observable _headerIsEditing: boolean = false;
    @observable _cellIsEditing: boolean = false;
    @observable _focusedCell: { row: number, col: number } = { row: 0, col: 0 };
    @observable _openCollections: Array<string> = [];

    @computed get previewWidth() { return () => NumCast(this.props.Document.schemaPreviewWidth); }
    @computed get previewHeight() { return () => this.props.PanelHeight() - 2 * this.borderWidth; }
    @computed get tableWidth() { return this.props.PanelWidth() - 2 * this.borderWidth - this.DIVIDER_WIDTH - this.previewWidth(); }

    @computed get columns() {
        return Cast(this.props.Document.schemaColumns, listSpec(SchemaHeaderField), []);
    }
    set columns(columns: SchemaHeaderField[]) {
        this.props.Document.schemaColumns = new List<SchemaHeaderField>(columns);
    }

    @computed get childDocs() {
        if (this.props.childDocs) return this.props.childDocs;

        let doc = this.props.dataDoc ? this.props.dataDoc : this.props.Document;
        return DocListCast(doc[this.props.fieldKey]);
    }
    set childDocs(docs: Doc[]) {
        let doc = this.props.dataDoc ? this.props.dataDoc : this.props.Document;
        doc[this.props.fieldKey] = new List<Doc>(docs);
    }

    @computed get textWrappedRows() {
        return Cast(this.props.Document.textwrappedSchemaRows, listSpec("string"), []);
    }
    set textWrappedRows(textWrappedRows: string[]) {
        this.props.Document.textwrappedSchemaRows = new List<string>(textWrappedRows);
    }

    @computed get resized(): { id: string, value: number }[] {
        return this.columns.reduce((resized, shf) => {
            (shf.width > -1) && resized.push({ id: shf.heading, value: shf.width });
            return resized;
        }, [] as { id: string, value: number }[]);
    }
    @computed get sorted(): { id: string, desc: boolean }[] {
        return this.columns.reduce((sorted, shf) => {
            shf.desc && sorted.push({ id: shf.heading, desc: shf.desc });
            return sorted;
        }, [] as { id: string, desc: boolean }[]);
    }

    @computed get borderWidth() { return Number(COLLECTION_BORDER_WIDTH); }
    @computed get tableColumns(): Column<Doc>[] {
        let possibleKeys = this.documentKeys.filter(key => this.columns.findIndex(existingKey => existingKey.heading.toUpperCase() === key.toUpperCase()) === -1);
        let columns: Column<Doc>[] = [];
        let tableIsFocused = this.props.isFocused(this.props.Document);
        let focusedRow = this._focusedCell.row;
        let focusedCol = this._focusedCell.col;
        let isEditable = !this._headerIsEditing;// && this.props.isSelected();

        let children = this.childDocs;

        if (children.reduce((found, doc) => found || doc.type === "collection", false)) {
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

        let cols = this.columns.map(col => {
            let header = <CollectionSchemaHeader
                keyValue={col}
                possibleKeys={possibleKeys}
                existingKeys={this.columns.map(c => c.heading)}
                keyType={this.getColumnType(col)}
                typeConst={columnTypes.get(col.heading) !== undefined}
                onSelect={this.changeColumns}
                setIsEditing={this.setHeaderIsEditing}
                deleteColumn={this.deleteColumn}
                setColumnType={this.setColumnType}
                setColumnSort={this.setColumnSort}
                setColumnColor={this.setColumnColor}
            />;

            return {
                Header: <MovableColumn columnRenderer={header} columnValue={col} allColumns={this.columns} reorderColumns={this.reorderColumns} ScreenToLocalTransform={this.props.ScreenToLocalTransform} />,
                accessor: (doc: Doc) => doc ? doc[col.heading] : 0,
                id: col.heading,
                Cell: (rowProps: CellInfo) => {
                    let rowIndex = rowProps.index;
                    let columnIndex = this.columns.map(c => c.heading).indexOf(rowProps.column.id!);
                    let isFocused = focusedRow === rowIndex && focusedCol === columnIndex && tableIsFocused;

                    let props: CellProps = {
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
                    };

                    let colType = this.getColumnType(col);
                    if (colType === ColumnType.Number) return <CollectionSchemaNumberCell {...props} />;
                    if (colType === ColumnType.String) return <CollectionSchemaStringCell {...props} />;
                    if (colType === ColumnType.Boolean) return <CollectionSchemaCheckboxCell {...props} />;
                    if (colType === ColumnType.Doc) return <CollectionSchemaDocCell {...props} />;
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
        let oldSchemaColumns = Cast(this.props.Document.schemaColumns, listSpec("string"), []);
        if (oldSchemaColumns && oldSchemaColumns.length && typeof oldSchemaColumns[0] !== "object") {
            let newSchemaColumns = oldSchemaColumns.map(i => typeof i === "string" ? new SchemaHeaderField(i, "#f1efeb") : i);
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

    tableRemoveDoc = (document: Doc): boolean => {

        let children = this.childDocs;
        if (children.indexOf(document) !== -1) {
            children.splice(children.indexOf(document), 1);
            this.childDocs = children;
            return true;
        }
        return false;
    }

    private getTrProps: ComponentPropsGetterR = (state, rowInfo) => {
        const that = this;
        if (!rowInfo) {
            return {};
        }
        return {
            ScreenToLocalTransform: this.props.ScreenToLocalTransform,
            addDoc: this.tableAddDoc,
            removeDoc: this.tableRemoveDoc,
            rowInfo,
            rowFocused: !this._headerIsEditing && rowInfo.index === this._focusedCell.row && this.props.isFocused(this.props.Document),
            textWrapRow: this.toggleTextWrapRow,
            rowWrapped: this.textWrappedRows.findIndex(id => rowInfo.original[Id] === id) > -1
        };
    }

    private getTdProps: ComponentPropsGetterR = (state, rowInfo, column, instance) => {
        if (!rowInfo) return {};
        if (!column) return {};

        let row = rowInfo.index;
        //@ts-ignore
        let col = this.columns.map(c => c.heading).indexOf(column!.id);
        let isFocused = this._focusedCell.row === row && this._focusedCell.col === col && this.props.isFocused(this.props.Document);
        let isEditing = this.props.isFocused(this.props.Document) && this._cellIsEditing;
        // TODO: editing border doesn't work :(
        return {
            style: {
                border: !this._headerIsEditing && isFocused ? "2px solid rgb(255, 160, 160)" : "1px solid #f1efeb"
            }
        };
    }

    @action
    onExpandCollection = (collection: Doc): void => {
        this._openCollections.push(collection[Id]);
    }

    @action
    onCloseCollection = (collection: Doc): void => {
        let index = this._openCollections.findIndex(col => col === collection[Id]);
        if (index > -1) this._openCollections.splice(index, 1);
    }

    @action
    setCellIsEditing = (isEditing: boolean): void => {
        this._cellIsEditing = isEditing;
    }

    @action
    setHeaderIsEditing = (isEditing: boolean): void => {
        this._headerIsEditing = isEditing;
    }

    onPointerDown = (e: React.PointerEvent): void => {
        this.props.setFocused(this.props.Document);
        if (e.button === 0 && !e.altKey && !e.ctrlKey && !e.metaKey) {
            if (this.props.isSelected()) e.stopPropagation();
        }
    }

    onWheel = (e: React.WheelEvent): void => {
        if (this.props.active()) {
            e.stopPropagation();
        }
    }

    onKeyDown = (e: KeyboardEvent): void => {
        if (!this._cellIsEditing && !this._headerIsEditing && this.props.isFocused(this.props.Document)) {// && this.props.isSelected()) {
            let direction = e.key === "Tab" ? "tab" : e.which === 39 ? "right" : e.which === 37 ? "left" : e.which === 38 ? "up" : e.which === 40 ? "down" : "";
            this.changeFocusedCellByDirection(direction);

            let children = this.childDocs;
            const pdoc = FieldValue(children[this._focusedCell.row]);
            pdoc && this.props.setPreviewDoc(pdoc);
        }
    }

    @action
    changeFocusedCellByDirection = (direction: string): void => {
        let children = this.childDocs;
        switch (direction) {
            case "tab":
                if (this._focusedCell.col + 1 === this.columns.length && this._focusedCell.row + 1 === children.length) {
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
                this._focusedCell = { row: this._focusedCell.row + 1 === children.length ? this._focusedCell.row : this._focusedCell.row + 1, col: this._focusedCell.col };
                break;
        }
    }

    @action
    changeFocusedCellByIndex = (row: number, col: number): void => {
        this._focusedCell = { row: row, col: col };
        this.props.setFocused(this.props.Document);
    }

    @undoBatch
    createRow = () => {
        let children = this.childDocs;

        let newDoc = Docs.Create.TextDocument({ width: 100, height: 30 });
        let proto = Doc.GetProto(newDoc);
        proto.title = "";
        children.push(newDoc);

        this.childDocs = children;
    }

    @undoBatch
    @action
    createColumn = () => {
        let index = 0;
        let columns = this.columns;
        let found = columns.findIndex(col => col.heading.toUpperCase() === "New field".toUpperCase()) > -1;
        if (!found) {
            columns.push(new SchemaHeaderField("New field", "#f1efeb"));
            this.columns = columns;
            return;
        }
        while (found) {
            index++;
            found = columns.findIndex(col => col.heading.toUpperCase() === ("New field (" + index + ")").toUpperCase()) > -1;
        }
        columns.push(new SchemaHeaderField("New field (" + index + ")", "#f1efeb"));
        this.columns = columns;
    }

    @undoBatch
    @action
    deleteColumn = (key: string) => {
        let columns = this.columns;
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

    @undoBatch
    @action
    changeColumns = (oldKey: string, newKey: string, addNew: boolean) => {
        let columns = this.columns;
        if (columns === undefined) {
            this.columns = new List<SchemaHeaderField>([new SchemaHeaderField(newKey, "f1efeb")]);
        } else {
            if (addNew) {
                columns.push(new SchemaHeaderField(newKey, "f1efeb"));
                this.columns = columns;
            } else {
                const index = columns.map(c => c.heading).indexOf(oldKey);
                if (index > -1) {
                    let column = columns[index];
                    column.setHeading(newKey);
                    columns[index] = column;
                    this.columns = columns;
                }
            }
        }
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
    setColumnType = (columnField: SchemaHeaderField, type: ColumnType): void => {
        if (columnTypes.get(columnField.heading)) return;

        let columns = this.columns;
        let index = columns.indexOf(columnField);
        if (index > -1) {
            columnField.setType(NumCast(type));
            columns[index] = columnField;
            this.columns = columns;
        }

        // const typesDoc = FieldValue(Cast(this.props.Document.schemaColumnTypes, Doc));
        // if (!typesDoc) {
        //     let newTypesDoc = new Doc();
        //     newTypesDoc[key] = type;
        //     this.props.Document.schemaColumnTypes = newTypesDoc;
        //     return;
        // } else {
        //     typesDoc[key] = type;
        // }
    }

    @undoBatch
    setColumnColor = (columnField: SchemaHeaderField, color: string): void => {
        let columns = this.columns;
        let index = columns.indexOf(columnField);
        if (index > -1) {
            columnField.setColor(color);
            columns[index] = columnField;
            this.columns = columns; // need to set the columns to trigger rerender
        }
    }

    @action
    setColumns = (columns: SchemaHeaderField[]) => {
        this.columns = columns;
    }

    @undoBatch
    reorderColumns = (toMove: SchemaHeaderField, relativeTo: SchemaHeaderField, before: boolean, columnsValues: SchemaHeaderField[]) => {
        let columns = [...columnsValues];
        let oldIndex = columns.indexOf(toMove);
        let relIndex = columns.indexOf(relativeTo);
        let newIndex = (oldIndex > relIndex && !before) ? relIndex + 1 : (oldIndex < relIndex && before) ? relIndex - 1 : relIndex;

        if (oldIndex === newIndex) return;

        columns.splice(newIndex, 0, columns.splice(oldIndex, 1)[0]);
        this.columns = columns;
    }

    @undoBatch
    @action
    setColumnSort = (columnField: SchemaHeaderField, descending: boolean | undefined) => {
        let columns = this.columns;
        let index = columns.findIndex(c => c.heading === columnField.heading);
        let column = columns[index];
        column.setDesc(descending);
        columns[index] = column;
        this.columns = columns;
    }

    get documentKeys() {
        let docs = this.childDocs;
        let keys: { [key: string]: boolean } = {};
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

    @action
    toggleTextWrapRow = (doc: Doc): void => {
        let textWrapped = this.textWrappedRows;
        let index = textWrapped.findIndex(id => doc[Id] === id);

        if (index > -1) {
            textWrapped.splice(index, 1);
        } else {
            textWrapped.push(doc[Id]);
        }

        this.textWrappedRows = textWrapped;
    }

    @computed
    get reactTable() {
        let children = this.childDocs;
        let hasCollectionChild = children.reduce((found, doc) => found || doc.type === "collection", false);
        let expandedRowsList = this._openCollections.map(col => children.findIndex(doc => doc[Id] === col).toString());
        let expanded = {};
        //@ts-ignore
        expandedRowsList.forEach(row => expanded[row] = true);
        console.log("text wrapped rows", ...[...this.textWrappedRows]); // TODO: get component to rerender on text wrap change without needign to console.log :((((

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
            onResizedChange={this.onResizedChange}
            SubComponent={hasCollectionChild ?
                row => {
                    if (row.original.type === "collection") {
                        return <div className="sub"><SchemaTable {...this.props} Document={row.original} childDocs={undefined} /></div>;
                    }
                }
                : undefined}

        />;
    }

    onResizedChange = (newResized: Resize[], event: any) => {
        let columns = this.columns;
        newResized.forEach(resized => {
            let index = columns.findIndex(c => c.heading === resized.id);
            let column = columns[index];
            column.setWidth(resized.value);
            columns[index] = column;
        });
        this.columns = columns;
    }

    onContextMenu = (e: React.MouseEvent): void => {
        if (!e.isPropagationStopped() && this.props.Document[Id] !== "mainDoc") { // need to test this because GoldenLayout causes a parallel hierarchy in the React DOM for its children and the main document view7
            ContextMenu.Instance.addItem({ description: "Make DB", event: this.makeDB, icon: "table" });
        }
    }

    @action
    makeDB = async () => {
        let csv: string = this.columns.reduce((val, col) => val + col + ",", "");
        csv = csv.substr(0, csv.length - 1) + "\n";
        let self = this;
        this.childDocs.map(doc => {
            csv += self.columns.reduce((val, col) => val + (doc[col.heading] ? doc[col.heading]!.toString() : "0") + ",", "");
            csv = csv.substr(0, csv.length - 1) + "\n";
        });
        csv.substring(0, csv.length - 1);
        let dbName = StrCast(this.props.Document.title);
        let res = await Gateway.Instance.PostSchema(csv, dbName);
        if (self.props.CollectionView && self.props.CollectionView.props.addDocument) {
            let schemaDoc = await Docs.Create.DBDocument("https://www.cs.brown.edu/" + dbName, { title: dbName }, { dbDoc: self.props.Document });
            if (schemaDoc) {
                //self.props.CollectionView.props.addDocument(schemaDoc, false);
                self.props.Document.schemaDoc = schemaDoc;
            }
        }
    }

    getField = (row: number, col?: number) => {
        let docs = this.childDocs;

        row = row % docs.length;
        while (row < 0) row += docs.length;
        const columns = this.columns;
        const doc = docs[row];
        if (col === undefined) {
            return doc;
        }
        if (col >= 0 && col < columns.length) {
            const column = this.columns[col].heading;
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
        const compiled = CompileScript(script, { params: { this: Doc.name }, capturedVariables: { doc: this.props.Document, key: this.props.fieldKey }, typecheck: true, transformer: this.createTransformer(row, col) });
        if (compiled.compiled) {
            doc[field] = new ComputedField(compiled);
            return true;
        }
        return false;
    }

    render() {
        return (
            <div className="collectionSchemaView-table" onPointerDown={this.onPointerDown} onWheel={this.onWheel}
                onDrop={(e: React.DragEvent) => this.props.onDrop(e, {})} onContextMenu={this.onContextMenu} >
                {this.reactTable}
                <div className="collectionSchemaView-addRow" onClick={() => this.createRow()}>+ new</div>
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
    PanelWidth: () => number;
    PanelHeight: () => number;
    ruleProvider: Doc | undefined;
    focus?: (doc: Doc) => void;
    showOverlays?: (doc: Doc) => { title?: string, caption?: string };
    CollectionView?: CollectionView | CollectionVideoView;
    CollectionDoc?: Doc;
    onClick?: ScriptField;
    getTransform: () => Transform;
    addDocument: (document: Doc, allowDuplicates?: boolean) => boolean;
    moveDocument: (document: Doc, target: Doc, addDoc: ((doc: Doc) => boolean)) => boolean;
    removeDocument: (document: Doc) => boolean;
    active: () => boolean;
    whenActiveChanged: (isActive: boolean) => void;
    addDocTab: (document: Doc, dataDoc: Doc | undefined, where: string) => boolean;
    pinToPres: (document: Doc) => void;
    setPreviewScript: (script: string) => void;
    previewScript?: string;
}

@observer
export class CollectionSchemaPreview extends React.Component<CollectionSchemaPreviewProps>{
    private dropDisposer?: DragManager.DragDropDisposer;
    _mainCont?: HTMLDivElement;
    private get nativeWidth() { return NumCast(this.props.Document!.nativeWidth, this.props.PanelWidth()); }
    private get nativeHeight() { return NumCast(this.props.Document!.nativeHeight, this.props.PanelHeight()); }
    private contentScaling = () => {
        let wscale = this.props.PanelWidth() / (this.nativeWidth ? this.nativeWidth : this.props.PanelWidth());
        if (wscale * this.nativeHeight > this.props.PanelHeight()) {
            return this.props.PanelHeight() / (this.nativeHeight ? this.nativeHeight : this.props.PanelHeight());
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
            this.props.childDocs && this.props.childDocs.map(otherdoc => {
                let target = Doc.GetProto(otherdoc);
                let layoutNative = Doc.MakeTitled("layoutNative");
                layoutNative.layout = ComputedField.MakeFunction("this.image_data[0]");
                target.layoutNative = layoutNative;
                target.layoutCUstom = target.layout = Doc.MakeDelegate(de.data.draggedDocuments[0]);
            });
            e.stopPropagation();
        }
        return true;
    }
    private PanelWidth = () => this.nativeWidth && (!this.props.Document || !this.props.Document.fitWidth) ? this.nativeWidth * this.contentScaling() : this.props.PanelWidth();
    private PanelHeight = () => this.nativeHeight && (!this.props.Document || !this.props.Document.fitWidth) ? this.nativeHeight * this.contentScaling() : this.props.PanelHeight();
    private getTransform = () => this.props.getTransform().translate(-this.centeringOffset, 0).scale(1 / this.contentScaling());
    get centeringOffset() { return this.nativeWidth && (!this.props.Document || !this.props.Document.fitWidth) ? (this.props.PanelWidth() - this.nativeWidth * this.contentScaling()) / 2 : 0; }
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
        return (<div className="collectionSchemaView-previewRegion"
            style={{ width: this.props.PanelWidth(), height: this.props.PanelHeight() }}>
            {!this.props.Document || !this.props.PanelWidth ? (null) : (
                <div className="collectionSchemaView-previewDoc"
                    style={{
                        transform: `translate(${this.centeringOffset}px, 0px)`,
                        borderRadius: this.borderRounding,
                        display: "inline",
                        height: this.props.PanelHeight(),
                        width: this.props.PanelWidth()
                    }}>
                    <DocumentView {...this.props}
                        DataDoc={this.props.DataDocument}
                        Document={this.props.Document}
                        fitToBox={this.props.fitToBox}
                        onClick={this.props.onClick}
                        ruleProvider={this.props.ruleProvider}
                        showOverlays={this.props.showOverlays}
                        addDocument={this.props.addDocument}
                        removeDocument={this.props.removeDocument}
                        moveDocument={this.props.moveDocument}
                        whenActiveChanged={this.props.whenActiveChanged}
                        ContainingCollectionView={this.props.CollectionView}
                        ContainingCollectionDoc={this.props.CollectionDoc}
                        addDocTab={this.props.addDocTab}
                        pinToPres={this.props.pinToPres}
                        parentActive={this.props.active}
                        ScreenToLocalTransform={this.getTransform}
                        renderDepth={this.props.renderDepth + 1}
                        ContentScaling={this.contentScaling}
                        PanelWidth={this.PanelWidth}
                        PanelHeight={this.PanelHeight}
                        focus={this.props.focus || emptyFunction}
                        backgroundColor={returnEmptyString}
                        bringToFront={emptyFunction}
                        zoomToScale={emptyFunction}
                        getScale={returnOne}
                    />
                </div>)}
            {input}
        </div>);
    }
}