import { action, computed, observable } from "mobx";
import { ColorState } from 'react-color';
import { Doc } from "../../fields/Doc";
import { InkTool } from "../../fields/InkField";
import { FieldValue, NumCast, StrCast } from "../../fields/Types";
import { CurrentUserUtils } from "../util/CurrentUserUtils";
import { Scripting } from "../util/Scripting";
import { SelectionManager } from "../util/SelectionManager";
import { undoBatch } from "../util/UndoManager";
import GestureOverlay from "./GestureOverlay";
import { FormattedTextBox } from "./nodes/formattedText/FormattedTextBox";

export class InkingControl {
    @observable static Instance: InkingControl;
    @computed private get _selectedTool(): InkTool { return FieldValue(NumCast(Doc.UserDoc().inkTool)) ?? InkTool.None; }
    @computed private get _selectedColor(): string { return CurrentUserUtils.ActivePen ? FieldValue(StrCast(CurrentUserUtils.ActivePen.backgroundColor)) ?? "rgb(0, 0, 0)" : "rgb(0, 0, 0)"; }
    @computed private get _selectedWidth(): string { return FieldValue(StrCast(Doc.UserDoc().inkWidth)) ?? "2"; }
    @observable public _open: boolean = false;

    constructor() {
        InkingControl.Instance = this;
    }

    switchTool = action((tool: InkTool): void => {
        // this._selectedTool = tool;
        Doc.UserDoc().inkTool = tool;
    });
    decimalToHexString(number: number) {
        if (number < 0) {
            number = 0xFFFFFFFF + number + 1;
        }
        return (number < 16 ? "0" : "") + number.toString(16).toUpperCase();
    }

    @undoBatch
    switchColor = action((color: ColorState): void => {
        Doc.UserDoc().backgroundColor = color.hex.startsWith("#") ?
            color.hex + (color.rgb.a ? this.decimalToHexString(Math.round(color.rgb.a * 255)) : "ff") : color.hex;
        CurrentUserUtils.ActivePen && (CurrentUserUtils.ActivePen.backgroundColor = color.hex);

        if (InkingControl.Instance.selectedTool === InkTool.None) {
            const selected = SelectionManager.SelectedDocuments();
            selected.map(view => {
                const targetDoc = view.props.Document.dragFactory instanceof Doc ? view.props.Document.dragFactory :
                    view.props.Document.layout instanceof Doc ? view.props.Document.layout :
                        view.props.Document.isTemplateForField ? view.props.Document : Doc.GetProto(view.props.Document);
                if (targetDoc) {
                    if (StrCast(Doc.Layout(view.props.Document).layout).indexOf("FormattedTextBox") !== -1 && FormattedTextBox.HadSelection) {
                        Doc.Layout(view.props.Document).color = Doc.UserDoc().bacgroundColor;
                    } else {
                        Doc.Layout(view.props.Document)._backgroundColor = Doc.UserDoc().backgroundColor; // '_backgroundColor' is template specific.  'backgroundColor' would apply to all templates, but has no UI at the moment
                    }
                }
            });
        }
    });
    @action
    switchWidth = (width: string): void => {
        // this._selectedWidth = width;
        if (!isNaN(parseInt(width))) {
            Doc.UserDoc().inkWidth = width;
        }
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
        Doc.UserDoc().inkColor = value;
    }

    @computed
    get selectedWidth() {
        return this._selectedWidth;
    }

}
Scripting.addGlobal(function activatePen(pen: any, width: any, color: any) { InkingControl.Instance.switchTool(pen ? InkTool.Pen : InkTool.None); InkingControl.Instance.switchWidth(width); InkingControl.Instance.updateSelectedColor(color); });
Scripting.addGlobal(function activateBrush(pen: any, width: any, color: any) { InkingControl.Instance.switchTool(pen ? InkTool.Highlighter : InkTool.None); InkingControl.Instance.switchWidth(width); InkingControl.Instance.updateSelectedColor(color); });
Scripting.addGlobal(function activateEraser(pen: any) { return InkingControl.Instance.switchTool(pen ? InkTool.Eraser : InkTool.None); });
Scripting.addGlobal(function activateStamp(pen: any) { return InkingControl.Instance.switchTool(pen ? InkTool.Stamp : InkTool.None); });
Scripting.addGlobal(function deactivateInk() { return InkingControl.Instance.switchTool(InkTool.None); });
Scripting.addGlobal(function setInkWidth(width: any) { return InkingControl.Instance.switchWidth(width); });
Scripting.addGlobal(function setInkColor(color: any) { return InkingControl.Instance.updateSelectedColor(color); });