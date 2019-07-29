import React = require("react");
import { action, computed, observable, trace, untracked } from "mobx";
import { observer } from "mobx-react";
import "./CollectionSchemaView.scss";
import { faPlus, faFont, faHashtag, faAlignJustify, faCheckSquare, faToggleOn } from '@fortawesome/free-solid-svg-icons';
import { library, IconProp } from "@fortawesome/fontawesome-svg-core";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Flyout, anchorPoints } from "../DocumentDecorations";
import { ColumnType } from "./CollectionSchemaView";
import { emptyFunction } from "../../../Utils";
import { contains } from "typescript-collections/dist/lib/arrays";
import { faFile } from "@fortawesome/free-regular-svg-icons";
import { SchemaHeaderField } from "../../../new_fields/SchemaHeaderField";

library.add(faPlus, faFont, faHashtag, faAlignJustify, faCheckSquare, faToggleOn, faFile);

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
    setColumnSort: (key: string, desc: boolean) => void;
    removeColumnSort: (key: string) => void;
    setColumnColor: (column: SchemaHeaderField, color: string) => void;

}

export class CollectionSchemaHeader extends React.Component<HeaderProps> {
    render() {
        let icon: IconProp = this.props.keyType === ColumnType.Number ? "hashtag" : this.props.keyType === ColumnType.String ? "font" :
            this.props.keyType === ColumnType.Boolean ? "check-square" : this.props.keyType === ColumnType.Doc ? "file" : "align-justify";
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
                    removeColumnSort={this.props.removeColumnSort}
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
    setColumnSort: (key: string, desc: boolean) => void;
    removeColumnSort: (key: string) => void;
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

    setNewColor = (color: string): void => {
        this.changeColumnType(ColumnType.Any);
        console.log("change color", this.props.columnField.heading);
        this.props.setColumnColor(this.props.columnField, color);
    }

    @action
    toggleIsOpen = (): void => {
        this._isOpen = !this._isOpen;
        this.props.setIsEditing(this._isOpen);
    }

    changeColumnType = (type: ColumnType): void => {
        console.log("change type", this.props.columnField.heading);
        // this.props.setColumnType(this.props.columnField, type);
    }

    @action
    setNode = (node: HTMLDivElement): void => {
        if (node) {
            this._node = node;
        }
    }

    renderTypes = () => {
        if (this.props.typeConst) return <></>;
        return (
            <div className="collectionSchema-headerMenu-group">
                <label>Column type:</label>
                <div className="columnMenu-types">
                    <button title="Any" className={this.props.columnField.type === ColumnType.Any ? "active" : ""} onClick={() => this.changeColumnType(ColumnType.Any)}>
                        <FontAwesomeIcon icon={"align-justify"} size="sm" />
                    </button>
                    <button title="Number" className={this.props.columnField.type === ColumnType.Number ? "active" : ""} onClick={() => this.changeColumnType(ColumnType.Number)}>
                        <FontAwesomeIcon icon={"hashtag"} size="sm" />
                    </button>
                    <button title="String" className={this.props.columnField.type === ColumnType.String ? "active" : ""} onClick={() => this.changeColumnType(ColumnType.String)}>
                        <FontAwesomeIcon icon={"font"} size="sm" />
                    </button>
                    <button title="Checkbox" className={this.props.columnField.type === ColumnType.Boolean ? "active" : ""} onClick={() => this.changeColumnType(ColumnType.Boolean)}>
                        <FontAwesomeIcon icon={"check-square"} size="sm" />
                    </button>
                    <button title="Document" className={this.props.columnField.type === ColumnType.Doc ? "active" : ""} onClick={() => this.changeColumnType(ColumnType.Doc)}>
                        <FontAwesomeIcon icon={"file"} size="sm" />
                    </button>
                </div>
            </div >
        );
    }

    renderSorting = () => {
        return (
            <div className="collectionSchema-headerMenu-group">
                <label>Sort by:</label>
                <div className="columnMenu-sort">
                    <div className="columnMenu-option" onClick={() => this.props.setColumnSort(this.props.columnField.heading, false)}>Sort ascending</div>
                    <div className="columnMenu-option" onClick={() => this.props.setColumnSort(this.props.columnField.heading, true)}>Sort descending</div>
                    <div className="columnMenu-option" onClick={() => this.props.removeColumnSort(this.props.columnField.heading)}>Clear sorting</div>
                </div>
            </div>
        );
    }

    renderColors = () => {
        return (
            <div className="collectionSchema-headerMenu-group">
                <label>Color:</label>
                <div className="columnMenu-colors">
                    <input type="radio" name="column-color" id="pink" value="#FFB4E8" onClick={() => this.setNewColor("#FFB4E8")} />
                    <label htmlFor="pink">
                        <div className="columnMenu-colorPicker" style={{ backgroundColor: "#FFB4E8" }}></div>
                    </label>
                    <input type="radio" name="column-color" id="purple" value="#b28dff" onClick={() => this.setNewColor("#b28dff")} />
                    <label htmlFor="purple">
                        <div className="columnMenu-colorPicker" style={{ backgroundColor: "#b28dff" }}></div>
                    </label>
                    <input type="radio" name="column-color" id="blue" value="#afcbff" onClick={() => this.setNewColor("#afcbff")} />
                    <label htmlFor="blue">
                        <div className="columnMenu-colorPicker" style={{ backgroundColor: "#afcbff" }}></div>
                    </label>
                    <input type="radio" name="column-color" id="yellow" value="#fff5ba" onClick={() => this.setNewColor("#fff5ba")} />
                    <label htmlFor="yellow">
                        <div className="columnMenu-colorPicker" style={{ backgroundColor: "#fff5ba" }}></div>
                    </label>
                    <input type="radio" name="column-color" id="red" value="#ffabab" onClick={() => this.setNewColor("#ffabab")} />
                    <label htmlFor="red">
                        <div className="columnMenu-colorPicker" style={{ backgroundColor: "#ffabab" }}></div>
                    </label>
                    <input type="radio" name="column=color" id="none" value="#f1efeb" onClick={() => this.setNewColor("#f1efeb")} />
                    <label htmlFor="none">
                        <div className="columnMenu-colorPicker" style={{ backgroundColor: "#f1efeb" }}></div>
                    </label>
                </div>
            </div>
        );
    }

    renderContent = () => {
        return (
            <div className="collectionSchema-header-menuOptions">
                <label>Key:</label>
                <div className="collectionSchema-headerMenu-group">
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
                        {/* {this.renderColors()} */}
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


interface KeysDropdownProps {
    keyValue: string;
    possibleKeys: string[];
    existingKeys: string[];
    canAddNew: boolean;
    addNew: boolean;
    onSelect: (oldKey: string, newKey: string, addnew: boolean) => void;
    setIsEditing: (isEditing: boolean) => void;
}
@observer
class KeysDropdown extends React.Component<KeysDropdownProps> {
    @observable private _key: string = this.props.keyValue;
    @observable private _searchTerm: string = "";
    @observable private _isOpen: boolean = false;
    @observable private _canClose: boolean = true;

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

        let keyOptions = this._searchTerm === "" ? this.props.possibleKeys : this.props.possibleKeys.filter(key => key.toUpperCase().indexOf(this._searchTerm.toUpperCase()) > -1);
        let exactFound = keyOptions.findIndex(key => key.toUpperCase() === this._searchTerm.toUpperCase()) > -1 ||
            this.props.existingKeys.findIndex(key => key.toUpperCase() === this._searchTerm.toUpperCase()) > -1;

        let options = keyOptions.map(key => {
            return <div key={key} className="key-option" onClick={() => { this.onSelect(key); this.setSearchTerm(""); }}>{key}</div>;
        });

        // if search term does not already exist as a group type, give option to create new group type
        if (!exactFound && this._searchTerm !== "" && this.props.canAddNew) {
            options.push(<div key={""} className="key-option"
                onClick={() => { this.onSelect(this._searchTerm); this.setSearchTerm(""); }}>
                Create "{this._searchTerm}" key</div>);
        }

        return options;
    }

    render() {
        return (
            <div className="keys-dropdown">
                <input className="keys-search" type="text" value={this._searchTerm} placeholder="Search for or create a new key"
                    onChange={e => this.onChange(e.target.value)} onFocus={this.onFocus} onBlur={this.onBlur}></input>
                <div className="keys-options-wrapper" onPointerEnter={this.onPointerEnter} onPointerOut={this.onPointerOut}>
                    {this.renderOptions()}
                </div>
            </div >
        );
    }
}
