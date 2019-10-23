import { action, computed, trace, observable, runInAction } from "mobx";
import { observer } from "mobx-react";
import { Utils } from "../../Utils";
import { Transform } from "../util/Transform";
import "./InkingCanvas.scss";
import { InkingControl } from "./InkingControl";
import { InkingStroke } from "./InkingStroke";
import React = require("react");
import { UndoManager } from "../util/UndoManager";
import { StrokeData, InkField, InkTool } from "../../new_fields/InkField";
import { Doc } from "../../new_fields/Doc";
import { Cast, PromiseValue, NumCast } from "../../new_fields/Types";

interface InkCanvasProps {
    getScreenTransform: () => Transform;
    AnnotationDocument: Doc;
    Document: Doc;
    inkFieldKey: string;
    children: () => JSX.Element[];
}

@observer
export class InkingCanvas extends React.Component<InkCanvasProps> {
    maxCanvasDim = 8192 / 2; // 1/2 of the maximum canvas dimension for Chrome
    @observable inkMidX: number = 0;
    @observable inkMidY: number = 0;
    private previousState?: Map<string, StrokeData>;
    private _currentStrokeId: string = "";
    public static IntersectStrokeRect(stroke: StrokeData, selRect: { left: number, top: number, width: number, height: number }): boolean {
        return stroke.pathData.reduce((inside: boolean, val) => inside ||
            (selRect.left < val.x && selRect.left + selRect.width > val.x &&
                selRect.top < val.y && selRect.top + selRect.height > val.y)
            , false);
    }
    public static StrokeRect(stroke: StrokeData): { left: number, top: number, right: number, bottom: number } {
        return stroke.pathData.reduce((bounds: { left: number, top: number, right: number, bottom: number }, val) =>
            ({
                left: Math.min(bounds.left, val.x), top: Math.min(bounds.top, val.y),
                right: Math.max(bounds.right, val.x), bottom: Math.max(bounds.bottom, val.y)
            })
            , { left: Number.MAX_VALUE, top: Number.MAX_VALUE, right: -Number.MAX_VALUE, bottom: -Number.MAX_VALUE });
    }

    componentDidMount() {
        PromiseValue(Cast(this.props.AnnotationDocument[this.props.inkFieldKey], InkField)).then(ink => runInAction(() => {
            if (ink) {
                let bounds = Array.from(ink.inkData).reduce(([mix, max, miy, may], [id, strokeData]) =>
                    strokeData.pathData.reduce(([mix, max, miy, may], p) =>
                        [Math.min(mix, p.x), Math.max(max, p.x), Math.min(miy, p.y), Math.max(may, p.y)],
                        [mix, max, miy, may]),
                    [Number.MAX_VALUE, Number.MIN_VALUE, Number.MAX_VALUE, Number.MIN_VALUE]);
                this.inkMidX = (bounds[0] + bounds[1]) / 2;
                this.inkMidY = (bounds[2] + bounds[3]) / 2;
            }
        }));
    }

    @computed
    get inkData(): Map<string, StrokeData> {
        let map = Cast(this.props.AnnotationDocument[this.props.inkFieldKey], InkField);
        return !map ? new Map : new Map(map.inkData);
    }

    set inkData(value: Map<string, StrokeData>) {
        this.props.AnnotationDocument[this.props.inkFieldKey] = new InkField(value);
    }

    @action
    onPointerDown = (e: React.PointerEvent): void => {
        if (e.button !== 0 || e.altKey || e.ctrlKey || InkingControl.Instance.selectedTool === InkTool.None) {
            return;
        }

        document.addEventListener("pointermove", this.onPointerMove, true);
        document.addEventListener("pointerup", this.onPointerUp, true);
        e.stopPropagation();
        e.preventDefault();

        this.previousState = new Map(this.inkData);

        if (InkingControl.Instance.selectedTool !== InkTool.Eraser && InkingControl.Instance.selectedTool !== InkTool.Scrubber) {
            // start the new line, saves a uuid to represent the field of the stroke
            this._currentStrokeId = Utils.GenerateGuid();
            const data = this.inkData;
            data.set(this._currentStrokeId, {
                pathData: [this.relativeCoordinatesForEvent(e.clientX, e.clientY)],
                color: InkingControl.Instance.selectedColor,
                width: InkingControl.Instance.selectedWidth,
                tool: InkingControl.Instance.selectedTool,
                displayTimecode: NumCast(this.props.Document.currentTimecode, -1),
                creationTime: new Date().getTime()
            });
            this.inkData = data;
        }
    }

