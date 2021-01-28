import { action } from "mobx";
import { observer } from "mobx-react";
import { Doc } from "../../fields/Doc";
import { documentSchema } from "../../fields/documentSchemas";
import { InkData, InkField, InkTool } from "../../fields/InkField";
import { makeInterface } from "../../fields/Schema";
import { Cast, StrCast } from "../../fields/Types";
import { TraceMobx } from "../../fields/util";
import { setupMoveUpEvents, emptyFunction, returnFalse } from "../../Utils";
import { CognitiveServices } from "../cognitive_services/CognitiveServices";
import { InteractionUtils } from "../util/InteractionUtils";
import { Scripting } from "../util/Scripting";
import { UndoManager } from "../util/UndoManager";
import { ContextMenu } from "./ContextMenu";
import { ViewBoxBaseComponent } from "./DocComponent";
import "./InkingStroke.scss";
import { FieldView, FieldViewProps } from "./nodes/FieldView";
import React = require("react");
import { InkStrokeProperties } from "./InkStrokeProperties";

type InkDocument = makeInterface<[typeof documentSchema]>;
const InkDocument = makeInterface(documentSchema);

@observer
export class InkingStroke extends ViewBoxBaseComponent<FieldViewProps, InkDocument>(InkDocument) {
    private _controlUndo?: UndoManager.Batch;

    public static LayoutString(fieldStr: string) { return FieldView.LayoutString(InkingStroke, fieldStr); }



    private analyzeStrokes = () => {
        const data: InkData = Cast(this.dataDoc[this.fieldKey], InkField)?.inkData ?? [];
        CognitiveServices.Inking.Appliers.ConcatenateHandwriting(this.dataDoc, ["inkAnalysis", "handwriting"], [data]);
    }

    private makeMask = () => {
        this.props.Document.mixBlendMode = "hard-light";
        this.props.Document.color = "#9b9b9bff";
        //this.props.Document._stayInCollection = true;
        this.props.Document.isInkMask = true;
    }

    public _prevX = 0;
    public _prevY = 0;
    private _controlNum = 0;
    @action
    onControlDown = (e: React.PointerEvent, i: number): void => {
        //TODO:renew points before controlling 
        InkStrokeProperties.Instance?.control(0.001, 0.001, 1);
        setupMoveUpEvents(this, e, this.onControlMove, this.onControlup, (e) => { });
        this._controlUndo = UndoManager.StartBatch("DocDecs set radius");
        this._prevX = e.clientX;
        this._prevY = e.clientY;
        this._controlNum = i;
    }

    @action
    changeCurrPoint = (i: number) => {
        if (!InkStrokeProperties.Instance) return;
        InkStrokeProperties.Instance._currPoint = i;
        document.addEventListener("keydown", this.delPts, true);
    }

    @action
    onControlMove = (e: PointerEvent, down: number[]): boolean => {
        if (!InkStrokeProperties.Instance) return false;
        const xDiff = this._prevX - e.clientX;
        const yDiff = this._prevY - e.clientY;
        InkStrokeProperties.Instance.control(xDiff, yDiff, this._controlNum);
        this._prevX = e.clientX;
        this._prevY = e.clientY;
        return false;
    }

    onControlup = (e: PointerEvent) => {
        this._prevX = 0;
        this._prevY = 0;
        this._controlNum = 0;
        this._controlUndo?.end();
        this._controlUndo = undefined;
    }
    @action
    delPts = (e: KeyboardEvent | React.PointerEvent | undefined) => {
        if (InkStrokeProperties.Instance && (e instanceof KeyboardEvent ? e.key === "-" : true)) {
            InkStrokeProperties.Instance.deletePoints();
        }
    }

    onPointerDown = (e: React.PointerEvent) => {
        this.props.isSelected(true) && setupMoveUpEvents(this, e, returnFalse, emptyFunction, action((e: PointerEvent, doubleTap: boolean | undefined) => {
            doubleTap && InkStrokeProperties.Instance && (InkStrokeProperties.Instance._controlBtn = true);
        }));
    }

