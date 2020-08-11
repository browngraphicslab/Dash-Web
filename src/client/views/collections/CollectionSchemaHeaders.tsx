import React = require("react");
import { action, observable, computed } from "mobx";
import { observer } from "mobx-react";
import "./CollectionSchemaView.scss";
import { faPlus, faFont, faHashtag, faAlignJustify, faCheckSquare, faToggleOn, faSortAmountDown, faSortAmountUp, faTimes, faImage, faListUl, faCalendar } from '@fortawesome/free-solid-svg-icons';
import { library, IconProp } from "@fortawesome/fontawesome-svg-core";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { ColumnType } from "./CollectionSchemaView";
import { faFile } from "@fortawesome/free-regular-svg-icons";
import { SchemaHeaderField, PastelSchemaPalette } from "../../../fields/SchemaHeaderField";
import { undoBatch } from "../../util/UndoManager";
import { Transform } from '../../util/Transform';
import { Doc, DocListCast, Field, Opt } from "../../../fields/Doc";
import { StrCast, Cast } from "../../../fields/Types";
import { optionFocusAriaMessage } from "react-select/src/accessibility";
import { TraceMobx } from "../../../fields/util";
import { CollectionTreeView } from "./CollectionTreeView";
import { returnEmptyFilter, returnFalse, emptyPath, returnZero, emptyFunction, returnOne } from "../../../Utils";
import { RichTextField } from "../../../fields/RichTextField";
import { Docs } from "../../documents/Documents";
import { List } from "../../../fields/List";
import { listSpec } from "../../../fields/Schema";
import { ScriptField, ComputedField } from "../../../fields/ScriptField";
import { DocumentType } from "../../documents/DocumentTypes";
import { CollectionView } from "./CollectionView";
import { SearchBox } from "../search/SearchBox";
import { createParameter } from "typescript";

const higflyout = require("@hig/flyout");
export const { anchorPoints } = higflyout;
export const Flyout = higflyout.default;

library.add(faPlus, faFont, faHashtag, faAlignJustify, faCheckSquare, faToggleOn, faFile as any, faSortAmountDown, faSortAmountUp, faTimes, faImage, faListUl, faCalendar);

export interface HeaderProps {
    keyValue: SchemaHeaderField;
    possibleKeys: string[];
    existingKeys: string[];
    keyType: ColumnType;
    typeConst: boolean;
    onSelect: (oldKey: string, newKey: string, addnew: boolean) => void;
    setIsEditing: (isEditing: boolean) => void;
    deleteColumn: (column: string) => void;
    setColumnType: (column: SchemaHeaderField, type: ColumnType) => void;
    setColumnSort: (column: SchemaHeaderField, desc: boolean | undefined) => void;
    setColumnColor: (column: SchemaHeaderField, color: string) => void;

}

