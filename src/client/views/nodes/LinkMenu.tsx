import { observable, computed, action } from "mobx";
import React = require("react");
import { SelectionManager } from "../../util/SelectionManager";
import { observer } from "mobx-react";
import './LinkMenu.scss'
import { KeyStore } from '../../../fields/KeyStore'
import { NumberField } from "../../../fields/NumberField";
import { props } from "bluebird";
import { DragManager } from "../../util/DragManager";
import { DocumentView } from "./DocumentView";
import { Document } from "../../../fields/Document";

interface Props {
    docView: DocumentView | undefined;
}

@observer
export class LinkMenu extends React.Component<Props> {
    // @observable private _hidden = true;

    // @computed
    // public get Hidden() { return this._hidden; }
    // public set Hidden(value: boolean) { this._hidden = value; }

    render() {
        // if (this.Hidden) {
        //     return (null);
        // }

        return (
            <div id="menu-container">
                <input id="search-bar" type="text" placeholder="Search..."></input>
                <div id="link-list">

                </div>

            </div>
        )
    }

}