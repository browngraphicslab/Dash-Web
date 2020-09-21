import React = require("react");
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { action, computed, observable } from "mobx";
import { observer } from "mobx-react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { CellInfo } from "react-table";
import "react-table/react-table.css";
import { DateField } from "../../../fields/DateField";
import { Doc, DocListCast, Field, Opt } from "../../../fields/Doc";
import { Id } from "../../../fields/FieldSymbols";
import { List } from "../../../fields/List";
import { SchemaHeaderField } from "../../../fields/SchemaHeaderField";
import { ComputedField } from "../../../fields/ScriptField";
import { BoolCast, Cast, DateCast, FieldValue, NumCast, StrCast } from "../../../fields/Types";
import { ImageField } from "../../../fields/URLField";
import { Utils } from "../../../Utils";
import { Docs } from "../../documents/Documents";
import { DocumentType } from "../../documents/DocumentTypes";
import { DocumentManager } from "../../util/DocumentManager";
import { DragManager } from "../../util/DragManager";
import { KeyCodes } from "../../util/KeyCodes";
import { CompileScript } from "../../util/Scripting";
import { SearchUtil } from "../../util/SearchUtil";
import { SnappingManager } from "../../util/SnappingManager";
import { undoBatch } from "../../util/UndoManager";
import '../DocumentDecorations.scss';
import { EditableView } from "../EditableView";
import { MAX_ROW_HEIGHT } from '../globalCssVariables.scss';
import { DocumentIconContainer } from "../nodes/DocumentIcon";
import { OverlayView } from "../OverlayView";
import "./CollectionSchemaView.scss";
import { CollectionView } from "./CollectionView";
const path = require('path');

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
    public static resolvedFieldKey(column: string, rowDoc: Doc) {
        const fieldKey = column;
        if (fieldKey.startsWith("*")) {
            const rootKey = fieldKey.substring(1);
            const allKeys = [...Array.from(Object.keys(rowDoc)), ...Array.from(Object.keys(Doc.GetProto(rowDoc)))];
            const matchedKeys = allKeys.filter(key => key.includes(rootKey));
            if (matchedKeys.length) return matchedKeys[0];
        }
        return fieldKey;
    }
    @observable protected _isEditing: boolean = false;
    protected _focusRef = React.createRef<HTMLDivElement>();
    protected _rowDoc = this.props.rowProps.original;
    protected _rowDataDoc = Doc.GetProto(this.props.rowProps.original);
    protected _dropDisposer?: DragManager.DragDropDisposer;
    @observable contents: string = "";

    componentDidMount() { document.addEventListener("keydown", this.onKeyDown); }
    componentWillUnmount() { document.removeEventListener("keydown", this.onKeyDown); }

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
        this.onItemDown(e);
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

        const doc = Cast(this._rowDoc[this.renderFieldKey], Doc, null);
        doc && this.props.setPreviewDoc(doc);
    }

    @undoBatch
    applyToDoc = (doc: Doc, row: number, col: number, run: (args?: { [name: string]: any }) => any) => {
        const res = run({ this: doc, $r: row, $c: col, $: (r: number = 0, c: number = 0) => this.props.getField(r + row, c + col) });
        if (!res.success) return false;
        doc[this.renderFieldKey] = res.result;
        return true;
    }

    private drop = (e: Event, de: DragManager.DropEvent) => {
        if (de.complete.docDragData) {
            if (de.complete.docDragData.draggedDocuments.length === 1) {
                this._rowDataDoc[this.renderFieldKey] = de.complete.docDragData.draggedDocuments[0];
            }
            else {
                const coll = Docs.Create.SchemaDocument([new SchemaHeaderField("title", "#f1efeb")], de.complete.docDragData.draggedDocuments, {});
                this._rowDataDoc[this.renderFieldKey] = coll;
            }
            e.stopPropagation();
        }
    }

    protected dropRef = (ele: HTMLElement | null) => {
        this._dropDisposer?.();
        ele && (this._dropDisposer = DragManager.MakeDropTarget(ele, this.drop.bind(this)));
    }

    returnHighlights(contents: string, positions?: number[]) {
        if (positions) {
            const results = [];
            StrCast(this.props.Document._searchString);
            const length = StrCast(this.props.Document._searchString).length;
            const color = contents ? "black" : "grey";

            results.push(<span key="-1" style={{ color }}>{contents?.slice(0, positions[0])}</span>);
            positions.forEach((num, cur) => {
                results.push(<span key={"start" + cur} style={{ backgroundColor: "#FFFF00", color }}>{contents?.slice(num, num + length)}</span>);
                let end = 0;
                cur === positions.length - 1 ? end = contents.length : end = positions[cur + 1];
                results.push(<span key={"end" + cur} style={{ color }}>{contents?.slice(num + length, end)}</span>);
            }
            );
            return results;
        }
        return <span style={{ color: contents ? "black" : "grey" }}>{contents ? contents?.valueOf() : "undefined"}</span>;
    }

    @computed get renderFieldKey() { return CollectionSchemaCell.resolvedFieldKey(this.props.rowProps.column.id!, this.props.rowProps.original); }
    onItemDown = async (e: React.PointerEvent) => {
        if (this.props.Document._searchDoc) {
            const aliasdoc = await SearchUtil.GetAliasesOfDocument(this._rowDataDoc);
            const targetContext = aliasdoc.length <= 0 ? undefined : Cast(aliasdoc[0].context, Doc, null);
            DocumentManager.Instance.jumpToDocument(this._rowDoc, false, () => undefined, targetContext);
        }
    }
    renderCellWithType(type: string | undefined) {
        const dragRef: React.RefObject<HTMLDivElement> = React.createRef();

        const fieldKey = this.renderFieldKey;
        const field = this._rowDoc[fieldKey];

        const onPointerEnter = (e: React.PointerEvent): void => {
            if (e.buttons === 1 && SnappingManager.GetIsDragging() && (type === "document" || type === undefined)) {
                dragRef.current!.className = "collectionSchemaView-cellContainer doc-drag-over";
            }
        };
        const onPointerLeave = (e: React.PointerEvent): void => {
            dragRef.current!.className = "collectionSchemaView-cellContainer";
        };

        let contents = Field.toString(field as Field);
        contents = contents === "" ? "--" : contents;

        let className = "collectionSchemaView-cellWrapper";
        if (this._isEditing) className += " editing";
        if (this.props.isFocused && this.props.isEditable) className += " focused";
        if (this.props.isFocused && !this.props.isEditable) className += " inactive";

        const positions = [];
        if (StrCast(this.props.Document._searchString).toLowerCase() !== "") {
            let term = (field instanceof Promise) ? "...promise pending..." : contents.toLowerCase();
            const search = StrCast(this.props.Document._searchString).toLowerCase();
            let start = term.indexOf(search);
            let tally = 0;
            if (start !== -1) {
                positions.push(start);
            }
            while (start < contents?.length && start !== -1) {
                term = term.slice(start + search.length + 1);
                tally += start + search.length + 1;
                start = term.indexOf(search);
                positions.push(tally + start);
            }
            if (positions.length > 1) {
                positions.pop();
            }
        }
        const placeholder = type === "number" ? "0" : contents === "" ? "--" : "undefined";
        return (
            <div className="collectionSchemaView-cellContainer" style={{ cursor: field instanceof Doc ? "grab" : "auto" }}
                ref={dragRef} onPointerDown={this.onPointerDown} onPointerEnter={onPointerEnter} onPointerLeave={onPointerLeave}>
                <div className={className} ref={this._focusRef} tabIndex={-1}>
                    <div className="collectionSchemaView-cellContents" ref={type === undefined || type === "document" ? this.dropRef : null}>
                        {!this.props.Document._searchDoc ?
                            <EditableView
                                editing={this._isEditing}
                                isEditingCallback={this.isEditingCallback}
                                display={"inline"}
                                contents={contents}
                                height={"auto"}
                                maxHeight={Number(MAX_ROW_HEIGHT)}
                                placeholder={placeholder}
                                GetValue={() => {
                                    const cfield = ComputedField.WithoutComputed(() => FieldValue(field));
                                    const cscript = cfield instanceof ComputedField ? cfield.script.originalScript : undefined;
                                    const cfinalScript = cscript?.split("return")[cscript.split("return").length - 1];
                                    return cscript ? (cfinalScript?.endsWith(";") ? `:=${cfinalScript?.substring(0, cfinalScript.length - 2)}` : cfinalScript) :
                                        Field.IsField(cfield) ? Field.toScriptString(cfield) : "";
                                }}
                                SetValue={action((value: string) => {
                                    let retVal = false;
                                    if (value.startsWith(":=") || value.startsWith("=:=")) {
                                        const script = value.substring(value.startsWith("=:=") ? 3 : 2);
                                        retVal = this.props.setComputed(script, value.startsWith(":=") ? this._rowDataDoc : this._rowDoc, this.renderFieldKey, this.props.row, this.props.col);
                                    } else {
                                        const script = CompileScript(value, { requiredType: type, typecheck: false, editable: true, addReturn: true, params: { this: Doc.name, $r: "number", $c: "number", $: "any" } });
                                        script.compiled && (retVal = this.applyToDoc(this._rowDataDoc, this.props.row, this.props.col, script.run));
                                    }
                                    if (retVal) {
                                        this._isEditing = false; // need to set this here. otherwise, the assignment of the field will invalidate & cause render() to be called with the wrong value for 'editing'
                                        this.props.setIsEditing(false);
                                    }
                                    return retVal;
                                })}
                                OnFillDown={async (value: string) => {
                                    const script = CompileScript(value, { requiredType: type, typecheck: false, editable: true, addReturn: true, params: { this: Doc.name, $r: "number", $c: "number", $: "any" } });
                                    script.compiled && DocListCast(field).
                                        forEach((doc, i) => value.startsWith(":=") ?
                                            this.props.setComputed(value.substring(2), Doc.GetProto(doc), this.renderFieldKey, i, this.props.col) :
                                            this.applyToDoc(Doc.GetProto(doc), i, this.props.col, script.run));
                                }}
                            />
                            :
                            this.returnHighlights(contents, positions)
                        }
                    </div >
                </div>
            </div>
        );
    }

    render() { return this.renderCellWithType(undefined); }
}

