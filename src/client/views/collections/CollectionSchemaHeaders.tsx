import React = require("react");
import { IconProp, library } from "@fortawesome/fontawesome-svg-core";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { action, computed, observable, runInAction } from "mobx";
import { observer } from "mobx-react";
import { Doc, DocListCast, Opt } from "../../../fields/Doc";
import { listSpec } from "../../../fields/Schema";
import { PastelSchemaPalette, SchemaHeaderField } from "../../../fields/SchemaHeaderField";
import { ScriptField } from "../../../fields/ScriptField";
import { Cast, StrCast } from "../../../fields/Types";
import { undoBatch } from "../../util/UndoManager";
import { SearchBox } from "../search/SearchBox";
import { ColumnType } from "./CollectionSchemaView";
import "./CollectionSchemaView.scss";
import { CollectionView } from "./CollectionView";

const higflyout = require("@hig/flyout");
export const { anchorPoints } = higflyout;
export const Flyout = higflyout.default;


export interface AddColumnHeaderProps {
    createColumn: () => void;
}

@observer
export class CollectionSchemaAddColumnHeader extends React.Component<AddColumnHeaderProps> {
    render() {
        return (
            <button className="add-column" onClick={() => this.props.createColumn()}><FontAwesomeIcon icon="plus" size="sm" /></button>
        );
    }
}


export interface ColumnMenuProps {
    columnField: SchemaHeaderField;
    // keyValue: string;
    possibleKeys: string[];
    existingKeys: string[];
    // keyType: ColumnType;
    typeConst: boolean;
    menuButtonContent: JSX.Element;
    addNew: boolean;
    onSelect: (oldKey: string, newKey: string, addnew: boolean) => void;
    setIsEditing: (isEditing: boolean) => void;
    deleteColumn: (column: string) => void;
    onlyShowOptions: boolean;
    setColumnType: (column: SchemaHeaderField, type: ColumnType) => void;
    setColumnSort: (column: SchemaHeaderField, desc: boolean | undefined) => void;
    anchorPoint?: any;
    setColumnColor: (column: SchemaHeaderField, color: string) => void;
}
@observer
export class CollectionSchemaColumnMenu extends React.Component<ColumnMenuProps> {
    @observable private _isOpen: boolean = false;
    @observable private _node: HTMLDivElement | null = null;

    componentDidMount() { document.addEventListener("pointerdown", this.detectClick); }

    componentWillUnmount() { document.removeEventListener("pointerdown", this.detectClick); }

    @action
    detectClick = (e: PointerEvent) => {
        !this._node?.contains(e.target as Node) && this.props.setIsEditing(this._isOpen = false);
    }

    @action
    toggleIsOpen = (): void => {
        this.props.setIsEditing(this._isOpen = !this._isOpen);
    }

    changeColumnType = (type: ColumnType) => {
        this.props.setColumnType(this.props.columnField, type);
    }

    changeColumnSort = (desc: boolean | undefined) => {
        this.props.setColumnSort(this.props.columnField, desc);
    }

    changeColumnColor = (color: string) => {
        this.props.setColumnColor(this.props.columnField, color);
    }

    @action
    setNode = (node: HTMLDivElement): void => {
        if (node) {
            this._node = node;
        }
    }

