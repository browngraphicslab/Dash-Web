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
import { EditableView } from "../EditableView";

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

    @action
    clearGroup = (): void => {
        this._searchTerm = "";
        this._groupType = "";
        this.props.removeGroupFromLink();
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
                        <button className="linkEditor-button" onClick={() => this.clearGroup()} title="Clear relationship from link"><FontAwesomeIcon icon="times" size="sm" /></button>
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
    mdDoc: Doc;
    mdKey: string;
    mdValue: string;
    allMdKeys: string[];
    changeMdKeyId: (id: string, newKey: string) => void;
    deleteMdId: (id: string) => void;
}

@observer
class LinkMetadataEditor extends React.Component<LinkMetadataEditorProps> {
    @observable private _key: string = this.props.mdKey;
    @observable private _value: string = this.props.mdValue;
    @observable private _keyError: boolean = false;

    @action
    setMetadataKey = (newKey: string): boolean => {
        let newIndex = this.props.allMdKeys.findIndex(key => key.toUpperCase() === newKey.toUpperCase());
        if (newIndex > -1 || newKey === "") {
            this._keyError = true;
            return false;
        } else {
            this._keyError = false;
        }

        let currIndex = this.props.allMdKeys.findIndex(key => key.toUpperCase() === this._key.toUpperCase());
        if (currIndex === -1) console.error("LinkMetadataEditor: key was not found -", this._key);

        let val = this.props.mdDoc[this._key];
        this.props.mdDoc[this._key] = undefined;
        this.props.mdDoc[newKey] = val;

        this.props.changeMdKeyId(this.props.id, newKey);
        this._key = newKey;

        let newKeys = this.props.allMdKeys;
        newKeys[currIndex] = newKey;
        LinkManager.Instance.setMetadataKeysForGroup(this.props.groupType, newKeys);

        return true;
    }

    @action
    setMetadataValue = (newValue: string): boolean => {
        if (this._keyError) return false;
        this._value = newValue;
        this.props.mdDoc[this._key] = newValue;
        return true;
    }

    deleteMetadataRow = (): void => {
        UndoManager.RunInBatch(() => {
            let currIndex = this.props.allMdKeys.findIndex(key => key.toUpperCase() === this._key.toUpperCase());
            if (currIndex === -1) console.error("LinkMetadataEditor: key was not found -", this._key);

            this.props.mdDoc[this._key] = undefined;
            this.props.deleteMdId(this.props.id);

            let newKeys = this.props.allMdKeys;
            newKeys.splice(currIndex, 1);
            LinkManager.Instance.setMetadataKeysForGroup(this.props.groupType, newKeys);
        }, "delete metadata row on link relationship");
    }

