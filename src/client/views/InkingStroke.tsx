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
import { Id } from "../../fields/FieldSymbols";

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
        const strokeWidth = Number(StrCast(this.layoutDoc.strokeWidth, ActiveInkWidth()));
        const strokeColor = StrCast(this.layoutDoc.color, ActiveInkColor());
        const points = InteractionUtils.CreatePolyline(data, left, top,
            strokeColor,
            strokeWidth.toString(),
            StrCast(this.layoutDoc.strokeBezier, ActiveInkBezierApprox()), StrCast(this.layoutDoc.fillColor, ActiveFillColor()), StrCast(this.layoutDoc.arrowStart, ActiveArrowStart()), StrCast(this.layoutDoc.arrowEnd, ActiveArrowEnd()), StrCast(this.layoutDoc.dash, ActiveDash()), scaleX, scaleY, "", "none", this.props.isSelected() && strokeWidth <= 5);
        const hpoints = InteractionUtils.CreatePolyline(data, left, top,
            this.props.isSelected() && strokeWidth > 5 ? strokeColor : "transparent",
            // strokeColor,
            (strokeWidth + 15).toString(),
            StrCast(this.layoutDoc.strokeBezier, ActiveInkBezierApprox()), StrCast(this.layoutDoc.fillColor, ActiveFillColor()), StrCast(this.layoutDoc.arrowStart, ActiveArrowStart()), StrCast(this.layoutDoc.arrowEnd, ActiveArrowEnd()), StrCast(this.layoutDoc.dash, ActiveDash()), scaleX, scaleY, "", this.props.active() ? "visiblestroke" : "none", false);
        console.log("#" + strokeColor);
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
                    ContextMenu.Instance.addItem({ description: "Analyze Stroke", event: this.analyzeStrokes, icon: "paint-brush" });
                    ContextMenu.Instance.addItem({ description: "Make Mask", event: this.makeMask, icon: "paint-brush" });
                }}
            ><defs>
                    <filter id="dangerShine">
                        <feColorMatrix type="matrix"
                            result="color"
                            values="1 0 0 0 0
                        0 0 0 0 0
                        0 0 0 0 0
                        0 0 0 1 0">
                        </feColorMatrix>
                        <feGaussianBlur in="color" stdDeviation="4" result="blur"></feGaussianBlur>
                        <feOffset in="blur" dx="0" dy="0" result="offset"></feOffset>
                        <feMerge>
                            <feMergeNode in="bg"></feMergeNode>
                            <feMergeNode in="offset"></feMergeNode>
                            <feMergeNode in="SourceGraphic"></feMergeNode>
                        </feMerge>
                    </filter>
                    {/* <marker id="arrow" markerWidth="10" markerHeight="10" refX="0" refY="3" orient="auto" markerUnits="strokeWidth">
                        <path d="M0,0 L0,6 L9,3 z" fill="black" />
                    </marker> */}
                    {/* <marker id="arrowHead" orient="auto" overflow="visible" refX="10" refY="3.5" markerWidth="10" markerHeight="7">
                        <polygon points="10 0, 10 7, 0 3.5" fill="dodgerblue" />
                    </marker>
                    <marker id="arrowEnd" orient="auto" overflow="visible" refX="0" refY="3.5" markerWidth="10" markerHeight="7">
                        <polygon points="0 0, 10 3.5, 0 7" fill="dodgerblue" />
                    </marker> */}
                    {/* <marker id="dot" orient="auto" overflow="visible">
                        <circle r={strokeWidth} fill={"#" + strokeColor} />
                    </marker> */}
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
export function ActiveFillColor(): string { return StrCast(ActiveInkPen()?.activeFillColor, "none"); }
export function ActiveArrowStart(): string { return StrCast(ActiveInkPen()?.activeArrowStart, "none"); }
export function ActiveArrowEnd(): string { return StrCast(ActiveInkPen()?.activeArrowEnd, "none"); }
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
