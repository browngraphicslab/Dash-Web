import React = require("react");
import { action, computed, observable, trace, untracked } from "mobx";
import { observer } from "mobx-react";
import "./CollectionSchemaView.scss";
import { faPlus, faFont, faHashtag, faAlignJustify, faCheckSquare } from '@fortawesome/free-solid-svg-icons';
import { library, IconProp } from "@fortawesome/fontawesome-svg-core";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Flyout, anchorPoints } from "../DocumentDecorations";
import { ColumnType } from "./CollectionSchemaView";
import { emptyFunction } from "../../../Utils";

library.add(faPlus, faFont, faHashtag, faAlignJustify, faCheckSquare);

export interface HeaderProps {
    keyValue: string;
    possibleKeys: string[];
    existingKeys: string[];
    keyType: ColumnType;
    typeConst: boolean;
    onSelect: (oldKey: string, newKey: string, addnew: boolean) => void;
    setIsEditing: (isEditing: boolean) => void;
    deleteColumn: (column: string) => void;
    setColumnType: (key: string, type: ColumnType) => void;
}

export class CollectionSchemaHeader extends React.Component<HeaderProps> {
    render() {
        let icon: IconProp = this.props.keyType === ColumnType.Number ? "hashtag" : this.props.keyType === ColumnType.String ? "font" :
            this.props.keyType === ColumnType.Checkbox || this.props.keyType === ColumnType.Boolean ? "check-square" : "align-justify";

        return (
            <div className="collectionSchemaView-header" >
                <CollectionSchemaColumnMenu
                    keyValue={this.props.keyValue}
                    possibleKeys={this.props.possibleKeys}
                    existingKeys={this.props.existingKeys}
                    keyType={this.props.keyType}
                    menuButtonContent={<div><FontAwesomeIcon icon={icon} size="sm" />{this.props.keyValue}</div>}
                    addNew={false}
                    onSelect={this.props.onSelect}
                    setIsEditing={this.props.setIsEditing}
                    deleteColumn={this.props.deleteColumn}
                    onlyShowOptions={false}
                    setColumnType={this.props.setColumnType}
                />
            </div>
        );
    }
}


export interface AddColumnHeaderProps {
    possibleKeys: string[];
    existingKeys: string[];
    onSelect: (oldKey: string, newKey: string, addnew: boolean) => void;
    setIsEditing: (isEditing: boolean) => void;
}

@observer
export class CollectionSchemaAddColumnHeader extends React.Component<AddColumnHeaderProps> {
    // @observable private _creatingColumn: boolean = false;

    // @action
    // onClick = (e: React.MouseEvent): void => {
    //     this._creatingColumn = true;
    // }

    render() {
        let addButton = <button onClick={() => console.log("add clicked")}><FontAwesomeIcon icon="plus" size="sm" /></button>;
        return (
            <div className="collectionSchemaView-header-addColumn" >
                {/* {this._creatingColumn ? <></> : */}
                <CollectionSchemaColumnMenu
                    keyValue=""
                    possibleKeys={this.props.possibleKeys}
                    existingKeys={this.props.existingKeys}
                    keyType={ColumnType.Any}
                    menuButtonContent={addButton}
                    addNew={true}
                    onSelect={this.props.onSelect}
                    setIsEditing={this.props.setIsEditing}
                    deleteColumn={action(emptyFunction)}
                    onlyShowOptions={true}
                    setColumnType={action(emptyFunction)}
                />
            </div>
        );
    }
}



export interface ColumnMenuProps {
    keyValue: string;
    possibleKeys: string[];
    existingKeys: string[];
    keyType: ColumnType;
    menuButtonContent: JSX.Element;
    addNew: boolean;
    onSelect: (oldKey: string, newKey: string, addnew: boolean) => void;
    setIsEditing: (isEditing: boolean) => void;
    deleteColumn: (column: string) => void;
    onlyShowOptions: boolean;
    setColumnType: (key: string, type: ColumnType) => void;
}
@observer
export class CollectionSchemaColumnMenu extends React.Component<ColumnMenuProps> {
    @observable private _isOpen: boolean = false;

    @action toggleIsOpen = (): void => {
        this._isOpen = !this._isOpen;
        this.props.setIsEditing(this._isOpen);
    }

