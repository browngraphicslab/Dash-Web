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
    setColumnType: (key: string, type: ColumnType) => void;
    setColumnSort: (key: string, desc: boolean) => void;
    removeColumnSort: (key: string) => void;
}

export class CollectionSchemaHeader extends React.Component<HeaderProps> {
    render() {
        let icon: IconProp = this.props.keyType === ColumnType.Number ? "hashtag" : this.props.keyType === ColumnType.String ? "font" :
            this.props.keyType === ColumnType.Boolean ? "check-square" : this.props.keyType === ColumnType.Doc ? "file" : "align-justify";

        return (
            <div className="collectionSchemaView-header" style={{ background: this.props.keyValue.color }}>
                <CollectionSchemaColumnMenu
                    keyValue={this.props.keyValue.heading}
                    possibleKeys={this.props.possibleKeys}
                    existingKeys={this.props.existingKeys}
                    keyType={this.props.keyType}
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
    keyValue: string;
    possibleKeys: string[];
    existingKeys: string[];
    keyType: ColumnType;
    typeConst: boolean;
    menuButtonContent: JSX.Element;
    addNew: boolean;
    onSelect: (oldKey: string, newKey: string, addnew: boolean) => void;
    setIsEditing: (isEditing: boolean) => void;
    deleteColumn: (column: string) => void;
    onlyShowOptions: boolean;
    setColumnType: (key: string, type: ColumnType) => void;
    setColumnSort: (key: string, desc: boolean) => void;
    removeColumnSort: (key: string) => void;
    anchorPoint?: any;
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

    setColumnType = (oldKey: string, newKey: string, addnew: boolean) => {
        let typeStr = newKey as keyof typeof ColumnType;
        let type = ColumnType[typeStr];
        this.props.setColumnType(this.props.keyValue, type);
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
                    <button title="Any" className={this.props.keyType === ColumnType.Any ? "active" : ""} onClick={() => this.props.setColumnType(this.props.keyValue, ColumnType.Any)}>
                        <FontAwesomeIcon icon={"align-justify"} size="sm" />
                    </button>
                    <button title="Number" className={this.props.keyType === ColumnType.Number ? "active" : ""} onClick={() => this.props.setColumnType(this.props.keyValue, ColumnType.Number)}>
                        <FontAwesomeIcon icon={"hashtag"} size="sm" />
                    </button>
                    <button title="String" className={this.props.keyType === ColumnType.String ? "active" : ""} onClick={() => this.props.setColumnType(this.props.keyValue, ColumnType.String)}>
                        <FontAwesomeIcon icon={"font"} size="sm" />
                    </button>
                    <button title="Checkbox" className={this.props.keyType === ColumnType.Boolean ? "active" : ""} onClick={() => this.props.setColumnType(this.props.keyValue, ColumnType.Boolean)}>
                        <FontAwesomeIcon icon={"check-square"} size="sm" />
                    </button>
                    <button title="Document" className={this.props.keyType === ColumnType.Doc ? "active" : ""} onClick={() => this.props.setColumnType(this.props.keyValue, ColumnType.Doc)}>
                        <FontAwesomeIcon icon={"file"} size="sm" />
                    </button>
                </div>
            </div>
        );
    }

    renderSorting = () => {
        return (
            <div className="collectionSchema-headerMenu-group">
                <label>Sort by:</label>
                <div className="columnMenu-sort">
                    <div className="columnMenu-option" onClick={() => this.props.setColumnSort(this.props.keyValue, false)}>Sort ascending</div>
                    <div className="columnMenu-option" onClick={() => this.props.setColumnSort(this.props.keyValue, true)}>Sort descending</div>
                    <div className="columnMenu-option" onClick={() => this.props.removeColumnSort(this.props.keyValue)}>Clear sorting</div>
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
                        keyValue={this.props.keyValue}
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
                        <div className="collectionSchema-headerMenu-group">
                            <button onClick={() => this.props.deleteColumn(this.props.keyValue)}>Delete Column</button>
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
