import React = require("react");
import { action, observable, trace, computed } from "mobx";
import { observer } from "mobx-react";
import { CellInfo } from "react-table";
import "react-table/react-table.css";
import { emptyFunction, returnFalse, returnZero, returnOne, returnEmptyFilter, Utils, emptyPath } from "../../../Utils";
import { Doc, DocListCast, Field, Opt } from "../../../fields/Doc";
import { Id } from "../../../fields/FieldSymbols";
import { KeyCodes } from "../../util/KeyCodes";
import { SetupDrag, DragManager } from "../../util/DragManager";
import { CompileScript } from "../../util/Scripting";
import { Transform } from "../../util/Transform";
import { MAX_ROW_HEIGHT, COLLECTION_BORDER_WIDTH } from '../globalCssVariables.scss';
import '../DocumentDecorations.scss';
import { EditableView } from "../EditableView";
import { FieldView, FieldViewProps } from "../nodes/FieldView";
import "./CollectionSchemaView.scss";
import { CollectionView, Flyout } from "./CollectionView";
import { NumCast, StrCast, BoolCast, FieldValue, Cast, DateCast } from "../../../fields/Types";
import { Docs } from "../../documents/Documents";
import { library } from '@fortawesome/fontawesome-svg-core';
import { faExpand } from '@fortawesome/free-solid-svg-icons';
import { SchemaHeaderField } from "../../../fields/SchemaHeaderField";
import { undoBatch } from "../../util/UndoManager";
import { SnappingManager } from "../../util/SnappingManager";
import { ComputedField } from "../../../fields/ScriptField";
import { ImageField } from "../../../fields/URLField";
import { List } from "../../../fields/List";
import { OverlayView } from "../OverlayView";
import { DocumentIconContainer } from "../nodes/DocumentIcon";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { DateField } from "../../../fields/DateField";
import { RichTextField } from "../../../fields/RichTextField";
const path = require('path');

library.add(faExpand);

export interface CellProps {
    row: number;
    col: number;
    rowProps: CellInfo;
    CollectionView: Opt<CollectionView>;
    ContainingCollection: Opt<CollectionView>;
    Document: Doc;
    fieldKey: string;
    renderDepth: number;
    addDocTab: (document: Doc, where: string) => boolean;
    pinToPres: (document: Doc) => void;
    moveDocument: (document: Doc | Doc[], targetCollection: Doc | undefined,
        addDocument: (document: Doc | Doc[]) => boolean) => boolean;
    isFocused: boolean;
    changeFocusedCellByIndex: (row: number, col: number) => void;
    setIsEditing: (isEditing: boolean) => void;
    isEditable: boolean;
    setPreviewDoc: (doc: Doc) => void;
    setComputed: (script: string, doc: Doc, field: string, row: number, col: number) => boolean;
    getField: (row: number, col?: number) => void;
    showDoc: (doc: Doc | undefined, dataDoc?: any, screenX?: number, screenY?: number) => void;
}

@observer
export class CollectionSchemaCell extends React.Component<CellProps> {
    @observable protected _isEditing: boolean = false;
    protected _focusRef = React.createRef<HTMLDivElement>();
    protected _document = this.props.rowProps.original;
    protected _dropDisposer?: DragManager.DragDropDisposer;

    componentDidMount() {
        document.addEventListener("keydown", this.onKeyDown);
    }

    componentWillUnmount() {
        document.removeEventListener("keydown", this.onKeyDown);
    }

    @action
    onKeyDown = (e: KeyboardEvent): void => {
        if (this.props.isFocused && this.props.isEditable && e.keyCode === KeyCodes.ENTER) {
            document.removeEventListener("keydown", this.onKeyDown);
            this._isEditing = true;
            this.props.setIsEditing(true);
        }
    }

    @action
    isEditingCallback = (isEditing: boolean): void => {
        document.removeEventListener("keydown", this.onKeyDown);
        isEditing && document.addEventListener("keydown", this.onKeyDown);
        this._isEditing = isEditing;
        this.props.setIsEditing(isEditing);
        this.props.changeFocusedCellByIndex(this.props.row, this.props.col);
    }

