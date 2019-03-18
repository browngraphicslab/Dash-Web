import { observable, action, computed } from "mobx";

import { CirclePicker, ColorResult } from 'react-color'
import React = require("react");
import "./InkingCanvas.scss"
import { InkTool } from "../../fields/InkField";
import { observer } from "mobx-react";
import "./InkingCanvas.scss"
import { library } from '@fortawesome/fontawesome-svg-core';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPen, faHighlighter, faEraser, faBan } from '@fortawesome/free-solid-svg-icons';
import { SelectionManager } from "../util/SelectionManager";
import { KeyStore } from "../../fields/KeyStore";

library.add(faPen, faHighlighter, faEraser, faBan);

@observer
export class InkingControl extends React.Component {
    static Instance: InkingControl = new InkingControl({});
    @observable private _selectedTool: InkTool = InkTool.None;
    @observable private _selectedColor: string = "rgb(244, 67, 54)";
    @observable private _selectedWidth: string = "25";
    @observable private _open: boolean = false;
    @observable private _colorPickerDisplay: boolean = false;

    constructor(props: Readonly<{}>) {
        super(props);
        InkingControl.Instance = this
    }

    @action
    switchTool = (tool: InkTool): void => {
        this._selectedTool = tool;
    }

    @action
    switchColor = (color: ColorResult): void => {
        this._selectedColor = color.hex;
        if (SelectionManager.SelectedDocuments().length == 1) {
            var sdoc = SelectionManager.SelectedDocuments()[0];
            if (sdoc.props.ContainingCollectionView && sdoc.props.ContainingCollectionView) {
                sdoc.props.Document.SetText(KeyStore.BackgroundColor, color.hex);
            }
        }
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

    selected = (tool: InkTool) => {
        if (this._selectedTool === tool) {
            return { color: "#61aaa3" }
        }
        return {}
    }

    @action
    toggleDisplay = () => {
        this._open = !this._open;
    }

    @action
    toggleColorPicker = () => {
        this._colorPickerDisplay = !this._colorPickerDisplay;
    }

    render() {
        return (
            <ul className="inking-control" style={this._open ? { display: "flex" } : { display: "none" }}>
                <li className="ink-tools ink-panel">
                    <div className="ink-tool-buttons">
                        <button onClick={() => this.switchTool(InkTool.Pen)} style={this.selected(InkTool.Pen)}><FontAwesomeIcon icon="pen" size="lg" title="Pen" /></button>
                        <button onClick={() => this.switchTool(InkTool.Highlighter)} style={this.selected(InkTool.Highlighter)}><FontAwesomeIcon icon="highlighter" size="lg" title="Highlighter" /></button>
                        <button onClick={() => this.switchTool(InkTool.Eraser)} style={this.selected(InkTool.Eraser)}><FontAwesomeIcon icon="eraser" size="lg" title="Eraser" /></button>
                        <button onClick={() => this.switchTool(InkTool.None)} style={this.selected(InkTool.None)}><FontAwesomeIcon icon="ban" size="lg" title="Pointer" /></button>
                    </div>
                </li>
                <li className="ink-color ink-panel">
                    <label>COLOR: </label>
                    <div className="ink-color-display" style={{ backgroundColor: this._selectedColor }}
                        onClick={() => this.toggleColorPicker()}>
                        {/* {this._colorPickerDisplay ? <span>&#9660;</span> : <span>&#9650;</span>} */}
                    </div>
                    <div className="ink-color-picker" style={this._colorPickerDisplay ? { display: "block" } : { display: "none" }}>
                        <CirclePicker onChange={this.switchColor} circleSize={22} width={"220"} />
                    </div>
                </li>
                <li className="ink-size ink-panel">
                    <label htmlFor="stroke-width">SIZE: </label>
                    <input type="text" min="1" max="100" value={this._selectedWidth} name="stroke-width"
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => this.switchWidth(e.target.value)} />
                    <input type="range" min="1" max="100" value={this._selectedWidth} name="stroke-width"
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => this.switchWidth(e.target.value)} />
                </li>
            </ul >
        )
    }
}