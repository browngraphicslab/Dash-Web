import React = require("react");
import { action, computed, observable, trace, untracked, toJS } from "mobx";
import { observer } from "mobx-react";
import ReactTable, { CellInfo, ComponentPropsGetterR, ReactTableDefaults, Column } from "react-table";
import "react-table/react-table.css";
import { emptyFunction, returnFalse, returnZero, returnOne } from "../../../Utils";
import { Doc, DocListCast, DocListCastAsync, Field, Opt } from "../../../new_fields/Doc";
import { Id } from "../../../new_fields/FieldSymbols";
import { SetupDrag, DragManager } from "../../util/DragManager";
import { CompileScript } from "../../util/Scripting";
import { Transform } from "../../util/Transform";
import { COLLECTION_BORDER_WIDTH, MAX_ROW_HEIGHT } from '../globalCssVariables.scss';
import '../DocumentDecorations.scss';
import { EditableView } from "../EditableView";
import { FieldView, FieldViewProps } from "../nodes/FieldView";
import { CollectionPDFView } from "./CollectionPDFView";
import "./CollectionSchemaView.scss";
import { CollectionVideoView } from "./CollectionVideoView";
import { CollectionView } from "./CollectionView";
import { NumCast, StrCast, BoolCast, FieldValue, Cast } from "../../../new_fields/Types";
import { Docs } from "../../documents/Documents";
import { DocumentContentsView } from "../nodes/DocumentContentsView";
import { SelectionManager } from "../../util/SelectionManager";


export interface CellProps {
    row: number;
    col: number;
    rowProps: CellInfo;
    CollectionView: CollectionView | CollectionPDFView | CollectionVideoView;
    ContainingCollection: Opt<CollectionView | CollectionPDFView | CollectionVideoView>;
    Document: Doc;
    fieldKey: string;
    renderDepth: number;
    addDocTab: (document: Doc, dataDoc: Doc | undefined, where: string) => void;
    moveDocument: (document: Doc, targetCollection: Doc, addDocument: (document: Doc) => boolean) => boolean;
    isFocused: boolean;
    changeFocusedCellByIndex: (row: number, col: number) => void;
    setIsEditing: (isEditing: boolean) => void;
    isEditable: boolean;
}

@observer
export class CollectionSchemaCell extends React.Component<CellProps> {
    @observable protected _isEditing: boolean = this.props.isEditing ? true : false;
    protected _focusRef = React.createRef<HTMLDivElement>();
    protected _document = this.props.rowProps.original;
    private _dropDisposer?: DragManager.DragDropDisposer;

    componentDidMount() {
        // if (this._focusRef.current) {
        //     if (this.props.isFocused) {
        //         this._focusRef.current.className += " focused";
        //         if (!this.props.isEditable) {
        //             this._focusRef.current.className += " inactive";
        //         }
        //     } else {
        //         this._focusRef.current.className = "collectionSchemaView-cellWrapper";
        //     }
        // }

        document.addEventListener("keydown", this.onKeyDown);

    }

    componentWillUnmount() {
        document.removeEventListener("keydown", this.onKeyDown);
    }

    @action
    onKeyDown = (e: KeyboardEvent): void => {
        console.log("CELL keydown");
        if (this.props.isFocused && this.props.isEditable) {
            document.removeEventListener("keydown", this.onKeyDown);
            this._isEditing = true;
            this.props.setIsEditing(true);
        }
    }

    @action
    isEditingCallback = (isEditing: boolean): void => {
        document.addEventListener("keydown", this.onKeyDown);
        this._isEditing = isEditing;
        this.props.setIsEditing(isEditing);
        this.props.changeFocusedCellByIndex(this.props.row, this.props.col);
    }

    @action
    onPointerDown = (e: React.PointerEvent): void => {
        this.props.changeFocusedCellByIndex(this.props.row, this.props.col);
    }

    applyToDoc = (doc: Doc, run: (args?: { [name: string]: any }) => any) => {
        const res = run({ this: doc });
        if (!res.success) return false;
        doc[this.props.rowProps.column.id as string] = res.result;
        return true;
    }

    private drop = (e: Event, de: DragManager.DropEvent) => {
        if (de.data instanceof DragManager.DocumentDragData) {
            let fieldKey = this.props.rowProps.column.id as string;
            if (de.data.draggedDocuments.length === 1) {
                this._document[fieldKey] = de.data.draggedDocuments[0];
            }
            else {
                let coll = Docs.Create.SchemaDocument(["title"], de.data.draggedDocuments, {});
                this._document[fieldKey] = coll;
            }
            e.stopPropagation();
        }
    }

    private dropRef = (ele: HTMLElement) => {
        this._dropDisposer && this._dropDisposer();
        if (ele) {
            this._dropDisposer = DragManager.MakeDropTarget(ele, { handlers: { drop: this.drop.bind(this) } });
        }
    }

