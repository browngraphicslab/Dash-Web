import { library } from "@fortawesome/fontawesome-svg-core";
import { faArrowLeft, faCog, faEllipsisV, faExchangeAlt, faPlus, faTable, faTimes, faTrash } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { action, observable, computed } from "mobx";
import { observer } from "mobx-react";
import { Doc, Opt } from "../../../fields/Doc";
import { StrCast } from "../../../fields/Types";
import { Utils } from "../../../Utils";
import { LinkManager } from "../../util/LinkManager";
import './LinkEditor.scss';
import React = require("react");
import { DocumentView } from "../nodes/DocumentView";
import { DocumentLinksButton } from "../nodes/DocumentLinksButton";
import { EditableView } from "../EditableView";

library.add(faArrowLeft, faEllipsisV, faTable, faTrash, faCog, faExchangeAlt, faTimes, faPlus);


interface GroupTypesDropdownProps {
    groupType: string;
    setGroupType: (group: string) => void;
}
// this dropdown could be generalized
@observer
class GroupTypesDropdown extends React.Component<GroupTypesDropdownProps> {
    @observable private _searchTerm: string = this.props.groupType;
    @observable private _groupType: string = this.props.groupType;
    @observable private _isEditing: boolean = false;

    @action
    createGroup = (groupType: string): void => {
        this.props.setGroupType(groupType);
        LinkManager.Instance.addGroupType(groupType);
    }

    @action
    onChange = (val: string): void => {
        this._searchTerm = val;
        this._groupType = val;
        this._isEditing = true;
    }

    @action
    onKeyDown = (e: React.KeyboardEvent): void => {
        if (e.key === "Enter") {
            const allGroupTypes = Array.from(LinkManager.Instance.getAllGroupTypes());
            const groupOptions = allGroupTypes.filter(groupType => groupType.toUpperCase().indexOf(this._searchTerm.toUpperCase()) > -1);
            const exactFound = groupOptions.findIndex(groupType => groupType.toUpperCase() === this._searchTerm.toUpperCase());

            if (exactFound > -1) {
                const groupType = groupOptions[exactFound];
                this.props.setGroupType(groupType);
                this._groupType = groupType;
            } else {
                this.createGroup(this._searchTerm);
                this._groupType = this._searchTerm;
            }

            this._searchTerm = this._groupType;
            this._isEditing = false;
        }
    }

    @action
    onOptionClick = (value: string, createNew: boolean): void => {
        if (createNew) {
            this.createGroup(this._searchTerm);
            this._groupType = this._searchTerm;

        } else {
            this.props.setGroupType(value);
            this._groupType = value;

        }
        this._searchTerm = this._groupType;
        this._isEditing = false;
    }

    @action
    onButtonPointerDown = (): void => {
        this._isEditing = true;
    }

    renderOptions = (): JSX.Element[] | JSX.Element => {
        if (this._searchTerm === "") return <></>;

        const allGroupTypes = Array.from(LinkManager.Instance.getAllGroupTypes());
        const groupOptions = allGroupTypes.filter(groupType => groupType.toUpperCase().indexOf(this._searchTerm.toUpperCase()) > -1);
        const exactFound = groupOptions.findIndex(groupType => groupType.toUpperCase() === this._searchTerm.toUpperCase()) > -1;

        const options = groupOptions.map(groupType => {
            const ref = React.createRef<HTMLDivElement>();
            return <div key={groupType} ref={ref} className="linkEditor-option"
                onClick={() => this.onOptionClick(groupType, false)}>{groupType}</div>;
        });

        // if search term does not already exist as a group type, give option to create new group type
        if (!exactFound && this._searchTerm !== "") {
            const ref = React.createRef<HTMLDivElement>();
            options.push(<div key={""} ref={ref} className="linkEditor-option"
                onClick={() => this.onOptionClick(this._searchTerm, true)}>Define new "{this._searchTerm}" relationship</div>);
        }

        return options;
    }

    render() {
        if (this._isEditing || this._groupType === "") {
            return (
                <div className="linkEditor-dropdown">
                    <input type="text" value={this._groupType === "-ungrouped-" ? "" : this._groupType} placeholder="Search for or create a new group"
                        onChange={e => this.onChange(e.target.value)} onKeyDown={this.onKeyDown} autoFocus></input>
                    <div className="linkEditor-options-wrapper">
                        {this.renderOptions()}
                    </div>
                </div >
            );
        } else {
            return <button className="linkEditor-typeButton" onClick={() => this.onButtonPointerDown()}>{this._groupType}</button>;
        }
    }
}


interface LinkMetadataEditorProps {
    id: string;
    groupType: string;
    mdDoc: Doc;
    mdKey: string;
    mdValue: string;
    changeMdIdKey: (id: string, newKey: string) => void;
}
@observer
class LinkMetadataEditor extends React.Component<LinkMetadataEditorProps> {
    @observable private _key: string = this.props.mdKey;
    @observable private _value: string = this.props.mdValue;
    @observable private _keyError: boolean = false;