export class CollectionSchemaHeader extends React.Component<HeaderProps> {
    render() {
        const icon: IconProp = this.props.keyType === ColumnType.Number ? "hashtag" : this.props.keyType === ColumnType.String ? "font" :
            this.props.keyType === ColumnType.Boolean ? "check-square" : this.props.keyType === ColumnType.Doc ? "file" :
                this.props.keyType === ColumnType.Image ? "image" : this.props.keyType === ColumnType.List ? "list-ul" : this.props.keyType === ColumnType.Date ? "calendar" :
                    "align-justify";
        return (
            <div className="collectionSchemaView-header" style={{ background: this.props.keyValue.color }}>
                <CollectionSchemaColumnMenu
                    columnField={this.props.keyValue}
                    // keyValue={this.props.keyValue.heading}
                    possibleKeys={this.props.possibleKeys}
                    existingKeys={this.props.existingKeys}
                    // keyType={this.props.keyType}
                    typeConst={this.props.typeConst}
                    menuButtonContent={<div><FontAwesomeIcon icon={icon} size="sm" />{this.props.keyValue.heading}</div>}
                    addNew={false}
                    onSelect={this.props.onSelect}
                    setIsEditing={this.props.setIsEditing}
                    deleteColumn={this.props.deleteColumn}
                    onlyShowOptions={false}
                    setColumnType={this.props.setColumnType}
                    setColumnSort={this.props.setColumnSort}
                    setColumnColor={this.props.setColumnColor}
                />
            </div>
        );
    }
}


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

    componentDidMount() {
        document.addEventListener("pointerdown", this.detectClick);
    }

    componentWillUnmount() {
        document.removeEventListener("pointerdown", this.detectClick);
    }

    detectClick = (e: PointerEvent): void => {
        if (this._node && this._node.contains(e.target as Node)) {
        } else {
            this._isOpen = false;
            this.props.setIsEditing(false);
        }
    }

    @action
    toggleIsOpen = (): void => {
        this._isOpen = !this._isOpen;
        this.props.setIsEditing(this._isOpen);
    }

    changeColumnType = (type: ColumnType): void => {
        this.props.setColumnType(this.props.columnField, type);
    }

    changeColumnSort = (desc: boolean | undefined): void => {
        this.props.setColumnSort(this.props.columnField, desc);
    }

    changeColumnColor = (color: string): void => {
        this.props.setColumnColor(this.props.columnField, color);
    }

    @action
    setNode = (node: HTMLDivElement): void => {
        if (node) {
            this._node = node;
        }
    }

    renderTypes = () => {
        if (this.props.typeConst) return <></>;

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
                <div className="collectionSchema-headerMenu-group">
                    <label>Key:</label>
                    <KeysDropdown
                        keyValue={this.props.columnField.heading}
                        possibleKeys={this.props.possibleKeys}
                        existingKeys={this.props.existingKeys}
                        canAddNew={true}
                        addNew={this.props.addNew}
                        onSelect={this.props.onSelect}
                        setIsEditing={this.props.setIsEditing}
                    />
                </div>
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
    Document?: Doc;
    dataDoc?: Doc;
    fieldKey?: string;
    ContainingCollectionDoc?: Doc;
    ContainingCollectionView?: CollectionView;
    active?: (outsideReaction?: boolean) => boolean;
}
@observer
export class KeysDropdown extends React.Component<KeysDropdownProps> {
    @observable private _key: string = this.props.keyValue;
    @observable private _searchTerm: string = this.props.keyValue;
    @observable private _isOpen: boolean = false;
    @observable private _canClose: boolean = true;
    @observable private _inputRef: React.RefObject<HTMLInputElement> = React.createRef();

    @action setSearchTerm = (value: string): void => { this._searchTerm = value; };
    @action setKey = (key: string): void => { this._key = key; };
    @action setIsOpen = (isOpen: boolean): void => { this._isOpen = isOpen; };

    @action
    onSelect = (key: string): void => {
        if (this._searchTerm.includes(":")) {
            const colpos = this._searchTerm.indexOf(":");
            const filter = this._searchTerm.slice(colpos + 1, this._searchTerm.length);
            //const filter = key.slice(this._key.length - key.length);
            this.props.onSelect(this._key, this._key, this.props.addNew, filter);
        }
        else {
            this.props.onSelect(this._key, key, this.props.addNew);
            this.setKey(key);
            this._isOpen = false;
            this.props.setIsEditing(false);
        }
    }

    @action
    onSelectValue = (key: string): void => {
        const colpos = this._searchTerm.indexOf(":");
        this.onSelect(key);
        this._searchTerm = this._searchTerm.slice(0, colpos + 1) + key;
        this._isOpen = false;
        this.props.onSelect(this._key, this._key, this.props.addNew, key);

    }

