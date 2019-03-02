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


@observer
export class LinkMenu extends React.Component {
    static Instance: LinkMenu
    @observable private _docView: DocumentView;
    @observable private _hidden = true;

    constructor(docView: DocumentView) {
        super(docView);
        this._docView = docView;
        LinkMenu.Instance = this;
    }

    @computed
    public get Hidden() { return this._hidden; }
    public set Hidden(value: boolean) { this._hidden = value; }

    render() {
        if (this.Hidden) {
            return (null);
        }

        return (
            <div id="menu-container">
                <input id="search-bar" type="text" placeholder="Search..."></input>
                <div id="link-list">

                </div>

            </div>
        )
    }

}