@observer
export class CollectionSchemaNumberCell extends CollectionSchemaCell { render() { return this.renderCellWithType("number"); } }

@observer
export class CollectionSchemaBooleanCell extends CollectionSchemaCell { render() { return this.renderCellWithType("boolean"); } }

@observer
export class CollectionSchemaStringCell extends CollectionSchemaCell { render() { return this.renderCellWithType("string"); } }

@observer
export class CollectionSchemaDateCell extends CollectionSchemaCell {
    @computed get _date(): Opt<DateField> { return this._rowDoc[this.renderFieldKey] instanceof DateField ? DateCast(this._rowDoc[this.renderFieldKey]) : undefined; }

    @action
    handleChange = (date: any) => {
        // const script = CompileScript(date.toString(), { requiredType: "Date", addReturn: true, params: { this: Doc.name } });
        // if (script.compiled) {
        //     this.applyToDoc(this._document, this.props.row, this.props.col, script.run);
        // } else {
        // ^ DateCast is always undefined for some reason, but that is what the field should be set to
        this._rowDoc[this.renderFieldKey] = new DateField(date as Date);
        //}
    }

    render() {
        return !this.props.isFocused ? <span onPointerDown={this.onPointerDown}>{this._date ? Field.toString(this._date as Field) : "--"}</span> :
            <DatePicker
                selected={this._date?.date || new Date}
                onSelect={date => this.handleChange(date)}
                onChange={date => this.handleChange(date)}
            />;
    }
}

