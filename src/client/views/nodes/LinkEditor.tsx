import { observable, computed, action } from "mobx";
import React = require("react");
import { observer } from "mobx-react";
import './LinkEditor.scss';
import { StrCast, Cast } from "../../../new_fields/Types";
import { Doc } from "../../../new_fields/Doc";
import { List } from "../../../new_fields/List";
import { listSpec } from "../../../new_fields/Schema";
import { LinkManager, LinkUtils } from "../../util/LinkManager";
import { Docs } from "../../documents/Documents";
import { Utils } from "../../../Utils";
import { faArrowLeft, faEllipsisV } from '@fortawesome/free-solid-svg-icons';
import { library } from "@fortawesome/fontawesome-svg-core";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { string } from "prop-types";

library.add(faArrowLeft);
library.add(faEllipsisV);

// this dropdown could be generalized
@observer
class LinkGroupsDropdown extends React.Component<{ groupId: string, groupType: string, setGroup: (groupId: string, group: string) => void }> {
    @observable private _searchTerm: string = "";
    @observable private _groupType: string = this.props.groupType;

    @action
    setSearchTerm(value: string) {
        this._searchTerm = value;
    }

    @action
    setGroupType(value: string) {
        this._groupType = value;
    }

    @action
    createGroup(value: string) {
        LinkManager.Instance.allGroups.set(value, []);
        this.props.setGroup(this.props.groupId, value);
    }

    renderOptions = (): JSX.Element[] => {
        let allGroups: string[], searchTerm: string, results: string[], exactFound: boolean;
        if (this._searchTerm !== "") {
            allGroups = Array.from(LinkManager.Instance.allGroups.keys());
            searchTerm = this._searchTerm.toUpperCase();
            results = allGroups.filter(group => group.toUpperCase().indexOf(searchTerm) > -1);
            exactFound = results.findIndex(group => group.toUpperCase() === searchTerm) > -1;
        } else {
            results = [];
            exactFound = false;
        }

        let options = [];
        results.forEach(result => {
            options.push(<div key={result} className="linkEditor-option"
                onClick={() => { this.props.setGroup(this.props.groupId, result); this.setGroupType(result); this.setSearchTerm("") }}>{result}</div>)
        });

        if (!exactFound && this._searchTerm !== "") {
            options.push(<div key={""} className="linkEditor-option"
                onClick={() => { this.createGroup(this._searchTerm); this.setGroupType(this._searchTerm); this.setSearchTerm("") }}>Define new "{this._searchTerm}" relationship</div>)
        }

        return options;
    }

    render() {
        return (
            <div className="linkEditor-dropdown">
                <input type="text" value={this._groupType} placeholder="Search for a group or create a new group"
                    onChange={e => { this.setSearchTerm(e.target.value); this.setGroupType(e.target.value) }}></input>
                <div className="linkEditor-options-wrapper">
                    {this.renderOptions()}
                </div>
            </div>
        )
    }
}



@observer
class LinkMetadataEditor extends React.Component<{ groupType: string, mdDoc: Doc, mdKey: string, mdValue: string }> {
    @observable private _key: string = this.props.mdKey;
    @observable private _value: string = this.props.mdValue;

    @action
    editMetadataKey = (value: string): void => {
        // TODO: check that metadata doesnt already exist in group
        let groupMdKeys = new Array(...LinkManager.Instance.allGroups.get(this.props.groupType)!);
        if (groupMdKeys) {
            let index = groupMdKeys.indexOf(this._key);
            if (index > -1) {
                groupMdKeys[index] = value;
            }
            else {
                console.log("OLD KEY WAS NOT FOUND", ...groupMdKeys)
            }
        }

        this._key = value;
        LinkManager.Instance.allGroups.set(this.props.groupType, groupMdKeys);
    }

    @action
    editMetadataValue = (value: string): void => {
        this.props.mdDoc[this._key] = value;
        this._value = value;
    }