    @action
    onPointerUp = (e: PointerEvent): void => {
        document.removeEventListener("pointermove", this.onPointerMove, true);
        document.removeEventListener("pointerup", this.onPointerUp, true);
        let coord = this.relativeCoordinatesForEvent(e.clientX, e.clientY);
        if (Math.abs(coord.x - this.inkMidX) > 500 || Math.abs(coord.y - this.inkMidY) > 500) {
            this.inkMidX = coord.x;
            this.inkMidY = coord.y;
        }
        e.stopPropagation();
        e.preventDefault();

        const batch = UndoManager.StartBatch("One ink stroke");
        const oldState = this.previousState || new Map;
        this.previousState = undefined;
        const newState = new Map(this.inkData);
        UndoManager.AddEvent({
            undo: () => this.inkData = oldState,
            redo: () => this.inkData = newState
        });
        batch.end();
    }

    @action
    onPointerMove = (e: PointerEvent): void => {
        e.stopPropagation();
        e.preventDefault();
        if (InkingControl.Instance.selectedTool !== InkTool.Eraser && InkingControl.Instance.selectedTool !== InkTool.Scrubber) {
            let data = this.inkData;  // add points to new line as it is being drawn
            let strokeData = data.get(this._currentStrokeId);
            if (strokeData) {
                strokeData.pathData.push(this.relativeCoordinatesForEvent(e.clientX, e.clientY));
                data.set(this._currentStrokeId, strokeData);
            }
            this.inkData = data;
        }
    }

    relativeCoordinatesForEvent = (ex: number, ey: number): { x: number, y: number } => {
        let [x, y] = this.props.getScreenTransform().transformPoint(ex, ey);
        return { x, y };
    }

    @action
    removeLine = (id: string): void => {
        if (!this.previousState) {
            this.previousState = new Map(this.inkData);
            document.addEventListener("pointermove", this.onPointerMove, true);
            document.addEventListener("pointerup", this.onPointerUp, true);
        }
        let data = this.inkData;
        data.delete(id);
        this.inkData = data;
    }

    @computed
    get drawnPaths() {
        let curTimecode = NumCast(this.props.Document.currentTimecode, -1);
        let paths = Array.from(this.inkData).reduce((paths, [id, strokeData]) => {
            if (strokeData.displayTimecode === -1 || (Math.abs(Math.round(strokeData.displayTimecode) - Math.round(curTimecode)) < 3)) {
                paths.push(<InkingStroke key={id} id={id}
                    line={strokeData.pathData}
                    count={strokeData.pathData.length}
                    offsetX={this.maxCanvasDim - this.inkMidX}
                    offsetY={this.maxCanvasDim - this.inkMidY}
                    color={strokeData.color}
                    width={strokeData.width}
                    tool={strokeData.tool}
                    creationTime={strokeData.creationTime}
                    deleteCallback={this.removeLine} />);
            }
            return paths;
        }, [] as JSX.Element[]);
        let markerPaths = paths.filter(path => path.props.tool === InkTool.Highlighter);
        let penPaths = paths.filter(path => path.props.tool !== InkTool.Highlighter);
        return [!penPaths.length ? (null) :
            <svg className={`inkingCanvas-paths-ink`} key="Pens"
                style={{ left: `${this.inkMidX - this.maxCanvasDim}px`, top: `${this.inkMidY - this.maxCanvasDim}px` }} >
                {penPaths}
            </svg>,
        !markerPaths.length ? (null) :
            <svg className={`inkingCanvas-paths-markers`} key="Markers"
                style={{ left: `${this.inkMidX - this.maxCanvasDim}px`, top: `${this.inkMidY - this.maxCanvasDim}px` }}>
                {markerPaths}
            </svg>];
    }

    render() {
        let svgCanvasStyle = InkingControl.Instance.selectedTool !== InkTool.None && !this.props.Document.isBackground ? "canSelect" : "noSelect";
        let cursor = svgCanvasStyle === "canSelect" ? (InkingControl.Instance.selectedTool === InkTool.Eraser ||
            InkingControl.Instance.selectedTool === InkTool.Scrubber ? "pointer" : "default") : undefined;
        return (
            <div className="inkingCanvas">
                <div className={`inkingCanvas-${svgCanvasStyle}`} onPointerDown={this.onPointerDown} style={{ cursor: cursor }} />
                {this.props.children()}
                {this.drawnPaths}
            </div >
        );
    }
}