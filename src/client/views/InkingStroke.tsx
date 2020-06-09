import { library } from "@fortawesome/fontawesome-svg-core";
import { faPaintBrush } from "@fortawesome/free-solid-svg-icons";
import { observable, runInAction, action } from "mobx";
import { observer } from "mobx-react";
import { documentSchema } from "../../fields/documentSchemas";
import { InkData, InkField, InkTool } from "../../fields/InkField";
import { makeInterface } from "../../fields/Schema";
import { Cast, StrCast } from "../../fields/Types";
import { TraceMobx } from "../../fields/util";
import { CognitiveServices } from "../cognitive_services/CognitiveServices";
import { InteractionUtils } from "../util/InteractionUtils";
import { ContextMenu } from "./ContextMenu";
import { ViewBoxBaseComponent } from "./DocComponent";
import "./InkingStroke.scss";
import { FieldView, FieldViewProps } from "./nodes/FieldView";
import React = require("react");
import { Scripting } from "../util/Scripting";
import { Doc } from "../../fields/Doc";

library.add(faPaintBrush);

type InkDocument = makeInterface<[typeof documentSchema]>;
const InkDocument = makeInterface(documentSchema);

@observer
export class InkingStroke extends ViewBoxBaseComponent<FieldViewProps, InkDocument>(InkDocument) {
    public static LayoutString(fieldStr: string) { return FieldView.LayoutString(InkingStroke, fieldStr); }

    private analyzeStrokes = () => {
        const data: InkData = Cast(this.dataDoc[this.fieldKey], InkField)?.inkData ?? [];
        CognitiveServices.Inking.Appliers.ConcatenateHandwriting(this.dataDoc, ["inkAnalysis", "handwriting"], [data]);
    }

    render() {
        TraceMobx();
        const data: InkData = Cast(this.dataDoc[this.fieldKey], InkField)?.inkData ?? [];
        const xs = data.map(p => p.X);
        const ys = data.map(p => p.Y);
        const left = Math.min(...xs);
        const top = Math.min(...ys);
        const right = Math.max(...xs);
        const bottom = Math.max(...ys);
        const width = right - left;
        const height = bottom - top;
        const scaleX = this.props.PanelWidth() / width;
        const scaleY = this.props.PanelHeight() / height;
        const points = InteractionUtils.CreatePolyline(data, left, top,
            StrCast(this.layoutDoc.color, ActiveInkColor()),
            StrCast(this.layoutDoc.strokeWidth, ActiveInkWidth()),
            StrCast(this.layoutDoc.strokeBezier, ActiveInkBezierApprox()), scaleX, scaleY, "");
        return (
            <svg className="inkingStroke"
                width={width}
                height={height}
                style={{ mixBlendMode: this.layoutDoc.tool === InkTool.Highlighter ? "multiply" : "unset" }}
                onContextMenu={() => {
                    ContextMenu.Instance.addItem({
                        description: "Analyze Stroke",
                        event: this.analyzeStrokes,
                        icon: "paint-brush"
                    });
                }}
            >
                {points}
            </svg>
        );
    }
}


export function SetActiveInkWidth(width: string): void { !isNaN(parseInt(width)) && ActiveInkPen() && (ActiveInkPen().activeInkWidth = width); }
export function SetActiveBezierApprox(bezier: string): void { ActiveInkPen() && (ActiveInkPen().activeInkBezier = isNaN(parseInt(bezier)) ? "" : bezier); }
export function SetActiveInkColor(value: string) { ActiveInkPen() && (ActiveInkPen().activeInkColor = value); }
export function ActiveInkPen(): Doc { return Cast(Doc.UserDoc().activeInkPen, Doc, null); }
export function ActiveInkColor(): string { return StrCast(ActiveInkPen()?.activeInkColor, "black"); }
export function ActiveInkWidth(): string { return StrCast(ActiveInkPen()?.activeInkWidth, "1"); }
export function ActiveInkBezierApprox(): string { return StrCast(ActiveInkPen()?.activeInkBezier); }
Scripting.addGlobal(function activateBrush(pen: any, width: any, color: any) {
    Doc.SetSelectedTool(pen ? InkTool.Highlighter : InkTool.None);
    SetActiveInkWidth(width);
    SetActiveInkColor(color);
});
Scripting.addGlobal(function activateEraser(pen: any) { return Doc.SetSelectedTool(pen ? InkTool.Eraser : InkTool.None); });
Scripting.addGlobal(function activateStamp(pen: any) { return Doc.SetSelectedTool(pen ? InkTool.Stamp : InkTool.None); });
Scripting.addGlobal(function deactivateInk() { return Doc.SetSelectedTool(InkTool.None); });
Scripting.addGlobal(function setInkWidth(width: any) { return Doc.SetSelectedTool(width); });
Scripting.addGlobal(function setInkColor(color: any) { return Doc.SetSelectedTool(color); });