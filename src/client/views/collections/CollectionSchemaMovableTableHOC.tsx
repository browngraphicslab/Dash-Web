import React = require("react");
import { TableProps, ReactTableDefaults, Column, TableCellRenderer, ComponentPropsGetterR, ComponentPropsGetter0 } from "react-table";
import { ComponentType, ComponentClass } from 'react';
import { action } from "mobx";
import "./CollectionSchemaView.scss";
import { library } from '@fortawesome/fontawesome-svg-core';
import { faBars } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { Transform } from "../../util/Transform";
import { Doc } from "../../../new_fields/Doc";
import { DragManager, SetupDrag } from "../../util/DragManager";
import { SelectionManager } from "../../util/SelectionManager";
import { Cast, FieldValue } from "../../../new_fields/Types";

library.add(faBars);

// export interface MovableSchemaProps {
//     ScreenToLocalTransform: () => Transform;
//     addDoc: (doc: Doc, relativeTo?: Doc, before?: boolean) => boolean;
//     moveDoc: DragManager.MoveFunction;
//     columnsValues: string[];
//     columnsList: Column<any>[];
//     setColumnsOrder: (columns: string[]) => void;
//     numImmovableColumns?: number;
// }

// export default function CollectionSchemaMovableHOC<Props extends Partial<TableProps>>(WrappedComponent: ComponentType<Props>): ComponentClass<Props & MovableSchemaProps> {
//     return class CollectionSchemaMovableSchemaHOC extends React.Component<Props & MovableSchemaProps> {
//         constructor(props: any) {
//             super(props);
//         }

//         reorderColumns(toMove: string, relativeTo: string, before: boolean, columnsValues: string[], setColumnsOrder: (columns: string[]) => void) {
//             let columns = [...columnsValues];
//             let oldIndex = columns.indexOf(toMove);
//             let relIndex = columns.indexOf(relativeTo);
//             let newIndex = (oldIndex > relIndex && !before) ? relIndex + 1 : (oldIndex < relIndex && before) ? relIndex - 1 : relIndex;

//             if (oldIndex === newIndex) return;

//             columns.splice(newIndex, 0, columns.splice(oldIndex, 1)[0]);
//             setColumnsOrder(columns);
//         }

//         createColumns(columnsValues: string[], columnsList: Column<any>[], setColumnsOrder: (columnsValues: string[]) => void, ScreenToLocalTransform: () => Transform): Column<any>[] {
//             let immovableIndex = this.props.numImmovableColumns ? columnsList.length - this.props.numImmovableColumns! : columnsList.length;
//             return columnsList.map((col, index) => {
//                 if (index >= immovableIndex) {
//                     return col;
//                 } else {
//                     return ({ ...col, Header: MovableColumn(col.Header, columnsValues[index], columnsValues, setColumnsOrder, this.reorderColumns, ScreenToLocalTransform) });
//                 }
//             });
//         }

//         render() {
//             console.log("THIS IS THE RIGHT HOC");
//             const { ScreenToLocalTransform, addDoc, moveDoc, columnsValues, columnsList, setColumnsOrder, getTrProps, ...props } = this.props;
//             return (
//                 <WrappedComponent {...props as Props} ></WrappedComponent>
//             );
//         }

//     };
// }
// //TrComponent={MovableRow(ScreenToLocalTransform, addDoc, moveDoc)}
// //columns={this.createColumns(columnsValues, columnsList, setColumnsOrder, ScreenToLocalTransform)}

// export  function MovableSchemaHOC<Props extends Partial<TableProps>>(WrappedComponent: ComponentType<Props>): ComponentClass<Props & MovableSchemaProps> {
//     return class MovableSchemaHOC extends React.Component<Props & MovableSchemaProps> {
//         constructor(props: any) {
//             super(props);
//         }

