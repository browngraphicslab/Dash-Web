import { action, computed, trace, observable, runInAction } from "mobx";
import { observer } from "mobx-react";
import { Document } from "../../fields/Document";
import { FieldWaiting } from "../../fields/Field";
import { InkField, InkTool, StrokeData, StrokeMap } from "../../fields/InkField";
import { KeyStore } from "../../fields/KeyStore";
import { Utils } from "../../Utils";
import { Transform } from "../util/Transform";
import "./InkingCanvas.scss";
import { InkingControl } from "./InkingControl";
import { InkingStroke } from "./InkingStroke";
import React = require("react");

interface InkCanvasProps {
    getScreenTransform: () => Transform;
    Document: Document;
    children: () => JSX.Element[];
}

@observer
export class InkingCanvas extends React.Component<InkCanvasProps> {
    maxCanvasDim = 8192 / 2; // 1/2 of the maximum canvas dimension for Chrome
    @observable inkMidX: number = 0;
    @observable inkMidY: number = 0;
    private _currentStrokeId: string = "";
    public static IntersectStrokeRect(stroke: StrokeData, selRect: { left: number, top: number, width: number, height: number }): boolean {
        return stroke.pathData.reduce((inside: boolean, val) => inside ||
            (selRect.left < val.x && selRect.left + selRect.width > val.x &&
                selRect.top < val.y && selRect.top + selRect.height > val.y)
            , false);
    }

    componentDidMount() {
        this.props.Document.GetTAsync(KeyStore.Ink, InkField, ink => runInAction(() => {
            if (ink) {
                let bounds = Array.from(ink.Data).reduce(([mix, max, miy, may], [id, strokeData]) =>
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
    get inkData(): StrokeMap {
        let map = this.props.Document.GetT(KeyStore.Ink, InkField);
        return !map || map === FieldWaiting ? new Map : new Map(map.Data);
    }

    set inkData(value: StrokeMap) {
        this.props.Document.SetDataOnPrototype(KeyStore.Ink, value, InkField);
    }

    @action
    onPointerDown = (e: React.PointerEvent): void => {
        if (e.button != 0 || e.altKey || e.ctrlKey || InkingControl.Instance.selectedTool === InkTool.None) {
            return;
        }
        document.addEventListener("pointermove", this.onPointerMove, true);
        document.addEventListener("pointerup", this.onPointerUp, true);
        e.stopPropagation();
        e.preventDefault();

        if (InkingControl.Instance.selectedTool != InkTool.Eraser) {
            // start the new line, saves a uuid to represent the field of the stroke
            this._currentStrokeId = Utils.GenerateGuid();
            this.inkData.set(this._currentStrokeId, {
                pathData: [this.relativeCoordinatesForEvent(e.clientX, e.clientY)],
                color: InkingControl.Instance.selectedColor,
                width: InkingControl.Instance.selectedWidth,
                tool: InkingControl.Instance.selectedTool,
                page: this.props.Document.GetNumber(KeyStore.CurPage, -1)
            });
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
    }

    @action
    onPointerMove = (e: PointerEvent): void => {
        e.stopPropagation()
        e.preventDefault();
        if (InkingControl.Instance.selectedTool != InkTool.Eraser) {
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
        let data = this.inkData;
        data.delete(id);
        this.inkData = data;
    }

    @computed
    get drawnPaths() {
        let curPage = this.props.Document.GetNumber(KeyStore.CurPage, -1)
        let paths = Array.from(this.inkData).reduce((paths, [id, strokeData]) => {
            if (strokeData.page == -1 || strokeData.page == curPage)
                paths.push(<InkingStroke key={id} id={id} line={strokeData.pathData}
                    offsetX={this.maxCanvasDim - this.inkMidX}
                    offsetY={this.maxCanvasDim - this.inkMidY}
                    color={strokeData.color} width={strokeData.width}
                    tool={strokeData.tool} deleteCallback={this.removeLine} />)
            return paths;
        }, [] as JSX.Element[]);
        return [<svg className={`inkingCanvas-paths-markers`} key="Markers"
            style={{ left: `${this.inkMidX - this.maxCanvasDim}px`, top: `${this.inkMidY - this.maxCanvasDim}px` }} >
            {paths.filter(path => path.props.tool == InkTool.Highlighter)}
        </svg>,
        <svg className={`inkingCanvas-paths-ink`} key="Pens"
            style={{ left: `${this.inkMidX - this.maxCanvasDim}px`, top: `${this.inkMidY - this.maxCanvasDim}px` }}>
            {paths.filter(path => path.props.tool != InkTool.Highlighter)}
        </svg>];
    }

    render() {
        let svgCanvasStyle = InkingControl.Instance.selectedTool != InkTool.None ? "canSelect" : "noSelect";
        return (
            <div className="inkingCanvas" >
                <div className={`inkingCanvas-${svgCanvasStyle}`} onPointerDown={this.onPointerDown} />
                {this.props.children()}
                {this.drawnPaths}
            </div >
        )
    }
}