    renderTypes = () => {
        if (this.props.typeConst) return (null);

        const type = this.props.columnField.type;
        return (
            <div className="collectionSchema-headerMenu-group">
                <label>Column type:</label>
                <div className="columnMenu-types">
                    <div className={"columnMenu-option" + (type === ColumnType.Any ? " active" : "")} onClick={() => this.changeColumnType(ColumnType.Any)}>
                        <FontAwesomeIcon icon={"align-justify"} size="sm" />
                        Any
                    </div>
                    <div className={"columnMenu-option" + (type === ColumnType.Number ? " active" : "")} onClick={() => this.changeColumnType(ColumnType.Number)}>
                        <FontAwesomeIcon icon={"hashtag"} size="sm" />
                        Number
                    </div>
                    <div className={"columnMenu-option" + (type === ColumnType.String ? " active" : "")} onClick={() => this.changeColumnType(ColumnType.String)}>
                        <FontAwesomeIcon icon={"font"} size="sm" />
                        Text
                    </div>
                    <div className={"columnMenu-option" + (type === ColumnType.Boolean ? " active" : "")} onClick={() => this.changeColumnType(ColumnType.Boolean)}>
                        <FontAwesomeIcon icon={"check-square"} size="sm" />
                        Checkbox
                    </div>
                    <div className={"columnMenu-option" + (type === ColumnType.List ? " active" : "")} onClick={() => this.changeColumnType(ColumnType.List)}>
                        <FontAwesomeIcon icon={"list-ul"} size="sm" />
                        List
                    </div>
                    <div className={"columnMenu-option" + (type === ColumnType.Doc ? " active" : "")} onClick={() => this.changeColumnType(ColumnType.Doc)}>
                        <FontAwesomeIcon icon={"file"} size="sm" />
                        Document
                    </div>
                    <div className={"columnMenu-option" + (type === ColumnType.Image ? " active" : "")} onClick={() => this.changeColumnType(ColumnType.Image)}>
                        <FontAwesomeIcon icon={"image"} size="sm" />
                        Image
                    </div>
                    <div className={"columnMenu-option" + (type === ColumnType.Date ? " active" : "")} onClick={() => this.changeColumnType(ColumnType.Date)}>
                        <FontAwesomeIcon icon={"calendar"} size="sm" />
                        Date
                    </div>
                </div>
            </div >
        );
    }

    renderSorting = () => {
        const sort = this.props.columnField.desc;
        return (
            <div className="collectionSchema-headerMenu-group">
                <label>Sort by:</label>
                <div className="columnMenu-sort">
                    <div className={"columnMenu-option" + (sort === true ? " active" : "")} onClick={() => this.changeColumnSort(true)}>
                        <FontAwesomeIcon icon="sort-amount-down" size="sm" />
                        Sort descending
                    </div>
                    <div className={"columnMenu-option" + (sort === false ? " active" : "")} onClick={() => this.changeColumnSort(false)}>
                        <FontAwesomeIcon icon="sort-amount-up" size="sm" />
                        Sort ascending
                    </div>
                    <div className="columnMenu-option" onClick={() => this.changeColumnSort(undefined)}>
                        <FontAwesomeIcon icon="times" size="sm" />
                        Clear sorting
                    </div>
                </div>
            </div>
        );
    }

    renderColors = () => {
        const selected = this.props.columnField.color;

        const pink = PastelSchemaPalette.get("pink2");
        const purple = PastelSchemaPalette.get("purple2");
        const blue = PastelSchemaPalette.get("bluegreen1");
        const yellow = PastelSchemaPalette.get("yellow4");
        const red = PastelSchemaPalette.get("red2");
        const gray = "#f1efeb";

        return (
            <div className="collectionSchema-headerMenu-group">
                <label>Color:</label>
                <div className="columnMenu-colors">
                    <div className={"columnMenu-colorPicker" + (selected === pink ? " active" : "")} style={{ backgroundColor: pink }} onClick={() => this.changeColumnColor(pink!)}></div>
                    <div className={"columnMenu-colorPicker" + (selected === purple ? " active" : "")} style={{ backgroundColor: purple }} onClick={() => this.changeColumnColor(purple!)}></div>
                    <div className={"columnMenu-colorPicker" + (selected === blue ? " active" : "")} style={{ backgroundColor: blue }} onClick={() => this.changeColumnColor(blue!)}></div>
                    <div className={"columnMenu-colorPicker" + (selected === yellow ? " active" : "")} style={{ backgroundColor: yellow }} onClick={() => this.changeColumnColor(yellow!)}></div>
                    <div className={"columnMenu-colorPicker" + (selected === red ? " active" : "")} style={{ backgroundColor: red }} onClick={() => this.changeColumnColor(red!)}></div>
                    <div className={"columnMenu-colorPicker" + (selected === gray ? " active" : "")} style={{ backgroundColor: gray }} onClick={() => this.changeColumnColor(gray)}></div>
                </div>
            </div>
        );
    }

    renderContent = () => {
        return (
            <div className="collectionSchema-header-menuOptions">
                {this.props.onlyShowOptions ? <></> :
                    <>
                        {this.renderTypes()}
                        {this.renderSorting()}
                        {this.renderColors()}
                        <div className="collectionSchema-headerMenu-group">
                            <button onClick={() => this.props.deleteColumn(this.props.columnField.heading)}>Delete Column</button>
                        </div>
                    </>
                }
            </div>
        );
    }

