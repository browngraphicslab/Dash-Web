import { observable, computed, action, trace } from "mobx";
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

library.add(faArrowLeft, faEllipsisV, faTable, faTrash, faCog, faExchangeAlt, faTimes, faPlus, faLongArrowAltRight);


interface GroupTypesDropdownProps {
    groupType: string;
    setGroupType: (group: string) => void;
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
                <input type="text" value={this._groupType} placeholder="Search or define a relationship"
                    onChange={e => this.onChange(e.target.value)}></input>
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

interface LinkEditorProps {
    sourceDoc: Doc;
    linkDoc: Doc;
    showLinks: () => void;
}
@observer
export class LinkEditor extends React.Component<LinkEditorProps> {

    private _metadataIds: Map<string, string> = new Map();
    @observable private _direction: LinkDirection = this.props.linkDoc.direction ? NumCast(this.props.linkDoc.direction) : LinkDirection.Uni;

    constructor(props: LinkEditorProps) {
        super(props);

        let groupDoc = LinkManager.Instance.getAnchorGroupDoc(props.linkDoc, props.sourceDoc);
        if (groupDoc) {
            let groupType = StrCast(groupDoc.type);
            let groupMdKeys = LinkManager.Instance.getMetadataKeysInGroup(groupType);
            groupMdKeys.forEach(key => {
                this._metadataIds.set(key, Utils.GenerateGuid());
            });
        }
    }

    @action
    deleteLink = (): void => {
        LinkManager.Instance.deleteLink(this.props.linkDoc);
        this.props.showLinks();
    }

    @action
    setGroupType = (groupType: string): void => {
        let groupDoc = LinkManager.Instance.getAnchorGroupDoc(this.props.linkDoc, this.props.sourceDoc);
        if (groupDoc) {
            groupDoc.type = groupType;

            let groupMdKeys = LinkManager.Instance.getMetadataKeysInGroup(groupType);
            groupMdKeys.forEach(key => {
                this._metadataIds.set(key, Utils.GenerateGuid());
            });

            let destDoc = LinkManager.Instance.getOppositeAnchor(this.props.linkDoc, this.props.sourceDoc);
            let linKDocProto = Doc.GetProto(this.props.linkDoc);
            linKDocProto.title = groupType + " link: " + StrCast(this.props.sourceDoc.title) + ", " + (destDoc ? StrCast(destDoc.title) : "");
        }
    }

    removeGroupFromLink = (): void => {
        let destDoc = LinkManager.Instance.getOppositeAnchor(this.props.linkDoc, this.props.sourceDoc);

        let newGroup = new Doc();
        let newMd = new Doc();
        newMd.anchor1 = this.props.sourceDoc.title;
        newMd.anchor2 = destDoc!.title;
        newMd.direction = "one-way";
        newGroup.metadata = newMd;
        newGroup.type = "";

        LinkManager.Instance.setAnchorGroupDoc(this.props.linkDoc, this.props.sourceDoc, newGroup);
        if (NumCast(this.props.linkDoc.direction) === LinkDirection.Bi && destDoc) {
            let newDestGroup = new Doc();
            newDestGroup.type = "";
            newDestGroup.metadata = Doc.MakeCopy(newMd);
            LinkManager.Instance.setAnchorGroupDoc(this.props.linkDoc, destDoc, newDestGroup);

            this.props.linkDoc.direction = LinkDirection.Uni;
            this._direction = LinkDirection.Uni;
        }
    }

    @action
    addMetadata = (groupType: string): void => {
        this._metadataIds.set("new key", Utils.GenerateGuid());

        // only add "new key" if there is no other key with value "new key"; prevents spamming
        let mdKeys = LinkManager.Instance.getMetadataKeysInGroup(groupType);
        if (mdKeys.indexOf("new key") === -1) mdKeys.push("new key");
        LinkManager.Instance.setMetadataKeysForGroup(groupType, mdKeys);
    }

    // for key rendering purposes
    changeMdIdKey = (id: string, newKey: string) => {
        this._metadataIds.set(newKey, id);
    }

    renderMetadata = (): JSX.Element[] => {
        let metadata: Array<JSX.Element> = [];
        let groupDoc = LinkManager.Instance.getAnchorGroupDoc(this.props.linkDoc, this.props.sourceDoc);
        if (!groupDoc) return [];
        const mdDoc = FieldValue(Cast(groupDoc.metadata, Doc));
        if (!mdDoc) return [];
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
        let cols = ["anchor1", "anchor2", "direction", ...[...keys]];
        let docs: Doc[] = LinkManager.Instance.getAllMetadataDocsInGroup(groupType);

        let createTable = action(() => Docs.SchemaDocument(cols, docs, { width: 500, height: 300, title: groupType + " table" }));
        let ref = React.createRef<HTMLDivElement>();
        return <div ref={ref}><button className="linkEditor-button" onPointerDown={SetupDrag(ref, createTable)} title="Drag to view relationship table"><FontAwesomeIcon icon="table" size="sm" /></button></div>;
    }

