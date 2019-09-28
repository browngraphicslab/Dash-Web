import { observable, computed, action, trace } from "mobx";
import React = require("react");
import { observer } from "mobx-react";
import './LinkEditor.scss';
import { StrCast, Cast, FieldValue } from "../../../new_fields/Types";
import { Doc } from "../../../new_fields/Doc";
import { LinkManager } from "../../util/LinkManager";
import { Docs } from "../../documents/Documents";
import { Utils } from "../../../Utils";
import { faArrowLeft, faEllipsisV, faTable, faTrash, faCog, faExchangeAlt, faTimes, faPlus } from '@fortawesome/free-solid-svg-icons';
import { library } from "@fortawesome/fontawesome-svg-core";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { SetupDrag } from "../../util/DragManager";
import { SchemaHeaderField, RandomPastel } from "../../../new_fields/SchemaHeaderField";
import { FollowModes, LinkFollowBox } from './LinkFollowBox';
import { ChangeEvent } from "react-autosuggest";

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
            let allGroupTypes = Array.from(LinkManager.Instance.getAllGroupTypes());
            let groupOptions = allGroupTypes.filter(groupType => groupType.toUpperCase().indexOf(this._searchTerm.toUpperCase()) > -1);
            let exactFound = groupOptions.findIndex(groupType => groupType.toUpperCase() === this._searchTerm.toUpperCase());

            if (exactFound > -1) {
                let groupType = groupOptions[exactFound];
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

        let allGroupTypes = Array.from(LinkManager.Instance.getAllGroupTypes());
        let groupOptions = allGroupTypes.filter(groupType => groupType.toUpperCase().indexOf(this._searchTerm.toUpperCase()) > -1);
        let exactFound = groupOptions.findIndex(groupType => groupType.toUpperCase() === this._searchTerm.toUpperCase()) > -1;

        let options = groupOptions.map(groupType => {
            let ref = React.createRef<HTMLDivElement>();
            return <div key={groupType} ref={ref} className="linkEditor-option"
                onClick={() => this.onOptionClick(groupType, false)}>{groupType}</div>;
        });

        // if search term does not already exist as a group type, give option to create new group type
        if (!exactFound && this._searchTerm !== "") {
            let ref = React.createRef<HTMLDivElement>();
            options.push(<div key={""} ref={ref} className="linkEditor-option"
                onClick={() => this.onOptionClick(this._searchTerm, true)}>Define new "{this._searchTerm}" relationship</div>);
        }

        return options;
    }

    render() {
        if (this._isEditing || this._groupType === "") {
            return (
                <div className="linkEditor-dropdown">
                    <input type="text" value={this._groupType} placeholder="Search for or create a new group"
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
        let groupMdKeys = LinkManager.Instance.getMetadataKeysInGroup(this.props.groupType);

        // don't allow user to create existing key
        let newIndex = groupMdKeys.findIndex(key => key.toUpperCase() === value.toUpperCase());
        if (newIndex > -1) {
            this._keyError = true;
            this._key = value;
            return;
        } else {
            this._keyError = false;
        }

        // set new value for key
        let currIndex = groupMdKeys.findIndex(key => {
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
            this.props.mdDoc[this._key] = value;
        }
    }

    @action
    removeMetadata = (): void => {
        let groupMdKeys = LinkManager.Instance.getMetadataKeysInGroup(this.props.groupType);

        let index = groupMdKeys.findIndex(key => key.toUpperCase() === this._key.toUpperCase());
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
                <button onClick={() => this.removeMetadata()}><FontAwesomeIcon icon="times" size="sm" /></button>
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

        let groupMdKeys = LinkManager.Instance.getMetadataKeysInGroup(StrCast(props.groupDoc.type));
        groupMdKeys.forEach(key => {
            this._metadataIds.set(key, Utils.GenerateGuid());
        });
    }

    @action
    setGroupType = (groupType: string): void => {
        this.props.groupDoc.type = groupType;
    }

    removeGroupFromLink = (groupType: string): void => {
        LinkManager.Instance.removeGroupFromAnchor(this.props.linkDoc, this.props.sourceDoc, groupType);
    }

    deleteGroup = (groupType: string): void => {
        LinkManager.Instance.deleteGroupType(groupType);
    }

    copyGroup = async (groupType: string): Promise<void> => {
        let sourceGroupDoc = this.props.groupDoc;
        const sourceMdDoc = await Cast(sourceGroupDoc.metadata, Doc);
        if (!sourceMdDoc) return;

        let destDoc = LinkManager.Instance.getOppositeAnchor(this.props.linkDoc, this.props.sourceDoc);
        // let destGroupList = LinkManager.Instance.getAnchorGroups(this.props.linkDoc, destDoc);
        let keys = LinkManager.Instance.getMetadataKeysInGroup(groupType);

        // create new metadata doc with copied kvp
        let destMdDoc = new Doc();
        destMdDoc.anchor1 = StrCast(sourceMdDoc.anchor2);
        destMdDoc.anchor2 = StrCast(sourceMdDoc.anchor1);
        keys.forEach(key => {
            let val = sourceMdDoc[key] === undefined ? "" : StrCast(sourceMdDoc[key]);
            destMdDoc[key] = val;
        });

        // create new group doc with new metadata doc
        let destGroupDoc = new Doc();
        destGroupDoc.type = groupType;
        destGroupDoc.metadata = destMdDoc;

        if (destDoc) {
            LinkManager.Instance.addGroupToAnchor(this.props.linkDoc, destDoc, destGroupDoc, true);
        }
    }

    @action
    addMetadata = (groupType: string): void => {
        this._metadataIds.set("new key", Utils.GenerateGuid());
        let mdKeys = LinkManager.Instance.getMetadataKeysInGroup(groupType);
        // only add "new key" if there is no other key with value "new key"; prevents spamming
        if (mdKeys.indexOf("new key") === -1) mdKeys.push("new key");
        LinkManager.Instance.setMetadataKeysForGroup(groupType, mdKeys);
    }

    // for key rendering purposes
    changeMdIdKey = (id: string, newKey: string) => {
        this._metadataIds.set(newKey, id);
    }

    renderMetadata = (): JSX.Element[] => {
        let metadata: Array<JSX.Element> = [];
        let groupDoc = this.props.groupDoc;
        const mdDoc = FieldValue(Cast(groupDoc.metadata, Doc));
        if (!mdDoc) {
            return [];
        }
        let groupType = StrCast(groupDoc.type);
        let groupMdKeys = LinkManager.Instance.getMetadataKeysInGroup(groupType);

        groupMdKeys.forEach((key) => {
            let val = StrCast(mdDoc[key]);
            metadata.push(
                <LinkMetadataEditor key={"mded-" + this._metadataIds.get(key)} id={this._metadataIds.get(key)!} groupType={groupType} mdDoc={mdDoc} mdKey={key} mdValue={val} changeMdIdKey={this.changeMdIdKey} />
            );
        });
        return metadata;
    }

    viewGroupAsTable = (groupType: string): JSX.Element => {
        let keys = LinkManager.Instance.getMetadataKeysInGroup(groupType);
        let index = keys.indexOf("");
        if (index > -1) keys.splice(index, 1);
        let cols = ["anchor1", "anchor2", ...[...keys]].map(c => new SchemaHeaderField(c, "#f1efeb"));
        let docs: Doc[] = LinkManager.Instance.getAllMetadataDocsInGroup(groupType);
        let createTable = action(() => Docs.Create.SchemaDocument(cols, docs, { width: 500, height: 300, title: groupType + " table" }));
        let ref = React.createRef<HTMLDivElement>();
        return <div ref={ref}><button className="linkEditor-button" onPointerDown={SetupDrag(ref, createTable)} title="Drag to view relationship table"><FontAwesomeIcon icon="table" size="sm" /></button></div>;
    }

    render() {
        let groupType = StrCast(this.props.groupDoc.type);
        // if ((groupType && LinkManager.Instance.getMetadataKeysInGroup(groupType).length > 0) || groupType === "") {
        let buttons;
        if (groupType === "") {
            buttons = (
                <>
                    <button className="linkEditor-button" disabled={true} title="Add KVP"><FontAwesomeIcon icon="plus" size="sm" /></button>
                    <button className="linkEditor-button" disabled title="Copy group to opposite anchor"><FontAwesomeIcon icon="exchange-alt" size="sm" /></button>
                    <button className="linkEditor-button" onClick={() => this.removeGroupFromLink(groupType)} title="Remove group from link"><FontAwesomeIcon icon="times" size="sm" /></button>
                    <button className="linkEditor-button" disabled title="Delete group"><FontAwesomeIcon icon="trash" size="sm" /></button>
                    <button className="linkEditor-button" disabled title="Drag to view relationship table"><FontAwesomeIcon icon="table" size="sm" /></button>
                </>
            );
        } else {
            buttons = (
                <>
                    <button className="linkEditor-button" onClick={() => this.addMetadata(groupType)} title="Add KVP"><FontAwesomeIcon icon="plus" size="sm" /></button>
                    <button className="linkEditor-button" onClick={() => this.copyGroup(groupType)} title="Copy group to opposite anchor"><FontAwesomeIcon icon="exchange-alt" size="sm" /></button>
                    <button className="linkEditor-button" onClick={() => this.removeGroupFromLink(groupType)} title="Remove group from link"><FontAwesomeIcon icon="times" size="sm" /></button>
                    <button className="linkEditor-button" onClick={() => this.deleteGroup(groupType)} title="Delete group"><FontAwesomeIcon icon="trash" size="sm" /></button>
                    {this.viewGroupAsTable(groupType)}
                </>
            );
        }
        return (
            <div className="linkEditor-group">
                <div className="linkEditor-group-row ">
                    <p className="linkEditor-group-row-label">type:</p>
                    <GroupTypesDropdown groupType={groupType} setGroupType={this.setGroupType} />
                </div>
                {this.renderMetadata().length > 0 ? <p className="linkEditor-group-row-label">metadata:</p> : <></>}
                {this.renderMetadata()}
                <div className="linkEditor-group-buttons">
                    {buttons}
                </div>
            </div>
        );
    }
}


interface LinkEditorProps {
    sourceDoc: Doc;
    linkDoc: Doc;
    showLinks: () => void;
}
@observer
export class LinkEditor extends React.Component<LinkEditorProps> {
    @observable private _linkOption: string = FollowModes.PAN;
    @observable private _linkConfirm: boolean = false;

    @action
    deleteLink = (): void => {
        LinkManager.Instance.deleteLink(this.props.linkDoc);
        this.props.showLinks();
    }

    @action
    addGroup = (): void => {
        // create new metadata document for group
        let mdDoc = new Doc();
        mdDoc.anchor1 = this.props.sourceDoc.title;
        let opp = LinkManager.Instance.getOppositeAnchor(this.props.linkDoc, this.props.sourceDoc);
        if (opp) {
            mdDoc.anchor2 = opp.title;
        }

        // create new group document
        let groupDoc = new Doc();
        groupDoc.type = "";
        groupDoc.metadata = mdDoc;

        LinkManager.Instance.addGroupToAnchor(this.props.linkDoc, this.props.sourceDoc, groupDoc);
    }
    @action
    linkChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
        this._linkConfirm = (e.target.value !== this._linkOption ? true : false);
        this._linkOption = e.target.value;
    }

    @action
    changeLinkBehavior = (e: React.MouseEvent<HTMLButtonElement>): void => {
        e.preventDefault();
        console.log(e);
        if (e.target.value === "confirm") { // TODO this says there's an error but there isnt i promis :(
            // reset linkfollowbox link behavior to chosen behavior
            console.log('change behavior');
        }
        this._linkConfirm = false;
    }

    render() {
        let destination = LinkManager.Instance.getOppositeAnchor(this.props.linkDoc, this.props.sourceDoc);
        let groupList = LinkManager.Instance.getAnchorGroups(this.props.linkDoc, this.props.sourceDoc);
        let groups = groupList.map(groupDoc => {
            return <LinkGroupEditor key={"gred-" + StrCast(groupDoc.type)} linkDoc={this.props.linkDoc} sourceDoc={this.props.sourceDoc} groupDoc={groupDoc} />;
        });

        // TODODO properly set linkoption based on default from linkfollowbox
        if (destination) {
            return (
                <div className="linkEditor">
                    <button className="linkEditor-back" onPointerDown={() => this.props.showLinks()}><FontAwesomeIcon icon="arrow-left" size="sm" /></button>
                    <div className="linkEditor-info">
                        <p className="linkEditor-linkedTo">editing link to: <b>{destination.proto!.title}</b></p>
                        <button className="linkEditor-button" onPointerDown={() => this.deleteLink()} title="Delete link"><FontAwesomeIcon icon="trash" size="sm" /></button>
                    </div>
                    <div className="linkEditor-linkType">
                        Change Link Type Here:
                        {/* TODODO radio buttons here 
                        pan and in place dont work unless freeform
                        DONE: confirm button (no accidental overwrites of complicated link follows)
                        EVENTUALLY: should b able to clean this up once we know
                        1) how to determine if follow type is valid
                        2) mapping over all the FollowType enums */}
                        <div className="linkEditor-linkForm">
                            <div className="linkEditor-linkOption">
                                <label>
                                    <input
                                        type="radio"
                                        value={FollowModes.PAN}
                                        checked={this._linkOption === FollowModes.PAN} // in future: check with linkfollowbox
                                        onChange={this.linkChange} />
                                    {FollowModes.PAN}</label>
                            </div>
                            <div className="linkEditor-linkOption">
                                <label>
                                    <input
                                        type="radio"
                                        value={FollowModes.INPLACE}
                                        checked={this._linkOption === FollowModes.INPLACE}
                                        onChange={this.linkChange} />
                                    {FollowModes.INPLACE}</label>
                            </div>
                            {this._linkConfirm ?
                                <div>
                                    <button value="confirm" onClick={this.changeLinkBehavior}>confirm</button>
                                    <button value="cancel" onClick={this.changeLinkBehavior}>cancel</button>
                                </div> : null}
                        </div>

                    </div>
                    <div className="linkEditor-groupsLabel">
                        <b>Relationships:</b>
                        <button className="linkEditor-button" onClick={() => this.addGroup()} title=" Add Group"><FontAwesomeIcon icon="plus" size="sm" /></button>
                    </div>
                    {groups.length > 0 ? groups : <div className="linkEditor-group">There are currently no relationships associated with this link.</div>}
                </div>

            );
        }
    }
}