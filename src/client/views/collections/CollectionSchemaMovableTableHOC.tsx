import React = require("react");
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { action } from "mobx";
import { ReactTableDefaults, RowInfo, TableCellRenderer } from "react-table";
import { Doc } from "../../../fields/Doc";
import { SchemaHeaderField } from "../../../fields/SchemaHeaderField";
import { Cast, FieldValue, StrCast } from "../../../fields/Types";
import { DocumentManager } from "../../util/DocumentManager";
import { DragManager, dropActionType, SetupDrag } from "../../util/DragManager";
import { SnappingManager } from "../../util/SnappingManager";
import { Transform } from "../../util/Transform";
import { undoBatch } from "../../util/UndoManager";
import { ContextMenu } from "../ContextMenu";
import "./CollectionSchemaView.scss";

export interface MovableColumnProps {
    columnRenderer: TableCellRenderer;
    columnValue: SchemaHeaderField;
    allColumns: SchemaHeaderField[];
    reorderColumns: (toMove: SchemaHeaderField, relativeTo: SchemaHeaderField, before: boolean, columns: SchemaHeaderField[]) => void;
    ScreenToLocalTransform: () => Transform;
}
export class MovableColumn extends React.Component<MovableColumnProps> {
    private _header?: React.RefObject<HTMLDivElement> = React.createRef();
    private _colDropDisposer?: DragManager.DragDropDisposer;
    private _startDragPosition: { x: number, y: number } = { x: 0, y: 0 };
    private _sensitivity: number = 16;
    private _dragRef: React.RefObject<HTMLDivElement> = React.createRef();

    onPointerEnter = (e: React.PointerEvent): void => {
        if (e.buttons === 1 && SnappingManager.GetIsDragging()) {
            this._header!.current!.className = "collectionSchema-col-wrapper";
            document.addEventListener("pointermove", this.onDragMove, true);
        }
    }
    onPointerLeave = (e: React.PointerEvent): void => {
        this._header!.current!.className = "collectionSchema-col-wrapper";
        document.removeEventListener("pointermove", this.onDragMove, true);
        !e.buttons && document.removeEventListener("pointermove", this.onPointerMove);
    }
    onDragMove = (e: PointerEvent): void => {
        const x = this.props.ScreenToLocalTransform().transformPoint(e.clientX, e.clientY);
        const rect = this._header!.current!.getBoundingClientRect();
        const bounds = this.props.ScreenToLocalTransform().transformPoint(rect.left + ((rect.right - rect.left) / 2), rect.top);
        const before = x[0] < bounds[0];
        this._header!.current!.className = "collectionSchema-col-wrapper";
        if (before) this._header!.current!.className += " col-before";
        if (!before) this._header!.current!.className += " col-after";
        e.stopPropagation();
    }

    createColDropTarget = (ele: HTMLDivElement) => {
        this._colDropDisposer?.();
        if (ele) {
            this._colDropDisposer = DragManager.MakeDropTarget(ele, this.colDrop.bind(this));
        }
    }

    colDrop = (e: Event, de: DragManager.DropEvent) => {
        document.removeEventListener("pointermove", this.onDragMove, true);
        const x = this.props.ScreenToLocalTransform().transformPoint(de.x, de.y);
        const rect = this._header!.current!.getBoundingClientRect();
        const bounds = this.props.ScreenToLocalTransform().transformPoint(rect.left + ((rect.right - rect.left) / 2), rect.top);
        const before = x[0] < bounds[0];
        const colDragData = de.complete.columnDragData;
        if (colDragData) {
            e.stopPropagation();
            this.props.reorderColumns(colDragData.colKey, this.props.columnValue, before, this.props.allColumns);
            return true;
        }
        return false;
    }

