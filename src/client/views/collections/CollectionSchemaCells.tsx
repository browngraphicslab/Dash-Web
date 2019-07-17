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
import { NumCast, StrCast, BoolCast } from "../../../new_fields/Types";


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
    changeFocusedCellByDirection: (direction: string) => void;
    changeFocusedCellByIndex: (row: number, col: number) => void;
    setIsEditing: (isEditing: boolean) => void;
    isEditable: boolean;
}

@observer
export class CollectionSchemaCell extends React.Component<CellProps> {
    @observable protected _isEditing: boolean = false;
    protected _focusRef = React.createRef<HTMLDivElement>();
    protected _document = this.props.rowProps.original;

    componentDidMount() {
        if (this._focusRef.current) {
            if (this.props.isFocused) {
                this._focusRef.current.className += " focused";
            } else {
                this._focusRef.current.className = "collectionSchemaView-cellWrapper";
            }
        }

        document.addEventListener("keydown", this.onKeyDown);
    }

    componentWillUnmount() {
        document.removeEventListener("keydown", this.onKeyDown);
    }

    @action
    onKeyDown = (e: KeyboardEvent): void => {
        if (this.props.isFocused && this.props.isEditable) {
            // console.log("schema cell", this.props.isEditable);
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
    }

    @action
    onPointerDown = (e: React.PointerEvent): void => {
        this.props.changeFocusedCellByIndex(this.props.row, this.props.col);
    }

    renderCell = (rowProps: CellInfo) => {
        let props: FieldViewProps = {
            Document: rowProps.original,
            DataDoc: rowProps.original,
            fieldKey: rowProps.column.id as string,
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
        let fieldContentView = <FieldView {...props} />;
        let reference = React.createRef<HTMLDivElement>();
        let onItemDown = (e: React.PointerEvent) => {
            (!this.props.CollectionView.props.isSelected() ? undefined :
                SetupDrag(reference, () => props.Document, this.props.moveDocument, this.props.Document.schemaDoc ? "copy" : undefined)(e));
        };
        let applyToDoc = (doc: Doc, run: (args?: { [name: string]: any }) => any) => {
            const res = run({ this: doc });
            if (!res.success) return false;
            doc[props.fieldKey] = res.result;
            return true;
        };
        return (
            <div className="collectionSchemaView-cellContents" onPointerDown={onItemDown} key={props.Document[Id]} ref={reference}>
                <EditableView
                    display={"inline"}
                    contents={fieldContentView}
                    height={Number(MAX_ROW_HEIGHT)}
                    GetValue={() => {
                        let field = props.Document[props.fieldKey];
                        if (Field.IsField(field)) {
                            return Field.toScriptString(field);
                        }
                        return "";
                    }}
                    SetValue={(value: string) => {
                        let script = CompileScript(value, { addReturn: true, params: { this: Doc.name } });
                        if (!script.compiled) {
                            return false;
                        }
                        return applyToDoc(props.Document, script.run);
                    }}
                    OnFillDown={async (value: string) => {
                        let script = CompileScript(value, { addReturn: true, params: { this: Doc.name } });
                        if (!script.compiled) {
                            return;
                        }
                        const run = script.run;
                        //TODO This should be able to be refactored to compile the script once
                        const val = await DocListCastAsync(this.props.Document[this.props.fieldKey]);
                        val && val.forEach(doc => applyToDoc(doc, run));
                    }}>
                </EditableView>
            </div >
        );
    }

    renderCellWithType(type: string | undefined) {
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
        let fieldContentView: JSX.Element = <FieldView {...props} />;
        let reference = React.createRef<HTMLDivElement>();
        let onItemDown = (e: React.PointerEvent) => {
            // (!this.props.CollectionView.props.isSelected() ? undefined :
            //     SetupDrag(reference, () => props.Document, this.props.moveDocument, this.props.Document.schemaDoc ? "copy" : undefined)(e));
        };
        let applyToDoc = (doc: Doc, run: (args?: { [name: string]: any }) => any) => {
            const res = run({ this: doc });
            if (!res.success) return false;
            doc[props.fieldKey] = res.result;
            return true;
        };

        let field = props.Document[props.fieldKey];
        let contents = type === undefined ? <FieldView {...props} /> : type === "number" ? NumCast(field) : type === "boolean" ? (BoolCast(field) ? "true" : "false") : "incorrect type";
        // let contents = typeof field === "number" ? NumCast(field) : "incorrect type";

        return (
            <div className="collectionSchemaView-cellWrapper" ref={this._focusRef} tabIndex={-1} onPointerDown={this.onPointerDown}>
                <div className="collectionSchemaView-cellContents" onPointerDown={onItemDown} key={props.Document[Id]} ref={reference}>
                    <EditableView
                        editing={this._isEditing}
                        // isEditingCallback={this.isEditingCallback}
                        display={"inline"}
                        contents={fieldContentView}
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
                            return applyToDoc(props.Document, script.run);
                        }}
                        OnFillDown={async (value: string) => {
                            let script = CompileScript(value, { requiredType: type, addReturn: true, params: { this: Doc.name } });
                            if (!script.compiled) {
                                return;
                            }
                            const run = script.run;
                            //TODO This should be able to be refactored to compile the script once
                            const val = await DocListCastAsync(this.props.Document[this.props.fieldKey]);
                            val && val.forEach(doc => applyToDoc(doc, run));
                        }} />
                </div >
            </div>
        );
    }

