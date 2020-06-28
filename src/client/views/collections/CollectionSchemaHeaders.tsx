import React = require("react");
import { action, observable } from "mobx";
import { observer } from "mobx-react";
import "./CollectionSchemaView.scss";
import { faPlus, faFont, faHashtag, faAlignJustify, faCheckSquare, faToggleOn, faSortAmountDown, faSortAmountUp, faTimes, faImage, faListUl } from '@fortawesome/free-solid-svg-icons';
import { library, IconProp } from "@fortawesome/fontawesome-svg-core";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { ColumnType } from "./CollectionSchemaView";
import { faFile } from "@fortawesome/free-regular-svg-icons";
import { SchemaHeaderField, PastelSchemaPalette } from "../../../fields/SchemaHeaderField";
import { undoBatch } from "../../util/UndoManager";
const higflyout = require("@hig/flyout");
export const { anchorPoints } = higflyout;
export const Flyout = higflyout.default;

library.add(faPlus, faFont, faHashtag, faAlignJustify, faCheckSquare, faToggleOn, faFile as any, faSortAmountDown, faSortAmountUp, faTimes, faImage, faListUl);

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
                this.props.keyType === ColumnType.Image ? "image" : this.props.keyType === ColumnType.List ? "list-ul" : "align-justify";
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
    onSelect: (oldKey: string, newKey: string, addnew: boolean) => void;
    setIsEditing: (isEditing: boolean) => void;
    width?: string;
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
        this.props.onSelect(this._key, key, this.props.addNew);
        this.setKey(key);
        this._isOpen = false;
        this.props.setIsEditing(false);
    }

    @undoBatch
    onKeyDown = (e: React.KeyboardEvent): void => {
        if (e.key === "Enter") {
            const keyOptions = this._searchTerm === "" ? this.props.possibleKeys : this.props.possibleKeys.filter(key => key.toUpperCase().indexOf(this._searchTerm.toUpperCase()) > -1);
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

    renderOptions = (): JSX.Element[] | JSX.Element => {
        if (!this._isOpen) return <></>;

        const searchTerm = this._searchTerm.trim() === "New field" ? "" : this._searchTerm;

        const keyOptions = searchTerm === "" ? this.props.possibleKeys : this.props.possibleKeys.filter(key => key.toUpperCase().indexOf(this._searchTerm.toUpperCase()) > -1);
        const exactFound = keyOptions.findIndex(key => key.toUpperCase() === this._searchTerm.toUpperCase()) > -1 ||
            this.props.existingKeys.findIndex(key => key.toUpperCase() === this._searchTerm.toUpperCase()) > -1;

        const options = keyOptions.map(key => {
            return <div key={key} className="key-option" style={{
                border: "1px solid lightgray",
                width: this.props.width, overflowX: "hidden"
            }}
                onPointerDown={e => e.stopPropagation()} onClick={() => { this.onSelect(key); this.setSearchTerm(""); }}>{key}</div>;
        });

        // if search term does not already exist as a group type, give option to create new group type
        if (!exactFound && this._searchTerm !== "" && this.props.canAddNew) {
            options.push(<div key={""} className="key-option" style={{
                border: "1px solid lightgray",
                width: this.props.width, overflowX: "hidden"
            }}
                onClick={() => { this.onSelect(this._searchTerm); this.setSearchTerm(""); }}>
                Create "{this._searchTerm}" key</div>);
        }

        return options;
    }

    render() {
        return (
            <div className="keys-dropdown" style={{ width: this.props.width }}>
                <input className="keys-search" style={{ width: this.props.width, maxWidth: "1000" }}
                    ref={this._inputRef} type="text" value={this._searchTerm} placeholder="Column key" onKeyDown={this.onKeyDown}
                    onChange={e => this.onChange(e.target.value)}
                    onClick={(e) => {
                        //this._inputRef.current!.select();
                        e.stopPropagation();
                    }} onFocus={this.onFocus} onBlur={this.onBlur}></input>
                <div className="keys-options-wrapper" style={{
                    backgroundColor: "white",
                    width: this.props.width, overflowX: "hidden"
                }}
                    onPointerEnter={this.onPointerEnter} onPointerLeave={this.onPointerOut}>
                    {this.renderOptions()}
                </div>
            </div >
        );
    }
}