    onPointerMove = (e: PointerEvent) => {
        const onRowMove = (e: PointerEvent) => {
            e.stopPropagation();
            e.preventDefault();

            document.removeEventListener("pointermove", onRowMove);
            document.removeEventListener('pointerup', onRowUp);
            const dragData = new DragManager.ColumnDragData(this.props.columnValue);
            DragManager.StartColumnDrag(this._dragRef.current!, dragData, e.x, e.y);
        };
        const onRowUp = (): void => {
            document.removeEventListener("pointermove", onRowMove);
            document.removeEventListener('pointerup', onRowUp);
        };
        if (e.buttons === 1) {
            const [dx, dy] = this.props.ScreenToLocalTransform().transformDirection(e.clientX - this._startDragPosition.x, e.clientY - this._startDragPosition.y);
            if (Math.abs(dx) + Math.abs(dy) > this._sensitivity) {
                document.removeEventListener("pointermove", this.onPointerMove);
                e.stopPropagation();

                document.addEventListener("pointermove", onRowMove);
                document.addEventListener("pointerup", onRowUp);
            }
        }
    }

    onPointerUp = (e: React.PointerEvent) => {
        document.removeEventListener("pointermove", this.onPointerMove);
    }

    @action
    onPointerDown = (e: React.PointerEvent, ref: React.RefObject<HTMLDivElement>) => {
        this._dragRef = ref;
        const [dx, dy] = this.props.ScreenToLocalTransform().transformDirection(e.clientX, e.clientY);
        if (!(e.target as any)?.tagName.includes("INPUT")) {
            this._startDragPosition = { x: dx, y: dy };
            document.addEventListener("pointermove", this.onPointerMove);
        }
    }


    render() {
        const reference = React.createRef<HTMLDivElement>();

        return (
            <div className="collectionSchema-col" ref={this.createColDropTarget}>
                <div className="collectionSchema-col-wrapper" ref={this._header} onPointerEnter={this.onPointerEnter} onPointerLeave={this.onPointerLeave}>
                    <div className="col-dragger" ref={reference} onPointerDown={e => this.onPointerDown(e, reference)} onPointerUp={this.onPointerUp}>
                        {this.props.columnRenderer}
                    </div>
                </div>
            </div>
        );
    }
}

export interface MovableRowProps {
    rowInfo: RowInfo;
    ScreenToLocalTransform: () => Transform;
    addDoc: (doc: Doc | Doc[], relativeTo?: Doc, before?: boolean) => boolean;
    removeDoc: (doc: Doc | Doc[]) => boolean;
    rowFocused: boolean;
    textWrapRow: (doc: Doc) => void;
    rowWrapped: boolean;
    dropAction: string;
    addDocTab: any;
}

export class MovableRow extends React.Component<MovableRowProps> {
    private _header?: React.RefObject<HTMLDivElement> = React.createRef();
    private _rowDropDisposer?: DragManager.DragDropDisposer;

    onPointerEnter = (e: React.PointerEvent): void => {
        if (e.buttons === 1 && SnappingManager.GetIsDragging()) {
            this._header!.current!.className = "collectionSchema-row-wrapper";
            document.addEventListener("pointermove", this.onDragMove, true);
        }
    }
    onPointerLeave = (e: React.PointerEvent): void => {
        this._header!.current!.className = "collectionSchema-row-wrapper";
        document.removeEventListener("pointermove", this.onDragMove, true);
    }
    onDragMove = (e: PointerEvent): void => {
        const x = this.props.ScreenToLocalTransform().transformPoint(e.clientX, e.clientY);
        const rect = this._header!.current!.getBoundingClientRect();
        const bounds = this.props.ScreenToLocalTransform().transformPoint(rect.left, rect.top + rect.height / 2);
        const before = x[1] < bounds[1];
        this._header!.current!.className = "collectionSchema-row-wrapper";
        if (before) this._header!.current!.className += " row-above";
        if (!before) this._header!.current!.className += " row-below";
        e.stopPropagation();
    }
    componentWillUnmount() {

        this._rowDropDisposer?.();
    }

    createRowDropTarget = (ele: HTMLDivElement) => {
        this._rowDropDisposer?.();
        if (ele) {
            this._rowDropDisposer = DragManager.MakeDropTarget(ele, this.rowDrop.bind(this));
        }
    }

