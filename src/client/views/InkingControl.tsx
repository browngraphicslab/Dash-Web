import { observable, action, computed, runInAction } from "mobx";
import { ColorResult } from 'react-color';
import React = require("react");
import { observer } from "mobx-react";
import "./InkingControl.scss";
import { library } from '@fortawesome/fontawesome-svg-core';
import { faPen, faHighlighter, faEraser, faBan } from '@fortawesome/free-solid-svg-icons';
import { SelectionManager } from "../util/SelectionManager";
import { InkTool } from "../../new_fields/InkField";
import { Doc } from "../../new_fields/Doc";
import { undoBatch, UndoManager } from "../util/UndoManager";
import { StrCast, NumCast, Cast } from "../../new_fields/Types";
import { MainOverlayTextBox } from "./MainOverlayTextBox";
import { listSpec } from "../../new_fields/Schema";
import { List } from "../../new_fields/List";
import { Utils } from "../../Utils";

library.add(faPen, faHighlighter, faEraser, faBan);

@observer
export class InkingControl extends React.Component {
    static Instance: InkingControl = new InkingControl({});
    @observable private _selectedTool: InkTool = InkTool.None;
    @observable private _selectedColor: string = "rgb(244, 67, 54)";
    @observable private _selectedWidth: string = "5";
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

    @undoBatch
    switchColor = action((color: ColorResult): void => {
        this._selectedColor = color.hex + (color.rgb.a !== undefined ? this.decimalToHexString(Math.round(color.rgb.a * 255)) : "ff");
        if (InkingControl.Instance.selectedTool === InkTool.None) {
            if (MainOverlayTextBox.Instance.SetColor(color.hex)) return;
            let selected = SelectionManager.SelectedDocuments();
            let oldColors = selected.map(view => {
                let targetDoc = view.props.Document.layout instanceof Doc ? view.props.Document.layout : view.props.Document.isTemplate ? view.props.Document : Doc.GetProto(view.props.Document);
                let oldColor = StrCast(targetDoc.backgroundColor);
                if (view.props.ContainingCollectionView && view.props.ContainingCollectionView.props.Document.colorPalette) {
                    let cp = Cast(view.props.ContainingCollectionView.props.Document.colorPalette, listSpec("string")) as string[];
                    let closest = 0;
                    let dist = 10000000;
                    let ccol = Utils.fromRGBAstr(StrCast(targetDoc.backgroundColor));
                    for (let i = 0; i < cp.length; i++) {
                        let cpcol = Utils.fromRGBAstr(cp[i]);
                        let d = Math.sqrt((ccol.r - cpcol.r) * (ccol.r - cpcol.r) + (ccol.b - cpcol.b) * (ccol.b - cpcol.b) + (ccol.g - cpcol.g) * (ccol.g - cpcol.g));
                        if (d < dist) {
                            dist = d;
                            closest = i;
                        }
                    }
                    cp[closest] = "rgba(" + color.rgb.r + "," + color.rgb.g + "," + color.rgb.b + "," + color.rgb.a + ")";
                    view.props.ContainingCollectionView.props.Document.colorPalette = new List(cp);
                    targetDoc.backgroundColor = cp[closest];
                } else {
                    targetDoc.backgroundColor = this._selectedColor;
                }
                if (view.props.Document.heading) {
                    let cv = view.props.ContainingCollectionView;
                    let ruleProvider = cv && (Cast(cv.props.Document.ruleProvider, Doc) as Doc);
                    let parback = cv && StrCast(cv.props.Document.backgroundColor);
                    cv && parback && ((ruleProvider ? ruleProvider : cv.props.Document)["ruleColor_" + NumCast(view.props.Document.heading)] = Utils.toRGBAstr(color.rgb));
                    // if (parback && cv && parback.indexOf("rgb") !== -1) {
                    //     let parcol = Utils.fromRGBAstr(parback);
                    //     let hsl = Utils.RGBToHSL(parcol.r, parcol.g, parcol.b);
                    //     cv && ((ruleProvider ? ruleProvider : cv.props.Document)["ruleColor_" + NumCast(view.props.Document.heading)] = color.hsl.s - hsl.s);
                    // }
                }
                return {
                    target: targetDoc,
                    previous: oldColor
                };
            });
            let captured = this._selectedColor;
            UndoManager.AddEvent({
                undo: () => oldColors.forEach(pair => pair.target.backgroundColor = pair.previous),
                redo: () => oldColors.forEach(pair => pair.target.backgroundColor = captured)
            });
        }
    });
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

    @action
    updateSelectedColor(value: string) {
        this._selectedColor = value;
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