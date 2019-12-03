import React = require("react");
import { ReactTableDefaults, TableCellRenderer, RowInfo } from "react-table";
import "./CollectionSchemaView.scss";
import { Transform } from "../../util/Transform";
import { Doc } from "../../../new_fields/Doc";
import { DragManager, SetupDrag } from "../../util/DragManager";
import { SelectionManager } from "../../util/SelectionManager";
import { Cast, FieldValue } from "../../../new_fields/Types";
import { ContextMenu } from "../ContextMenu";
import { action } from "mobx";
import { library } from '@fortawesome/fontawesome-svg-core';
import { faGripVertical, faTrash } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { DocumentManager } from "../../util/DocumentManager";
import { SchemaHeaderField } from "../../../new_fields/SchemaHeaderField";
import { undoBatch } from "../../util/UndoManager";

library.add(faGripVertical, faTrash);

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
        if (e.buttons === 1 && SelectionManager.GetIsDragging()) {
            this._header!.current!.className = "collectionSchema-col-wrapper";
            document.addEventListener("pointermove", this.onDragMove, true);
        }
    }
    onPointerLeave = (e: React.PointerEvent): void => {
        this._header!.current!.className = "collectionSchema-col-wrapper";
        document.removeEventListener("pointermove", this.onDragMove, true);
        document.removeEventListener("pointermove", this.onPointerMove);
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
        this._colDropDisposer && this._colDropDisposer();
        if (ele) {
            this._colDropDisposer = DragManager.MakeDropTarget(ele, { handlers: { drop: this.colDrop.bind(this) } });
        }
    }

    colDrop = (e: Event, de: DragManager.DropEvent) => {
        document.removeEventListener("pointermove", this.onDragMove, true);
        const x = this.props.ScreenToLocalTransform().transformPoint(de.x, de.y);
        const rect = this._header!.current!.getBoundingClientRect();
        const bounds = this.props.ScreenToLocalTransform().transformPoint(rect.left + ((rect.right - rect.left) / 2), rect.top);
        const before = x[0] < bounds[0];
        if (de.data instanceof DragManager.ColumnDragData) {
            this.props.reorderColumns(de.data.colKey, this.props.columnValue, before, this.props.allColumns);
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
        this._startDragPosition = { x: dx, y: dy };
        document.addEventListener("pointermove", this.onPointerMove);
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
    addDoc: (doc: Doc, relativeTo?: Doc, before?: boolean) => boolean;
    removeDoc: (doc: Doc) => boolean;
    rowFocused: boolean;
    textWrapRow: (doc: Doc) => void;
    rowWrapped: boolean;
}

export class MovableRow extends React.Component<MovableRowProps> {
    private _header?: React.RefObject<HTMLDivElement> = React.createRef();
    private _rowDropDisposer?: DragManager.DragDropDisposer;

    onPointerEnter = (e: React.PointerEvent): void => {
        if (e.buttons === 1 && SelectionManager.GetIsDragging()) {
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

    createRowDropTarget = (ele: HTMLDivElement) => {
        this._rowDropDisposer && this._rowDropDisposer();
        if (ele) {
            this._rowDropDisposer = DragManager.MakeDropTarget(ele, { handlers: { drop: this.rowDrop.bind(this) } });
        }
    }

    rowDrop = (e: Event, de: DragManager.DropEvent) => {
        const rowDoc = FieldValue(Cast(this.props.rowInfo.original, Doc));
        if (!rowDoc) return false;

        const x = this.props.ScreenToLocalTransform().transformPoint(de.x, de.y);
        const rect = this._header!.current!.getBoundingClientRect();
        const bounds = this.props.ScreenToLocalTransform().transformPoint(rect.left, rect.top + rect.height / 2);
        const before = x[1] < bounds[1];

        if (de.data instanceof DragManager.DocumentDragData) {
            e.stopPropagation();
            if (de.data.draggedDocuments[0] === rowDoc) return true;
            const addDocument = (doc: Doc) => this.props.addDoc(doc, rowDoc, before);
            const movedDocs = de.data.draggedDocuments;
            return (de.data.dropAction || de.data.userDropAction) ?
                de.data.droppedDocuments.reduce((added: boolean, d) => this.props.addDoc(d, rowDoc, before) || added, false)
                : (de.data.moveDocument) ?
                    movedDocs.reduce((added: boolean, d) => de.data.moveDocument(d, rowDoc, addDocument) || added, false)
                    : de.data.droppedDocuments.reduce((added: boolean, d) => this.props.addDoc(d, rowDoc, before), false);
        }
        return false;
    }

    onRowContextMenu = (e: React.MouseEvent): void => {
        const description = this.props.rowWrapped ? "Unwrap text on row" : "Text wrap row";
        ContextMenu.Instance.addItem({ description: description, event: () => this.props.textWrapRow(this.props.rowInfo.original), icon: "file-pdf" });
    }

    @undoBatch
    @action
    move: DragManager.MoveFunction = (doc: Doc, target: Doc, addDoc) => {
        const targetView = DocumentManager.Instance.getDocumentView(target);
        if (targetView && targetView.props.ContainingCollectionDoc) {
            return doc !== target && doc !== targetView.props.ContainingCollectionDoc && this.props.removeDoc(doc) && addDoc(doc);
        }
        return doc !== target && this.props.removeDoc(doc) && addDoc(doc);
    }

    render() {
        const { children = null, rowInfo } = this.props;
        if (!rowInfo) {
            return <ReactTableDefaults.TrComponent>{children}</ReactTableDefaults.TrComponent>;
        }

        const { original } = rowInfo;
        const doc = FieldValue(Cast(original, Doc));
        if (!doc) return <></>;

        const reference = React.createRef<HTMLDivElement>();
        const onItemDown = SetupDrag(reference, () => doc, this.move);

        let className = "collectionSchema-row";
        if (this.props.rowFocused) className += " row-focused";
        if (this.props.rowWrapped) className += " row-wrapped";

        return (
            <div className={className} ref={this.createRowDropTarget} onContextMenu={this.onRowContextMenu}>
                <div className="collectionSchema-row-wrapper" ref={this._header} onPointerEnter={this.onPointerEnter} onPointerLeave={this.onPointerLeave}>
                    <ReactTableDefaults.TrComponent>
                        <div className="row-dragger">
                            <div className="row-option" onClick={undoBatch(() => this.props.removeDoc(this.props.rowInfo.original))}><FontAwesomeIcon icon="trash" size="sm" /></div>
                            <div className="row-option" style={{ cursor: "grab" }} ref={reference} onPointerDown={onItemDown}><FontAwesomeIcon icon="grip-vertical" size="sm" /></div>
                        </div>
                        {children}
                    </ReactTableDefaults.TrComponent>
                </div>
            </div>
        );
    }
}