@observer
export class CollectionSchemaDocCell extends CollectionSchemaCell {

    _overlayDisposer?: () => void;

    @computed get _doc() { return FieldValue(Cast(this._rowDoc[this.renderFieldKey], Doc)); }

    @action
    onSetValue = (value: string) => {
        this._doc && (Doc.GetProto(this._doc).title = value);

        const script = CompileScript(value, {
            addReturn: true,
            typecheck: false,
            transformer: DocumentIconContainer.getTransformer()
        });

        const results = script.compiled && script.run();
        if (results && results.success) {
            this._rowDoc[this.renderFieldKey] = results.result;
            return true;
        }
        return false;
    }

    componentWillUnmount() { this.onBlur(); }

    onBlur = () => { this._overlayDisposer?.(); };
    onFocus = () => {
        this.onBlur();
        this._overlayDisposer = OverlayView.Instance.addElement(<DocumentIconContainer />, { x: 0, y: 0 });
    }

    @action
    isEditingCallback = (isEditing: boolean): void => {
        document.removeEventListener("keydown", this.onKeyDown);
        isEditing && document.addEventListener("keydown", this.onKeyDown);
        this._isEditing = isEditing;
        this.props.setIsEditing(isEditing);
        this.props.changeFocusedCellByIndex(this.props.row, this.props.col);
    }

