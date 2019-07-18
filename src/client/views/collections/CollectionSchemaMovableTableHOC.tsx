import React = require("react");
import { ReactTableDefaults, TableCellRenderer, ComponentPropsGetterR, ComponentPropsGetter0 } from "react-table";
import "./CollectionSchemaView.scss";
import { Transform } from "../../util/Transform";
import { Doc } from "../../../new_fields/Doc";
import { DragManager, SetupDrag } from "../../util/DragManager";
import { SelectionManager } from "../../util/SelectionManager";
import { Cast, FieldValue } from "../../../new_fields/Types";


export interface MovableColumnProps {
    columnRenderer: TableCellRenderer;
    columnValue: string;
    allColumns: string[];
    reorderColumns: (toMove: string, relativeTo: string, before: boolean, columns: string[]) => void;
    ScreenToLocalTransform: () => Transform;
}
export class MovableColumn extends React.Component<MovableColumnProps> {
    private _header?: React.RefObject<HTMLDivElement> = React.createRef();
    private _colDropDisposer?: DragManager.DragDropDisposer;

    onPointerEnter = (e: React.PointerEvent): void => {
        if (e.buttons === 1 && SelectionManager.GetIsDragging()) {
            this._header!.current!.className = "collectionSchema-col-wrapper";
            document.addEventListener("pointermove", this.onDragMove, true);
        }
    }
    onPointerLeave = (e: React.PointerEvent): void => {
        this._header!.current!.className = "collectionSchema-col-wrapper";
        document.removeEventListener("pointermove", this.onDragMove, true);
    }
    onDragMove = (e: PointerEvent): void => {
        let x = this.props.ScreenToLocalTransform().transformPoint(e.clientX, e.clientY);
        let rect = this._header!.current!.getBoundingClientRect();
        let bounds = this.props.ScreenToLocalTransform().transformPoint(rect.left + ((rect.right - rect.left) / 2), rect.top);
        let before = x[0] < bounds[0];
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
        let x = this.props.ScreenToLocalTransform().transformPoint(de.x, de.y);
        let rect = this._header!.current!.getBoundingClientRect();
        let bounds = this.props.ScreenToLocalTransform().transformPoint(rect.left + ((rect.right - rect.left) / 2), rect.top);
        let before = x[0] < bounds[0];
        if (de.data instanceof DragManager.ColumnDragData) {
            this.props.reorderColumns(de.data.colKey, this.props.columnValue, before, this.props.allColumns);
            return true;
        }
        return false;
    }

    setupDrag (ref: React.RefObject<HTMLElement>) {
        let onRowMove = (e: PointerEvent) => {
            e.stopPropagation();
            e.preventDefault();

            document.removeEventListener("pointermove", onRowMove);
            document.removeEventListener('pointerup', onRowUp);
            let dragData = new DragManager.ColumnDragData(this.props.columnValue);
            DragManager.StartColumnDrag(ref.current!, dragData, e.x, e.y);
        };
        let onRowUp = (): void => {
            document.removeEventListener("pointermove", onRowMove);
            document.removeEventListener('pointerup', onRowUp);
        };
        let onItemDown = (e: React.PointerEvent) => {
            if (e.button === 0) {
                e.stopPropagation();
                document.addEventListener("pointermove", onRowMove);
                document.addEventListener("pointerup", onRowUp);
            }
        };
        return onItemDown;
    }


    render() {
        let reference = React.createRef<HTMLDivElement>();
        let onItemDown = this.setupDrag(reference);

        return (
            <div className="collectionSchema-col" ref={this.createColDropTarget}>
                <div className="collectionSchema-col-wrapper" ref={this._header} onPointerEnter={this.onPointerEnter} onPointerLeave={this.onPointerLeave}>
                    <div className="col-dragger" ref={reference} onPointerDown={onItemDown}>
                        {this.props.columnRenderer}
                    </div>
                </div>
            </div>
        );
    }
}

export interface MovableRowProps {
    ScreenToLocalTransform: () => Transform;
    addDoc: (doc: Doc, relativeTo?: Doc, before?: boolean) => boolean;
    moveDoc: DragManager.MoveFunction;
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
        let x = this.props.ScreenToLocalTransform().transformPoint(e.clientX, e.clientY);
        let rect = this._header!.current!.getBoundingClientRect();
        let bounds = this.props.ScreenToLocalTransform().transformPoint(rect.left, rect.top + rect.height / 2);
        let before = x[1] < bounds[1];
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
        const { children = null, rowInfo } = this.props;
        if (!rowInfo) return false;

        const { original } = rowInfo;
        const rowDoc = FieldValue(Cast(original, Doc));
        if (!rowDoc) return false;

        let x = this.props.ScreenToLocalTransform().transformPoint(de.x, de.y);
        let rect = this._header!.current!.getBoundingClientRect();
        let bounds = this.props.ScreenToLocalTransform().transformPoint(rect.left, rect.top + rect.height / 2);
        let before = x[1] < bounds[1];
        if (de.data instanceof DragManager.DocumentDragData) {
            e.stopPropagation();
            if (de.data.draggedDocuments[0] === rowDoc) return true;
            let addDocument = (doc: Doc) => this.props.addDoc(doc, rowDoc, before);
            let movedDocs = de.data.draggedDocuments; //(de.data.options === this.props.treeViewId ? de.data.draggedDocuments : de.data.droppedDocuments);
            return (de.data.dropAction || de.data.userDropAction) ?
                de.data.droppedDocuments.reduce((added: boolean, d) => this.props.addDoc(d, rowDoc, before) || added, false)
                : (de.data.moveDocument) ?
                    movedDocs.reduce((added: boolean, d) => de.data.moveDocument(d, rowDoc, addDocument) || added, false)
                    : de.data.droppedDocuments.reduce((added: boolean, d) => this.props.addDoc(d, rowDoc, before), false);
        }
        return false;
    }

    render() {
        const { children = null, rowInfo } = this.props;
        if (!rowInfo) {
            return <ReactTableDefaults.TrComponent>{children}</ReactTableDefaults.TrComponent>;
        }

        const { original } = rowInfo;
        const doc = FieldValue(Cast(original, Doc));
        if (!doc) return <></>;

        let reference = React.createRef<HTMLDivElement>();
        let onItemDown = SetupDrag(reference, () => doc, this.props.moveDoc);

        return (
            <div className="collectionSchema-row" ref={this.createRowDropTarget}>
                <div className="collectionSchema-row-wrapper" ref={this._header} onPointerEnter={this.onPointerEnter} onPointerLeave={this.onPointerLeave}>
                    <div className="row-dragger" ref={reference} onPointerDown={onItemDown}>
                        <ReactTableDefaults.TrComponent>
                            {children}
                        </ReactTableDefaults.TrComponent>
                    </div>
                </div>
            </div>
        );
    }
}