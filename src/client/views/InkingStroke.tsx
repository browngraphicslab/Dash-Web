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
            StrCast(this.layoutDoc.strokeBezier, ActiveInkBezierApprox()), scaleX, scaleY, "", "none", this.props.isSelected() && strokeWidth <= 5);
        const hpoints = InteractionUtils.CreatePolyline(data, left, top,
            this.props.isSelected() && strokeWidth > 5 ? strokeColor : "transparent",
            (strokeWidth + 15).toString(),
            StrCast(this.layoutDoc.strokeBezier, ActiveInkBezierApprox()), scaleX, scaleY, "", this.props.active() ? "visiblestroke" : "none", false);
        return (
            <svg className="inkingStroke"
                width={width}
                height={height}
                style={{
                    pointerEvents: this.props.Document.isInkMask ? "all" : "none",
                    transform: this.props.Document.isInkMask ? "translate(2500px, 2500px)" : undefined,
                    mixBlendMode: this.layoutDoc.tool === InkTool.Highlighter ? "multiply" : "unset"
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
Scripting.addGlobal(function setInkWidth(width: any) { return SetActiveInkWidth(width); });
Scripting.addGlobal(function setInkColor(color: any) { return SetActiveInkColor(color); });