    render() {
        return !this._doc ? this.renderCellWithType("document") :
            <div className="collectionSchemaView-cellWrapper" ref={this._focusRef} tabIndex={-1}
                onPointerDown={this.onPointerDown}
            >
                <div className="collectionSchemaView-cellContents-document"
                    style={{ padding: "5.9px" }}
                    ref={this.dropRef}
                    onFocus={this.onFocus}
                    onBlur={this.onBlur}
                >
                    <EditableView
                        editing={this._isEditing}
                        isEditingCallback={this.isEditingCallback}
                        display={"inline"}
                        contents={this._doc.title || "--"}
                        height={"auto"}
                        maxHeight={Number(MAX_ROW_HEIGHT)}
                        GetValue={() => StrCast(this._doc?.title)}
                        SetValue={action((value: string) => {
                            this.onSetValue(value);
                            return true;
                        })}
                    />
                </div >
                <div onClick={() => this._doc && this.props.addDocTab(this._doc, "add:right")} className="collectionSchemaView-cellContents-docButton">
                    <FontAwesomeIcon icon="external-link-alt" size="lg" />
                </div>
            </div>;
    }
}

@observer
export class CollectionSchemaImageCell extends CollectionSchemaCell {

    choosePath(url: URL) {
        if (url.protocol === "data") return url.href;
        if (url.href.indexOf(window.location.origin) === -1) return Utils.CorsProxy(url.href);
        if (!/\.(png|jpg|jpeg|gif|webp)$/.test(url.href.toLowerCase())) return url.href;//Why is this here

        const ext = path.extname(url.href);
        return url.href.replace(ext, "_o" + path.extname(url.href));
    }

    render() {
        const field = Cast(this._rowDoc[this.renderFieldKey], ImageField, null); // retrieve the primary image URL that is being rendered from the data doc
        const alts = DocListCast(this._rowDoc[this.renderFieldKey + "-alternates"]); // retrieve alternate documents that may be rendered as alternate images
        const altpaths = alts.map(doc => Cast(doc[Doc.LayoutFieldKey(doc)], ImageField, null)?.url).filter(url => url).map(url => this.choosePath(url)); // access the primary layout data of the alternate documents
        const paths = field ? [this.choosePath(field.url), ...altpaths] : altpaths;
        const url = paths.length ? paths : [Utils.CorsProxy("http://www.cs.brown.edu/~bcz/noImage.png")];

        const heightToWidth = NumCast(this._rowDoc._nativeHeight) / NumCast(this._rowDoc._nativeWidth);
        let width = Math.min(75, this.props.rowProps.width);
        const height = Math.min(75, width * heightToWidth);
        width = height / heightToWidth;

        const reference = React.createRef<HTMLDivElement>();
        return <div className="collectionSchemaView-cellWrapper" ref={this._focusRef} tabIndex={-1} onPointerDown={this.onPointerDown}>
            <div className="collectionSchemaView-cellContents" key={this._rowDoc[Id]} ref={reference}>
                <img src={url[0]}
                    width={paths.length ? width : "20px"}
                    height={paths.length ? height : "20px"} />
            </div >
        </div>;
    }
}