    @action
    setMetadataKey = (value: string): void => {
        const groupMdKeys = LinkManager.Instance.getMetadataKeysInGroup(this.props.groupType);

        // don't allow user to create existing key
        const newIndex = groupMdKeys.findIndex(key => key.toUpperCase() === value.toUpperCase());
        if (newIndex > -1) {
            this._keyError = true;
            this._key = value;
            return;
        } else {
            this._keyError = false;
        }

        // set new value for key
        const currIndex = groupMdKeys.findIndex(key => {
            return StrCast(key).toUpperCase() === this._key.toUpperCase();
        });
        if (currIndex === -1) console.error("LinkMetadataEditor: key was not found");
        groupMdKeys[currIndex] = value;

        this.props.changeMdIdKey(this.props.id, value);
        this._key = value;
        LinkManager.Instance.setMetadataKeysForGroup(this.props.groupType, [...groupMdKeys]);
    }

    @action
    setMetadataValue = (value: string): void => {
        if (!this._keyError) {
            this._value = value;
            Doc.GetProto(this.props.mdDoc)[this._key] = value;
        }
    }

    @action
    removeMetadata = (): void => {
        const groupMdKeys = LinkManager.Instance.getMetadataKeysInGroup(this.props.groupType);

        const index = groupMdKeys.findIndex(key => key.toUpperCase() === this._key.toUpperCase());
        if (index === -1) console.error("LinkMetadataEditor: key was not found");
        groupMdKeys.splice(index, 1);

        LinkManager.Instance.setMetadataKeysForGroup(this.props.groupType, groupMdKeys);
        this._key = "";
    }

    render() {
        return (
            <div className="linkEditor-metadata-row">
                <input className={this._keyError ? "linkEditor-error" : ""} type="text" value={this._key === "new key" ? "" : this._key} placeholder="key" onChange={e => this.setMetadataKey(e.target.value)}></input>:
                <input type="text" value={this._value} placeholder="value" onChange={e => this.setMetadataValue(e.target.value)}></input>
                <button title="remove metadata from relationship" onClick={() => this.removeMetadata()}><FontAwesomeIcon icon="times" size="sm" /></button>
            </div>
        );
    }
}

interface LinkGroupEditorProps {
    sourceDoc: Doc;
    linkDoc: Doc;
    groupDoc: Doc;
}
@observer
export class LinkGroupEditor extends React.Component<LinkGroupEditorProps> {

    private _metadataIds: Map<string, string> = new Map();

    constructor(props: LinkGroupEditorProps) {
        super(props);

        const groupMdKeys = LinkManager.Instance.getMetadataKeysInGroup(StrCast(props.groupDoc.linkRelationship));
        groupMdKeys.forEach(key => this._metadataIds.set(key, Utils.GenerateGuid()));
    }

    @action
    setGroupType = (groupType: string): void => {
        Doc.GetProto(this.props.groupDoc).linkRelationship = groupType;
    }

    removeGroupFromLink = (groupType: string): void => {
        LinkManager.Instance.removeGroupFromAnchor(this.props.linkDoc, this.props.sourceDoc, groupType);
    }

    deleteGroup = (groupType: string): void => {
        LinkManager.Instance.deleteGroupType(groupType);
    }


    @action
    addMetadata = (groupType: string): void => {
        this._metadataIds.set("new key", Utils.GenerateGuid());
        const mdKeys = LinkManager.Instance.getMetadataKeysInGroup(groupType);
        // only add "new key" if there is no other key with value "new key"; prevents spamming
        if (mdKeys.indexOf("new key") === -1) mdKeys.push("new key");
        LinkManager.Instance.setMetadataKeysForGroup(groupType, mdKeys);
    }

    // for key rendering purposes
    changeMdIdKey = (id: string, newKey: string) => {
        this._metadataIds.set(newKey, id);
    }

    renderMetadata = (): JSX.Element[] => {
        const metadata: Array<JSX.Element> = [];
        const groupDoc = this.props.groupDoc;
        const groupType = StrCast(groupDoc.linkRelationship);
        const groupMdKeys = LinkManager.Instance.getMetadataKeysInGroup(groupType);

        groupMdKeys.forEach((key) => {
            const val = StrCast(groupDoc[key]);
            metadata.push(
                <LinkMetadataEditor key={"mded-" + this._metadataIds.get(key)} id={this._metadataIds.get(key)!} groupType={groupType} mdDoc={groupDoc} mdKey={key} mdValue={val} changeMdIdKey={this.changeMdIdKey} />
            );
        });
        return metadata;
    }