    @undoBatch
    onKeyDown = (e: React.KeyboardEvent): void => {
        if (e.key === "Enter") {
            let keyOptions = this._searchTerm === "" ? this.props.possibleKeys : this.props.possibleKeys.filter(key => key.toUpperCase().indexOf(this._searchTerm.toUpperCase()) > -1);
            let blockedkeys = ["_scrollTop", "customTitle", "limitHeight", "proto", "x", "y", "_width", "_height", "_autoHeight", "_fontSize", "_fontFamily", "context", "zIndex", "_timeStampOnEnter", "lines", "highlighting", "searchMatch", "creationDate", "isPrototype", "text-annotations", "aliases", "text-lastModified", "text-noTemplate", "layoutKey", "baseProto", "_xMargin", "_yMargin", "layout", "layout_keyValue", "links"];
            keyOptions = keyOptions.filter(n => !blockedkeys.includes(n));
            if (keyOptions.length) {
                this.onSelect(keyOptions[0]);
            } else if (this._searchTerm !== "" && this.props.canAddNew) {
                this.setSearchTerm(this._searchTerm || this._key);
                this.onSelect(this._searchTerm);
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

    @action
    onBlur = (e: React.FocusEvent): void => {
        if (this._canClose) {
            this._isOpen = false;
            this.props.setIsEditing(false);
        }
    }

    @action
    onPointerEnter = (e: React.PointerEvent): void => {
        this._canClose = false;
    }

    @action
    onPointerOut = (e: React.PointerEvent): void => {
        this._canClose = true;
    }
    @action
    renderOptions = (): JSX.Element[] | JSX.Element => {
        if (!this._isOpen) {
            this.defaultMenuHeight = 0;
            return <></>;
        }
        const searchTerm = this._searchTerm.trim() === "New field" ? "" : this._searchTerm;

        let keyOptions = searchTerm === "" ? this.props.possibleKeys : this.props.possibleKeys.filter(key => key.toUpperCase().indexOf(this._searchTerm.toUpperCase()) > -1);
        const exactFound = keyOptions.findIndex(key => key.toUpperCase() === this._searchTerm.toUpperCase()) > -1 ||
            this.props.existingKeys.findIndex(key => key.toUpperCase() === this._searchTerm.toUpperCase()) > -1;

        let blockedkeys = ["proto", "x", "y", "_width", "_height", "_autoHeight", "_fontSize", "_fontFamily", "context", "zIndex", "_timeStampOnEnter", "lines", "highlighting", "searchMatch", "creationDate", "isPrototype", "text-annotations", "aliases", "text-lastModified", "text-noTemplate", "layoutKey", "baseProto", "_xMargin", "_yMargin", "layout", "layout_keyValue", "links"];
        keyOptions = keyOptions.filter(n => !blockedkeys.includes(n));

        const options = keyOptions.map(key => {
            return <div key={key} className="key-option" style={{
                border: "1px solid lightgray",
                width: this.props.width, maxWidth: this.props.width, overflowX: "hidden", background: "white",
            }}
                onPointerDown={e => e.stopPropagation()} onClick={() => { this.onSelect(key); this.setSearchTerm(""); }}>{key}</div>;
        });

        // if search term does not already exist as a group type, give option to create new group type
        if (this._key !== this._searchTerm.slice(0, this._key.length)) {
            if (!exactFound && this._searchTerm !== "" && this.props.canAddNew) {
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
                let panesize = this.props.docs.length * 30;
                options.length * 20 + 8 - 10 > panesize ? this.defaultMenuHeight = panesize : this.defaultMenuHeight = options.length * 20 + 8;
            }
            else {
                options.length > 5 ? this.defaultMenuHeight = 108 : this.defaultMenuHeight = options.length * 20 + 8;
            }
        }
        return options;
    }
    @action
    renderFilterOptions = (): JSX.Element[] | JSX.Element => {
        if (!this._isOpen) {
            this.defaultMenuHeight = 0;
            return <></>;
        }
        let keyOptions: string[] = [];
        const colpos = this._searchTerm.indexOf(":");
        const temp = this._searchTerm.slice(colpos + 1, this._searchTerm.length);
        let docs = DocListCast(this.props.dataDoc![this.props.fieldKey!]);
        docs.forEach((doc) => {
            const key = StrCast(doc[this._key]);
            if (keyOptions.includes(key) === false && key.includes(temp)) {
                keyOptions.push(key);
            }
        });

        const options = keyOptions.map(key => {
            //Doc.setDocFilter(this.props.Document!, this._key, key, undefined);
            let bool = false;
            let filters = Cast(this.props.Document!._docFilters, listSpec("string"));
            console.log(filters);
            if (filters !== undefined) {
                bool = filters.includes(key) && filters[filters.indexOf(key) + 1] === "check";
                console.log(filters.includes(key));
            }
            return <div key={key} className="key-option" style={{
                border: "1px solid lightgray", paddingLeft: 5, textAlign: "left",
                width: this.props.width, maxWidth: this.props.width, overflowX: "hidden", background: "white", backgroundColor: "white",
            }}
            >
                <input type="checkbox" onChange={(e) => { e.target.checked === true ? Doc.setDocFilter(this.props.Document!, this._key, key, "check") : Doc.setDocFilter(this.props.Document!, this._key, key, undefined); e.target.checked === true && SearchBox.Instance.filter === true ? Doc.setDocFilter(docs![0], this._key, key, "check") : Doc.setDocFilter(docs![0], this._key, key, undefined); }}
                    checked={bool} ></input>
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
                let panesize = this.props.docs.length * 30;
                options.length * 20 + 8 - 10 > panesize ? this.defaultMenuHeight = panesize : this.defaultMenuHeight = options.length * 20 + 8;
            }
            else {
                options.length > 5 ? this.defaultMenuHeight = 108 : this.defaultMenuHeight = options.length * 20 + 8;
            }

        }

        return options;
    }


    // @action
    // renderFilterOptions = (): JSX.Element[] | JSX.Element => {
    //     this.facetClick(this._key);
    //     return <div>
    //         {this.filterView}
    //     </div>
    // }
    @observable defaultMenuHeight = 0;


    facetClick = (facetHeader: string) => {
        facetHeader = this._key;
        let newFacet: Opt<Doc>;
        if (this.props.Document !== undefined) {
            const facetCollection = this.props.Document;
            // const found = DocListCast(facetCollection[this.props.fieldKey + "-filter"]).findIndex(doc => doc.title === facetHeader);
            // if (found !== -1) {
            //     console.log("found not n-1");
            //     (facetCollection[this.props.fieldKey + "-filter"] as List<Doc>).splice(found, 1);
            //     const docFilter = Cast(this.props.Document._docFilters, listSpec("string"));
            //     if (docFilter) {
            //         let index: number;
            //         while ((index = docFilter.findIndex(item => item === facetHeader)) !== -1) {
            //             docFilter.splice(index, 3);
            //         }
            //     }
            //     const docRangeFilters = Cast(this.props.Document._docRangeFilters, listSpec("string"));
            //     if (docRangeFilters) {
            //         let index: number;
            //         while ((index = docRangeFilters.findIndex(item => item === facetHeader)) !== -1) {
            //             docRangeFilters.splice(index, 3);
            //         }
            //     }
            // }



            console.log("found is n-1");
            const allCollectionDocs = DocListCast(this.props.dataDoc![this.props.fieldKey!]);
            var rtfields = 0;
            const facetValues = Array.from(allCollectionDocs.reduce((set, child) => {
                const field = child[facetHeader] as Field;
                const fieldStr = Field.toString(field);
                if (field instanceof RichTextField || (typeof (field) === "string" && fieldStr.split(" ").length > 2)) rtfields++;
                return set.add(fieldStr);
            }, new Set<string>()));

            let nonNumbers = 0;
            let minVal = Number.MAX_VALUE, maxVal = -Number.MAX_VALUE;
            facetValues.map(val => {
                const num = Number(val);
                if (Number.isNaN(num)) {
                    nonNumbers++;
                } else {
                    minVal = Math.min(num, minVal);
                    maxVal = Math.max(num, maxVal);
                }
            });
            if (facetHeader === "text" || rtfields / allCollectionDocs.length > 0.1) {
                console.log("Case1");
                newFacet = Docs.Create.TextDocument("", { _width: 100, _height: 25, treeViewExpandedView: "layout", title: facetHeader, treeViewOpen: true, forceActive: true, ignoreClick: true });
                Doc.GetProto(newFacet).type = DocumentType.COL; // forces item to show an open/close button instead ofa checkbox
                newFacet.target = this.props.Document;
                newFacet._textBoxPadding = 4;
                const scriptText = `setDocFilter(this.target, "${facetHeader}", text, "match")`;
                newFacet.onTextChanged = ScriptField.MakeScript(scriptText, { this: Doc.name, text: "string" });
            } else if (nonNumbers / facetValues.length < .1) {
                console.log("Case2");
                newFacet = Docs.Create.SliderDocument({ title: facetHeader, treeViewExpandedView: "layout", treeViewOpen: true });
                const newFacetField = Doc.LayoutFieldKey(newFacet);
                const ranged = Doc.readDocRangeFilter(this.props.Document, facetHeader);
                Doc.GetProto(newFacet).type = DocumentType.COL; // forces item to show an open/close button instead ofa checkbox
                const extendedMinVal = minVal - Math.min(1, Math.abs(maxVal - minVal) * .05);
                const extendedMaxVal = maxVal + Math.min(1, Math.abs(maxVal - minVal) * .05);
                newFacet[newFacetField + "-min"] = ranged === undefined ? extendedMinVal : ranged[0];
                newFacet[newFacetField + "-max"] = ranged === undefined ? extendedMaxVal : ranged[1];
                Doc.GetProto(newFacet)[newFacetField + "-minThumb"] = extendedMinVal;
                Doc.GetProto(newFacet)[newFacetField + "-maxThumb"] = extendedMaxVal;
                newFacet.target = this.props.Document;
                const scriptText = `setDocFilterRange(this.target, "${facetHeader}", range)`;
                newFacet.onThumbChanged = ScriptField.MakeScript(scriptText, { this: Doc.name, range: "number" });
                Doc.AddDocToList(facetCollection, this.props.fieldKey + "-filter", newFacet);
            } else {
                console.log("Case3");
                newFacet = new Doc();
                newFacet.title = facetHeader;
                newFacet.treeViewOpen = true;
                newFacet.type = DocumentType.COL;
                const capturedVariables = { layoutDoc: this.props.Document, dataDoc: this.props.dataDoc! };
                this.props.Document.data = ComputedField.MakeFunction(`readFacetData(layoutDoc, dataDoc, "${this.props.fieldKey}", "${facetHeader}")`, {}, capturedVariables);
                // this.props.Document.data
            }
            //newFacet && Doc.AddDocToList(facetCollection, this.props.fieldKey + "-filter", newFacet);
        }
    }


    get ignoreFields() { return ["_docFilters", "_docRangeFilters"]; }

    @computed get scriptField() {
        console.log("we kinda made it");
        const scriptText = "setDocFilter(containingTreeView, heading, this.title, checked)";
        const script = ScriptField.MakeScript(scriptText, { this: Doc.name, heading: "string", checked: "string", containingTreeView: Doc.name });
        return script ? () => script : undefined;
    }
    filterBackground = () => "rgba(105, 105, 105, 0.432)";


    // @computed get filterView() {
    //     TraceMobx();
    //     if (this.props.Document !== undefined) {
    //         //const facetCollection = this.props.Document;
    //         // const flyout = (
    //         //     <div className="collectionTimeView-flyout" style={{ width: `${this.facetWidth()}`, height: this.props.PanelHeight() - 30 }} onWheel={e => e.stopPropagation()}>
    //         //         {this._allFacets.map(facet => <label className="collectionTimeView-flyout-item" key={`${facet}`} onClick={e => this.facetClick(facet)}>
    //         //             <input type="checkbox" onChange={e => { }} checked={DocListCast(this.props.Document[this.props.fieldKey + "-filter"]).some(d => d.title === facet)} />
    //         //             <span className="checkmark" />
    //         //             {facet}
    //         //         </label>)}
    //         //     </div>
    //         // );
    //         return <div className="altcollectionTimeView-treeView">
    //             <div className="altcollectionTimeView-tree" key="tree">
    //                 <CollectionTreeView
    //                     PanelPosition={""}
    //                     Document={this.props.Document}
    //                     DataDoc={this.props.Document}
    //                     fieldKey={this.props.fieldKey!}
    //                     CollectionView={undefined}
    //                     docFilters={returnEmptyFilter}
    //                     ContainingCollectionDoc={this.props.ContainingCollectionDoc!}
    //                     ContainingCollectionView={this.props.ContainingCollectionView!}
    //                     PanelWidth={() => 200}
    //                     PanelHeight={() => 200}
    //                     NativeHeight={returnZero}
    //                     NativeWidth={returnZero}
    //                     LibraryPath={emptyPath}
    //                     rootSelected={returnFalse}
    //                     renderDepth={1}
    //                     dropAction={undefined}
    //                     ScreenToLocalTransform={Transform.Identity}
    //                     addDocTab={returnFalse}
    //                     pinToPres={returnFalse}
    //                     isSelected={returnFalse}
    //                     select={returnFalse}
    //                     bringToFront={emptyFunction}
    //                     active={this.props.active!}
    //                     whenActiveChanged={returnFalse}
    //                     treeViewHideTitle={true}
    //                     ContentScaling={returnOne}
    //                     focus={returnFalse}
    //                     treeViewHideHeaderFields={true}
    //                     onCheckedClick={this.scriptField}
    //                     ignoreFields={this.ignoreFields}
    //                     annotationsKey={""}
    //                     dontRegisterView={true}
    //                     backgroundColor={this.filterBackground}
    //                     moveDocument={returnFalse}
    //                     removeDocument={returnFalse}
    //                     addDocument={returnFalse} />
    //             </div>
    //         </div>;
    //     }
    // }

    render() {
        return (
            <div className="keys-dropdown" style={{ zIndex: 10, width: this.props.width, maxWidth: this.props.width }}>
                <input className="keys-search" style={{ width: "100%" }}
                    ref={this._inputRef} type="text" value={this._searchTerm} placeholder="Column key" onKeyDown={this.onKeyDown}
                    onChange={e => this.onChange(e.target.value)}
                    onClick={(e) => {
                        //this._inputRef.current!.select();
                        e.stopPropagation();
                    }} onFocus={this.onFocus} onBlur={this.onBlur}></input>
                <div className="keys-options-wrapper" style={{
                    width: this.props.width, maxWidth: this.props.width, height: "auto",
                }}
                    onPointerEnter={this.onPointerEnter} onPointerLeave={this.onPointerOut}>
                    {this._searchTerm.includes(":") ?
                        this.renderFilterOptions() : this.renderOptions()}
                </div>
            </div >
        );
    }
}
