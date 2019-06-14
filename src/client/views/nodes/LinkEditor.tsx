import { observable, computed, action } from "mobx";
import React = require("react");
import { observer } from "mobx-react";
import './LinkEditor.scss';
import { StrCast, Cast } from "../../../new_fields/Types";
import { Doc } from "../../../new_fields/Doc";
import { LinkManager } from "../../util/LinkManager";
import { Docs } from "../../documents/Documents";
import { Utils } from "../../../Utils";
import { faArrowLeft, faEllipsisV, faTable } from '@fortawesome/free-solid-svg-icons';
import { library } from "@fortawesome/fontawesome-svg-core";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { SetupDrag } from "../../util/DragManager";

library.add(faArrowLeft);
library.add(faEllipsisV);
library.add(faTable);


interface GroupTypesDropdownProps {
    groupId: string;
    groupType: string;
    setGroup: (groupId: string, group: string) => void;
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
        this.props.setGroup(this.props.groupId, groupType);
        LinkManager.Instance.groupMetadataKeys.set(groupType, []);
    }

    renderOptions = (): JSX.Element[] | JSX.Element => {
        if (this._searchTerm === "") return <></>;

        let allGroupTypes = Array.from(LinkManager.Instance.groupMetadataKeys.keys());
        let groupOptions = allGroupTypes.filter(groupType => groupType.toUpperCase().indexOf(this._searchTerm.toUpperCase()) > -1);
        let exactFound = groupOptions.findIndex(groupType => groupType.toUpperCase() === this._searchTerm.toUpperCase()) > -1;

        let options = groupOptions.map(groupType => {
            return <div key={groupType} className="linkEditor-option"
                onClick={() => { this.props.setGroup(this.props.groupId, groupType); this.setGroupType(groupType); this.setSearchTerm(""); }}>{groupType}</div>;
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
                <input type="text" value={this._groupType} placeholder="Search for a group or create a new group"
                    onChange={e => { this.setSearchTerm(e.target.value); this.setGroupType(e.target.value); }}></input>
                <div className="linkEditor-options-wrapper">
                    {this.renderOptions()}
                </div>
            </div>
        );
    }
}


interface LinkMetadataEditorProps {
    groupType: string;
    mdDoc: Doc;
    mdKey: string;
    mdValue: string;
}
@observer
class LinkMetadataEditor extends React.Component<LinkMetadataEditorProps> {
    @observable private _key: string = this.props.mdKey;
    @observable private _value: string = this.props.mdValue;
    @observable private _keyError: boolean = false;

    @action
    setMetadataKey = (value: string): void => {
        let groupMdKeys = new Array(...LinkManager.Instance.groupMetadataKeys.get(this.props.groupType)!);

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
        let currIndex = groupMdKeys.findIndex(key => key.toUpperCase() === this._key.toUpperCase());
        if (currIndex === -1) console.error("LinkMetadataEditor: key was not found");
        groupMdKeys[currIndex] = value;

        this._key = value;
        LinkManager.Instance.groupMetadataKeys.set(this.props.groupType, groupMdKeys);
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
        let groupMdKeys = new Array(...LinkManager.Instance.groupMetadataKeys.get(this.props.groupType)!);

        let index = groupMdKeys.findIndex(key => key.toUpperCase() === this._key.toUpperCase());
        if (index === -1) console.error("LinkMetadataEditor: key was not found");
        groupMdKeys.splice(index, 1);

        LinkManager.Instance.groupMetadataKeys.set(this.props.groupType, groupMdKeys);
        this._key = "";
    }