    render() {
        return (
            <div className="linkEditor-metadataRow">
                <div className={this._keyError ? "linkEditor-metadata-key key-error" : this._key === "new key" ? "linkEditor-metadata-key placeholder" : "linkEditor-metadata-key"} >
                    <button className="linkEditor-metadataButton" onClick={() => this.deleteMetadataRow()} title="Delete metadata row"><FontAwesomeIcon icon="times" size="sm" /></button>
                    <EditableView
                        contents={this._key === "new key" ? "key" : this._key}
                        display={"block"}
                        height={20}
                        GetValue={() => this._key === "new key" ? "" : this._key}
                        SetValue={this.setMetadataKey}
                    />
                </div>
                <div className={this._value === "" ? "linkEditor-metadata-value placeholder" : "linkEditor-metadata-value"} >
                    <EditableView
                        contents={this._value === "" ? "value" : this._value}
                        display={"block"}
                        height={20}
                        GetValue={() => this._value === "" ? "" : this._value}
                        SetValue={this.setMetadataValue}
                    />
                </div>
            </div >
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
    @observable private _metadata: Map<string, string> = new Map();

    constructor(props: LinkEditorProps) {
        super(props);

        let groupDoc = LinkManager.Instance.getAnchorGroupDoc(props.linkDoc, props.sourceDoc);
        if (groupDoc) {
            let groupType = StrCast(groupDoc.type);
            let groupMdKeys = LinkManager.Instance.getMetadataKeysInGroup(groupType);
            groupMdKeys.forEach(key => {
                this._metadata.set(Utils.GenerateGuid(), key);
            });
        }
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
        let linkDocProto = Doc.GetProto(this.props.linkDoc);
        switch (this._direction) {
            case LinkDirection.Bi: {
                let destDoc = LinkManager.Instance.getOppositeAnchor(this.props.linkDoc, this.props.sourceDoc);
                let sourceGroupDoc = LinkManager.Instance.getAnchorGroupDoc(this.props.linkDoc, this.props.sourceDoc);
                let sourceMdDoc = Cast(sourceGroupDoc!.metadata, Doc, new Doc);
                if (!destDoc || !sourceGroupDoc) break;

                linkDocProto.direction = LinkDirection.Uni;
                sourceMdDoc.direction = "one-way";
                sourceMdDoc.anchor1 = this.props.sourceDoc.title;
                sourceMdDoc.anchor2 = destDoc.title;

                let newGroup = new Doc();
                newGroup.type = sourceGroupDoc.type;
                let newMd = Doc.MakeCopy(sourceMdDoc);
                newMd.anchor1 = destDoc.title;
                newMd.anchor2 = this.props.sourceDoc.title;
                newGroup.metadata = newMd;

                LinkManager.Instance.setAnchorGroupDoc(this.props.linkDoc, destDoc, newGroup);
                this._direction = LinkDirection.Uni;
                break;
            }
            case LinkDirection.Uni: {
                let destDoc = LinkManager.Instance.getOppositeAnchor(this.props.linkDoc, this.props.sourceDoc);
                let sourceGroupDoc = LinkManager.Instance.getAnchorGroupDoc(this.props.linkDoc, this.props.sourceDoc);
                if (!destDoc || !sourceGroupDoc) break;

                linkDocProto.direction = LinkDirection.Bi;
                Cast(sourceGroupDoc.metadata, Doc, new Doc).direction = "shared";
                LinkManager.Instance.setAnchorGroupDoc(this.props.linkDoc, destDoc, sourceGroupDoc);
                this._direction = LinkDirection.Bi;
                break;
            }
        }
    }

    @action
    setGroupType = (groupType: string): void => {
        UndoManager.RunInBatch(() => {
            let groupDoc = LinkManager.Instance.getAnchorGroupDoc(this.props.linkDoc, this.props.sourceDoc);
            if (groupDoc) {
                groupDoc.type = groupType;

                let groupMdKeys = LinkManager.Instance.getMetadataKeysInGroup(groupType);
                groupMdKeys.forEach(key => {
                    this._metadata.set(Utils.GenerateGuid(), key);
                });

                let destDoc = LinkManager.Instance.getOppositeAnchor(this.props.linkDoc, this.props.sourceDoc);
                let linkDocProto = Doc.GetProto(this.props.linkDoc);
                linkDocProto.title = groupType + " link: " + StrCast(this.props.sourceDoc.title) + ", " + (destDoc ? StrCast(destDoc.title) : "");
            }
        }, "set relationship type of link");
    }

    @action
    removeGroupFromLink = (): void => {
        UndoManager.RunInBatch(() => {
            let linkDocProto = Doc.GetProto(this.props.linkDoc);
            let destDoc = LinkManager.Instance.getOppositeAnchor(this.props.linkDoc, this.props.sourceDoc);

            let newGroup = new Doc();
            let newMd = new Doc();
            newMd.anchor1 = this.props.sourceDoc.title;
            newMd.anchor2 = destDoc!.title;
            newMd.direction = "one-way";
            newGroup.metadata = newMd;
            newGroup.type = "";

            LinkManager.Instance.setAnchorGroupDoc(this.props.linkDoc, this.props.sourceDoc, newGroup);
            if (NumCast(linkDocProto.direction) === LinkDirection.Bi && destDoc) {
                let newDestGroup = new Doc();
                newDestGroup.type = "";
                newDestGroup.metadata = Doc.MakeCopy(newMd);
                LinkManager.Instance.setAnchorGroupDoc(this.props.linkDoc, destDoc, newDestGroup);

                linkDocProto.direction = LinkDirection.Uni;
                this._direction = LinkDirection.Uni;
            }

            this._metadata = new Map();
            linkDocProto.title = "link: " + StrCast(this.props.sourceDoc.title) + ", " + (destDoc ? StrCast(destDoc.title) : "");
        }, "remove relationship from link");
    }

    @action
    addMetadata = (): void => {
        UndoManager.RunInBatch(() => {
            let groupDoc = LinkManager.Instance.getAnchorGroupDoc(this.props.linkDoc, this.props.sourceDoc);
            let groupType = StrCast(groupDoc!.type);
            this._metadata.set(Utils.GenerateGuid(), "new key");

            // only add "new key" if there is no other key with value "new key"; prevents spamming
            let mdKeys = LinkManager.Instance.getMetadataKeysInGroup(groupType);
            if (mdKeys.indexOf("new key") === -1) mdKeys.push("new key");
            LinkManager.Instance.setMetadataKeysForGroup(groupType, mdKeys);
        }, "add metadata key to link relationship");
    }


    @action
    changeMdKeyId = (id: string, newKey: string): void => {
        let kvp = this._metadata.get(id);
        if (kvp) {
            this._metadata.set(id, newKey);
        }
    }

    @action
    deleteMdId = (id: string): void => {
        this._metadata.delete(id);
    }

    renderMetadataRows = (): JSX.Element[] => {
        let groupDoc = LinkManager.Instance.getAnchorGroupDoc(this.props.linkDoc, this.props.sourceDoc);
        let groupType = StrCast(groupDoc!.type);
        let mdDoc = Cast(groupDoc!.metadata, Doc, new Doc);
        let allMdKeys = Array.from(this._metadata.values());
        let metadataRows: Array<JSX.Element> = [];
        this._metadata.forEach((key, id) => {
            metadataRows.push(
                <LinkMetadataEditor key={id} id={id} groupType={groupType} mdDoc={mdDoc} mdKey={key} mdValue={StrCast(mdDoc[key])} allMdKeys={allMdKeys}
                    changeMdKeyId={this.changeMdKeyId} deleteMdId={this.deleteMdId} />
            );
        });

        return metadataRows;
    }

    render() {
        let destination = LinkManager.Instance.getOppositeAnchor(this.props.linkDoc, this.props.sourceDoc);
        if (!destination) return <></>;

        let groupType = StrCast(LinkManager.Instance.getAnchorGroupDoc(this.props.linkDoc, this.props.sourceDoc)!.type);

        return (
            <div className="linkEditor">
                <button className="linkEditor-back" onPointerDown={() => this.props.showLinks()}><FontAwesomeIcon icon="arrow-left" size="sm" /></button>
                <div className="linkEditor-info">
                    <p className="linkEditor-linkedTo">Editing link to: <b>{destination.proto!.title}</b></p>
                    <button className="linkEditor-button" onPointerDown={() => this.deleteLink()} title="Delete link"><FontAwesomeIcon icon="trash" size="sm" /></button>
                </div>
                <div className="linkEditor-group">
                    <div className="linkEditor-group-row linkEditor-direction">
                        <p>Direction: </p>
                        <button className="linkEditor-directionButton" onClick={() => this.toggleDirection()} title="Toggle direction of link">{this._direction === LinkDirection.Uni ? "one-way" : "shared"}</button>
                    </div>
                    <div className="linkEditor-group-row">
                        <p>Relationship:</p>
                        <GroupTypesDropdown groupType={groupType} setGroupType={this.setGroupType} removeGroupFromLink={this.removeGroupFromLink} />
                    </div>
                    {this.renderMetadataRows().length > 0 ?
                        <div className="linkEditor-group-row">
                            <div className="linkEditor-group-row-label"><p>Metadata:</p></div>
                            <div className="linkEditor-metadataTable">
                                <div className="linkEditor-metadataRow linkEditor-metadata-header">
                                    <p className="linkEditor-metadata-key">Key</p><p className="linkEditor-metadata-value">Value</p>
                                </div>
                                {this.renderMetadataRows()}
                            </div>
                        </div>
                        : <></>}
                    {groupType === "" ?
                        <button className="linkEditor-button linkEditor-addKvp" disabled={true} title="Add KVP"><FontAwesomeIcon icon="plus" size="sm" /></button> :
                        <button className="linkEditor-button linkEditor-addKvp" onClick={() => this.addMetadata()} title="Add KVP"><FontAwesomeIcon icon="plus" size="sm" /></button>
                    }
                </div>
            </div >

        );
    }
}