    render() {
        return this.renderCell(this.props.rowProps);
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
export class CollectionSchemaCheckboxCell extends CollectionSchemaCell {
    render() {
        console.log("render checkbox cell");
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
        let fieldContentView: JSX.Element = <FieldView {...props} />;
        let reference = React.createRef<HTMLDivElement>();
        let onItemDown = (e: React.PointerEvent) => {
            // (!this.props.CollectionView.props.isSelected() ? undefined :
            //     SetupDrag(reference, () => props.Document, this.props.moveDocument, this.props.Document.schemaDoc ? "copy" : undefined)(e));
        };
        let applyToDoc = (doc: Doc, run: (args?: { [name: string]: any }) => any) => {
            const res = run({ this: doc });
            if (!res.success) return false;
            doc[props.fieldKey] = res.result;
            return true;
        };

        let field = props.Document[props.fieldKey];
        let contents = BoolCast(field);
        console.log("contents", contents);
        // let contents = typeof field === "number" ? NumCast(field) : "incorrect type";

        let toggleChecked = (e: React.ChangeEvent<HTMLInputElement>) => {
            console.log("toggle check", e.target.checked);
            // this._isChecked = e.target.checked;

            let document = this.props.rowProps.original;
            let script = CompileScript(e.target.checked.toString(), { requiredType: "boolean", addReturn: true, params: { this: Doc.name } });
            if (script.compiled) {
                let applied = applyToDoc(document, script.run);
                console.log("applied", applied);
            }
        };

        return (
            <div className="collectionSchemaView-cellWrapper" ref={this._focusRef} tabIndex={-1} onPointerDown={this.onPointerDown}>
                <div className="collectionSchemaView-cellContents" onPointerDown={onItemDown} key={props.Document[Id]} ref={reference}>
                    <input type="checkbox" onChange={toggleChecked} />
                    {/* <EditableView
                        editing={this._isEditing}
                        isEditingCallback={this.isEditingCallback}
                        display={"inline"}
                        contents={fieldContentView}
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
                            return applyToDoc(props.Document, script.run);
                        }}
                        OnFillDown={async (value: string) => {
                            let script = CompileScript(value, { requiredType: type, addReturn: true, params: { this: Doc.name } });
                            if (!script.compiled) {
                                return;
                            }
                            const run = script.run;
                            //TODO This should be able to be refactored to compile the script once
                            const val = await DocListCastAsync(this.props.Document[this.props.fieldKey]);
                            val && val.forEach(doc => applyToDoc(doc, run));
                        }} /> */}
                </div >
            </div>
        );
    }
}

        // @observer
// export class CollectionSchemaCheckboxCell extends CollectionSchemaCell {
//     // @observable private _isChecked: boolean = BoolCast(this.props.rowProps.original[this.props.fieldKey]);

//     render() {
//         console.log("checkbox rneder");

//         let props: FieldViewProps = {
//             Document: this.props.rowProps.original,
//             DataDoc: this.props.rowProps.original,
//             fieldKey: this.props.rowProps.column.id as string,
//             fieldExt: "",
//             ContainingCollectionView: this.props.CollectionView,
//             isSelected: returnFalse,
//             select: emptyFunction,
//             renderDepth: this.props.renderDepth + 1,
//             selectOnLoad: false,
//             ScreenToLocalTransform: Transform.Identity,
//             focus: emptyFunction,
//             active: returnFalse,
//             whenActiveChanged: emptyFunction,
//             PanelHeight: returnZero,
//             PanelWidth: returnZero,
//             addDocTab: this.props.addDocTab,
//         };
//         let reference = React.createRef<HTMLDivElement>();
//         let onItemDown = (e: React.PointerEvent) => {
//             (!this.props.CollectionView.props.isSelected() ? undefined :
//                 SetupDrag(reference, () => props.Document, this.props.moveDocument, this.props.Document.schemaDoc ? "copy" : undefined)(e));
//         };

//         let applyToDoc = (doc: Doc, run: (args?: { [name: string]: any }) => any) => {
//             const res = run({ this: doc });
//             if (!res.success) return false;
//             doc[this.props.fieldKey] = res.result;
//             return true;
//         };

//         let toggleChecked = (e: React.ChangeEvent<HTMLInputElement>) => {
//             console.log("toggle check", e.target.checked);
//             // this._isChecked = e.target.checked;

//             let document = this.props.rowProps.original;
//             let script = CompileScript(e.target.checked.toString(), { requiredType: "boolean", addReturn: true, params: { this: Doc.name } });
//             if (script.compiled) {
//                 console.log("script compiled");
//                 applyToDoc(document, script.run);
//             }
//         };


//         let field = props.Document[props.fieldKey];
//         // let contents = typeof field === "boolean" ? BoolCast(field) : "incorrect type";
//         let checked = typeof field === "boolean" ? BoolCast(field) : false;

//         return (
//             <div className="collectionSchemaView-cellWrapper" ref={this._focusRef} tabIndex={-1} onPointerDown={this.onPointerDown}>
//                 <div className="collectionSchemaView-cellContents" onPointerDown={onItemDown} key={props.Document[Id]} ref={reference}>
//                     <input type="checkbox" checked={checked} onChange={toggleChecked} />

//                     {/* <EditableView
//                         editing={this._isEditing}
//                         isEditingCallback={this.isEditingCallback}
//                         display={"inline"}
//                         contents={contents}
//                         height={Number(MAX_ROW_HEIGHT)}
//                         GetValue={() => {
//                             let field = props.Document[props.fieldKey];
//                             if (typeof field === "string") {
//                                 return Field.toScriptString(field);
//                             }
//                             return "";
//                         }
//                         }
//                         SetValue={(value: string) => {
//                             let script = CompileScript(value, { requiredType: "boolean", addReturn: true, params: { this: Doc.name } });
//                             if (!script.compiled) {
//                                 return false;
//                             }
//                             return applyToDoc(props.Document, script.run);
//                         }}
//                         OnFillDown={async (value: string) => {
//                             let script = CompileScript(value, { requiredType: "boolean", addReturn: true, params: { this: Doc.name } });
//                             if (!script.compiled) {
//                                 return;
//                             }
//                             const run = script.run;
//                             //TODO This should be able to be refactored to compile the script once
//                             const val = await DocListCastAsync(this.props.Document[this.props.fieldKey]);
//                             val && val.forEach(doc => applyToDoc(doc, run));
//                         }} /> */}
//                 </div >
//             </div>
//         );
//     }
// }