    renderCellWithType(type: string | undefined) {
        let dragRef: React.RefObject<HTMLDivElement> = React.createRef();

        let props: FieldViewProps = {
            Document: this.props.rowProps.original,
            DataDoc: this.props.rowProps.original,
            fieldKey: this.props.rowProps.column.id as string,
            fieldExt: "",
            ContainingCollectionView: this.props.CollectionView,
            isSelected: returnFalse,
            select: emptyFunction,
            renderDepth: this.props.renderDepth + 1,
            selectOnLoad: false,
            ScreenToLocalTransform: Transform.Identity,
            focus: emptyFunction,
            active: returnFalse,
            whenActiveChanged: emptyFunction,
            PanelHeight: returnZero,
            PanelWidth: returnZero,
            addDocTab: this.props.addDocTab,
        };

        // let onItemDown = (e: React.PointerEvent) => {
        //     SetupDrag(this._focusRef, () => this._document[props.fieldKey] instanceof Doc ? this._document[props.fieldKey] : this._document,
        //         this._document[props.fieldKey] instanceof Doc ? (doc: Doc, target: Doc, addDoc: (newDoc: Doc) => any) => addDoc(doc) : this.props.moveDocument, this._document[props.fieldKey] instanceof Doc ? "alias" : this.props.Document.schemaDoc ? "copy" : undefined)(e);
        // };
        let onPointerEnter = (e: React.PointerEvent): void => {
            if (e.buttons === 1 && SelectionManager.GetIsDragging() && (type === "document" || type === undefined)) {
                dragRef!.current!.className = "doc-drag-over";
            }
        };
        let onPointerLeave = (e: React.PointerEvent): void => {
            dragRef!.current!.className = "";
        };

        let field = props.Document[props.fieldKey];
        let contents: any = "incorrect type";
        if (type === undefined) contents = <FieldView {...props} />;
        if (type === "number") contents = typeof field === "number" ? NumCast(field) : "--" + typeof field + "--";
        if (type === "string") contents = typeof field === "string" ? (StrCast(field) === "" ? "--" : StrCast(field)) : "--" + typeof field + "--";
        if (type === "boolean") contents = typeof field === "boolean" ? (BoolCast(field) ? "true" : "false") : "--" + typeof field + "--";
        if (type === "document") {
            let doc = FieldValue(Cast(field, Doc));
            contents = typeof field === "object" ? doc ? StrCast(doc.title) === "" ? "--" : StrCast(doc.title) : `--${typeof field}--` : `--${typeof field}--`;
        }

        let className = "collectionSchemaView-cellWrapper";
        if (this._isEditing) className += " editing";
        if (this.props.isFocused && this.props.isEditable) className += " focused";
        if (this.props.isFocused && !this.props.isEditable) className += " inactive";

        return (
            <div className="" ref={dragRef} onPointerEnter={onPointerEnter} onPointerLeave={onPointerLeave}>
                <div className={className} ref={this._focusRef} tabIndex={-1} onPointerDown={this.onPointerDown}>
                    <div className="collectionSchemaView-cellContents" ref={type === undefined || type === "document" ? this.dropRef : null} key={props.Document[Id]}>
                        <EditableView
                            editing={this._isEditing}
                            isEditingCallback={this.isEditingCallback}
                            display={"inline"}
                            contents={contents}
                            height={Number(MAX_ROW_HEIGHT)}
                            GetValue={() => {
                                let field = props.Document[props.fieldKey];
                                if (Field.IsField(field)) {
                                    return Field.toScriptString(field);
                                }
                                return "";
                            }
                            }
                            SetValue={(value: string) => {
                                let script = CompileScript(value, { requiredType: type, addReturn: true, params: { this: Doc.name } });
                                if (!script.compiled) {
                                    return false;
                                }
                                return this.applyToDoc(props.Document, script.run);
                            }}
                            OnFillDown={async (value: string) => {
                                let script = CompileScript(value, { requiredType: type, addReturn: true, params: { this: Doc.name } });
                                if (!script.compiled) {
                                    return;
                                }
                                const run = script.run;
                                //TODO This should be able to be refactored to compile the script once
                                const val = await DocListCastAsync(this.props.Document[this.props.fieldKey]);
                                val && val.forEach(doc => this.applyToDoc(doc, run));
                            }} />
                    </div >
                </div>
            </div>
        );
    }

    render() {
        return this.renderCellWithType(undefined);
    }
}

@observer
export class CollectionSchemaNumberCell extends CollectionSchemaCell {
    render() {
        return this.renderCellWithType("number");
    }
}

@observer
export class CollectionSchemaBooleanCell extends CollectionSchemaCell {
    render() {
        return this.renderCellWithType("boolean");
    }
}

@observer
export class CollectionSchemaStringCell extends CollectionSchemaCell {
    render() {
        return this.renderCellWithType("string");
    }
}

@observer
export class CollectionSchemaDocCell extends CollectionSchemaCell {
    render() {
        return this.renderCellWithType("document");
    }
}

@observer
export class CollectionSchemaCheckboxCell extends CollectionSchemaCell {
    @observable private _isChecked: boolean = typeof this.props.rowProps.original[this.props.rowProps.column.id as string] === "boolean" ? BoolCast(this.props.rowProps.original[this.props.rowProps.column.id as string]) : false;

    @action
    toggleChecked = (e: React.ChangeEvent<HTMLInputElement>) => {
        this._isChecked = e.target.checked;
        let script = CompileScript(e.target.checked.toString(), { requiredType: "boolean", addReturn: true, params: { this: Doc.name } });
        if (script.compiled) {
            this.applyToDoc(this._document, script.run);
        }
    }

    render() {
        let reference = React.createRef<HTMLDivElement>();
        let onItemDown = (e: React.PointerEvent) => {
            (!this.props.CollectionView.props.isSelected() ? undefined :
                SetupDrag(reference, () => this._document, this.props.moveDocument, this.props.Document.schemaDoc ? "copy" : undefined)(e));
        };
        return (
            <div className="collectionSchemaView-cellWrapper" ref={this._focusRef} tabIndex={-1} onPointerDown={this.onPointerDown}>
                <div className="collectionSchemaView-cellContents" onPointerDown={onItemDown} key={this._document[Id]} ref={reference}>
                    <input type="checkbox" checked={this._isChecked} onChange={this.toggleChecked} />
                </div >
            </div>
        );
    }
}