    public static MaskDim = 50000;
    render() {
        TraceMobx();
        const formatInstance = InkStrokeProperties.Instance;
        if (!formatInstance) return (null);
        const data: InkData = Cast(this.dataDoc[this.fieldKey], InkField)?.inkData ?? [];
        // const strokeWidth = Number(StrCast(this.layoutDoc.strokeWidth, ActiveInkWidth()));
        const strokeWidth = Number(this.layoutDoc.strokeWidth);
        const xs = data.map(p => p.X);
        const ys = data.map(p => p.Y);
        const lineTop = Math.min(...ys);
        const lineBot = Math.max(...ys);
        const lineLft = Math.min(...xs);
        const lineRgt = Math.max(...xs);
        const left = lineLft - strokeWidth / 2;
        const top = lineTop - strokeWidth / 2;
        const right = lineRgt + strokeWidth / 2;
        const bottom = lineBot + strokeWidth / 2;
        const width = Math.max(1, right - left);
        const height = Math.max(1, bottom - top);
        const scaleX = width === strokeWidth ? 1 : (this.props.PanelWidth() - strokeWidth) / (width - strokeWidth);
        const scaleY = height === strokeWidth ? 1 : (this.props.PanelHeight() - strokeWidth) / (height - strokeWidth);
        const strokeColor = StrCast(this.layoutDoc.color, "");

        const points = InteractionUtils.CreatePolyline(data, left, top, strokeColor, strokeWidth, strokeWidth,
            StrCast(this.layoutDoc.strokeBezier), StrCast(this.layoutDoc.fillColor, "none"),
            StrCast(this.layoutDoc.strokeStartMarker), StrCast(this.layoutDoc.strokeEndMarker),
            StrCast(this.layoutDoc.strokeDash), scaleX, scaleY, "", "none", this.props.isSelected() && strokeWidth <= 5 && lineBot - lineTop > 1 && lineRgt - lineLft > 1, false);

        const hpoints = InteractionUtils.CreatePolyline(data, left, top,
            this.props.isSelected() && strokeWidth > 5 ? strokeColor : "transparent", strokeWidth, (strokeWidth + 15),
            StrCast(this.layoutDoc.strokeBezier), StrCast(this.layoutDoc.fillColor, "none"),
            "none", "none", undefined, scaleX, scaleY, "", this.props.layerProvider?.(this.props.Document) === false ? "none" : "visiblepainted", false, true);

        //points for adding
        const apoints = InteractionUtils.CreatePoints(data, left, top, strokeColor, strokeWidth, strokeWidth,
            StrCast(this.layoutDoc.strokeBezier), StrCast(this.layoutDoc.fillColor, "none"),
            StrCast(this.layoutDoc.strokeStartMarker), StrCast(this.layoutDoc.strokeEndMarker),
            StrCast(this.layoutDoc.strokeDash), scaleX, scaleY, "", "none", this.props.isSelected() && strokeWidth <= 5, false);

        const controlPoints: { X: number, Y: number, I: number }[] = [];
        const handlePoints: { X: number, Y: number, I: number, dot1: number, dot2: number }[] = [];
        const handleLine: { X1: number, Y1: number, X2: number, Y2: number, X3: number, Y3: number, dot1: number, dot2: number }[] = [];
        if (data.length >= 4) {
            for (var i = 0; i <= data.length - 4; i += 4) {
                controlPoints.push({ X: data[i].X, Y: data[i].Y, I: i });
                controlPoints.push({ X: data[i + 3].X, Y: data[i + 3].Y, I: i + 3 });
                handlePoints.push({ X: data[i + 1].X, Y: data[i + 1].Y, I: i + 1, dot1: i, dot2: i === 0 ? i : i - 1 });
                handlePoints.push({ X: data[i + 2].X, Y: data[i + 2].Y, I: i + 2, dot1: i + 3, dot2: i === data.length ? i + 3 : i + 4 });
            }

            handleLine.push({ X1: data[0].X, Y1: data[0].Y, X2: data[0].X, Y2: data[0].Y, X3: data[1].X, Y3: data[1].Y, dot1: 0, dot2: 0 });
            for (var i = 2; i < data.length - 4; i += 4) {

                handleLine.push({ X1: data[i].X, Y1: data[i].Y, X2: data[i + 1].X, Y2: data[i + 1].Y, X3: data[i + 3].X, Y3: data[i + 3].Y, dot1: i + 1, dot2: i + 2 });

            }
            handleLine.push({ X1: data[data.length - 2].X, Y1: data[data.length - 2].Y, X2: data[data.length - 1].X, Y2: data[data.length - 1].Y, X3: data[data.length - 1].X, Y3: data[data.length - 1].Y, dot1: data.length - 1, dot2: data.length - 1 });

        }
        // if (data.length <= 4) {
        //     handlePoints = [];
        //     handleLine = [];
        //     controlPoints = [];
        //     for (var i = 0; i < data.length; i++) {
        //         controlPoints.push({ X: data[i].X, Y: data[i].Y, I: i });
        //     }

        // }
        const dotsize = String(Math.max(width * scaleX, height * scaleY) / 40);

        const addpoints = apoints.map((pts, i) =>
            <svg height="10" width="10" key={`add${i}`}>
                <circle cx={(pts.X - left - strokeWidth / 2) * scaleX + strokeWidth / 2} cy={(pts.Y - top - strokeWidth / 2) * scaleY + strokeWidth / 2} r={strokeWidth / 2} stroke="invisible" strokeWidth={String(Number(dotsize) / 2)} fill="invisible"
                    onPointerDown={(e) => { formatInstance.addPoints(pts.X, pts.Y, apoints, i, controlPoints); }} pointerEvents="all" cursor="all-scroll"
                />
            </svg>);

        const controls = controlPoints.map((pts, i) =>
            <svg height="10" width="10" key={`ctrl${i}`}>
                <circle cx={(pts.X - left - strokeWidth / 2) * scaleX + strokeWidth / 2} cy={(pts.Y - top - strokeWidth / 2) * scaleY + strokeWidth / 2} r={strokeWidth / 2} stroke="black" strokeWidth={String(Number(dotsize) / 2)} fill="red"
                    onPointerDown={(e) => { this.changeCurrPoint(pts.I); this.onControlDown(e, pts.I); }} pointerEvents="all" cursor="all-scroll"
                />
            </svg>);
        const handles = handlePoints.map((pts, i) =>
            <svg height="10" width="10" key={`hdl${i}`}>
                <circle cx={(pts.X - left - strokeWidth / 2) * scaleX + strokeWidth / 2} cy={(pts.Y - top - strokeWidth / 2) * scaleY + strokeWidth / 2} r={strokeWidth / 2} stroke="black" strokeWidth={String(Number(dotsize) / 2)} fill="green"
                    onPointerDown={(e) => this.onControlDown(e, pts.I)} pointerEvents="all" cursor="all-scroll" display={(pts.dot1 === formatInstance._currPoint || pts.dot2 === formatInstance._currPoint) ? "inherit" : "none"} />
            </svg>);
        const handleLines = handleLine.map((pts, i) =>
            <svg height="100" width="100" key={`line${i}`}  >
                <line x1={(pts.X1 - left - strokeWidth / 2) * scaleX + strokeWidth / 2} y1={(pts.Y1 - top - strokeWidth / 2) * scaleY + strokeWidth / 2}
                    x2={(pts.X2 - left - strokeWidth / 2) * scaleX + strokeWidth / 2} y2={(pts.Y2 - top - strokeWidth / 2) * scaleY + strokeWidth / 2} stroke="green" strokeWidth={String(Number(dotsize) / 2)}
                    display={(pts.dot1 === formatInstance._currPoint || pts.dot2 === formatInstance._currPoint) ? "inherit" : "none"} />
                <line x1={(pts.X2 - left - strokeWidth / 2) * scaleX + strokeWidth / 2} y1={(pts.Y2 - top - strokeWidth / 2) * scaleY + strokeWidth / 2}
                    x2={(pts.X3 - left - strokeWidth / 2) * scaleX + strokeWidth / 2} y2={(pts.Y3 - top - strokeWidth / 2) * scaleY + strokeWidth / 2} stroke="green" strokeWidth={String(Number(dotsize) / 2)}
                    display={(pts.dot1 === formatInstance._currPoint || pts.dot2 === formatInstance._currPoint) ? "inherit" : "none"} />
            </svg>);


        return (
            <svg className="inkingStroke"
                style={{
                    pointerEvents: this.props.Document.isInkMask && this.props.layerProvider?.(this.props.Document) !== false ? "all" : "none",
                    transform: this.props.Document.isInkMask ? `translate(${InkingStroke.MaskDim / 2}px, ${InkingStroke.MaskDim / 2}px)` : undefined,
                    mixBlendMode: this.layoutDoc.tool === InkTool.Highlighter ? "multiply" : "unset",
                    overflow: "visible",
                }}
                onPointerDown={this.onPointerDown}
                onContextMenu={() => {
                    const cm = ContextMenu.Instance;
                    if (cm) {
                        !Doc.UserDoc().noviceMode && cm.addItem({ description: "Recognize Writing", event: this.analyzeStrokes, icon: "paint-brush" });
                        cm.addItem({ description: "Make Mask", event: this.makeMask, icon: "paint-brush" });
                        cm.addItem({ description: "Edit Points", event: action(() => formatInstance._controlBtn = !formatInstance._controlBtn), icon: "paint-brush" });
                        //cm.addItem({ description: "Format Shape...", event: this.formatShape, icon: "paint-brush" });
                    }
                }}
            ><defs>
                </defs>
                {hpoints}
                {points}
                {formatInstance._controlBtn && this.props.isSelected() ? addpoints : ""}
                {formatInstance._controlBtn && this.props.isSelected() ? controls : ""}
                {formatInstance._controlBtn && this.props.isSelected() ? handles : ""}
                {formatInstance._controlBtn && this.props.isSelected() ? handleLines : ""}

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
