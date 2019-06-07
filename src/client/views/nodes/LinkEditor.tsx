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
import { LinkManager } from "../../util/LinkManager";

interface Props {
    sourceDoc: Doc;
    linkDoc: Doc;
    groups: Map<number, Doc>;
    showLinks: () => void;
}

@observer
export class LinkEditor extends React.Component<Props> {

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
    editGroup(groupId: number, value: string) {
        let linkDoc = this.props.linkDoc.proto ? this.props.linkDoc.proto : this.props.linkDoc;
        let groupDoc = this.props.groups.get(groupId);
        if (groupDoc) {
            groupDoc.proto!.type = value;
            if (Doc.AreProtosEqual(this.props.sourceDoc, Cast(linkDoc.anchor1, Doc, new Doc))) {
                // let groups = Cast(linkDoc.anchor1Groups, listSpec(Doc), []);
                // groups.push(groupDoc);
                linkDoc.anchor1Groups = new List<Doc>([groupDoc]);

            } else {
                linkDoc.anchor2Groups = new List<Doc>([groupDoc]);
            }
        }

    }

    renderGroup(groupId: number, groupDoc: Doc) {
        return (
            <div>
                <p>type:</p>
                <input type="text" value={StrCast(groupDoc.proto!.type)} onChange={e => this.editGroup(groupId, e.target.value)}></input>
            </div>
        )
    }

    renderGroups() {
        let groups: Array<JSX.Element> = [];
        this.props.groups.forEach((groupDoc, groupId) => {
            groups.push(
                <div>
                    {this.renderGroup(groupId, groupDoc)}
                </div>
            )
        });
        return groups;
    }

    onSaveButtonPressed = (e: React.PointerEvent): void => {
        e.stopPropagation();

        // let linkDoc = this.props.linkDoc.proto ? this.props.linkDoc.proto : this.props.linkDoc;
        // // linkDoc.title = this._title;
        // // linkDoc.linkDescription = this._description;

        this.props.showLinks();
    }

    render() {
        let destination = LinkManager.Instance.findOppositeAnchor(this.props.linkDoc, this.props.sourceDoc);

        return (
            <div className="edit-container">
                <p>linked to: {destination.proto!.title}</p>
                <b>Groups:</b>
                {this.renderGroups()}

                {/* <input onChange={this.onTitleChanged} className="name-input" type="text" value={this._title} placeholder="Name . . ."></input>
                <textarea onChange={this.onDescriptionChanged} className="description-input" value={this._description} placeholder="Description . . ."></textarea> */}
                {/* {this.renderTags()}
                <button onClick={this.addTag}>+</button> */}
                <div className="save-button" onPointerDown={this.onSaveButtonPressed}>SAVE</div>
            </div>

        );
    }
}