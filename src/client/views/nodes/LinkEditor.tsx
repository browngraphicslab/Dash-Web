import { observable, computed, action } from "mobx";
import React = require("react");
import { SelectionManager } from "../../util/SelectionManager";
import { observer } from "mobx-react";
import './LinkEditor.scss';
import { KeyStore } from '../../../fields/KeyStore';
import { props } from "bluebird";
import { DocumentView } from "./DocumentView";
import { Document } from "../../../fields/Document";
import { TextField } from "../../../fields/TextField";
import { link } from "fs";

interface Props {
    linkDoc: Document;
    showLinks: () => void;
}

@observer
export class LinkEditor extends React.Component<Props> {

    @observable private _nameInput: string = this.props.linkDoc.GetText(KeyStore.Title, "");
    @observable private _descriptionInput: string = this.props.linkDoc.GetText(KeyStore.LinkDescription, "");


    onSaveButtonPressed = (e: React.PointerEvent): void => {
        console.log("view down");
        e.stopPropagation();

        this.props.linkDoc.SetData(KeyStore.Title, this._nameInput, TextField);
        this.props.linkDoc.SetData(KeyStore.LinkDescription, this._descriptionInput, TextField);

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