    render() {
        return (
            <div className="collectionSchema-header-menu" ref={this.setNode}>
                <Flyout anchorPoint={this.props.anchorPoint ? this.props.anchorPoint : anchorPoints.TOP_CENTER} content={this.renderContent()}>
                    <div className="collectionSchema-header-toggler" onClick={() => this.toggleIsOpen()}>{this.props.menuButtonContent}</div>
                </ Flyout >
            </div>
        );
    }
}


export interface KeysDropdownProps {
    keyValue: string;
    possibleKeys: string[];
    existingKeys: string[];
    canAddNew: boolean;
    addNew: boolean;
    onSelect: (oldKey: string, newKey: string, addnew: boolean, filter?: string) => void;
    setIsEditing: (isEditing: boolean) => void;
    width?: string;
    docs?: Doc[];
    Document: Doc;
    dataDoc: Doc | undefined;
    fieldKey: string;
    ContainingCollectionDoc: Doc | undefined;
    ContainingCollectionView: Opt<CollectionView>;
    active?: (outsideReaction?: boolean) => boolean;
    openHeader: (column: any, screenx: number, screeny: number) => void;
    col: SchemaHeaderField;
    icon: IconProp;
}
@observer
export class KeysDropdown extends React.Component<KeysDropdownProps> {
    @observable private _key: string = this.props.keyValue;
    @observable private _searchTerm: string = this.props.keyValue;
    @observable private _isOpen: boolean = false;
    @observable private _node: HTMLDivElement | null = null;
    @observable private _inputRef: React.RefObject<HTMLInputElement> = React.createRef();

    @action setSearchTerm = (value: string): void => { this._searchTerm = value; };
    @action setKey = (key: string): void => { this._key = key; };
    @action setIsOpen = (isOpen: boolean): void => { this._isOpen = isOpen; };

    @action
    onSelect = (key: string): void => {
        this.props.onSelect(this._key, key, this.props.addNew);
        this.setKey(key);
        this._isOpen = false;
        this.props.setIsEditing(false);
    }

    @action
    setNode = (node: HTMLDivElement): void => {
        if (node) {
            this._node = node;
        }
    }

    componentDidMount() {
        document.addEventListener("pointerdown", this.detectClick);
        const filters = Cast(this.props.Document._docFilters, listSpec("string"));
        if (filters?.includes(this._key)) {
            runInAction(() => this.closeResultsVisibility = "contents");
        }
    }

    @action
    detectClick = (e: PointerEvent): void => {
        if (this._node && this._node.contains(e.target as Node)) {
        } else {
            this._isOpen = false;
            this.props.setIsEditing(false);
        }
    }

    private tempfilter: string = "";
    @undoBatch
    onKeyDown = (e: React.KeyboardEvent): void => {
        if (e.key === "Enter") {
            if (this._searchTerm.includes(":")) {
                const colpos = this._searchTerm.indexOf(":");
                const temp = this._searchTerm.slice(colpos + 1, this._searchTerm.length);
                if (temp === "") {
                    Doc.setDocFilter(this.props.Document, this._key, this.tempfilter, undefined);
                    this.updateFilter();
                }
                else {
                    Doc.setDocFilter(this.props.Document, this._key, this.tempfilter, undefined);
                    this.tempfilter = temp;
                    Doc.setDocFilter(this.props.Document, this._key, temp, "check");
                    this.props.col.setColor("green");
                    this.closeResultsVisibility = "contents";
                }
            }
            else {
                Doc.setDocFilter(this.props.Document, this._key, this.tempfilter, undefined);
                this.updateFilter();
                if (this.showKeys.length) {
                    this.onSelect(this.showKeys[0]);
                } else if (this._searchTerm !== "" && this.props.canAddNew) {
                    this.setSearchTerm(this._searchTerm || this._key);
                    this.onSelect(this._searchTerm);
                }
            }
        }
    }

    onChange = (val: string): void => {
        this.setSearchTerm(val);
    }

    @action
    onFocus = (e: React.FocusEvent): void => {
        this._isOpen = true;
        this.props.setIsEditing(true);
    }