    setColumnType = (oldKey: string, newKey: string, addnew: boolean) => {
        let typeStr = newKey as keyof typeof ColumnType;
        let type = ColumnType[typeStr];
        this.props.setColumnType(this.props.keyValue, type);
    }

    renderContent = () => {
        let keyTypeStr = ColumnType[this.props.keyType];
        let colTypes = [];
        for (let type in ColumnType) {
            if (!(parseInt(type, 10) >= 0)) colTypes.push(type);
        }

        if (this._isOpen) {
            if (this.props.onlyShowOptions) {
                return (
                    <div className="collectionSchema-header-menuOptions">
                        <KeysDropdown
                            keyValue={this.props.keyValue}
                            possibleKeys={this.props.possibleKeys}
                            existingKeys={this.props.existingKeys}
                            canAddNew={true}
                            addNew={this.props.addNew}
                            onSelect={this.props.onSelect}
                        />
                    </div>
                );
            } else {
                return (
                    <div className="collectionSchema-header-menuOptions">
                        <KeysDropdown
                            keyValue={this.props.keyValue}
                            possibleKeys={this.props.possibleKeys}
                            existingKeys={this.props.existingKeys}
                            canAddNew={true}
                            addNew={this.props.addNew}
                            onSelect={this.props.onSelect}
                        />
                        <KeysDropdown
                            keyValue={keyTypeStr}
                            possibleKeys={colTypes}
                            existingKeys={[]}
                            canAddNew={false}
                            addNew={false}
                            onSelect={this.setColumnType}
                        />
                        <button onClick={() => this.props.deleteColumn(this.props.keyValue)}>Delete Column</button>
                    </div>
                );
            }
        }
    }

    render() {
        return (
            // <Flyout anchorPoint={anchorPoints.TOP} content={<div style={{ color: "black" }}>{this.renderContent()}</div>}>
            //     <div onClick={() => { this.props.setIsEditing(true); console.log("clicked anchor"); }}>{this.props.menuButton}</div>
            // </ Flyout >
            <div className="collectionSchema-header-menu">
                <div className="collectionSchema-header-toggler" onClick={() => this.toggleIsOpen()}>{this.props.menuButtonContent}</div>
                {this.renderContent()}
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

}
@observer
class KeysDropdown extends React.Component<KeysDropdownProps> {
    @observable private _key: string = this.props.keyValue;
    @observable private _searchTerm: string = "";

    @action setSearchTerm = (value: string): void => { this._searchTerm = value; };
    @action setKey = (key: string): void => { this._key = key; };

    @action
    onSelect = (key: string): void => {
        this.props.onSelect(this._key, key, this.props.addNew);
        this.setKey(key);
    }

    onChange = (val: string): void => {
        this.setSearchTerm(val);
    }

    renderOptions = (): JSX.Element[] | JSX.Element => {
        let keyOptions = this._searchTerm === "" ? this.props.possibleKeys : this.props.possibleKeys.filter(key => key.toUpperCase().indexOf(this._searchTerm.toUpperCase()) > -1);
        let exactFound = keyOptions.findIndex(key => key.toUpperCase() === this._searchTerm.toUpperCase()) > -1 ||
            this.props.existingKeys.findIndex(key => key.toUpperCase() === this._searchTerm.toUpperCase()) > -1;

        let options = keyOptions.map(key => {
            return <div key={key} className="key-option" onClick={() => { this.onSelect(key); this.setSearchTerm(""); }}>{key}</div>;
        });

        // if search term does not already exist as a group type, give option to create new group type
        if (!exactFound && this._searchTerm !== "" && this.props.canAddNew) {
            options.push(<div key={""} className="key-option"
                onClick={() => { this.onSelect(this._searchTerm); this.setSearchTerm(""); }}>Create "{this._searchTerm}" key</div>);
        }

        return options;
    }

    render() {
        return (
            <div className="keys-dropdown">
                <input type="text" value={this._searchTerm} placeholder="Search for or create a new key"
                    onChange={e => this.onChange(e.target.value)} ></input>
                <div className="keys-options-wrapper">
                    {this.renderOptions()}
                </div>
            </div >
        );
    }
}
