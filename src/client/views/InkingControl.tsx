import { action, computed, observable } from "mobx";
import { ColorState } from 'react-color';
import { Doc } from "../../new_fields/Doc";
import { InkTool } from "../../new_fields/InkField";
import { List } from "../../new_fields/List";
import { listSpec } from "../../new_fields/Schema";
import { Cast, NumCast, StrCast, FieldValue } from "../../new_fields/Types";
import { Utils } from "../../Utils";
import { Scripting } from "../util/Scripting";
import { SelectionManager } from "../util/SelectionManager";
import { undoBatch, UndoManager } from "../util/UndoManager";
import { CurrentUserUtils } from "../../server/authentication/models/current_user_utils";
import GestureOverlay from "./GestureOverlay";

export class InkingControl {
    @observable static Instance: InkingControl;
    @computed private get _selectedTool(): InkTool { return FieldValue(NumCast(CurrentUserUtils.UserDocument.inkTool)) ?? InkTool.None; }
    @computed private get _selectedColor(): string { return GestureOverlay.Instance.Color ?? FieldValue(StrCast(CurrentUserUtils.UserDocument.inkColor)) ?? "rgb(244, 67, 54)"; }
    @computed private get _selectedWidth(): string { return GestureOverlay.Instance.Width?.toString() ?? FieldValue(StrCast(CurrentUserUtils.UserDocument.inkWidth)) ?? "5"; }
    @observable public _open: boolean = false;

    constructor() {
        InkingControl.Instance = this;
    }

    switchTool = action((tool: InkTool): void => {
        // this._selectedTool = tool;
        CurrentUserUtils.UserDocument.inkTool = tool;
    });
    decimalToHexString(number: number) {
        if (number < 0) {
            number = 0xFFFFFFFF + number + 1;
        }

        return number.toString(16).toUpperCase();
    }

    @undoBatch
    switchColor = action((color: ColorState): void => {
        CurrentUserUtils.UserDocument.inkColor = color.hex + (color.rgb.a !== undefined ? this.decimalToHexString(Math.round(color.rgb.a * 255)) : "ff");

        if (InkingControl.Instance.selectedTool === InkTool.None) {
            const selected = SelectionManager.SelectedDocuments();
            const oldColors = selected.map(view => {
                const targetDoc = view.props.Document.dragFactory instanceof Doc ? view.props.Document.dragFactory :
                    view.props.Document.layout instanceof Doc ? view.props.Document.layout :
                        view.props.Document.isTemplateForField ? view.props.Document : Doc.GetProto(view.props.Document);
                const sel = window.getSelection();
                if (StrCast(targetDoc.layout).indexOf("FormattedTextBox") !== -1 && (!sel || sel.toString() !== "")) {
                    targetDoc.color = this._selectedColor;
                    return {
                        target: targetDoc,
                        previous: StrCast(targetDoc.color)
                    };
                }
                const oldColor = StrCast(targetDoc.backgroundColor);
                let matchedColor = this._selectedColor;
                const cvd = view.props.ContainingCollectionDoc;
                let ruleProvider = view.props.ruleProvider;
                if (cvd) {
                    if (!cvd.colorPalette) {
                        const defaultPalette = ["rg(114,229,239)", "rgb(255,246,209)", "rgb(255,188,156)", "rgb(247,220,96)", "rgb(122,176,238)",
                            "rgb(209,150,226)", "rgb(127,235,144)", "rgb(252,188,189)", "rgb(247,175,81)",];
                        const colorPalette = Cast(cvd.colorPalette, listSpec("string"));
                        if (!colorPalette) cvd.colorPalette = new List<string>(defaultPalette);
                    }
                    const cp = Cast(cvd.colorPalette, listSpec("string")) as string[];
                    let closest = 0;
                    let dist = 10000000;
                    const ccol = Utils.fromRGBAstr(StrCast(targetDoc.backgroundColor));
                    for (let i = 0; i < cp.length; i++) {
                        const cpcol = Utils.fromRGBAstr(cp[i]);
                        const d = Math.sqrt((ccol.r - cpcol.r) * (ccol.r - cpcol.r) + (ccol.b - cpcol.b) * (ccol.b - cpcol.b) + (ccol.g - cpcol.g) * (ccol.g - cpcol.g));
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
                (!ruleProvider && targetDoc) && (Doc.Layout(view.props.Document).backgroundColor = matchedColor);

                return {
                    target: targetDoc,
                    previous: oldColor
                };
            });
            //let captured = this._selectedColor;
            // UndoManager.AddEvent({
            //     undo: () => oldColors.forEach(pair => pair.target.backgroundColor = pair.previous),
            //     redo: () => oldColors.forEach(pair => pair.target.backgroundColor = captured)
            // });
        } else {
            CurrentUserUtils.ActivePen && (CurrentUserUtils.ActivePen.backgroundColor = this._selectedColor);
        }
    });
    @action
    switchWidth = (width: string): void => {
        // this._selectedWidth = width;
        CurrentUserUtils.UserDocument.inkWidth = width;
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
        // this._selectedColor = value;
        CurrentUserUtils.UserDocument.inkColor = value;
    }

    @computed
    get selectedWidth() {
        return this._selectedWidth;
    }

}
Scripting.addGlobal(function activatePen(pen: any, width: any, color: any) { InkingControl.Instance.switchTool(pen ? InkTool.Pen : InkTool.None); InkingControl.Instance.switchWidth(width); InkingControl.Instance.updateSelectedColor(color); });
Scripting.addGlobal(function activateBrush(pen: any, width: any, color: any) { InkingControl.Instance.switchTool(pen ? InkTool.Highlighter : InkTool.None); InkingControl.Instance.switchWidth(width); InkingControl.Instance.updateSelectedColor(color); });
Scripting.addGlobal(function activateEraser(pen: any) { return InkingControl.Instance.switchTool(pen ? InkTool.Eraser : InkTool.None); });
Scripting.addGlobal(function activateScrubber(pen: any) { return InkingControl.Instance.switchTool(pen ? InkTool.Scrubber : InkTool.None); });
Scripting.addGlobal(function activateStamp(pen: any) { return InkingControl.Instance.switchTool(pen ? InkTool.Stamp : InkTool.None); });
Scripting.addGlobal(function deactivateInk() { return InkingControl.Instance.switchTool(InkTool.None); });
Scripting.addGlobal(function setInkWidth(width: any) { return InkingControl.Instance.switchWidth(width); });
Scripting.addGlobal(function setInkColor(color: any) { return InkingControl.Instance.updateSelectedColor(color); });