    render() {
        const groupType = StrCast(this.props.groupDoc.linkRelationship);
        // if ((groupType && LinkManager.Instance.getMetadataKeysInGroup(groupType).length > 0) || groupType === "") {
        const buttons = <button className="linkEditor-button" disabled={groupType === ""} onClick={() => this.deleteGroup(groupType)} title="Delete Relationship from all links"><FontAwesomeIcon icon="trash" size="sm" /></button>;
        const addButton = <button className="linkEditor-addbutton" onClick={() => this.addMetadata(groupType)} disabled={groupType === ""} title="Add metadata to relationship"><FontAwesomeIcon icon="plus" size="sm" /></button>;

        return (
            <div className="linkEditor-group">
                <div className="linkEditor-group-row ">
                    {buttons}
                    <GroupTypesDropdown groupType={groupType} setGroupType={this.setGroupType} />
                    <button className="linkEditor-button" onClick={() => this.removeGroupFromLink(groupType)} title="Remove relationship from link"><FontAwesomeIcon icon="times" size="sm" /></button>
                </div>
                {this.renderMetadata().length > 0 ? <p className="linkEditor-group-row-label">metadata:</p> : <></>}
                {addButton}
                {this.renderMetadata()}
            </div>
        );
    }
}


interface LinkEditorProps {
    sourceDoc: Doc;
    linkDoc: Doc;
    showLinks: () => void;
    hideback?: boolean;
}
@observer
export class LinkEditor extends React.Component<LinkEditorProps> {


    @observable description = StrCast(LinkManager.currentLink?.description);
    @observable openDropdown: boolean = false;

    @observable currentFollow: string = "Default";


    //@observable description = this.props.linkDoc.description ? StrCast(this.props.linkDoc.description) : "DESCRIPTION";

    @action
    deleteLink = (): void => {
        LinkManager.Instance.deleteLink(this.props.linkDoc);
        this.props.showLinks();
    }

    @action
    setDescripValue = (value: string) => {
        if (LinkManager.currentLink) {
            LinkManager.currentLink.description = value;
            return true;
        }
    }

    @computed
    get editDescription() {
        return <div className="linkEditor-description">
            <div className="linkEditor-description-label">
                Link Description:</div>
            <div className="linkEditor-description-input">
                <EditableView
                    GetValue={() => StrCast(LinkManager.currentLink?.description)}
                    SetValue={value => { this.setDescripValue(value); return false; }}
                    contents={LinkManager.currentLink?.description}
                    placeholder={"(optional) enter link description"}
                    color={"rgb(88, 88, 88)"}
                ></EditableView></div></div>;
    }

    @action
    changeDropdown = () => {
        this.openDropdown = !this.openDropdown;
    }

    @action
    changeFollowBehavior = (follow: string) => {
        this.openDropdown = false;
        this.currentFollow = follow;
    }

    @computed
    get followingDropdown() {
        return <div className="linkEditor-followingDropdown">
            <div className="linkEditor-followingDropdown-label">
                Follow Behavior:</div>
            <div className="linkEditor-followingDropdown-dropdown">
                <div className="linkEditor-followingDropdown-header">
                    {this.currentFollow}
                    <FontAwesomeIcon className="linkEditor-followingDropdown-icon"
                        icon={this.openDropdown ? "chevron-up" : "chevron-down"}
                        size={"sm"} onPointerDown={this.changeDropdown} />
                </div>
                {this.openDropdown ?
                    <div className="linkEditor-followingDropdown-optionsList">
                        <div className="linkEditor-followingDropdown-option"
                            onPointerDown={() => this.changeFollowBehavior("default")}>
                            Default
                        </div>
                        <div className="linkEditor-followingDropdown-option"
                            onPointerDown={() => this.changeFollowBehavior("Always open in right tab")}>
                            Always open in right tab
                        </div>
                        <div className="linkEditor-followingDropdown-option"
                            onPointerDown={() => this.changeFollowBehavior("Always open in new tab")}>
                            Always open in new tab
                        </div>
                    </div>
                    : null}
            </div>
        </div>;
    }

    render() {
        const destination = LinkManager.Instance.getOppositeAnchor(this.props.linkDoc, this.props.sourceDoc);

        const groups = [this.props.linkDoc].map(groupDoc => {
            return <LinkGroupEditor key={"gred-" + StrCast(groupDoc.linkRelationship)} linkDoc={this.props.linkDoc}
                sourceDoc={this.props.sourceDoc} groupDoc={groupDoc} />;
        });

        return !destination ? (null) : (
            <div className="linkEditor">
                <div className="linkEditor-info">
                    {this.props.hideback ? (null) : <button className="linkEditor-button-back"
                        onPointerDown={this.props.showLinks}>
                        <FontAwesomeIcon icon="arrow-left" size="sm" /></button>}
                    <p className="linkEditor-linkedTo">editing link to: <b>{
                        destination.proto?.title ?? destination.title ?? "untitled"}</b></p>
                    <button className="linkEditor-button" onPointerDown={() => this.deleteLink()} title="Delete link">
                        <FontAwesomeIcon icon="trash" size="sm" /></button>
                </div>

                <div>{this.editDescription}</div>
                <div>{this.followingDropdown}</div>

                {/* {groups.length > 0 ? groups : <div className="linkEditor-group">There are currently no relationships associated with this link.</div>} */}
            </div>

        );
    }
}