//         createColumns(columnsValues: string[], columnsList: Column<any>[], setColumnsOrder: (columnsValues: string[]) => void, ScreenToLocalTransform: () => Transform): Column<any>[] {
//             let immovableIndex = this.props.numImmovableColumns ? columnsList.length - this.props.numImmovableColumns! : columnsList.length;
//             return columnsList.map((col, index) => {
//                 if (index >= immovableIndex) {
//                     return col;
//                 } else {
//                     return ({ ...col, Header: MovableColumn(col.Header, columnsValues[index], columnsValues, setColumnsOrder, this.reorderColumns, ScreenToLocalTransform) });
//                 }
//             });
//         }

//         reorderColumns(toMove: string, relativeTo: string, before: boolean, columnsValues: string[], setColumnsOrder: (columns: string[]) => void) {
//             let columns = [...columnsValues];
//             let oldIndex = columns.indexOf(toMove);
//             let relIndex = columns.indexOf(relativeTo);
//             let newIndex = (oldIndex > relIndex && !before) ? relIndex + 1 : (oldIndex < relIndex && before) ? relIndex - 1 : relIndex;

//             if (oldIndex === newIndex) return;

//             columns.splice(newIndex, 0, columns.splice(oldIndex, 1)[0]);
//             setColumnsOrder(columns);
//         }

//         render() {
//             const { ScreenToLocalTransform, addDoc, moveDoc, columnsValues, columnsList, setColumnsOrder, getTrProps, ...props } = this.props;
//             return (
//                 <WrappedComponent {...props as Props} columns={this.createColumns(columnsValues, columnsList, setColumnsOrder, ScreenToLocalTransform)} TrComponent={MovableRow(ScreenToLocalTransform, addDoc, moveDoc)} ></WrappedComponent>
//             );
//         }
//     };
// }




export interface MovableColumnProps {
    columnRenderer: TableCellRenderer;
    columnValue: string;
    allColumns: string[];
    reorderColumns: (toMove: string, relativeTo: string, before: boolean, columns: string[]) => void;
    ScreenToLocalTransform: () => Transform;
}
export class MovableColumn extends React.Component<MovableColumnProps> {
    // private _ref: React.RefObject<HTMLDivElement> = React.createRef();

    onDragStart = (e: React.DragEvent<HTMLDivElement>, ref: React.RefObject<HTMLDivElement>): void => {
        console.log("drag start");
        e.dataTransfer.setData("column", this.props.columnValue);
    }

    onDragOver = (e: React.DragEvent<HTMLDivElement>,ref: React.RefObject<HTMLDivElement>): void => {
        console.log("drag over");
        let x = this.props.ScreenToLocalTransform().transformPoint(e.clientX, e.clientY);
        let rect = ref.current!.getBoundingClientRect();
        let bounds = this.props.ScreenToLocalTransform().transformPoint(rect.left + ((rect.right - rect.left) / 2), rect.top);
        let before = x[0] < bounds[0];

        ref.current!.className = "collectionSchema-column-header";
        if (before) ref.current!.className += " col-before";
        if (!before) ref.current!.className += " col-after";
        // e.stopPropagation();
    }

    onDragLeave = (e: React.DragEvent<HTMLDivElement>, ref: React.RefObject<HTMLDivElement>): void => {
        console.log("drag leave");
        ref.current!.className = "collectionSchema-column-header";
        e.stopPropagation();
    }

    onDrop = (e: React.DragEvent<HTMLDivElement>,ref: React.RefObject<HTMLDivElement>): void => {
        console.log("on drop");
        // TODO: get column being dropped and before/after
        let x = this.props.ScreenToLocalTransform().transformPoint(e.clientX, e.clientY);
        let rect = ref.current!.getBoundingClientRect();
        let bounds = this.props.ScreenToLocalTransform().transformPoint(rect.left + ((rect.right - rect.left) / 2), rect.top);
        let before = x[0] < bounds[0];

        this.props.reorderColumns(e.dataTransfer.getData("column"), this.props.columnValue, before, this.props.allColumns);
        ref.current!.className = "collectionSchema-column-header";
    }