    @action
    removeMetadata = (): void => {
        let groupMdKeys = new Array(...LinkManager.Instance.allGroups.get(this.props.groupType)!);
        if (groupMdKeys) {
            let index = groupMdKeys.indexOf(this._key);
            if (index > -1) {
                groupMdKeys.splice(index, 1);
            }
            else {
                console.log("OLD KEY WAS NOT FOUND", ...groupMdKeys)
            }
        }
        this._key = "";
        LinkManager.Instance.allGroups.set(this.props.groupType, groupMdKeys);
    }

    render() {
        return (
            <div className="linkEditor-metadata-row">
                <input type="text" value={this._key} placeholder="key" onChange={e => this.editMetadataKey(e.target.value)}></input>:
                <input type="text" value={this._value} placeholder="value" onChange={e => this.editMetadataValue(e.target.value)}></input>
                <button onClick={() => this.removeMetadata()}>X</button>
            </div>
        )
    }
}


interface LinkEditorProps {
    sourceDoc: Doc;
    linkDoc: Doc;
    showLinks: () => void;
}

@observer
export class LinkEditor extends React.Component<LinkEditorProps> {

    @observable private _groups: Map<string, Doc> = new Map(); // map of temp group id to the corresponding group doc

    constructor(props: LinkEditorProps) {
        super(props);

        let groups = new Map<string, Doc>();
        let groupList = (Doc.AreProtosEqual(props.sourceDoc, Cast(props.linkDoc.anchor1, Doc, new Doc))) ?
            Cast(props.linkDoc.anchor1Groups, listSpec(Doc), []) : Cast(props.linkDoc.anchor2Groups, listSpec(Doc), []);
        groupList.forEach(groupDoc => {
            if (groupDoc instanceof Doc) {
                let id = Utils.GenerateGuid();
                groups.set(id, groupDoc);
            } else {
                // promise doc
            }
        })
        this._groups = groups;
    }

    @action
    addGroup = (): void => {
        console.log("before adding", ...Array.from(this._groups.keys()));

        let index = Array.from(this._groups.values()).findIndex(groupDoc => {
            return groupDoc["type"] === "New Group";
        })
        if (index === -1) {
            // create new document for group
            let groupDoc = Docs.TextDocument();
            groupDoc.proto!.type = "New Group";
            groupDoc.proto!.metadata = Docs.TextDocument();

            this._groups.set(Utils.GenerateGuid(), groupDoc);

            let linkDoc = this.props.linkDoc.proto ? this.props.linkDoc.proto : this.props.linkDoc;
            LinkUtils.setAnchorGroups(linkDoc, this.props.sourceDoc, Array.from(this._groups.values()));
        }


        // console.log("set anchor groups for", this.props.sourceDoc["title"]);
        console.log("after adding", ...Array.from(this._groups.keys()));
    }

    @action
    setGroupType = (groupId: string, groupType: string): void => {
        console.log("setting for ", groupId);
        let linkDoc = this.props.linkDoc.proto ? this.props.linkDoc.proto : this.props.linkDoc;
        let groupDoc = this._groups.get(groupId);
        if (groupDoc) {
            console.log("found group doc");
            groupDoc.proto!.type = groupType;

            this._groups.set(groupId, groupDoc);

            let gd = this._groups.get(groupId);
            if (gd)
                console.log("just created", StrCast(gd["type"]));

            LinkUtils.setAnchorGroups(linkDoc, this.props.sourceDoc, Array.from(this._groups.values()));
            console.log("set", Array.from(this._groups.values()).length)
        }

        let anchor1groups: string[] = [];
        Cast(this.props.linkDoc.anchor1Groups, listSpec(Doc), []).forEach(doc => {
            if (doc instanceof Doc) {
                anchor1groups.push(StrCast(doc.proto!.type));
            } else {
                console.log("promise");
            }
        })
        let anchor2groups: string[] = [];
        Cast(this.props.linkDoc.anchor2Groups, listSpec(Doc), []).forEach(doc => {
            if (doc instanceof Doc) {
                anchor2groups.push(StrCast(doc.proto!.type));
            } else {
                console.log("promise");
            }
        })
        console.log("groups for anchors; anchor1: [", ...anchor1groups, "] ; anchor2: [", ...anchor2groups, "]")
    }

