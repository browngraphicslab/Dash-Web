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

interface LinkEditorProps {
    sourceDoc: Doc;
    linkDoc: Doc;
    groups: Map<string, Doc>;
    metadata: Map<string, Map<string, Doc>>;
    showLinks: () => void;
}

@observer
export class LinkEditor extends React.Component<LinkEditorProps> {

    // @observable private _groups: Map<string, Doc> = new Map();
    // @observable private _metadata: Map<string, Map<string, Doc>> = new Map();

    // // componentDidMount() {

    // // }
    // constructor(props: LinkEditorProps) {
    //     super(props);

    //     let groups = new Map<string, Doc>();
    //     let metadata: Map<string, Map<string, Doc>> = new Map();
    //     let groupList = (Doc.AreProtosEqual(props.docView.props.Document, Cast(this._editingLink.anchor1, Doc, new Doc))) ?
    //         Cast(this._editingLink.anchor1Groups, listSpec(Doc), []) : Cast(this._editingLink.anchor2Groups, listSpec(Doc), []);
    //     groupList.forEach(groupDoc => {
    //         if (groupDoc instanceof Doc) {
    //             let id = Utils.GenerateGuid();
    //             groups.set(id, groupDoc);

    //             let metadataMap = new Map<string, Doc>();
    //             let metadataDocs = Cast(groupDoc.proto!.metadata, listSpec(Doc), []);
    //             metadataDocs.forEach(mdDoc => {
    //                 if (mdDoc && mdDoc instanceof Doc) { // TODO: handle promise doc
    //                     metadataMap.set(Utils.GenerateGuid(), mdDoc);
    //                 }
    //             })
    //             metadata.set(id, metadataMap);
    //         }
    //     })
    // }

    // @observable private _title: string = StrCast(this.props.linkDoc.title);
    // @observable private _description: string = StrCast(this.props.linkDoc.linkDescription);
    // @observable private _tags: Array<string> = Cast(this.props.linkDoc.linkTags, List);

    // @action
    // onTitleChanged = (e: React.ChangeEvent<HTMLInputElement>) => {
    //     this._title = e.target.value;
    // }

    // @action
    // onDescriptionChanged = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    //     this._description = e.target.value;
    // }

    // renderTags() {
    //     return this._tags.map(tag => {
    //         if (tag === "") {
    //             return <input type="text" placeholder="Tag"></input>;
    //         } else {
    //             return <input type="text" value={tag}></input>;
    //         }
    //     })
    // }

    // addTag = (): void => {
    //     this._tags.push("");
    // }

    @action
    editGroup(groupId: string, value: string) {
        let linkDoc = this.props.linkDoc.proto ? this.props.linkDoc.proto : this.props.linkDoc;
        let groupDoc = this.props.groups.get(groupId);
        if (groupDoc) {
            groupDoc.proto!.type = value;
            LinkUtils.setAnchorGroups(linkDoc, this.props.sourceDoc, [groupDoc]);
        }
    }

    @action
    addGroup = (e: React.MouseEvent): void => {
        // create new document for group
        let groupDoc = Docs.TextDocument();
        groupDoc.proto!.title = "";
        groupDoc.proto!.metadata = new List<Doc>([]);

        this.props.groups.set(Utils.GenerateGuid(), groupDoc);

        let linkDoc = this.props.linkDoc.proto ? this.props.linkDoc.proto : this.props.linkDoc;
        LinkUtils.setAnchorGroups(linkDoc, this.props.sourceDoc, Array.from(this.props.groups.values()));
    }

    renderGroup(groupId: string, groupDoc: Doc) {
        // let metadata = this.props.metadata.get(groupId);
        // if (!metadata) {
        //     metadata = new Map<string, Doc>();
        // }
        return (
            // <div key={groupId} className="linkEditor-group">
            <div key={groupId} className="linkEditor-group-row">
                <p className="linkEditor-group-row-label">type:</p>
                <input key={groupId + "-type"} type="text" value={StrCast(groupDoc.proto!.type)} onChange={e => this.editGroup(groupId, e.target.value)}></input>
            </div>
            //         {/* {this.renderMetadata(groupId)} */ }
            // {/* <button onPointerDown={() => this.addMetadata(groupId)}>+</button> */ }
            //     // </div>
        )
    }

