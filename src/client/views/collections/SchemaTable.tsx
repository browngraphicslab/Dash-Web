import React = require("react");
import { IconProp } from '@fortawesome/fontawesome-svg-core';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { action, computed, observable } from "mobx";
import { observer } from "mobx-react";
import ReactTable, { CellInfo, Column, ComponentPropsGetterR, Resize, SortingRule } from "react-table";
import "react-table/react-table.css";
import { Doc, DocListCast, Field, Opt } from "../../../fields/Doc";
import { Id } from "../../../fields/FieldSymbols";
import { List } from "../../../fields/List";
import { listSpec } from "../../../fields/Schema";
import { SchemaHeaderField } from "../../../fields/SchemaHeaderField";
import { ComputedField } from "../../../fields/ScriptField";
import { Cast, FieldValue, NumCast, StrCast } from "../../../fields/Types";
import { emptyFunction, emptyPath, returnEmptyFilter, returnFalse, returnOne, returnZero } from "../../../Utils";
import { Docs, DocumentOptions } from "../../documents/Documents";
import { DocumentType } from "../../documents/DocumentTypes";
import { CompileScript, Transformer, ts } from "../../util/Scripting";
import { Transform } from "../../util/Transform";
import { undoBatch } from "../../util/UndoManager";
import { COLLECTION_BORDER_WIDTH } from '../../views/globalCssVariables.scss';
import { ContextMenu } from "../ContextMenu";
import '../DocumentDecorations.scss';
import { ContentFittingDocumentView } from "../nodes/ContentFittingDocumentView";
import { CellProps, CollectionSchemaButtons, CollectionSchemaCell, CollectionSchemaCheckboxCell, CollectionSchemaDateCell, CollectionSchemaDocCell, CollectionSchemaImageCell, CollectionSchemaListCell, CollectionSchemaNumberCell, CollectionSchemaStringCell } from "./CollectionSchemaCells";
import { CollectionSchemaAddColumnHeader, KeysDropdown } from "./CollectionSchemaHeaders";
import { MovableColumn, MovableRow } from "./CollectionSchemaMovableTableHOC";
import "./CollectionSchemaView.scss";
import { CollectionView } from "./CollectionView";


