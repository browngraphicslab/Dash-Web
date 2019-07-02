import { observable, computed, action, trace, toJS } from "mobx";
import React = require("react");
import { observer } from "mobx-react";
import './LinkEditor.scss';
import { StrCast, Cast, FieldValue, NumCast } from "../../../new_fields/Types";
import { Doc } from "../../../new_fields/Doc";
import { LinkManager, LinkDirection } from "../../util/LinkManager";
import { Docs } from "../../documents/Documents";
import { Utils } from "../../../Utils";
import { faArrowLeft, faEllipsisV, faTable, faTrash, faCog, faExchangeAlt, faTimes, faPlus, faLongArrowAltRight } from '@fortawesome/free-solid-svg-icons';
import { library } from "@fortawesome/fontawesome-svg-core";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { SetupDrag } from "../../util/DragManager";
import { UndoManager } from "../../util/UndoManager";

library.add(faArrowLeft, faEllipsisV, faTable, faTrash, faCog, faExchangeAlt, faTimes, faPlus, faLongArrowAltRight);


interface GroupTypesDropdownProps {
    groupType: string;
    setGroupType: (group: string) => void;
    removeGroupFromLink: () => void;
}
// this dropdown could be generalized
@observer
class GroupTypesDropdown extends React.Component<GroupTypesDropdownProps> {
    @observable private _searchTerm: string = "";
    @observable private _groupType: string = this.props.groupType;

    @action setSearchTerm = (value: string): void => { this._searchTerm = value; };
    @action setGroupType = (value: string): void => { this._groupType = value; };

    @action
    createGroup = (groupType: string): void => {
        this.props.setGroupType(groupType);
        LinkManager.Instance.createGroupType(groupType);
    }

    onChange = (val: string): void => {
        this.setSearchTerm(val);
        this.setGroupType(val);
    }

    renderOptions = (): JSX.Element[] | JSX.Element => {
        if (this._searchTerm === "") return <></>;

        let allGroupTypes = Array.from(LinkManager.Instance.getAllGroupTypes());
        let groupOptions = allGroupTypes.filter(groupType => groupType.toUpperCase().indexOf(this._searchTerm.toUpperCase()) > -1);
        let exactFound = groupOptions.findIndex(groupType => groupType.toUpperCase() === this._searchTerm.toUpperCase()) > -1;

        let options = groupOptions.map(groupType => {
            return <div key={groupType} className="linkEditor-option"
                onClick={() => { this.props.setGroupType(groupType); this.setGroupType(groupType); this.setSearchTerm(""); }}>{groupType}</div>;
        });

        // if search term does not already exist as a group type, give option to create new group type
        if (!exactFound && this._searchTerm !== "") {
            options.push(<div key={""} className="linkEditor-option"
                onClick={() => { this.createGroup(this._searchTerm); this.setGroupType(this._searchTerm); this.setSearchTerm(""); }}>Define new "{this._searchTerm}" relationship</div>);
        }

        return options;
    }

    render() {
        return (
            <div className="linkEditor-dropdown">
                <div className="linkEditor-dropdown-input">
                    <input type="text" value={this._groupType} placeholder="Search or define a relationship"
                        onChange={e => this.onChange(e.target.value)}></input>
                    {this.props.groupType === "" ?
                        <button className="linkEditor-button" disabled title="Clear relationship from link"><FontAwesomeIcon icon="times" size="sm" /></button> :
                        <button className="linkEditor-button" onClick={() => this.props.removeGroupFromLink()} title="Clear relationship from link"><FontAwesomeIcon icon="times" size="sm" /></button>
                    }
                </div>
                <div className="linkEditor-options-wrapper">
                    {this.renderOptions()}
                </div>
            </div >
        );
    }
}


interface LinkMetadataEditorProps {
    id: string;
    groupType: string;
    mdKey: string;
    mdValue: string;
    allMdKeys: string[];
    changeMdKey: (id: string, newKey: string) => void;
    changeMdValue: (id: string, newValue: string) => void;
    deleteMd: (id: string) => void;
    setError: (hasError: boolean) => void;
}

@observer
class LinkMetadataEditor extends React.Component<LinkMetadataEditorProps> {
    // @observable private _renderedKey: string = this.props.mdKey;
    @observable private _key: string = this.props.mdKey;
    @observable private _value: string = this.props.mdValue;
    @observable private _keyError: boolean = false;

