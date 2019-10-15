import { action, computed, observable } from "mobx";
import { ColorResult } from 'react-color';
import { Doc } from "../../new_fields/Doc";
import { InkTool } from "../../new_fields/InkField";
import { List } from "../../new_fields/List";
import { listSpec } from "../../new_fields/Schema";
import { Cast, NumCast, StrCast } from "../../new_fields/Types";
import { Utils } from "../../Utils";
import { Scripting } from "../util/Scripting";
import { SelectionManager } from "../util/SelectionManager";
import { undoBatch, UndoManager } from "../util/UndoManager";


export class InkingControl {
    @observable static Instance: InkingControl;
    @observable private _selectedTool: InkTool = InkTool.None;
    @observable private _selectedColor: string = "rgb(244, 67, 54)";
    @observable private _selectedWidth: string = "5";
    @observable public _open: boolean = false;

    constructor() {
        InkingControl.Instance = this;
    }

    switchTool = action((tool: InkTool): void => {
        this._selectedTool = tool;
    })
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
            let selected = SelectionManager.SelectedDocuments();
            let oldColors = selected.map(view => {
                let targetDoc = view.props.Document.layout instanceof Doc ? view.props.Document.layout : view.props.Document.isTemplate ? view.props.Document : Doc.GetProto(view.props.Document);
                let sel = window.getSelection();
                if (StrCast(targetDoc.layout).indexOf("FormattedTextBox") !== -1 && (!sel || sel.toString() !== "")) {
                    targetDoc.color = this._selectedColor;
                    return {
                        target: targetDoc,
                        previous: StrCast(targetDoc.color)
                    };
                }
                let oldColor = StrCast(targetDoc.backgroundColor);
                let matchedColor = this._selectedColor;
                const cvd = view.props.ContainingCollectionDoc;
                let ruleProvider = view.props.ruleProvider;
                if (cvd) {
                    if (!cvd.colorPalette) {
                        let defaultPalette = ["rg(114,229,239)", "rgb(255,246,209)", "rgb(255,188,156)", "rgb(247,220,96)", "rgb(122,176,238)",
                            "rgb(209,150,226)", "rgb(127,235,144)", "rgb(252,188,189)", "rgb(247,175,81)",];
                        let colorPalette = Cast(cvd.colorPalette, listSpec("string"));
                        if (!colorPalette) cvd.colorPalette = new List<string>(defaultPalette);
                    }
                    let cp = Cast(cvd.colorPalette, listSpec("string")) as string[];
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
                    cvd.colorPalette = new List(cp);
                    matchedColor = cp[closest];
                    ruleProvider = (view.props.Document.heading && ruleProvider) ? ruleProvider : undefined;
                    ruleProvider && ((Doc.GetProto(ruleProvider)["ruleColor_" + NumCast(view.props.Document.heading)] = Utils.toRGBAstr(color.rgb)));
                }
                !ruleProvider && (targetDoc.backgroundColor = matchedColor);

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

}
Scripting.addGlobal(function activatePen() { return InkingControl.Instance.switchTool(InkTool.Pen); });
Scripting.addGlobal(function activateBrush() { return InkingControl.Instance.switchTool(InkTool.Highlighter); });
Scripting.addGlobal(function activateEraser() { return InkingControl.Instance.switchTool(InkTool.Eraser); });
Scripting.addGlobal(function deactivateInk() { return InkingControl.Instance.switchTool(InkTool.None); });
Scripting.addGlobal(function setInkWidth(width: any) { return InkingControl.Instance.switchWidth(width); });
Scripting.addGlobal(function setInkColor(color: any) { return InkingControl.Instance.updateSelectedColor(color); });