    @action
    onPointerDown = async (e: React.PointerEvent): Promise<void> => {

        this.props.changeFocusedCellByIndex(this.props.row, this.props.col);
        this.props.setPreviewDoc(this.props.rowProps.original);

        let url: string;
        if (url = StrCast(this.props.rowProps.row.href)) {
            try {
                new URL(url);
                const temp = window.open(url)!;
                temp.blur();
                window.focus();
            } catch { }
        }

        // this._isEditing = true;
        // this.props.setIsEditing(true);

        const field = this.props.rowProps.original[this.props.rowProps.column.id!];
        const doc = FieldValue(Cast(field, Doc));
        if (typeof field === "object" && doc) this.props.setPreviewDoc(doc);
    }

    @undoBatch
    applyToDoc = (doc: Doc, row: number, col: number, run: (args?: { [name: string]: any }) => any) => {
        const res = run({ this: doc, $r: row, $c: col, $: (r: number = 0, c: number = 0) => this.props.getField(r + row, c + col) });
        if (!res.success) return false;
        // doc[this.props.fieldKey] = res.result;
        // return true;
        doc[this.props.rowProps.column.id as string] = res.result;
        return true;
    }

    private drop = (e: Event, de: DragManager.DropEvent) => {
        if (de.complete.docDragData) {
            const fieldKey = this.props.rowProps.column.id as string;
            if (de.complete.docDragData.draggedDocuments.length === 1) {
                this._document[fieldKey] = de.complete.docDragData.draggedDocuments[0];
            }
            else {
                const coll = Docs.Create.SchemaDocument([new SchemaHeaderField("title", "#f1efeb")], de.complete.docDragData.draggedDocuments, {});
                this._document[fieldKey] = coll;
            }
            e.stopPropagation();
        }
    }

    protected dropRef = (ele: HTMLElement | null) => {
        this._dropDisposer && this._dropDisposer();
        if (ele) {
            this._dropDisposer = DragManager.MakeDropTarget(ele, this.drop.bind(this));
        }
    }

    // expandDoc = (e: React.PointerEvent) => {
    //     let field = this.props.rowProps.original[this.props.rowProps.column.id as string];
    //     let doc = FieldValue(Cast(field, Doc));

    //     this.props.setPreviewDoc(doc!);

    //     // this.props.changeFocusedCellByIndex(this.props.row, this.props.col);

    //     e.stopPropagation();
    // }