    @action
    addMetadata = (groupId: string): void => {
        // create new metadata doc
        let mdDoc = Docs.TextDocument();
        mdDoc.proto!.title = "";
        mdDoc.proto!.value = "";

        // append to map
        let mdMap = this.props.metadata.get(groupId);
        if (mdMap) {
            mdMap.set(Utils.GenerateGuid(), mdDoc);
        } else {
            mdMap = new Map();
            mdMap.set(Utils.GenerateGuid(), mdDoc);
        }

        // add to internal representation of metadata
        this.props.metadata.set(groupId, mdMap);

        // add to internatal representation of group
        let groupDoc = this.props.groups.get(groupId);
        if (groupDoc) {
            groupDoc.proto!.metadata = new List<Doc>(Array.from(mdMap.values()));
            this.props.groups.set(groupId, groupDoc);
        }

        // add to link doc
        let linkDoc = this.props.linkDoc.proto ? this.props.linkDoc.proto : this.props.linkDoc;
        LinkUtils.setAnchorGroups(linkDoc, this.props.sourceDoc, Array.from(this.props.groups.values()));

    }

    // @action
    // addMetadata = (groupId: string): void => {
    //     let groupDoc = this.props.groups.get(groupId);
    //     if (groupDoc) {
    //         // create new document for metadata row
    //         let metadata = Cast(groupDoc.metadata, listSpec(Doc), []);
    //         let metadataDoc = Docs.TextDocument();
    //         metadataDoc.proto!.title = "";
    //         metadataDoc.proto!.value = "";
    //         let metadataMap = new Map<string, 

    //         this.props.metadata.set(groupId, new Map)

    //         groupDoc.proto!.metadata = new List<Doc>([metadataDoc]); // TODO: append to metadata
    //     }
    // }

    // @action
    // editMetadataTitle = (groupId: string, mdId: string, value: string) => {
    //     let group = this.props.metadata.get(groupId);
    //     if (group) {
    //         let mdDoc = group.get(mdId);
    //         if (mdDoc) {
    //             mdDoc.proto!.title = value;
    //         }
    //     }
    // }

    // @action
    // editMetadataValue = (groupId: string, mdId: string, value: string) => {
    //     let group = this.props.metadata.get(groupId);
    //     if (group) {
    //         let mdDoc = group.get(mdId);
    //         if (mdDoc) {
    //             mdDoc.proto!.value = value;
    //         }
    //     }
    // }

    @action
    editMetadataTitle(groupId: string, mdId: string, value: string) {

    }

    @action
    editMetadataValue(groupId: string, mdId: string, value: string) {

    }

    renderMetadata(groupId: string) {
        let metadata: Array<JSX.Element> = [];
        let metadataMap = this.props.metadata.get(groupId);
        if (metadataMap) {
            metadataMap.forEach((mdDoc, mdId) => {
                metadata.push(
                    <div key={mdId} className="linkEditor-metadata-row">
                        <input type="text" value={StrCast(mdDoc.proto!.title)} onChange={e => this.editMetadataTitle(groupId, mdId, e.target.value)}></input>
                        :
                        <input type="text" value={StrCast(mdDoc.proto!.value)} onChange={e => this.editMetadataValue(groupId, mdId, e.target.value)}></input>
                    </div>
                )
            })
        }

        return metadata;

        // let metadataList: Array<JSX.Element> = [];
        // metadata.forEach((mdDoc, mdId) => {
        //     metadataList.push(
        //         <div key={mdId} className="linkEditor-metadata-row">
        //             <input type="text" value={StrCast(mdDoc.proto!.title)} onChange={e => this.editMetadataTitle(groupId, mdId, e.target.value)}></input>:
        //             <input type="text" value={StrCast(mdDoc.proto!.value)} onChange={e => this.editMetadataValue(groupId, mdId, e.target.value)}></input>
        //         </div>
        //     )
        // })
    }

    renderGroups() {
        let groups: Array<JSX.Element> = [];
        this.props.groups.forEach((groupDoc, groupId) => {
            groups.push(this.renderGroup(groupId, groupDoc))
        });
        return groups;
    }

    render() {
        let destination = LinkUtils.findOppositeAnchor(this.props.linkDoc, this.props.sourceDoc);

        return (
            <div className="linkEditor">
                <button className="linkEditor-back" onPointerDown={() => this.props.showLinks()}><FontAwesomeIcon icon="arrow-left" size="sm" /></button>
                <p className="linkEditor-linkedTo">editing link to: <b>{destination.proto!.title}</b></p>
                <div className="linkEditor-groupsLabel">
                    <b>Groups:</b>
                    <button onClick={this.addGroup} title="Add Group">+</button>
                </div>
                {this.renderGroups()}

            </div>

        );
    }
}