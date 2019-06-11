import { observable, computed, action } from "mobx";
import React = require("react");
import { SelectionManager } from "../../util/SelectionManager";
import { observer } from "mobx-react";
import './LinkEditor.scss';
import { props } from "bluebird";
import { DocumentView } from "./DocumentView";
import { link } from "fs";
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

// this dropdown could be generalizeds
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
                onClick={() => { this.createGroup(this._searchTerm); this.setGroupType(this._searchTerm); this.setSearchTerm("") }}>Create new "{this._searchTerm}" group</div>)
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

    render() {
        return (
            <div className="linkEditor-metadata-row">
                <input type="text" value={this._key} placeholder="key" onChange={e => this.editMetadataKey(e.target.value)}></input>:
                <input type="text" value={this._value} placeholder="value" onChange={e => this.editMetadataValue(e.target.value)}></input>
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

    @observable private _groups: Map<string, Doc> = new Map();
    @observable private _metadata: Map<string, Map<string, Doc>> = new Map();

    constructor(props: LinkEditorProps) {
        super(props);

        let groups = new Map<string, Doc>();
        let metadata: Map<string, Map<string, Doc>> = new Map();
        let groupList = (Doc.AreProtosEqual(props.sourceDoc, Cast(props.linkDoc.anchor1, Doc, new Doc))) ?
            Cast(props.linkDoc.anchor1Groups, listSpec(Doc), []) : Cast(props.linkDoc.anchor2Groups, listSpec(Doc), []);
        groupList.forEach(groupDoc => {
            if (groupDoc instanceof Doc) {
                let id = Utils.GenerateGuid();
                groups.set(id, groupDoc);

                let metadataMap = new Map<string, Doc>();
                let metadataDocs = Cast(groupDoc.proto!.metadata, listSpec(Doc), []);
                metadataDocs.forEach(mdDoc => {
                    if (mdDoc && mdDoc instanceof Doc) { // TODO: handle promise doc
                        metadataMap.set(Utils.GenerateGuid(), mdDoc);
                    }
                })
                metadata.set(id, metadataMap);
            } else {
                // promise doc
            }
        })
        this._groups = groups;
        this._metadata = metadata;
    }

    // @action
    // editGroup(groupId: string, value: string) {
    //     let linkDoc = this.props.linkDoc.proto ? this.props.linkDoc.proto : this.props.linkDoc;
    //     let groupDoc = this._groups.get(groupId);
    //     if (groupDoc) {
    //         groupDoc.proto!.type = value;
    //         LinkUtils.setAnchorGroups(linkDoc, this.props.sourceDoc, [groupDoc]);
    //     }
    // }

    @action
    addGroup = (e: React.MouseEvent): void => {
        // create new document for group
        let groupDoc = Docs.TextDocument();
        groupDoc.proto!.title = "";
        groupDoc.proto!.metadata = new List<Doc>([]);

        this._groups.set(Utils.GenerateGuid(), groupDoc);

        let linkDoc = this.props.linkDoc.proto ? this.props.linkDoc.proto : this.props.linkDoc;
        LinkUtils.setAnchorGroups(linkDoc, this.props.sourceDoc, Array.from(this._groups.values()));
    }

    @action
    setGroup = (groupId: string, group: string): void => {
        let linkDoc = this.props.linkDoc.proto ? this.props.linkDoc.proto : this.props.linkDoc;
        let groupDoc = this._groups.get(groupId);
        if (groupDoc) {
            groupDoc.proto!.type = group;
            LinkUtils.setAnchorGroups(linkDoc, this.props.sourceDoc, [groupDoc]);
        }
    }

    renderGroup(groupId: string, groupDoc: Doc) {
        return (
            <div key={groupId} className="linkEditor-group">
                <div className="linkEditor-group-row">
                    <p className="linkEditor-group-row-label">type:</p>
                    <LinkGroupsDropdown groupId={groupId} groupType={StrCast(groupDoc.proto!.type)} setGroup={this.setGroup} />
                    {/* <input key={groupId + "-type"} type="text" value={StrCast(groupDoc.proto!.type)} onChange={e => this.editGroup(groupId, e.target.value)}></input> */}
                    {/* <input key={groupId + "-type"} type="text" value={StrCast(groupDoc.proto!.type)} onChange={e => this.editGroup(groupId, e.target.value)}></input> */}
                </div>
                {this.renderMetadata(groupId)}
                {groupDoc["type"] === "*" ? <></> : <button onClick={() => this.addMetadata(StrCast(groupDoc.proto!.type))}>add kvp</button>}
                <button onClick={this.viewGroupAsTable}>view group as table</button>
                {/* <button onClick={() => this.addMetadata(StrCast(groupDoc.proto!.type))}>+</button> */}
            </div>
        )
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

        // // create new metadata doc
        // let mdDoc = Docs.TextDocument();
        // mdDoc.proto!.title = "";
        // mdDoc.proto!.value = "";

        // // append to map
        // let mdMap = this._metadata.get(groupId);
        // if (mdMap) {
        //     mdMap.set(Utils.GenerateGuid(), mdDoc);
        // } else {
        //     mdMap = new Map();
        //     mdMap.set(Utils.GenerateGuid(), mdDoc);
        // }

        // // add to internal representation of metadata
        // this._metadata.set(groupId, mdMap);

        // // add to internatal representation of group
        // let groupDoc = this._groups.get(groupId);
        // if (groupDoc) {
        //     groupDoc.proto!.metadata = new List<Doc>(Array.from(mdMap.values()));
        //     this._groups.set(groupId, groupDoc);
        // }

        // // add to link doc
        // let linkDoc = this.props.linkDoc.proto ? this.props.linkDoc.proto : this.props.linkDoc;
        // LinkUtils.setAnchorGroups(linkDoc, this.props.sourceDoc, Array.from(this._groups.values()));
    }

    // @action
    // editMetadataTitle(groupId: string, mdId: string, value: string) {
    //     let groupMd = this._metadata.get(groupId);
    //     if (groupMd) {
    //         let mdDoc = groupMd.get(mdId);
    //         if (mdDoc) {
    //             mdDoc.proto!.title = value;
    //         }
    //     }
    //     // set group and link?
    // }

    // @action
    // editMetadataValue(groupId: string, mdId: string, value: string) {
    //     let groupMd = this._metadata.get(groupId);
    //     if (groupMd) {
    //         let mdDoc = groupMd.get(mdId);
    //         if (mdDoc) {
    //             mdDoc.proto!.value = value;
    //         }
    //     }
    //     // set group and link?
    // }

    @action
    editMetadataKey(groupId: string, value: string) {
        let groupDoc = this._groups.get(groupId);
        if (groupDoc) {

        }
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
                        // <div key={key} className="linkEditor-metadata-row">
                        //     <input type="text" value={key} placeholder="key"></input>
                        //     :
                        //     <input type="text" value={(mdDoc[key] === undefined) ? "" : StrCast(mdDoc[key])} placeholder="value"></input>
                        // </div>
                    )
                })
            }
        }


        // let metadataMap = this._metadata.get(groupId);
        // if (metadataMap) {
        //     metadataMap.forEach((mdDoc, mdId) => {
        //         metadata.push(
        //             <div key={mdId} className="linkEditor-metadata-row">
        //                 <input type="text" value={StrCast(mdDoc.proto!.title)} placeholder="key" onChange={e => this.editMetadataTitle(groupId, mdId, e.target.value)}></input>
        //                 :
        //                 <input type="text" value={StrCast(mdDoc.proto!.value)} placeholder="value" onChange={e => this.editMetadataValue(groupId, mdId, e.target.value)}></input>
        //             </div>
        //         )
        //     })
        // }

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
                    <b>Groups:</b>
                    <button onClick={this.addGroup} title="Add Group">+</button>
                </div>
                {groups}
            </div>

        );
    }
}