    renderCellWithType(type: string | undefined) {
        const dragRef: React.RefObject<HTMLDivElement> = React.createRef();

        const props: FieldViewProps = {
            Document: this.props.rowProps.original,
            DataDoc: this.props.rowProps.original,
            LibraryPath: [],
            dropAction: "alias",
            bringToFront: emptyFunction,
            rootSelected: returnFalse,
            fieldKey: this.props.rowProps.column.id as string,
            docFilters: returnEmptyFilter,
            ContainingCollectionView: this.props.CollectionView,
            ContainingCollectionDoc: this.props.CollectionView && this.props.CollectionView.props.Document,
            isSelected: returnFalse,
            select: emptyFunction,
            renderDepth: this.props.renderDepth + 1,
            ScreenToLocalTransform: Transform.Identity,
            focus: emptyFunction,
            active: returnFalse,
            whenActiveChanged: emptyFunction,
            PanelHeight: returnZero,
            PanelWidth: returnZero,
            NativeHeight: returnZero,
            NativeWidth: returnZero,
            addDocTab: this.props.addDocTab,
            pinToPres: this.props.pinToPres,
            ContentScaling: returnOne
        };

        const field = props.Document[props.fieldKey];
        const doc = FieldValue(Cast(field, Doc));
        const fieldIsDoc = (type === "document" && typeof field === "object") || (typeof field === "object" && doc);

        const onItemDown = (e: React.PointerEvent) => {
            //fieldIsDoc && 
            SetupDrag(this._focusRef,
                () => this._document[props.fieldKey] instanceof Doc ? this._document[props.fieldKey] : this._document,
                this._document[props.fieldKey] instanceof Doc ? (doc: Doc | Doc[], target: Doc | undefined, addDoc: (newDoc: Doc | Doc[]) => any) => addDoc(doc) : this.props.moveDocument,
                this._document[props.fieldKey] instanceof Doc ? "alias" : this.props.Document.schemaDoc ? "copy" : undefined)(e);
        };
        const onPointerEnter = (e: React.PointerEvent): void => {
            if (e.buttons === 1 && SnappingManager.GetIsDragging() && (type === "document" || type === undefined)) {
                dragRef.current!.className = "collectionSchemaView-cellContainer doc-drag-over";
            }
        };
        const onPointerLeave = (e: React.PointerEvent): void => {
            dragRef.current!.className = "collectionSchemaView-cellContainer";
        };

        let contents: any = "incorrect type";
        if (type === undefined) contents = <FieldView {...props} />;
        if (type === "number") contents = typeof field === "number" ? NumCast(field) : "--" + typeof field + "--";
        if (type === "string") contents = typeof field === "string" ? (StrCast(field) === "" ? "--" : StrCast(field)) : "--" + typeof field + "--";
        if (type === "boolean") contents = typeof field === "boolean" ? (BoolCast(field) ? "true" : "false") : "--" + typeof field + "--";
        if (type === "document") {
            const doc = FieldValue(Cast(field, Doc));
            contents = typeof field === "object" ? doc ? StrCast(doc.title) === "" ? "--" : StrCast(doc.title) : `--${typeof field}--` : `--${typeof field}--`;
        }
        if (type === "image") {
            const image = FieldValue(Cast(field, ImageField));
            const doc = FieldValue(Cast(field, Doc));
            contents = typeof field === "object" ? doc ? StrCast(doc.title) === "" ? "--" : StrCast(doc.title) : `--${typeof field}--` : `--${typeof field}--`;
        }
        if (type === "list") {
            contents = typeof field === "object" ? doc ? StrCast(field) === "" ? "--" : StrCast(field) : `--${typeof field}--` : `--${typeof field}--`;
        }
        if (type === "date") {
            contents = typeof field === "object" ? doc ? StrCast(field) === "" ? "--" : StrCast(field) : `--${typeof field}--` : `--${typeof field}--`;
        }


        let className = "collectionSchemaView-cellWrapper";
        if (this._isEditing) className += " editing";
        if (this.props.isFocused && this.props.isEditable) className += " focused";
        if (this.props.isFocused && !this.props.isEditable) className += " inactive";


        // let docExpander = (
        //     <div className="collectionSchemaView-cellContents-docExpander" onPointerDown={this.expandDoc} >
        //         <FontAwesomeIcon icon="expand" size="sm" />
        //     </div>
        // );   
        const positions = [];
        if (StrCast(this.props.Document._searchString) !== "") {
            const cfield = ComputedField.WithoutComputed(() => FieldValue(props.Document[props.fieldKey]));
            let term = "";
            if (cfield !== undefined) {
                if (cfield.Text !== undefined) {
                    term = cfield.Text;
                }
                else if (StrCast(cfield)) {
                    term = StrCast(cfield);
                }
                else {
                    term = String(NumCast(cfield));
                }
            }
            const search = StrCast(this.props.Document._searchString);
            let start = term.indexOf(search);
            let tally = 0;
            if (start !== -1) {
                positions.push(start);
            }
            while (start < contents.length && start !== -1) {
                term = term.slice(start + search.length + 1);
                tally += start + search.length + 1;
                start = term.indexOf(search);
                positions.push(tally + start);
            }
            if (positions.length > 1) {
                positions.pop();
            }
        }
        return (
            <div className="collectionSchemaView-cellContainer" style={{ cursor: fieldIsDoc ? "grab" : "auto" }}
                ref={dragRef} onPointerDown={this.onPointerDown} onPointerEnter={onPointerEnter} onPointerLeave={onPointerLeave}>
                <div className={className} ref={this._focusRef} onPointerDown={onItemDown} tabIndex={-1}>
                    <div className="collectionSchemaView-cellContents" ref={type === undefined || type === "document" ? this.dropRef : null} key={props.Document[Id]}>
                        <EditableView
                            positions={positions.length > 0 ? positions : undefined}
                            search={StrCast(this.props.Document._searchString) ? StrCast(this.props.Document._searchString) : undefined}
                            editing={this._isEditing}
                            isEditingCallback={this.isEditingCallback}
                            display={"inline"}
                            contents={contents ? contents : type === "number" ? "0" : "undefined"}
                            highlight={positions.length > 0 ? true : undefined}
                            //contents={StrCast(contents)}
                            height={"auto"}
                            maxHeight={Number(MAX_ROW_HEIGHT)}
                            placeholder={"enter value"}
                            bing={() => {
                                const cfield = ComputedField.WithoutComputed(() => FieldValue(props.Document[props.fieldKey]));
                                if (cfield !== undefined) {
                                    console.log(typeof (cfield));
                                    // if (typeof(cfield)===RichTextField)
                                    const a = cfield as RichTextField;
                                    if (a.Text !== undefined) {
                                        return (a.Text);
                                    }
                                    else if (StrCast(cfield)) {
                                        return StrCast(cfield);
                                    }
                                    else {
                                        return String(NumCast(cfield));
                                    }
                                }
                            }}
                            GetValue={() => {
                                if (type === "number" && (contents === 0 || contents === "0")) {
                                    return "0";
                                } else {
                                    const cfield = ComputedField.WithoutComputed(() => FieldValue(props.Document[props.fieldKey]));
                                    if (type === "number") {
                                        return StrCast(cfield);
                                    }
                                    const cscript = cfield instanceof ComputedField ? cfield.script.originalScript : undefined;
                                    const cfinalScript = cscript?.split("return")[cscript.split("return").length - 1];
                                    const val = cscript !== undefined ? (cfinalScript?.endsWith(";") ? `:=${cfinalScript?.substring(0, cfinalScript.length - 2)}` : cfinalScript) :
                                        Field.IsField(cfield) ? Field.toScriptString(cfield) : "";
                                    return val;

                                }

                            }}
                            SetValue={action((value: string) => {
                                let retVal = false;

                                if (value.startsWith(":=")) {
                                    retVal = this.props.setComputed(value.substring(2), props.Document, this.props.rowProps.column.id!, this.props.row, this.props.col);
                                } else {
                                    const script = CompileScript(value, { requiredType: type, typecheck: false, editable: true, addReturn: true, params: { this: Doc.name, $r: "number", $c: "number", $: "any" } });
                                    if (script.compiled) {
                                        retVal = this.applyToDoc(props.Document, this.props.row, this.props.col, script.run);
                                    }

                                }
                                if (retVal) {
                                    this._isEditing = false; // need to set this here. otherwise, the assignment of the field will invalidate & cause render() to be called with the wrong value for 'editing'
                                    this.props.setIsEditing(false);
                                }
                                return retVal;

                                //return true;
                            })}
                            OnFillDown={async (value: string) => {
                                const script = CompileScript(value, { requiredType: type, typecheck: false, editable: true, addReturn: true, params: { this: Doc.name, $r: "number", $c: "number", $: "any" } });
                                if (script.compiled) {
                                    DocListCast(this.props.Document[this.props.fieldKey]).
                                        forEach((doc, i) => value.startsWith(":=") ?
                                            this.props.setComputed(value.substring(2), doc, this.props.rowProps.column.id!, i, this.props.col) :
                                            this.applyToDoc(doc, i, this.props.col, script.run));
                                }
                            }}
                        />


                    </div >
                    {/* {fieldIsDoc ? docExpander : null} */}
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
export class CollectionSchemaDateCell extends CollectionSchemaCell {
    @observable private _date: Date = this.props.rowProps.original[this.props.rowProps.column.id as string] instanceof DateField ? DateCast(this.props.rowProps.original[this.props.rowProps.column.id as string]).date :
        this.props.rowProps.original[this.props.rowProps.column.id as string] instanceof Date ? this.props.rowProps.original[this.props.rowProps.column.id as string] : new Date();

    @action
    handleChange = (date: any) => {
        this._date = date;
        // const script = CompileScript(date.toString(), { requiredType: "Date", addReturn: true, params: { this: Doc.name } });
        // if (script.compiled) {
        //     this.applyToDoc(this._document, this.props.row, this.props.col, script.run);
        // } else {
        // ^ DateCast is always undefined for some reason, but that is what the field should be set to
        this._document[this.props.rowProps.column.id as string] = date as Date;
        //}
    }

    render() {
        return <DatePicker
            selected={this._date}
            onSelect={date => this.handleChange(date)}
            onChange={date => this.handleChange(date)}
        />;
    }
}

@observer
export class CollectionSchemaDocCell extends CollectionSchemaCell {

    _overlayDisposer?: () => void;

    private prop: FieldViewProps = {
        Document: this.props.rowProps.original,
        DataDoc: this.props.rowProps.original,
        LibraryPath: [],
        dropAction: "alias",
        bringToFront: emptyFunction,
        rootSelected: returnFalse,
        fieldKey: this.props.rowProps.column.id as string,
        ContainingCollectionView: this.props.CollectionView,
        ContainingCollectionDoc: this.props.CollectionView && this.props.CollectionView.props.Document,
        isSelected: returnFalse,
        select: emptyFunction,
        renderDepth: this.props.renderDepth + 1,
        ScreenToLocalTransform: Transform.Identity,
        focus: emptyFunction,
        active: returnFalse,
        whenActiveChanged: emptyFunction,
        PanelHeight: returnZero,
        PanelWidth: returnZero,
        NativeHeight: returnZero,
        NativeWidth: returnZero,
        addDocTab: this.props.addDocTab,
        pinToPres: this.props.pinToPres,
        ContentScaling: returnOne,
        docFilters: returnEmptyFilter
    };
    @observable private _field = this.prop.Document[this.prop.fieldKey];
    @observable private _doc = FieldValue(Cast(this._field, Doc));
    @observable private _docTitle = this._doc?.title;
    @observable private _preview = false;
    @computed get previewWidth() { return () => NumCast(this.props.Document.schemaPreviewWidth); }
    @computed get borderWidth() { return Number(COLLECTION_BORDER_WIDTH); }
    @computed get tableWidth() { return this.prop.PanelWidth() - 2 * this.borderWidth - 4 - this.previewWidth(); }

    @action
    onSetValue = (value: string) => {
        this._docTitle = value;
        //this.prop.Document[this.prop.fieldKey] = this._text;

        const script = CompileScript(value, {
            addReturn: true,
            typecheck: false,
            transformer: DocumentIconContainer.getTransformer()
        });

        const results = script.compiled && script.run();
        if (results && results.success) {
            this._doc = results.result;
            this._document[this.prop.fieldKey] = results.result;
            this._docTitle = this._doc?.title;

            return true;
        }
        return false;
    }

    onFocus = () => {
        this._overlayDisposer?.();
        this._overlayDisposer = OverlayView.Instance.addElement(<DocumentIconContainer />, { x: 0, y: 0 });
    }

    @action
    onOpenClick = () => {
        this._preview = false;
        if (this._doc) {
            this.props.addDocTab(this._doc, "onRight");
            return true;
        }
        return false;
    }

    @action
    showPreview = (bool: boolean, e: any) => {
        if (this._isEditing) {
            this._preview = false;
        } else {
            if (bool) {
                this.props.showDoc(this._doc, this.prop.DataDoc, e.clientX, e.clientY);
            } else {
                this.props.showDoc(undefined);
            }
        }
    }

    @action
    isEditingCalling = (isEditing: boolean): void => {
        this.showPreview(false, "");
        document.removeEventListener("keydown", this.onKeyDown);
        isEditing && document.addEventListener("keydown", this.onKeyDown);
        this._isEditing = isEditing;
        this.props.setIsEditing(isEditing);
        this.props.changeFocusedCellByIndex(this.props.row, this.props.col);
    }

    onDown = (e: any) => {
        this.props.changeFocusedCellByIndex(this.props.row, this.props.col);
        this.props.setPreviewDoc(this.props.rowProps.original);

        let url: string;
        if (url = StrCast(this.props.rowProps.row.href)) {
            try {
                new URL(url);
                const temp = window.open(url)!;
                temp.blur();
                window.focus();
            } catch { }
        }

        const field = this.props.rowProps.original[this.props.rowProps.column.id!];
        const doc = FieldValue(Cast(field, Doc));
        if (typeof field === "object" && doc) this.props.setPreviewDoc(doc);

        this.showPreview(true, e);

    }

    render() {
        if (typeof this._field === "object" && this._doc && this._docTitle) {
            return (
                <div className="collectionSchemaView-cellWrapper" ref={this._focusRef} tabIndex={-1}
                    onPointerDown={(e) => { this.onDown(e); }}
                    onPointerEnter={(e) => { this.showPreview(true, e); }}
                    onPointerLeave={(e) => { this.showPreview(false, e); }}
                >

                    <div className="collectionSchemaView-cellContents-document"
                        style={{ padding: "5.9px" }}
                        ref={this.dropRef}
                        onFocus={this.onFocus}
                        onBlur={() => this._overlayDisposer?.()}
                    >

                        <EditableView
                            editing={this._isEditing}
                            isEditingCallback={this.isEditingCalling}
                            display={"inline"}
                            contents={this._docTitle}
                            height={"auto"}
                            maxHeight={Number(MAX_ROW_HEIGHT)}
                            GetValue={() => {
                                return StrCast(this._docTitle);
                            }}
                            SetValue={action((value: string) => {
                                this.onSetValue(value);
                                this.showPreview(false, "");
                                return true;
                            })}
                        />
                    </div >
                    <div onClick={this.onOpenClick} className="collectionSchemaView-cellContents-docButton">
                        <FontAwesomeIcon icon="external-link-alt" size="lg" ></FontAwesomeIcon> </div>
                </div>
            );
        } else {
            return this.renderCellWithType("document");
        }
    }
}

@observer
export class CollectionSchemaImageCell extends CollectionSchemaCell {
    // render() {
    //     return this.renderCellWithType("image");
    // }

    choosePath(url: URL, dataDoc: any) {
        const lower = url.href.toLowerCase();
        if (url.protocol === "data") {
            return url.href;
        } else if (url.href.indexOf(window.location.origin) === -1) {
            return Utils.CorsProxy(url.href);
        } else if (!/\.(png|jpg|jpeg|gif|webp)$/.test(lower)) {
            return url.href;//Why is this here
        }
        const ext = path.extname(url.href);
        const _curSuffix = "_o";
        return url.href.replace(ext, _curSuffix + ext);
    }

    render() {
        const props: FieldViewProps = {
            Document: this.props.rowProps.original,
            DataDoc: this.props.rowProps.original,
            LibraryPath: [],
            dropAction: "alias",
            bringToFront: emptyFunction,
            rootSelected: returnFalse,
            fieldKey: this.props.rowProps.column.id as string,
            ContainingCollectionView: this.props.CollectionView,
            ContainingCollectionDoc: this.props.CollectionView && this.props.CollectionView.props.Document,
            isSelected: returnFalse,
            select: emptyFunction,
            renderDepth: this.props.renderDepth + 1,
            ScreenToLocalTransform: Transform.Identity,
            focus: emptyFunction,
            active: returnFalse,
            whenActiveChanged: emptyFunction,
            PanelHeight: returnZero,
            PanelWidth: returnZero,
            NativeHeight: returnZero,
            NativeWidth: returnZero,
            addDocTab: this.props.addDocTab,
            pinToPres: this.props.pinToPres,
            ContentScaling: returnOne,
            docFilters: returnEmptyFilter
        };

        let image = true;
        let url = [];
        if (props.DataDoc) {
            const field = Cast(props.DataDoc[props.fieldKey], ImageField, null); // retrieve the primary image URL that is being rendered from the data doc
            const alts = DocListCast(props.DataDoc[props.fieldKey + "-alternates"]); // retrieve alternate documents that may be rendered as alternate images
            const altpaths = alts.map(doc => Cast(doc[Doc.LayoutFieldKey(doc)], ImageField, null)?.url).filter(url => url).map(url => this.choosePath(url, props.DataDoc)); // access the primary layout data of the alternate documents
            const paths = field ? [this.choosePath(field.url, props.DataDoc), ...altpaths] : altpaths;
            if (paths.length) {
                url = paths;
            } else {
                url = [Utils.CorsProxy("http://www.cs.brown.edu/~bcz/noImage.png")];
                image = false;
            }
            //url = paths.length ? paths : [Utils.CorsProxy("http://www.cs.brown.edu/~bcz/noImage.png")];
        } else {
            url = [Utils.CorsProxy("http://www.cs.brown.edu/~bcz/noImage.png")];
            image = false;
        }

        const heightToWidth = NumCast(props.DataDoc?._nativeHeight) / NumCast(props.DataDoc?._nativeWidth);
        const height = this.props.rowProps.width * heightToWidth;

        if (props.fieldKey === "data") {
            if (url !== []) {
                const reference = React.createRef<HTMLDivElement>();
                return (
                    <div className="collectionSchemaView-cellWrapper" ref={this._focusRef} tabIndex={-1} onPointerDown={this.onPointerDown}>
                        <div className="collectionSchemaView-cellContents" key={this._document[Id]} ref={reference}>
                            <img src={url[0]} width={image ? this.props.rowProps.width : "30px"}
                                height={image ? height : "30px"} />
                        </div >
                    </div>
                );

            } else {
                return this.renderCellWithType("image");
            }
        } else {
            return this.renderCellWithType("image");
        }
    }
}





@observer
export class CollectionSchemaListCell extends CollectionSchemaCell {

    _overlayDisposer?: () => void;

    private prop: FieldViewProps = {
        Document: this.props.rowProps.original,
        DataDoc: this.props.rowProps.original,
        LibraryPath: [],
        dropAction: "alias",
        bringToFront: emptyFunction,
        rootSelected: returnFalse,
        fieldKey: this.props.rowProps.column.id as string,
        ContainingCollectionView: this.props.CollectionView,
        ContainingCollectionDoc: this.props.CollectionView && this.props.CollectionView.props.Document,
        isSelected: returnFalse,
        select: emptyFunction,
        renderDepth: this.props.renderDepth + 1,
        ScreenToLocalTransform: Transform.Identity,
        focus: emptyFunction,
        active: returnFalse,
        whenActiveChanged: emptyFunction,
        PanelHeight: returnZero,
        PanelWidth: returnZero,
        NativeHeight: returnZero,
        NativeWidth: returnZero,
        addDocTab: this.props.addDocTab,
        pinToPres: this.props.pinToPres,
        ContentScaling: returnOne,
        docFilters: returnEmptyFilter
    };
    @observable private _field = this.prop.Document[this.prop.fieldKey];
    @observable private _optionsList = this._field as List<any>;
    @observable private _opened = false;
    @observable private _text = "select an item";
    @observable private _selectedNum = 0;

    @action
    toggleOpened(open: boolean) {
        this._opened = open;
    }

    // @action
    // onChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    //     this._text = e.target.value;

    //     // change if its a document
    //     this._optionsList[this._selectedNum] = this._text;
    // }

    @action
    onSetValue = (value: string) => {


        this._text = value;

        // change if its a document
        this._optionsList[this._selectedNum] = this._text;

        (this.prop.Document[this.prop.fieldKey] as List<any>).splice(this._selectedNum, 1, value);

    }

    @action
    onSelected = (element: string, index: number) => {
        this._text = element;
        this._selectedNum = index;
    }

    onFocus = () => {
        this._overlayDisposer?.();
        this._overlayDisposer = OverlayView.Instance.addElement(<DocumentIconContainer />, { x: 0, y: 0 });
    }


    render() {

        const dragRef: React.RefObject<HTMLDivElement> = React.createRef();

        let type = "list";

        let link = false;
        let doc = false;
        const reference = React.createRef<HTMLDivElement>();

        if (typeof this._field === "object" && this._optionsList[0]) {

            const options = this._optionsList.map((element, index) => {

                if (element instanceof Doc) {
                    doc = true;
                    type = "document";
                    if (this.prop.fieldKey.toLowerCase() === "links") {
                        link = true;
                        type = "link";
                    }
                    const document = FieldValue(Cast(element, Doc));
                    const title = element.title;
                    return <div
                        className="collectionSchemaView-dropdownOption"
                        onPointerDown={(e) => { this.onSelected(StrCast(element.title), index); }}
                        style={{ padding: "6px" }}>
                        {title}
                    </div>;

                } else {
                    return <div
                        className="collectionSchemaView-dropdownOption"
                        onPointerDown={(e) => { this.onSelected(StrCast(element), index); }}
                        style={{ padding: "6px" }}>{element}</div>;
                }
            });

            const plainText = <div style={{ padding: "5.9px" }}>{this._text}</div>;
            // const textarea = <textarea onChange={this.onChange} value={this._text}
            //     onFocus={doc ? this.onFocus : undefined}
            //     onBlur={doc ? e => this._overlayDisposer?.() : undefined}
            //     style={{ resize: "none" }}
            //     placeholder={"select an item"}></textarea>;

            const textarea = <div className="collectionSchemaView-cellContents"
                style={{ padding: "5.9px" }}
                ref={type === undefined || type === "document" ? this.dropRef : null} key={this.prop.Document[Id]}>
                <EditableView
                    editing={this._isEditing}
                    isEditingCallback={this.isEditingCallback}
                    display={"inline"}
                    contents={this._text}
                    height={"auto"}
                    maxHeight={Number(MAX_ROW_HEIGHT)}
                    GetValue={() => {
                        return this._text;
                    }}
                    SetValue={action((value: string) => {

                        // add special for params 
                        this.onSetValue(value);
                        return true;
                    })}
                />
            </div >;

            //☰

            const dropdown = <div>
                {options}
            </div>;

            return (
                <div className="collectionSchemaView-cellWrapper" ref={this._focusRef} tabIndex={-1} onPointerDown={this.onPointerDown}>
                    <div className="collectionSchemaView-cellContents" key={this._document[Id]} ref={reference}>
                        <div className="collectionSchemaView-dropDownWrapper">
                            <button type="button" className="collectionSchemaView-dropdownButton" onClick={(e) => { this.toggleOpened(!this._opened); }}
                                style={{ right: "length", position: "relative" }}>
                                {this._opened ? <FontAwesomeIcon icon="caret-up" size="lg" ></FontAwesomeIcon>
                                    : <FontAwesomeIcon icon="caret-down" size="lg" ></FontAwesomeIcon>}
                            </button>
                            <div className="collectionSchemaView-dropdownText"> {link ? plainText : textarea} </div>
                        </div>

                        {this._opened ? dropdown : null}
                    </div >
                </div>
            );
        } else {
            return this.renderCellWithType("list");
        }
    }
}





@observer
export class CollectionSchemaCheckboxCell extends CollectionSchemaCell {
    @observable private _isChecked: boolean = typeof this.props.rowProps.original[this.props.rowProps.column.id as string] === "boolean" ? BoolCast(this.props.rowProps.original[this.props.rowProps.column.id as string]) : false;

    @action
    toggleChecked = (e: React.ChangeEvent<HTMLInputElement>) => {
        this._isChecked = e.target.checked;
        const script = CompileScript(e.target.checked.toString(), { requiredType: "boolean", addReturn: true, params: { this: Doc.name } });
        if (script.compiled) {
            this.applyToDoc(this._document, this.props.row, this.props.col, script.run);
        }
    }

    render() {
        const reference = React.createRef<HTMLDivElement>();
        const onItemDown = (e: React.PointerEvent) => {
            (!this.props.CollectionView || !this.props.CollectionView.props.isSelected() ? undefined :
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


@observer
export class CollectionSchemaButtons extends CollectionSchemaCell {

    render() {
        // const reference = React.createRef<HTMLDivElement>();
        // const onItemDown = (e: React.PointerEvent) => {
        //     (!this.props.CollectionView || !this.props.CollectionView.props.isSelected() ? undefined :
        //         SetupDrag(reference, () => this._document, this.props.moveDocument, this.props.Document.schemaDoc ? "copy" : undefined)(e));
        // };
        const doc = this.props.rowProps.original;
        let buttons: JSX.Element | undefined = undefined;
        buttons = <div style={{
            paddingTop: 8,
            paddingLeft: 3,
        }}><button onClick={() => {
            doc.searchMatch = false;
            setTimeout(() => doc.searchMatch = true, 0);
            doc.searchIndex = NumCast(doc.searchIndex);
        }} style={{ padding: 2, left: 77 }}>
                <FontAwesomeIcon icon="arrow-up" size="sm" />
            </button>
            <button onClick={() => {
                {
                    doc.searchMatch2 = false;
                    setTimeout(() => doc.searchMatch2 = true, 0);
                    doc.searchIndex = NumCast(doc.searchIndex);
                }
            }} style={{ padding: 2 }}>
                <FontAwesomeIcon icon="arrow-down" size="sm" />
            </button></div>;
        const type = StrCast(doc.type);
        if (type === "pdf") {
            buttons = <div><button
                style={{
                    position: "relative",
                    height: 30,
                    width: 28,
                    left: 1,
                }}

                onClick={() => {
                    doc.searchMatch = false;
                    setTimeout(() => doc.searchMatch = true, 0);
                    doc.searchIndex = NumCast(doc.searchIndex);
                }}>
                <FontAwesomeIcon icon="arrow-down" size="sm" />
            </button></div >;
        }
        else if (type !== "rtf") {
            buttons = undefined;
        }

        if (BoolCast(this.props.Document._searchDoc) === true) {

        }
        else {
            buttons = undefined;
        }
        return (
            <div> {buttons}</div>
        );
    }
}