    removeGroupFromLink = (groupId: string, groupType: string) => {
        // this._groups.delete(groupId);
        let groupDoc = this._groups.get(groupId);
        if (groupDoc) {
            LinkUtils.removeGroupFromAnchor(this.props.linkDoc, this.props.sourceDoc, groupType);
            this._groups.delete(groupId);
        }
        // LinkUtils.setAnchorGroups(this.props.linkDoc, this.props.sourceDoc, Array.from(this._groups.values()));
        console.log("\nremoved", groupId, "remaining", ...Array.from(this._groups.keys()), "\n");
    }

    deleteGroup = (groupId: string, groupType: string) => {
        let groupDoc = this._groups.get(groupId);
        if (groupDoc) {
            LinkManager.Instance.deleteGroup(groupType);
            this._groups.delete(groupId);
        }
    }

    renderGroup(groupId: string, groupDoc: Doc) {
        let type = StrCast(groupDoc["type"]);
        if ((type && LinkManager.Instance.allGroups.get(type)) || type === "New Group") {
            return (
                <div key={groupId} className="linkEditor-group">
                    <div className="linkEditor-group-row">
                        <p className="linkEditor-group-row-label">type:</p>
                        <LinkGroupsDropdown groupId={groupId} groupType={StrCast(groupDoc.proto!.type)} setGroup={this.setGroupType} />
                    </div>
                    {this.renderMetadata(groupId)}
                    <div className="linkEditor-group-buttons">
                        {groupDoc["type"] === "New Group" ? <button disabled={true} title="Add KVP">+</button> :
                            <button onClick={() => this.addMetadata(StrCast(groupDoc.proto!.type))} title="Add KVP">+</button>}
                        {/* <button onClick={this.viewGroupAsTable}>view group as table</button> */}
                        <button onClick={() => this.copyGroup(groupId, type)} title="Copy group to opposite anchor">↔</button>
                        <button onClick={() => this.removeGroupFromLink(groupId, type)} title="Remove group from link">x</button>
                        <button onClick={() => this.deleteGroup(groupId, type)} title="Delete group">xx</button>
                    </div>
                </div>
            )
        } else {
            return <></>
        }
    }

    viewGroupAsTable = (): void => {

    }

    @action
    addMetadata = (groupType: string): void => {
        let mdKeys = LinkManager.Instance.allGroups.get(groupType);
        if (mdKeys) {
            if (mdKeys.indexOf("new key") === -1) {
                mdKeys.push("new key");
            }
        } else {
            mdKeys = ["new key"];
        }
        LinkManager.Instance.allGroups.set(groupType, mdKeys);

    }

    renderMetadata(groupId: string) {
        let metadata: Array<JSX.Element> = [];
        let groupDoc = this._groups.get(groupId);
        if (groupDoc) {
            let mdDoc = Cast(groupDoc.proto!.metadata, Doc, new Doc);
            let groupType = StrCast(groupDoc.proto!.type);
            let groupMdKeys = LinkManager.Instance.allGroups.get(groupType);
            if (groupMdKeys) {
                groupMdKeys.forEach((key, index) => {
                    metadata.push(
                        <LinkMetadataEditor key={"mded-" + index} groupType={groupType} mdDoc={mdDoc} mdKey={key} mdValue={(mdDoc[key] === undefined) ? "" : StrCast(mdDoc[key])} />
                    )
                })
            }
        }
        return metadata;
    }

    render() {
        let destination = LinkUtils.findOppositeAnchor(this.props.linkDoc, this.props.sourceDoc);

        let groups: Array<JSX.Element> = [];
        this._groups.forEach((groupDoc, groupId) => {
            groups.push(this.renderGroup(groupId, groupDoc))
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