enum ColumnType {
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
    ["title", ColumnType.String], ["text", ColumnType.String],
    ["x", ColumnType.Number], ["y", ColumnType.Number], ["_width", ColumnType.Number], ["_height", ColumnType.Number],
    ["_nativeWidth", ColumnType.Number], ["_nativeHeight", ColumnType.Number], ["isPrototype", ColumnType.Boolean],
    ["page", ColumnType.Number], ["curPage", ColumnType.Number], ["currentTimecode", ColumnType.Number], ["zIndex", ColumnType.Number]
]);

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
    active: (outsideReaction: boolean | undefined) => boolean;
    onDrop: (e: React.DragEvent<Element>, options: DocumentOptions, completed?: (() => void) | undefined) => void;
    addDocTab: (document: Doc, where: string) => boolean;
    pinToPres: (document: Doc) => void;
    isSelected: (outsideReaction?: boolean) => boolean;
    isFocused: (document: Doc, outsideReaction: boolean) => boolean;
    setFocused: (document: Doc) => void;
    setPreviewDoc: (document: Doc) => void;
    columns: SchemaHeaderField[];
    documentKeys: any[];
    headerIsEditing: boolean;
    openHeader: (column: any, screenx: number, screeny: number) => void;
    onPointerDown: (e: React.PointerEvent) => void;
    onResizedChange: (newResized: Resize[], event: any) => void;
    setColumns: (columns: SchemaHeaderField[]) => void;
    reorderColumns: (toMove: SchemaHeaderField, relativeTo: SchemaHeaderField, before: boolean, columnsValues: SchemaHeaderField[]) => void;
    changeColumns: (oldKey: string, newKey: string, addNew: boolean) => void;
    setHeaderIsEditing: (isEditing: boolean) => void;
    changeColumnSort: (columnField: SchemaHeaderField, descending: boolean | undefined) => void;
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

    @observable _showTitleDropdown: boolean = false;

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
            shf.desc !== undefined && sorted.push({ id: shf.heading, desc: shf.desc });
            return sorted;
        }, [] as SortingRule[]);
    }

    @action
    changeSorting = (col: any) => {
        if (col.desc === undefined) {
            // no sorting
            this.props.changeColumnSort(col, true);
        } else if (col.desc === true) {
            // descending sort
            this.props.changeColumnSort(col, false);
        } else if (col.desc === false) {
            // ascending sort
            this.props.changeColumnSort(col, undefined);
        }
    }

    @action
    changeTitleMode = () => this._showTitleDropdown = !this._showTitleDropdown

    @computed get borderWidth() { return Number(COLLECTION_BORDER_WIDTH); }
    @computed get tableColumns(): Column<Doc>[] {

        const possibleKeys = this.props.documentKeys.filter(key => this.props.columns.findIndex(existingKey => existingKey.heading.toUpperCase() === key.toUpperCase()) === -1);
        const columns: Column<Doc>[] = [];
        const tableIsFocused = this.props.isFocused(this.props.Document, false);
        const focusedRow = this._focusedCell.row;
        const focusedCol = this._focusedCell.col;
        const isEditable = !this.props.headerIsEditing;

        if (this.childDocs.reduce((found, doc) => found || doc.type === DocumentType.COL, false)) {
            columns.push(
                {
                    expander: true,
                    Header: "",
                    width: 30,
                    Expander: (rowInfo) => {
                        if (rowInfo.original.type === "collection") {
                            return rowInfo.isExpanded ?
                                <div className="collectionSchemaView-expander" onClick={() => this.onCloseCollection(rowInfo.original)}><FontAwesomeIcon icon={"caret-down"} size="sm" /></div> :
                                <div className="collectionSchemaView-expander" onClick={() => this.onExpandCollection(rowInfo.original)}><FontAwesomeIcon icon={"caret-right"} size="sm" /></div>;
                        } else {
                            return null;
                        }
                    }
                }
            );
        }
        this.props.active;

        const cols = this.props.columns.map(col => {
            const icon: IconProp = this.getColumnType(col) === ColumnType.Number ? "hashtag" : this.getColumnType(col) === ColumnType.String ? "font" :
                this.getColumnType(col) === ColumnType.Boolean ? "check-square" : this.getColumnType(col) === ColumnType.Doc ? "file" :
                    this.getColumnType(col) === ColumnType.Image ? "image" : this.getColumnType(col) === ColumnType.List ? "list-ul" :
                        this.getColumnType(col) === ColumnType.Date ? "calendar" : "align-justify";

            const keysDropdown = <KeysDropdown
                keyValue={col.heading}
                possibleKeys={possibleKeys}
                existingKeys={this.props.columns.map(c => c.heading)}
                canAddNew={true}
                addNew={false}
                onSelect={this.props.changeColumns}
                setIsEditing={this.props.setHeaderIsEditing}
                docs={this.props.childDocs}
                Document={this.props.Document}
                dataDoc={this.props.dataDoc}
                fieldKey={this.props.fieldKey}
                ContainingCollectionDoc={this.props.ContainingCollectionDoc}
                ContainingCollectionView={this.props.ContainingCollectionView}
                active={this.props.active}
                openHeader={this.props.openHeader}
                icon={icon}
                col={col}
                // try commenting this out
                width={"100%"}
            />;



            const sortIcon = col.desc === undefined ? "caret-right" : col.desc === true ? "caret-down" : "caret-up";

            const header =
                <div //className="collectionSchemaView-header"
                    //onClick={e => this.props.openHeader(col, menuContent, e.clientX, e.clientY)}
                    className="collectionSchemaView-menuOptions-wrapper"
                    style={{
                        background: col.color, padding: "2px",
                        display: "flex", cursor: "default", height: "100%",
                    }}>
                    {/* <FontAwesomeIcon onClick={e => this.props.openHeader(col, e.clientX, e.clientY)} icon={icon} size="lg" style={{ display: "inline", paddingBottom: "1px", paddingTop: "4px", cursor: "hand" }} /> */}
                    {keysDropdown}
                    <div onClick={e => this.changeSorting(col)}
                        style={{ width: 21, padding: 1, display: "inline", zIndex: 1, background: "inherit", cursor: "hand" }}>
                        <FontAwesomeIcon icon={sortIcon} size="lg" />
                    </div>
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
                    if (colType === ColumnType.Date) return <CollectionSchemaDateCell {...props} />;
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

                return <CollectionSchemaButtons {...props} />;
            },
            width: 28,
            resizable: false
        });
        return columns;
    }


    constructor(props: SchemaTableProps) {
        super(props);
        // convert old schema columns (list of strings) into new schema columns (list of schema header fields)
        const oldSchemaHeaders = Cast(this.props.Document._schemaHeaders, listSpec("string"), []);
        if (oldSchemaHeaders?.length && typeof oldSchemaHeaders[0] !== "object") {
            const newSchemaHeaders = oldSchemaHeaders.map(i => typeof i === "string" ? new SchemaHeaderField(i, "#f1efeb") : i);
            this.props.Document._schemaHeaders = new List<SchemaHeaderField>(newSchemaHeaders);
        } else if (this.props.Document._schemaHeaders === undefined) {
            this.props.Document._schemaHeaders = new List<SchemaHeaderField>([new SchemaHeaderField("title", "#f1efeb")]);
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
            rowFocused: !this.props.headerIsEditing && rowInfo.index === this._focusedCell.row && this.props.isFocused(this.props.Document, true),
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
        const isFocused = this._focusedCell.row === row && this._focusedCell.col === col && this.props.isFocused(this.props.Document, true);
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
        console.log("headerIsEditing", this.props.headerIsEditing);
        if (!this._cellIsEditing && !this.props.headerIsEditing && this.props.isFocused(this.props.Document, true)) {// && this.props.isSelected(true)) {
            const direction = e.key === "Tab" ? "tab" : e.which === 39 ? "right" : e.which === 37 ? "left" : e.which === 38 ? "up" : e.which === 40 ? "down" : "";
            this._focusedCell = this.changeFocusedCellByDirection(direction, this._focusedCell.row, this._focusedCell.col);

            const pdoc = FieldValue(this.childDocs[this._focusedCell.row]);
            pdoc && this.props.setPreviewDoc(pdoc);
        } else if ((this._cellIsEditing || this.props.headerIsEditing) && (e.keyCode === 37 || e.keyCode === 39)) {
            e.stopPropagation(); // stopPropagation for left/right arrows 
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

    @action
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
                return (doc as any)[key][row + ${row}][(doc as any)._schemaHeaders[col + ${col}].heading];
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
        return <div className="collectionSchemaView-table" onPointerDown={this.props.onPointerDown} onWheel={e => this.props.active(true) && e.stopPropagation()}
            onDrop={e => this.props.onDrop(e, {})} onContextMenu={this.onContextMenu} >
            {this.reactTable}
            {StrCast(this.props.Document.type) !== "search" ? <div className="collectionSchemaView-addRow" onClick={() => this.createRow()}>+ new</div>
                : undefined}
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