    rowDrop = (e: Event, de: DragManager.DropEvent) => {
        this.onPointerLeave(e as any);
        const rowDoc = FieldValue(Cast(this.props.rowInfo.original, Doc));
        if (!rowDoc) return false;

        const x = this.props.ScreenToLocalTransform().transformPoint(de.x, de.y);
        const rect = this._header!.current!.getBoundingClientRect();
        const bounds = this.props.ScreenToLocalTransform().transformPoint(rect.left, rect.top + rect.height / 2);
        const before = x[1] < bounds[1];

        const docDragData = de.complete.docDragData;
        if (docDragData) {
            e.stopPropagation();
            if (docDragData.draggedDocuments[0] === rowDoc) return true;
            const addDocument = (doc: Doc | Doc[]) => this.props.addDoc(doc, rowDoc, before);
            const movedDocs = docDragData.draggedDocuments;
            return (docDragData.dropAction || docDragData.userDropAction) ?
                docDragData.droppedDocuments.reduce((added: boolean, d) => this.props.addDoc(d, rowDoc, before) || added, false)
                : (docDragData.moveDocument) ?
                    movedDocs.reduce((added: boolean, d) => docDragData.moveDocument?.(d, rowDoc, addDocument) || added, false)
                    : docDragData.droppedDocuments.reduce((added: boolean, d) => this.props.addDoc(d, rowDoc, before), false);
        }
        return false;
    }

    onRowContextMenu = (e: React.MouseEvent): void => {
        const description = this.props.rowWrapped ? "Unwrap text on row" : "Text wrap row";
        ContextMenu.Instance.addItem({ description: description, event: () => this.props.textWrapRow(this.props.rowInfo.original), icon: "file-pdf" });
    }

    @undoBatch
    @action
    move: DragManager.MoveFunction = (doc: Doc | Doc[], targetCollection: Doc | undefined, addDoc) => {
        const targetView = targetCollection && DocumentManager.Instance.getDocumentView(targetCollection);
        return doc !== targetCollection && doc !== targetView?.props.ContainingCollectionDoc && this.props.removeDoc(doc) && addDoc(doc);
    }

    @action
    onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        console.log("yes");
        if (e.key === "Backspace" || e.key === "Delete") {
            undoBatch(() => this.props.removeDoc(this.props.rowInfo.original));
        }
    }

    render() {
        const { children = null, rowInfo } = this.props;

        if (!rowInfo) {
            return <ReactTableDefaults.TrComponent>{children}</ReactTableDefaults.TrComponent>;
        }

        const { original } = rowInfo;
        const doc = FieldValue(Cast(original, Doc));

        if (!doc) return (null);

        const reference = React.createRef<HTMLDivElement>();
        const onItemDown = SetupDrag(reference, () => doc, this.move, StrCast(this.props.dropAction) as dropActionType);

        let className = "collectionSchema-row";
        if (this.props.rowFocused) className += " row-focused";
        if (this.props.rowWrapped) className += " row-wrapped";

        return (
            <div className={className} onKeyPress={this.onKeyDown} ref={this.createRowDropTarget} onContextMenu={this.onRowContextMenu}>
                <div className="collectionSchema-row-wrapper" onKeyPress={this.onKeyDown} ref={this._header} onPointerEnter={this.onPointerEnter} onPointerLeave={this.onPointerLeave}>
                    <ReactTableDefaults.TrComponent onKeyPress={this.onKeyDown} >
                        <div className="row-dragger">
                            <div className="row-option" style={{ left: 5 }} onClick={undoBatch(() => this.props.removeDoc(this.props.rowInfo.original))}><FontAwesomeIcon icon="trash" size="sm" /></div>
                            <div className="row-option" style={{ cursor: "grab", left: 25 }} ref={reference} onPointerDown={onItemDown}><FontAwesomeIcon icon="grip-vertical" size="sm" /></div>
                            <div className="row-option" style={{ left: 40 }} onClick={() => this.props.addDocTab(this.props.rowInfo.original, "onRight")}><FontAwesomeIcon icon="external-link-alt" size="sm" /></div>
                        </div>
                        {children}
                    </ReactTableDefaults.TrComponent>
                </div>
            </div>
        );
    }
}