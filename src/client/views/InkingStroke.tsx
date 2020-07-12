import { library } from "@fortawesome/fontawesome-svg-core";
import { faPaintBrush } from "@fortawesome/free-solid-svg-icons";
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
import FormatShapePane from "./collections/collectionFreeForm/FormatShapePane";
import { action } from "mobx";

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

    private makeMask = () => {
        this.props.Document._backgroundColor = "rgba(0,0,0,0.7)";
        this.props.Document.mixBlendMode = "hard-light";
        this.props.Document.color = "#9b9b9bff";
        this.props.Document.stayInCollection = true;
        this.props.Document.isInkMask = true;
    }

    @action
    private formatShape = () => {
        FormatShapePane.Instance.Pinned = true;
    }

    render() {
        TraceMobx();
        const data: InkData = Cast(this.dataDoc[this.fieldKey], InkField)?.inkData ?? [];
        // const strokeWidth = Number(StrCast(this.layoutDoc.strokeWidth, ActiveInkWidth()));
        const strokeWidth = Number(this.layoutDoc.strokeWidth);
        const xs = data.map(p => p.X);
        const ys = data.map(p => p.Y);
        const left = Math.min(...xs) - strokeWidth / 2;
        const top = Math.min(...ys) - strokeWidth / 2;
        const right = Math.max(...xs) + strokeWidth / 2;
        const bottom = Math.max(...ys) + strokeWidth / 2;
        const width = right - left;
        const height = bottom - top;
        const scaleX = (this.props.PanelWidth() - strokeWidth) / (width - strokeWidth);
        const scaleY = (this.props.PanelHeight() - strokeWidth) / (height - strokeWidth);
        const strokeColor = StrCast(this.layoutDoc.color, "");
        const points = InteractionUtils.CreatePolyline(data, left, top, strokeColor, strokeWidth, strokeWidth,
            StrCast(this.layoutDoc.strokeBezier), StrCast(this.layoutDoc.fillColor, "transparent"),
            StrCast(this.layoutDoc.strokeArrowStart), StrCast(this.layoutDoc.strokeArrowEnd),
            StrCast(this.layoutDoc.strokeDash), scaleX, scaleY, "", "none", this.props.isSelected() && strokeWidth <= 5, false);
        const hpoints = InteractionUtils.CreatePolyline(data, left, top,
            this.props.isSelected() && strokeWidth > 5 ? strokeColor : "transparent", strokeWidth, (strokeWidth + 15),
            StrCast(this.layoutDoc.strokeBezier), StrCast(this.layoutDoc.fillColor, "transparent"),
            "none", "none", "0", scaleX, scaleY, "", this.props.active() ? "visiblepainted" : "none", false, true);
        return (
            <svg className="inkingStroke"
                width={width}
                height={height}
                style={{
                    pointerEvents: this.props.Document.isInkMask ? "all" : "none",
                    transform: this.props.Document.isInkMask ? "translate(2500px, 2500px)" : undefined,
                    mixBlendMode: this.layoutDoc.tool === InkTool.Highlighter ? "multiply" : "unset",
                    overflow: "visible",
                }}
                onContextMenu={() => {
                    const cm = ContextMenu.Instance;
                    if (cm) {
                        cm.addItem({ description: "Analyze Stroke", event: this.analyzeStrokes, icon: "paint-brush" });
                        cm.addItem({ description: "Make Mask", event: this.makeMask, icon: "paint-brush" });
                        cm.addItem({ description: "Format Shape", event: this.formatShape, icon: "paint-brush" });
                    }
                }}
            ><defs>
                </defs>
                {hpoints}
                {points}
            </svg>
        );
    }
}


export function SetActiveInkWidth(width: string): void { !isNaN(parseInt(width)) && ActiveInkPen() && (ActiveInkPen().activeInkWidth = width); }
export function SetActiveBezierApprox(bezier: string): void { ActiveInkPen() && (ActiveInkPen().activeInkBezier = isNaN(parseInt(bezier)) ? "" : bezier); }
export function SetActiveInkColor(value: string) { ActiveInkPen() && (ActiveInkPen().activeInkColor = value); }
export function SetActiveFillColor(value: string) { ActiveInkPen() && (ActiveInkPen().activeFillColor = value); }
export function SetActiveArrowStart(value: string) { ActiveInkPen() && (ActiveInkPen().activeArrowStart = value); }
export function SetActiveArrowEnd(value: string) { ActiveInkPen() && (ActiveInkPen().activeArrowEnd = value); }
export function SetActiveDash(dash: string): void { !isNaN(parseInt(dash)) && ActiveInkPen() && (ActiveInkPen().activeDash = dash); }
export function ActiveInkPen(): Doc { return Cast(Doc.UserDoc().activeInkPen, Doc, null); }
export function ActiveInkColor(): string { return StrCast(ActiveInkPen()?.activeInkColor, "black"); }
export function ActiveFillColor(): string { return StrCast(ActiveInkPen()?.activeFillColor, ""); }
export function ActiveArrowStart(): string { return StrCast(ActiveInkPen()?.activeArrowStart, ""); }
export function ActiveArrowEnd(): string { return StrCast(ActiveInkPen()?.activeArrowEnd, ""); }
export function ActiveDash(): string { return StrCast(ActiveInkPen()?.activeDash, "0"); }
export function ActiveInkWidth(): string { return StrCast(ActiveInkPen()?.activeInkWidth, "1"); }
export function ActiveInkBezierApprox(): string { return StrCast(ActiveInkPen()?.activeInkBezier); }
Scripting.addGlobal(function activateBrush(pen: any, width: any, color: any, fill: any, arrowStart: any, arrowEnd: any, dash: any) {
    Doc.SetSelectedTool(pen ? InkTool.Highlighter : InkTool.None);
    SetActiveInkWidth(width);
    SetActiveInkColor(color);
    SetActiveFillColor(fill);
    SetActiveArrowStart(arrowStart);
    SetActiveArrowEnd(arrowEnd);
    SetActiveDash(dash);
});
Scripting.addGlobal(function activateEraser(pen: any) { return Doc.SetSelectedTool(pen ? InkTool.Eraser : InkTool.None); });
Scripting.addGlobal(function activateStamp(pen: any) { return Doc.SetSelectedTool(pen ? InkTool.Stamp : InkTool.None); });
Scripting.addGlobal(function deactivateInk() { return Doc.SetSelectedTool(InkTool.None); });
Scripting.addGlobal(function setInkWidth(width: any) { return SetActiveInkWidth(width); });
Scripting.addGlobal(function setInkColor(color: any) { return SetActiveInkColor(color); });
Scripting.addGlobal(function setFillColor(fill: any) { return SetActiveFillColor(fill); });
Scripting.addGlobal(function setActiveArrowStart(arrowStart: any) { return SetActiveArrowStart(arrowStart); });
Scripting.addGlobal(function setActiveArrowEnd(arrowEnd: any) { return SetActiveArrowStart(arrowEnd); });
Scripting.addGlobal(function setActiveDash(dash: any) { return SetActiveDash(dash); });
