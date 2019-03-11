import { observable, computed, action } from "mobx";
import React = require("react");
import { SelectionManager } from "../../util/SelectionManager";
import { observer } from "mobx-react";
import './LinkBox.scss'
import { KeyStore } from '../../../fields/KeyStore'
import { props } from "bluebird";
import { DocumentView } from "./DocumentView";
import { Document } from "../../../fields/Document";
import { ListField } from "../../../fields/ListField";
import { DocumentManager } from "../../util/DocumentManager";
import { LinkBox } from "./LinkBox";

interface Props {
    linkBox: LinkBox;
    linkDoc: Document;
}

@observer
export class LinkEditor extends React.Component<Props> {

    onSaveButtonPressed = (e: React.PointerEvent): void => {
        console.log("view down");
        e.stopPropagation();

    }

    render() {

        return (
            <div className="edit-container">
                <input className="name-input" type="text" placeholder="Name..."></input>
                <input className="description-input" type="text" placeholder="Description"></input>
                <div className="save-button"></div>
            </div>

        )
    }
}