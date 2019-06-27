import { observable, action, computed } from "mobx";
import { ColorResult } from 'react-color';
import React = require("react");
import { observer } from "mobx-react";
import "./InkingControl.scss";
import { library } from '@fortawesome/fontawesome-svg-core';
import { faPen, faHighlighter, faEraser, faBan } from '@fortawesome/free-solid-svg-icons';
import { SelectionManager } from "../util/SelectionManager";
import { InkTool } from "../../new_fields/InkField";
import { Doc } from "../../new_fields/Doc";

library.add(faPen, faHighlighter, faEraser, faBan);

@observer
export class InkingControl extends React.Component {
    static Instance: InkingControl = new InkingControl({});
    @observable private _selectedTool: InkTool = InkTool.None;
    @observable private _selectedColor: string = "rgb(244, 67, 54)";
    @observable private _selectedWidth: string = "25";
    @observable public _open: boolean = false;

    constructor(props: Readonly<{}>) {
        super(props);
        InkingControl.Instance = this;
    }

    @action
    switchTool = (tool: InkTool): void => {
        this._selectedTool = tool;
    }
    decimalToHexString(number: number) {
        if (number < 0) {
            number = 0xFFFFFFFF + number + 1;
        }

        return number.toString(16).toUpperCase();
    }

    @action
    switchColor = (color: ColorResult): void => {
        this._selectedColor = color.hex + (color.rgb.a !== undefined ? this.decimalToHexString(Math.round(color.rgb.a * 255)) : "ff");
        if (InkingControl.Instance.selectedTool === InkTool.None) SelectionManager.SelectedDocuments().forEach(doc => (doc.props.Document.isTemplate ? doc.props.Document : Doc.GetProto(doc.props.Document)).backgroundColor = this._selectedColor);
    }

    @action
    switchWidth = (width: string): void => {
        this._selectedWidth = width;
    }

    @computed
    get selectedTool() {
        return this._selectedTool;
    }

    @computed
    get selectedColor() {
        return this._selectedColor;
    }

    @computed
    get selectedWidth() {
        return this._selectedWidth;
    }

    @action
    toggleDisplay = () => {
        this._open = !this._open;
        this.switchTool(this._open ? InkTool.Pen : InkTool.None);
    }
    render() {
        return (
            <ul className="inking-control" style={this._open ? { display: "flex" } : { display: "none" }}>
                <li className="ink-size ink-panel">
                    <label htmlFor="stroke-width">SIZE: </label>
                    <input type="text" min="1" max="100" value={this._selectedWidth} name="stroke-width"
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => this.switchWidth(e.target.value)} />
                    <input type="range" min="1" max="100" value={this._selectedWidth} name="stroke-width"
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => this.switchWidth(e.target.value)} />
                </li>
            </ul >
        );
    }
}