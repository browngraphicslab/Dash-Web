import { observable, computed, action } from "mobx";
import React = require("react");
import { SelectionManager } from "../../util/SelectionManager";
import { observer } from "mobx-react";
import './LinkEditor.scss';
import { props } from "bluebird";
import { DocumentView } from "./DocumentView";
import { link } from "fs";
import { StrCast } from "../../../new_fields/Types";
import { Doc } from "../../../new_fields/Doc";

interface Props {
    linkDoc: Doc;
    showLinks: () => void;
}

@observer
export class LinkEditor extends React.Component<Props> {

    @observable private _nameInput: string = StrCast(this.props.linkDoc.title);
    @observable private _descriptionInput: string = StrCast(this.props.linkDoc.linkDescription);


    onSaveButtonPressed = (e: React.PointerEvent): void => {
        e.stopPropagation();

        this.props.linkDoc.title = this._nameInput;
        this.props.linkDoc.linkDescription = this._descriptionInput;

        this.props.showLinks();
    }



    render() {

        return (
            <div className="edit-container">
                <input onChange={this.onNameChanged} className="name-input" type="text" value={this._nameInput} placeholder="Name . . ."></input>
                <textarea onChange={this.onDescriptionChanged} className="description-input" value={this._descriptionInput} placeholder="Description . . ."></textarea>
                <div className="save-button" onPointerDown={this.onSaveButtonPressed}>SAVE</div>
            </div>

        );
    }

    @action
    onNameChanged = (e: React.ChangeEvent<HTMLInputElement>) => {
        this._nameInput = e.target.value;
    }

    @action
    onDescriptionChanged = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        this._descriptionInput = e.target.value;
    }
}