    render() {
        return (
            <div className="linkEditor-metadata-row">
                <input className={this._keyError ? "linkEditor-error" : ""} type="text" value={this._key} placeholder="key" onChange={e => this.setMetadataKey(e.target.value)}></input>:
                <input type="text" value={this._value} placeholder="value" onChange={e => this.setMetadataValue(e.target.value)}></input>
                <button onClick={() => this.removeMetadata()}>x</button>
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

    // map of temporary group id to the corresponding group doc
    @observable private _groups: Map<string, Doc> = new Map();

    constructor(props: LinkEditorProps) {
        super(props);

        let groups = new Map<string, Doc>();
        let groupList = LinkManager.Instance.getAnchorGroups(props.linkDoc, props.sourceDoc);
        groupList.forEach(groupDoc => {
            let id = Utils.GenerateGuid();
            groups.set(id, groupDoc);
        });
        this._groups = groups;
    }

    @action
    addGroup = (): void => {
        // new group only gets added if there is not already a group with type "new group"
        let index = Array.from(this._groups.values()).findIndex(groupDoc => {
            return groupDoc.type === "New Group";
        });
        if (index > -1) return;

        // create new metadata document for group
        let mdDoc = Docs.TextDocument();
        mdDoc.proto!.anchor1 = this.props.sourceDoc.title;
        mdDoc.proto!.anchor2 = LinkManager.Instance.findOppositeAnchor(this.props.linkDoc, this.props.sourceDoc).title;

        // create new group document
        let groupDoc = Docs.TextDocument();
        groupDoc.proto!.type = "New Group";
        groupDoc.proto!.metadata = mdDoc;

        this._groups.set(Utils.GenerateGuid(), groupDoc);

        let linkDoc = this.props.linkDoc.proto ? this.props.linkDoc.proto : this.props.linkDoc;
        LinkManager.Instance.setAnchorGroups(linkDoc, this.props.sourceDoc, Array.from(this._groups.values()));
    }

    @action
    setGroupType = (groupId: string, groupType: string): void => {
        let groupDoc = this._groups.get(groupId);
        if (groupDoc) {
            groupDoc.proto!.type = groupType;
            this._groups.set(groupId, groupDoc);
            LinkManager.Instance.setAnchorGroups(this.props.linkDoc, this.props.sourceDoc, Array.from(this._groups.values()));
        }
    }

    removeGroupFromLink = (groupId: string, groupType: string): void => {
        let groupDoc = this._groups.get(groupId);
        if (!groupDoc) console.error("LinkEditor: group not found");
        LinkManager.Instance.removeGroupFromAnchor(this.props.linkDoc, this.props.sourceDoc, groupType);
        this._groups.delete(groupId);
    }

    deleteGroup = (groupId: string, groupType: string): void => {
        let groupDoc = this._groups.get(groupId);
        if (!groupDoc) console.error("LinkEditor: group not found");
        LinkManager.Instance.deleteGroup(groupType);
        this._groups.delete(groupId);
    }

    copyGroup = (groupId: string, groupType: string): void => {
        let sourceGroupDoc = this._groups.get(groupId);
        let sourceMdDoc = Cast(sourceGroupDoc!.metadata, Doc, new Doc);
        let destDoc = LinkManager.Instance.findOppositeAnchor(this.props.linkDoc, this.props.sourceDoc);
        let destGroupList = LinkManager.Instance.getAnchorGroups(this.props.linkDoc, destDoc);
        let keys = LinkManager.Instance.groupMetadataKeys.get(groupType);

        // create new metadata doc with copied kvp
        let destMdDoc = Docs.TextDocument();
        destMdDoc.proto!.anchor1 = StrCast(sourceMdDoc.anchor2);
        destMdDoc.proto!.anchor2 = StrCast(sourceMdDoc.anchor1);
        if (keys) {
            keys.forEach(key => {
                let val = sourceMdDoc[key] === undefined ? "" : StrCast(sourceMdDoc[key]);
                destMdDoc[key] = val;
            });
        }

        // create new group doc with new metadata doc
        let destGroupDoc = Docs.TextDocument();
        destGroupDoc.proto!.type = groupType;
        destGroupDoc.proto!.metadata = destMdDoc;

        // if group does not already exist on opposite anchor, create group doc
        let index = destGroupList.findIndex(groupDoc => { StrCast(groupDoc.type).toUpperCase() === groupType.toUpperCase(); });
        if (index > -1) {
            destGroupList[index] = destGroupDoc;
        } else {
            destGroupList.push(destGroupDoc);
        }

        LinkManager.Instance.setAnchorGroups(this.props.linkDoc, destDoc, destGroupList);
    }

    viewGroupAsTable = (groupId: string, groupType: string): JSX.Element => {
        let keys = LinkManager.Instance.groupMetadataKeys.get(groupType);
        let groupDoc = this._groups.get(groupId);
        if (keys && groupDoc) {
            let docs: Doc[] = LinkManager.Instance.findAllMetadataDocsInGroup(groupType);
            let createTable = action(() => Docs.SchemaDocument(["anchor1", "anchor2", ...keys!], docs, { width: 200, height: 200, title: groupType + " table" }));
            let ref = React.createRef<HTMLDivElement>();
            return <div className="linkEditor-groupOpts" ref={ref}><button onPointerDown={SetupDrag(ref, createTable)}><FontAwesomeIcon icon="table" size="sm" /></button></div>;
        } else {
            return <button className="linkEditor-groupOpts" disabled><FontAwesomeIcon icon="table" size="sm" /></button>;
        }
    }

    renderGroup = (groupId: string, groupDoc: Doc): JSX.Element => {
        let type = StrCast(groupDoc.type);
        if ((type && LinkManager.Instance.groupMetadataKeys.get(type)) || type === "New Group") {
            return (
                <div key={groupId} className="linkEditor-group">
                    <div className="linkEditor-group-row">
                        <p className="linkEditor-group-row-label">type:</p>
                        <GroupTypesDropdown groupId={groupId} groupType={StrCast(groupDoc.proto!.type)} setGroup={this.setGroupType} />
                    </div>
                    {this.renderMetadata(groupId)}
                    <div className="linkEditor-group-buttons">
                        {groupDoc.type === "New Group" ? <button className="linkEditor-groupOpts" disabled={true} title="Add KVP">+</button> :
                            <button className="linkEditor-groupOpts" onClick={() => this.addMetadata(StrCast(groupDoc.proto!.type))} title="Add KVP">+</button>}
                        <button className="linkEditor-groupOpts" onClick={() => this.copyGroup(groupId, type)} title="Copy group to opposite anchor">↔</button>
                        <button className="linkEditor-groupOpts" onClick={() => this.removeGroupFromLink(groupId, type)} title="Remove group from link">x</button>
                        <button className="linkEditor-groupOpts" onClick={() => this.deleteGroup(groupId, type)} title="Delete group">xx</button>
                        {this.viewGroupAsTable(groupId, type)}
                    </div>
                </div>
            );
        } else {
            return <></>;
        }
    }


    @action
    addMetadata = (groupType: string): void => {
        let mdKeys = LinkManager.Instance.groupMetadataKeys.get(groupType);
        if (mdKeys) {
            // only add "new key" if there is no other key with value "new key"; prevents spamming
            if (mdKeys.indexOf("new key") === -1) mdKeys.push("new key");
        } else {
            mdKeys = ["new key"];
        }
        LinkManager.Instance.groupMetadataKeys.set(groupType, mdKeys);
    }

    renderMetadata = (groupId: string): JSX.Element[] => {
        let metadata: Array<JSX.Element> = [];
        let groupDoc = this._groups.get(groupId);
        if (groupDoc) {
            let mdDoc = Cast(groupDoc.proto!.metadata, Doc, new Doc);
            let groupType = StrCast(groupDoc.proto!.type);
            let groupMdKeys = LinkManager.Instance.groupMetadataKeys.get(groupType);
            if (groupMdKeys) {
                groupMdKeys.forEach((key, index) => {
                    metadata.push(
                        <LinkMetadataEditor key={"mded-" + index} groupType={groupType} mdDoc={mdDoc} mdKey={key} mdValue={(mdDoc[key] === undefined) ? "" : StrCast(mdDoc[key])} />
                    );
                });
            }
        }
        return metadata;
    }

    render() {
        let destination = LinkManager.Instance.findOppositeAnchor(this.props.linkDoc, this.props.sourceDoc);

        let groups: Array<JSX.Element> = [];
        this._groups.forEach((groupDoc, groupId) => {
            groups.push(this.renderGroup(groupId, groupDoc));
        });

        return (
            <div className="linkEditor">
                <button className="linkEditor-back" onPointerDown={() => this.props.showLinks()}><FontAwesomeIcon icon="arrow-left" size="sm" /></button>
                <p className="linkEditor-linkedTo">editing link to: <b>{destination.proto!.title}</b></p>
                <div className="linkEditor-groupsLabel">
                    <b>Relationships:</b>
                    <button onClick={() => this.addGroup()} title="Add Group">+</button>
                </div>
                {groups.length > 0 ? groups : <div className="linkEditor-group">There are currently no relationships associated with this link.</div>}
            </div>

        );
    }
}