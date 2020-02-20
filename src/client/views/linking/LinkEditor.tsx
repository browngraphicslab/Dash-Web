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

        const groupMdKeys = LinkManager.Instance.getMetadataKeysInGroup(StrCast(props.groupDoc.title));
        groupMdKeys.forEach(key => this._metadataIds.set(key, Utils.GenerateGuid()));
    }

    @action
    setGroupType = (groupType: string): void => {
        this.props.groupDoc.title = groupType;
    }

    removeGroupFromLink = (groupType: string): void => {
        LinkManager.Instance.removeGroupFromAnchor(this.props.linkDoc, this.props.sourceDoc, groupType);
    }

    deleteGroup = (groupType: string): void => {
        LinkManager.Instance.deleteGroupType(groupType);
    }

    copyGroup = async (groupType: string): Promise<void> => {
        const sourceGroupDoc = this.props.groupDoc;

        const destDoc = LinkManager.Instance.getOppositeAnchor(this.props.linkDoc, this.props.sourceDoc);
        // let destGroupList = LinkManager.Instance.getAnchorGroups(this.props.linkDoc, destDoc);
        const keys = LinkManager.Instance.getMetadataKeysInGroup(groupType);


        // create new group doc with new metadata doc
        const destGroupDoc = new Doc();
        destGroupDoc.title = groupType;
        // create new metadata doc with copied kvp
        destGroupDoc.anchor1 = sourceGroupDoc.anchor2;
        destGroupDoc.anchor2 = sourceGroupDoc.anchor1;
        keys.forEach(key => {
            const val = sourceGroupDoc[key] === undefined ? "" : StrCast(sourceGroupDoc[key]);
            destGroupDoc[key] = val;
        });

        if (destDoc) {
            LinkManager.Instance.addGroupToAnchor(this.props.linkDoc, destDoc, destGroupDoc, true);
        }
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
        const groupType = StrCast(groupDoc.title);
        const groupMdKeys = LinkManager.Instance.getMetadataKeysInGroup(groupType);

        groupMdKeys.forEach((key) => {
            const val = StrCast(groupDoc[key]);
            metadata.push(
                <LinkMetadataEditor key={"mded-" + this._metadataIds.get(key)} id={this._metadataIds.get(key)!} groupType={groupType} mdDoc={groupDoc} mdKey={key} mdValue={val} changeMdIdKey={this.changeMdIdKey} />
            );
        });
        return metadata;
    }

    viewGroupAsTable = (groupType: string): JSX.Element => {
        const keys = LinkManager.Instance.getMetadataKeysInGroup(groupType);
        const index = keys.indexOf("");
        if (index > -1) keys.splice(index, 1);
        const cols = ["anchor1", "anchor2", ...[...keys]].map(c => new SchemaHeaderField(c, "#f1efeb"));
        const docs: Doc[] = LinkManager.Instance.getAllMetadataDocsInGroup(groupType);
        const createTable = action(() => Docs.Create.SchemaDocument(cols, docs, { _width: 500, _height: 300, title: groupType + " table" }));
        const ref = React.createRef<HTMLDivElement>();
        return <div ref={ref}><button className="linkEditor-button" onPointerDown={SetupDrag(ref, createTable)} title="Drag to view relationship table"><FontAwesomeIcon icon="table" size="sm" /></button></div>;
    }

    render() {
        const groupType = StrCast(this.props.groupDoc.title);
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

    @action
    deleteLink = (): void => {
        LinkManager.Instance.deleteLink(this.props.linkDoc);
        this.props.showLinks();
    }

    render() {
        const destination = LinkManager.Instance.getOppositeAnchor(this.props.linkDoc, this.props.sourceDoc);

        const groups = [this.props.linkDoc].map(groupDoc => {
            return <LinkGroupEditor key={"gred-" + StrCast(groupDoc.title)} linkDoc={this.props.linkDoc} sourceDoc={this.props.sourceDoc} groupDoc={groupDoc} />;
        });

        return !destination ? (null) : (
            <div className="linkEditor">
                <button className="linkEditor-back" onPointerDown={() => this.props.showLinks()}><FontAwesomeIcon icon="arrow-left" size="sm" /></button>
                <div className="linkEditor-info">
                    <p className="linkEditor-linkedTo">editing link to: <b>{destination.proto!.title}</b></p>
                    <button className="linkEditor-button" onPointerDown={() => this.deleteLink()} title="Delete link"><FontAwesomeIcon icon="trash" size="sm" /></button>
                </div>
                <div className="linkEditor-groupsLabel">
                    <b>Relationships:</b>
                </div>
                {groups.length > 0 ? groups : <div className="linkEditor-group">There are currently no relationships associated with this link.</div>}
            </div>

        );
    }
}