@observer
export class CollectionSchemaListCell extends CollectionSchemaCell {
    _overlayDisposer?: () => void;

    @computed get _field() { return this._rowDoc[this.renderFieldKey]; }
    @computed get _optionsList() { return this._field as List<any>; }
    @observable private _opened = false;
    @observable private _text = "select an item";
    @observable private _selectedNum = 0;

    @action
    onSetValue = (value: string) => {
        // change if its a document
        this._optionsList[this._selectedNum] = this._text = value;

        (this._field as List<any>).splice(this._selectedNum, 1, value);
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
        const link = false;
        const reference = React.createRef<HTMLDivElement>();

        if (this._optionsList?.length) {
            const options = !this._opened ? (null) :
                <div>
                    {this._optionsList.map((element, index) => {
                        const val = Field.toString(element);
                        return <div className="collectionSchemaView-dropdownOption" key={index} style={{ padding: "6px" }} onPointerDown={(e) => this.onSelected(StrCast(element), index)} >
                            {val}
                        </div>;
                    })}
                </div>;

            const plainText = <div style={{ padding: "5.9px" }}>{this._text}</div>;
            const textarea = <div className="collectionSchemaView-cellContents" key={this._rowDoc[Id]} style={{ padding: "5.9px" }} ref={this.dropRef} >
                <EditableView
                    editing={this._isEditing}
                    isEditingCallback={this.isEditingCallback}
                    display={"inline"}
                    contents={this._text}
                    height={"auto"}
                    maxHeight={Number(MAX_ROW_HEIGHT)}
                    GetValue={() => this._text}
                    SetValue={action((value: string) => {
                        // add special for params 
                        this.onSetValue(value);
                        return true;
                    })}
                />
            </div >;

            //☰
            return (
                <div className="collectionSchemaView-cellWrapper" ref={this._focusRef} tabIndex={-1} onPointerDown={this.onPointerDown}>
                    <div className="collectionSchemaView-cellContents" key={this._rowDoc[Id]} ref={reference}>
                        <div className="collectionSchemaView-dropDownWrapper">
                            <button type="button" className="collectionSchemaView-dropdownButton" style={{ right: "length", position: "relative" }}
                                onClick={action(e => this._opened = !this._opened)} >
                                <FontAwesomeIcon icon={this._opened ? "caret-up" : "caret-down"} size="sm" />
                            </button>
                            <div className="collectionSchemaView-dropdownText"> {link ? plainText : textarea} </div>
                        </div>
                        {options}
                    </div >
                </div>
            );
        }
        return this.renderCellWithType("list");
    }
}


@observer
export class CollectionSchemaCheckboxCell extends CollectionSchemaCell {
    @computed get _isChecked() { return BoolCast(this._rowDoc[this.renderFieldKey]); }

    render() {
        const reference = React.createRef<HTMLDivElement>();
        return (
            <div className="collectionSchemaView-cellWrapper" ref={this._focusRef} tabIndex={-1} onPointerDown={this.onPointerDown}>
                <input type="checkbox" checked={this._isChecked} onChange={e => this._rowDoc[this.renderFieldKey] = e.target.checked} />
            </div>
        );
    }
}


@observer
export class CollectionSchemaButtons extends CollectionSchemaCell {
    render() {
        return !this.props.Document._searchDoc || ![DocumentType.PDF, DocumentType.RTF].includes(StrCast(this._rowDoc.type) as DocumentType) ? <></> :
            <div style={{ paddingTop: 8, paddingLeft: 3 }} >
                <button style={{ padding: 2, left: 77 }} onClick={() => Doc.SearchMatchNext(this._rowDoc, true)}>
                    <FontAwesomeIcon icon="arrow-up" size="sm" />
                </button>
                <button style={{ padding: 2 }} onClick={() => Doc.SearchMatchNext(this._rowDoc, false)} >
                    <FontAwesomeIcon icon="arrow-down" size="sm" />
                </button>
            </div>;
    }
}