    @action
    setDirection = (direction: LinkDirection): void => {
        switch (direction) {
            case LinkDirection.Uni: {
                let destDoc = LinkManager.Instance.getOppositeAnchor(this.props.linkDoc, this.props.sourceDoc);
                let sourceGroupDoc = LinkManager.Instance.getAnchorGroupDoc(this.props.linkDoc, this.props.sourceDoc);
                if (destDoc && sourceGroupDoc) {
                    this.props.linkDoc.direction = LinkDirection.Uni;
                    Cast(sourceGroupDoc.metadata, Doc, new Doc).direction = "one-way";
                    let newGroup = new Doc();
                    newGroup.type = sourceGroupDoc.type;
                    newGroup.metadata = Doc.MakeCopy(Cast(sourceGroupDoc.metadata, Doc, new Doc));
                    LinkManager.Instance.setAnchorGroupDoc(this.props.linkDoc, destDoc, newGroup);
                }
                this._direction = LinkDirection.Uni;
                break;
            }
            case LinkDirection.Bi: {
                let destDoc = LinkManager.Instance.getOppositeAnchor(this.props.linkDoc, this.props.sourceDoc);
                let sourceGroupDoc = LinkManager.Instance.getAnchorGroupDoc(this.props.linkDoc, this.props.sourceDoc);
                if (destDoc && sourceGroupDoc) {
                    this.props.linkDoc.direction = LinkDirection.Bi;
                    Cast(sourceGroupDoc.metadata, Doc, new Doc).direction = "shared";
                    LinkManager.Instance.setAnchorGroupDoc(this.props.linkDoc, destDoc, sourceGroupDoc);
                }
                this._direction = LinkDirection.Bi;
                break;
            }
        }
    }

    render() {
        let destination = LinkManager.Instance.getOppositeAnchor(this.props.linkDoc, this.props.sourceDoc);
        let groupDoc = LinkManager.Instance.getAnchorGroupDoc(this.props.linkDoc, this.props.sourceDoc);
        if (!destination || !groupDoc) return <></>;

        let groupType = StrCast(groupDoc.type);

        let buttons;
        if (groupType === "") {
            buttons = (
                <>
                    <button className="linkEditor-button" disabled={true} title="Add KVP"><FontAwesomeIcon icon="plus" size="sm" /></button>
                    <button className="linkEditor-button" disabled title="Clear relationship from link"><FontAwesomeIcon icon="times" size="sm" /></button>
                    <button className="linkEditor-button" disabled title="Drag to view relationship table"><FontAwesomeIcon icon="table" size="sm" /></button>
                </>
            );
        } else {
            buttons = (
                <>
                    <button className="linkEditor-button" onClick={() => this.addMetadata(groupType)} title="Add KVP"><FontAwesomeIcon icon="plus" size="sm" /></button>
                    <button className="linkEditor-button" onClick={() => this.removeGroupFromLink()} title="Clear relationship from link"><FontAwesomeIcon icon="times" size="sm" /></button>
                    {this.viewGroupAsTable(groupType)}
                </>
            );
        }

        return (
            <div className="linkEditor">
                <button className="linkEditor-back" onPointerDown={() => this.props.showLinks()}><FontAwesomeIcon icon="arrow-left" size="sm" /></button>
                <div className="linkEditor-info">
                    <p className="linkEditor-linkedTo">Editing link to: <b>{destination.proto!.title}</b></p>
                    <button className="linkEditor-button" onPointerDown={() => this.deleteLink()} title="Delete link"><FontAwesomeIcon icon="trash" size="sm" /></button>
                </div>
                <div className="linkEditor-group">
                    <div className="linkEditor-group-row linkEditor-direction">
                        <p className="linkEditor-group-row-label">Direction: </p>
                        <p>{this._direction === LinkDirection.Uni ? "one-way" : "shared"}</p>
                        <button className={this._direction === LinkDirection.Uni ? "linkEditor-button linkEditor-button-active" : "linkEditor-button linkEditor-button-inactive"}
                            onClick={() => this.setDirection(LinkDirection.Bi)} title="Click to make this link bidirectional"><FontAwesomeIcon icon="long-arrow-alt-right" size="sm" /></button>
                        <button className={this._direction === LinkDirection.Bi ? "linkEditor-button linkEditor-button-active" : "linkEditor-button linkEditor-button-inactive"}
                            onClick={() => this.setDirection(LinkDirection.Uni)} title="Click to make this link unidirectional"><FontAwesomeIcon icon="exchange-alt" size="sm" /></button>
                    </div>
                    <div className="linkEditor-group-row">
                        <p className="linkEditor-group-row-label">Relationship:</p>
                        <GroupTypesDropdown groupType={groupType} setGroupType={this.setGroupType} />
                    </div>
                    {this.renderMetadata().length > 0 ? <p className="linkEditor-group-row-label">Metadata:</p> : <></>}
                    {this.renderMetadata()}
                    <div className="linkEditor-group-buttons">
                        {buttons}
                    </div>
                </div>
                {/* {groups.length > 0 ? groups : <div className="linkEditor-group">There are currently no relationships associated with this link.</div>} */}
            </div>

        );
    }
}