    @computed get showKeys() {
        const whitelistKeys = ["context", "author", "*lastModified", "text", "data", "tags", "creationDate"];
        const keyOptions = this._searchTerm === "" ? this.props.possibleKeys : this.props.possibleKeys.filter(key => key.toUpperCase().indexOf(this._searchTerm.toUpperCase()) > -1);
        const showKeys = new Set<string>();
        [...keyOptions, ...whitelistKeys].forEach(key => (!Doc.UserDoc().noviceMode ||
            whitelistKeys.includes(key)
            || ((!key.startsWith("_") && key[0] === key[0].toUpperCase()) || key[0] === "#")) ? showKeys.add(key) : null);
        return Array.from(showKeys.keys()).filter(key => !this._searchTerm || key.includes(this._searchTerm));
    }
    @action
    renderOptions = (): JSX.Element[] | JSX.Element => {
        if (!this._isOpen) {
            this.defaultMenuHeight = 0;
            return <></>;
        }
        const options = this.showKeys.map(key => {
            return <div key={key} className="key-option" style={{
                border: "1px solid lightgray",
                width: this.props.width, maxWidth: this.props.width, overflowX: "hidden", background: "white",
            }}
                onPointerDown={e => {
                    e.stopPropagation();
                }}
                onClick={() => {
                    this.onSelect(key);
                    this.setSearchTerm("");
                }}>{key}</div>;
        });

        // if search term does not already exist as a group type, give option to create new group type

        if (this._key !== this._searchTerm.slice(0, this._key.length)) {
            if (this._searchTerm !== "" && this.props.canAddNew) {
                options.push(<div key={""} className="key-option" style={{
                    border: "1px solid lightgray", width: this.props.width, maxWidth: this.props.width, overflowX: "hidden", background: "white",
                }}
                    onClick={() => { this.onSelect(this._searchTerm); this.setSearchTerm(""); }}>
                    Create "{this._searchTerm}" key</div>);
            }
        }

        if (options.length === 0) {
            this.defaultMenuHeight = 0;
        }
        else {
            if (this.props.docs) {
                const panesize = this.props.docs.length * 30;
                options.length * 20 + 8 - 10 > panesize ? this.defaultMenuHeight = panesize : this.defaultMenuHeight = options.length * 20 + 8;
            }
            else {
                options.length > 5 ? this.defaultMenuHeight = 108 : this.defaultMenuHeight = options.length * 20 + 8;
            }
        }
        return options;
    }

    docSafe: Doc[] = [];

    @action
    renderFilterOptions = (): JSX.Element[] | JSX.Element => {
        if (!this._isOpen || !this.props.dataDoc) {
            this.defaultMenuHeight = 0;
            return <></>;
        }
        const keyOptions: string[] = [];
        const colpos = this._searchTerm.indexOf(":");
        const temp = this._searchTerm.slice(colpos + 1, this._searchTerm.length);
        if (this.docSafe.length === 0) {
            this.docSafe = DocListCast(this.props.dataDoc[this.props.fieldKey]);
        }
        const docs = this.docSafe;
        docs.forEach((doc) => {
            const key = StrCast(doc[this._key]);
            if (keyOptions.includes(key) === false && key.includes(temp) && key !== "") {
                keyOptions.push(key);
            }
        });

        const filters = Cast(this.props.Document._docFilters, listSpec("string"));
        if (filters === undefined || filters.length === 0 || filters.includes(this._key) === false) {
            this.props.col.setColor("rgb(241, 239, 235)");
            this.closeResultsVisibility = "none";
        }
        for (let i = 0; i < (filters?.length ?? 0) - 1; i += 3) {
            if (filters![i] === this.props.col.heading && keyOptions.includes(filters![i + 1]) === false) {
                keyOptions.push(filters![i + 1]);
            }
        }
        const options = keyOptions.map(key => {
            let bool = false;
            if (filters !== undefined) {
                bool = filters.includes(key) && filters[filters.indexOf(key) + 1] === "check";
            }
            return <div key={key} className="key-option" style={{
                border: "1px solid lightgray", paddingLeft: 5, textAlign: "left",
                width: this.props.width, maxWidth: this.props.width, overflowX: "hidden", background: "white", backgroundColor: "white",
            }}
            >
                <input type="checkbox"
                    onPointerDown={e => e.stopPropagation()}
                    onClick={e => e.stopPropagation()}
                    onChange={(e) => {
                        e.target.checked === true ? Doc.setDocFilter(this.props.Document, this._key, key, "check") : Doc.setDocFilter(this.props.Document, this._key, key, undefined);
                        e.target.checked === true ? this.closeResultsVisibility = "contents" : console.log("");
                        e.target.checked === true ? this.props.col.setColor("green") : this.updateFilter();
                        e.target.checked === true && SearchBox.Instance.filter === true ? Doc.setDocFilter(docs[0], this._key, key, "check") : Doc.setDocFilter(docs[0], this._key, key, undefined);
                    }}
                    checked={bool}
                />
                <span style={{ paddingLeft: 4 }}>
                    {key}
                </span>

            </div>;
        });
        if (options.length === 0) {
            this.defaultMenuHeight = 0;
        }
        else {
            if (this.props.docs) {
                const panesize = this.props.docs.length * 30;
                options.length * 20 + 8 - 10 > panesize ? this.defaultMenuHeight = panesize : this.defaultMenuHeight = options.length * 20 + 8;
            }
            else {
                options.length > 5 ? this.defaultMenuHeight = 108 : this.defaultMenuHeight = options.length * 20 + 8;
            }

        }
        return options;
    }