    @action
    setMetadataKey = (newKey: string): void => {
        let newIndex = this.props.allMdKeys.findIndex(key => key.toUpperCase() === newKey.toUpperCase());
        if (newIndex > -1 || newKey === "") {
            this.props.setError(true);
            this._keyError = true;
            this._key = newKey;
            return;
        } else {
            this.props.setError(false);
            this._keyError = false;
        }
        this.props.changeMdKey(this.props.id, newKey);
        this._key = newKey;
    }

    @action
    setMetadataValue = (newValue: string): void => {
        this.props.changeMdValue(this.props.id, newValue);
        this._value = newValue;
    }

    render() {
        return (
            <div className="linkEditor-metadata-row">
                <input className={this._keyError ? "linkEditor-error" : ""} type="text" value={this._key === "new key" ? "" : this._key} placeholder="key" onChange={e => this.setMetadataKey(e.target.value)}></input>:
                <input type="text" value={this._value} placeholder="value" onChange={e => this.setMetadataValue(e.target.value)}></input>
                <button className="linkEditor-button" onClick={() => this.props.deleteMd(this.props.id)}><FontAwesomeIcon icon="times" size="sm" /></button>
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

    @observable private _direction: LinkDirection = Doc.GetProto(this.props.linkDoc).direction ? NumCast(Doc.GetProto(this.props.linkDoc).direction) : LinkDirection.Uni;
    @observable private _type: string = StrCast(LinkManager.Instance.getAnchorGroupDoc(this.props.linkDoc, this.props.sourceDoc)!.type);
    @observable private _metadata: Map<string, { key: string, value: string }> = new Map();
    @observable private _hasError: boolean = false;

    constructor(props: LinkEditorProps) {
        super(props);

        let groupDoc = LinkManager.Instance.getAnchorGroupDoc(props.linkDoc, props.sourceDoc);
        if (groupDoc) {
            let groupType = StrCast(groupDoc.type);
            let groupMdKeys = LinkManager.Instance.getMetadataKeysInGroup(groupType);
            let mdDoc = Cast(groupDoc.metadata, Doc, new Doc);
            groupMdKeys.forEach(key => {
                this._metadata.set(Utils.GenerateGuid(), { key: key, value: StrCast(mdDoc[key]) });
            });
        }
    }

    @action
    setError = (hasError: boolean): void => {
        this._hasError = hasError;
    }

    @action
    deleteLink = (): void => {
        UndoManager.RunInBatch(() => {
            LinkManager.Instance.deleteLink(this.props.linkDoc);
        }, "delete link");
        this.props.showLinks();
    }

    @action
    toggleDirection = (): void => {
        console.log("toggling direction", this._direction === LinkDirection.Bi, this._direction === LinkDirection.Uni);
        if (this._direction === LinkDirection.Bi) {
            this._direction = LinkDirection.Uni;
        } else if (this._direction === LinkDirection.Uni) {
            this._direction = LinkDirection.Bi;
        }
        console.log("toggled", this._direction);
    }

    @action
    setGroupType = (groupType: string): void => {
        this._type = groupType;

        let newMetadata: Map<string, { key: string, value: string }> = new Map();
        let groupMdKeys = LinkManager.Instance.getMetadataKeysInGroup(this._type);
        groupMdKeys.forEach(key => {
            newMetadata.set(Utils.GenerateGuid(), { key: key, value: "" });
        });
        this._metadata = newMetadata;

    }

    @action
    removeGroupFromLink = (): void => {
        this._type = "";
        this._metadata = new Map();
        console.log("removed group from link");
    }

    @action
    addMetadata = (): void => {
        let metadata = Array.from(this._metadata.values());
        if (metadata.findIndex(md => md.key === "new key") === -1) {
            this._metadata.set(Utils.GenerateGuid(), { key: "new key", value: "" });
        }
    }


    @action
    changeMdKey = (id: string, newKey: string): void => {
        let kvp = this._metadata.get(id);
        if (kvp) {
            let val = kvp.value;
            this._metadata.set(id, { key: newKey, value: val });
        }
    }

    @action
    changeMdValue = (id: string, newValue: string): void => {
        let kvp = this._metadata.get(id);
        if (kvp) {
            let key = kvp.key;
            this._metadata.set(id, { key: key, value: newValue });
        }
    }

    @action
    deleteMd = (id: string): void => {
        this._metadata.delete(id);
    }

    renderMetadata = (): JSX.Element[] => {
        let allMdKeys = Array.from(this._metadata.values()).map(md => md.key);
        let metadataRows: Array<JSX.Element> = [];
        this._metadata.forEach((md, id) => {
            metadataRows.push(
                <LinkMetadataEditor key={id} id={id} groupType={this._type} mdKey={md.key} mdValue={md.value} allMdKeys={allMdKeys}
                    changeMdKey={this.changeMdKey} changeMdValue={this.changeMdValue} deleteMd={this.deleteMd} setError={this.setError} />
            );
        });

        return metadataRows;
    }

    saveLink = (): void => {
        let destDoc = LinkManager.Instance.getOppositeAnchor(this.props.linkDoc, this.props.sourceDoc) || new Doc();

        let mdDoc = new Doc();
        mdDoc.anchor1 = this.props.sourceDoc.title;
        mdDoc.anchor2 = destDoc.title;
        mdDoc.direction = this._direction === LinkDirection.Uni ? "one-way" : "shared";

        let metadata = Array.from(this._metadata.values());
        metadata.forEach(md => {
            mdDoc[md.key] = md.value;
        });

        let mdKeys = metadata.map(md => md.key);
        LinkManager.Instance.setMetadataKeysForGroup(this._type, mdKeys);

        let groupDoc = new Doc();
        groupDoc.type = this._type;
        groupDoc.metadata = mdDoc;

        LinkManager.Instance.setAnchorGroupDoc(this.props.linkDoc, this.props.sourceDoc, groupDoc);

        if (this._direction === LinkDirection.Bi) {
            LinkManager.Instance.setAnchorGroupDoc(this.props.linkDoc, destDoc, groupDoc);
        }

        let linkDocProto = Doc.GetProto(this.props.linkDoc);
        linkDocProto.title = this._type + " link: " + StrCast(this.props.sourceDoc.title) + ", " + (destDoc ? StrCast(destDoc.title) : "");
        linkDocProto.direction = this._direction;

        this.props.showLinks();
    }

    render() {
        let destination = LinkManager.Instance.getOppositeAnchor(this.props.linkDoc, this.props.sourceDoc);
        if (!destination) return <></>;

        return (
            <div className="linkEditor">
                <div className="linkEditor-info">
                    <p className="linkEditor-linkedTo">Editing link to: <b>{destination.proto!.title}</b></p>
                    <button className="linkEditor-button" onPointerDown={() => this.deleteLink()} title="Delete link"><FontAwesomeIcon icon="trash" size="sm" /></button>
                </div>
                <div className="linkEditor-group">
                    <div className="linkEditor-group-row linkEditor-direction">
                        <p className="linkEditor-group-row-label">Direction: </p>
                        <button className="linkEditor-directionButton" onClick={() => this.toggleDirection()}>{this._direction === LinkDirection.Uni ? "one-way" : "shared"}</button>
                    </div>
                    <div className="linkEditor-group-row">
                        <div className="linkEditor-group-row-label">
                            <p>Relationship:</p>
                        </div>
                        <GroupTypesDropdown groupType={this._type} setGroupType={this.setGroupType} removeGroupFromLink={this.removeGroupFromLink} />
                    </div>
                    {this.renderMetadata().length > 0 ? <div className="linkEditor-group-row-label"><p>Metadata:</p></div> : <></>}
                    {this.renderMetadata()}
                    {this._type === "" ?
                        <button className="linkEditor-button linkEditor-addKvp" disabled={true} title="Add KVP"><FontAwesomeIcon icon="plus" size="sm" /></button> :
                        <button className="linkEditor-button linkEditor-addKvp" onClick={() => this.addMetadata()} title="Add KVP"><FontAwesomeIcon icon="plus" size="sm" /></button>
                    }
                    <div className="linkEditor-navButtons">
                        {this._hasError ? <button disabled>Save</button> : <button onPointerDown={() => this.saveLink()}>Save</button>}
                        <button onPointerDown={() => this.props.showLinks()}>Cancel</button>
                    </div>
                </div>
            </div>

        );
    }
}