    render() {
        let ref: React.RefObject<HTMLDivElement> =  React.createRef();
        return (
             <div className="collectionSchema-column-header" ref={ref} draggable={true} 
             onPointerDown={() => console.log("pointer down")} onPointerEnter={() => console.log("pointer enter")} onPointerOut={() => console.log("pointer exit")}
                 onDragStart={e => this.onDragStart(e, ref)} onDragOver={e => this.onDragOver(e, ref)} onDragLeave={e => this.onDragLeave(e, ref)} onDrop={e => this.onDrop(e, ref)}>
                 {this.props.columnRenderer}
            </div>
        );
    }
}

// export function MovableColumn(columnRenderer: TableCellRenderer, columnValue: string, allColumns: string[],
//     reorderColumns: (toMove: string, relativeTo: string, before: boolean, columns: string[]) => void,
//     ScreenToLocalTransform: () => Transform) {
//     return ;
// }

export function MovableRow(ScreenToLocalTransform: () => Transform, addDoc: (doc: Doc, relativeTo?: Doc, before?: boolean) => boolean, moveDoc: DragManager.MoveFunction) {
    return class MovableRow extends React.Component {
        private _header?: React.RefObject<HTMLDivElement> = React.createRef();
        private _treedropDisposer?: DragManager.DragDropDisposer;

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
            let x = ScreenToLocalTransform().transformPoint(e.clientX, e.clientY);
            let rect = this._header!.current!.getBoundingClientRect();
            let bounds = ScreenToLocalTransform().transformPoint(rect.left, rect.top + rect.height / 2);
            let before = x[1] < bounds[1];
            this._header!.current!.className = "collectionSchema-row-wrapper";
            if (before) this._header!.current!.className += " row-above";
            if (!before) this._header!.current!.className += " row-below";
            e.stopPropagation();
        }

        createTreeDropTarget = (ele: HTMLDivElement) => {
            this._treedropDisposer && this._treedropDisposer();
            if (ele) {
                this._treedropDisposer = DragManager.MakeDropTarget(ele, { handlers: { drop: this.treeDrop.bind(this) } });
            }
        }

        treeDrop = (e: Event, de: DragManager.DropEvent) => {
            const { children = null, rowInfo } = this.props;
            if (!rowInfo) return false;

            const { original } = rowInfo;
            const rowDoc = FieldValue(Cast(original, Doc));
            if (!rowDoc) return false;

            let x = ScreenToLocalTransform().transformPoint(de.x, de.y);
            let rect = this._header!.current!.getBoundingClientRect();
            let bounds = ScreenToLocalTransform().transformPoint(rect.left, rect.top + rect.height / 2);
            let before = x[1] < bounds[1];
            if (de.data instanceof DragManager.DocumentDragData) {
                e.stopPropagation();
                if (de.data.draggedDocuments[0] === rowDoc) return true;
                let addDocument = (doc: Doc) => addDoc(doc, rowDoc, before);
                let movedDocs = de.data.draggedDocuments; //(de.data.options === this.props.treeViewId ? de.data.draggedDocuments : de.data.droppedDocuments);
                return (de.data.dropAction || de.data.userDropAction) ?
                    de.data.droppedDocuments.reduce((added: boolean, d) => addDoc(d, rowDoc, before) || added, false)
                    : (de.data.moveDocument) ?
                        movedDocs.reduce((added: boolean, d) => de.data.moveDocument(d, rowDoc, addDocument) || added, false)
                        : de.data.droppedDocuments.reduce((added: boolean, d) => addDoc(d, rowDoc, before), false);
            }
            return false;
        }

        render() {
            const { children = null, rowInfo } = this.props;
            if (!rowInfo) {
                console.log("no rowinfo");
                return <ReactTableDefaults.TrComponent>{children}</ReactTableDefaults.TrComponent>;
            }

            const { original } = rowInfo;
            const doc = FieldValue(Cast(original, Doc));
            if (!doc) return <></>;

            let reference = React.createRef<HTMLDivElement>();
            let onItemDown = SetupDrag(reference, () => doc, moveDoc);

            return (
                <div className="collectionSchema-row" ref={this.createTreeDropTarget}>
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
    };
}