    @observable defaultMenuHeight = 0;


    updateFilter() {
        const filters = Cast(this.props.Document._docFilters, listSpec("string"));
        if (filters === undefined || filters.length === 0 || filters.includes(this._key) === false) {
            this.props.col.setColor("rgb(241, 239, 235)");
            this.closeResultsVisibility = "none";
        }
    }


    get ignoreFields() { return ["_docFilters", "_docRangeFilters"]; }

    @computed get scriptField() {
        const scriptText = "setDocFilter(containingTreeView, heading, this.title, checked)";
        const script = ScriptField.MakeScript(scriptText, { this: Doc.name, heading: "string", checked: "string", containingTreeView: Doc.name });
        return script ? () => script : undefined;
    }
    filterBackground = () => "rgba(105, 105, 105, 0.432)";
    @observable filterOpen: boolean | undefined = undefined;
    closeResultsVisibility: string = "none";

    removeFilters = (e: React.PointerEvent): void => {
        const keyOptions: string[] = [];
        if (this.docSafe.length === 0 && this.props.dataDoc) {
            this.docSafe = DocListCast(this.props.dataDoc[this.props.fieldKey]);
        }
        const docs = this.docSafe;
        docs.forEach((doc) => {
            const key = StrCast(doc[this._key]);
            if (keyOptions.includes(key) === false) {
                keyOptions.push(key);
            }
        });

        Doc.setDocFilter(this.props.Document, this._key, "", "remove");
        this.props.col.setColor("rgb(241, 239, 235)");
        this.closeResultsVisibility = "none";
    }
    render() {
        return (
            <div style={{ display: "flex" }} ref={this.setNode}>
                <FontAwesomeIcon onClick={e => { this.props.openHeader(this.props.col, e.clientX, e.clientY); e.stopPropagation(); }} icon={this.props.icon} size="lg" style={{ display: "inline", paddingBottom: "1px", paddingTop: "4px", cursor: "hand" }} />

                {/* <FontAwesomeIcon icon={fa.faSearchMinus} size="lg" style={{ display: "inline", paddingBottom: "1px", paddingTop: "4px", cursor: "hand" }} onClick={e => {
                    runInAction(() => { this._isOpen === undefined ? this._isOpen = true : this._isOpen = !this._isOpen })
                }} /> */}

                <div className="keys-dropdown" style={{ zIndex: 1, width: this.props.width, maxWidth: this.props.width }}>
                    <input className="keys-search" style={{ width: "100%" }}
                        ref={this._inputRef} type="text" value={this._searchTerm} placeholder="Column key" onKeyDown={this.onKeyDown}
                        onChange={e => this.onChange(e.target.value)}
                        onClick={(e) => { e.stopPropagation(); this._inputRef.current?.focus(); }}
                        onFocus={this.onFocus} ></input>
                    <div style={{ display: this.closeResultsVisibility }}>
                        <FontAwesomeIcon onPointerDown={this.removeFilters} icon={"times-circle"} size="lg"
                            style={{ cursor: "hand", color: "grey", padding: 2, left: -20, top: -1, height: 15, position: "relative" }} />
                    </div>
                    {!this._isOpen ? (null) : <div className="keys-options-wrapper" style={{
                        width: this.props.width, maxWidth: this.props.width, height: "auto",
                    }}>
                        {this._searchTerm.includes(":") ? this.renderFilterOptions() : this.renderOptions()}
                    </div>}
                </div >
            </div>
        );
    }
}
