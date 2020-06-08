import { action, observable } from "mobx";
import { Doc } from "../../fields/Doc";
import { InkTool } from "../../fields/InkField";
import { CurrentUserUtils } from "../util/CurrentUserUtils";
import { Scripting } from "../util/Scripting";
import { InkingStroke } from "./InkingStroke";

export class InkingControl {
    @observable static Instance: InkingControl;
    @observable public _open: boolean = false;
    constructor() {
        InkingControl.Instance = this;
    }

    switchTool = action((tool: InkTool): void => {
        // this._selectedTool = tool;
        Doc.UserDoc().inkTool = tool;
    });

    @action
    switchWidth = (width: string): void => {
        if (!isNaN(parseInt(width))) {
            CurrentUserUtils.ActivePen && (CurrentUserUtils.ActivePen.inkWidth = InkingStroke.InkWidth = width);
        }
    }

    @action
    switchBezier = (bezier: string): void => {
        CurrentUserUtils.ActivePen && (CurrentUserUtils.ActivePen.inkBezier = InkingStroke.InkBezierApprox = isNaN(parseInt(bezier)) ? "" : bezier);
    }

    @action
    switchColor(value: string) {
        CurrentUserUtils.ActivePen && (CurrentUserUtils.ActivePen.inkColor = InkingStroke.InkColor = value);
    }
}
Scripting.addGlobal(function activateBrush(pen: any, width: any, color: any) { InkingControl.Instance.switchTool(pen ? InkTool.Highlighter : InkTool.None); InkingControl.Instance.switchWidth(width); InkingControl.Instance.switchColor(color); });
Scripting.addGlobal(function activateEraser(pen: any) { return InkingControl.Instance.switchTool(pen ? InkTool.Eraser : InkTool.None); });
Scripting.addGlobal(function activateStamp(pen: any) { return InkingControl.Instance.switchTool(pen ? InkTool.Stamp : InkTool.None); });
Scripting.addGlobal(function deactivateInk() { return InkingControl.Instance.switchTool(InkTool.None); });
Scripting.addGlobal(function setInkWidth(width: any) { return InkingControl.Instance.switchWidth(width); });
Scripting.addGlobal(function setInkColor(color: any) { return InkingControl.Instance.switchColor(color); });