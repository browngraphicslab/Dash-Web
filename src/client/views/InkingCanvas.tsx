import { action, computed } from "mobx";
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
}

@observer
export class InkingCanvas extends React.Component<InkCanvasProps> {
    static InkOffset: number = 50000;
    public static IntersectStrokeRect(stroke: StrokeData, selRect: { left: number, top: number, width: number, height: number }): boolean {
        let inside = false;
        stroke.pathData.map(val => {
            if (selRect.left < val.x - InkingCanvas.InkOffset && selRect.left + selRect.width > val.x - InkingCanvas.InkOffset &&
                selRect.top < val.y - InkingCanvas.InkOffset && selRect.top + selRect.height > val.y - InkingCanvas.InkOffset)
                inside = true;
        });
        return inside
    }
    private _isDrawing: boolean = false;
    private _idGenerator: string = "";

    constructor(props: Readonly<InkCanvasProps>) {
        super(props);
    }

    @computed
    get inkData(): StrokeMap {
        let map = this.props.Document.GetT(KeyStore.Ink, InkField);
        if (!map || map === FieldWaiting) {
            return new Map;
        }
        return new Map(map.Data);
    }

    set inkData(value: StrokeMap) {
        this.props.Document.SetDataOnPrototype(KeyStore.Ink, value, InkField);
    }

    componentDidMount() {
        document.addEventListener("mouseup", this.handleMouseUp);
    }

    componentWillUnmount() {
        document.removeEventListener("mouseup", this.handleMouseUp);
    }

    @action
    onPointerDown = (e: React.PointerEvent): void => {
        this._isDrawing = false;
        if (e.button != 0 || e.altKey || e.ctrlKey ||
            InkingControl.Instance.selectedTool === InkTool.None) {
            return;
        }
        document.addEventListener("pointermove", this.onPointerMove, true);
        document.addEventListener("pointerup", this.onPointerUp, true);
        e.stopPropagation();

        this._isDrawing = true;
        if (InkingControl.Instance.selectedTool != InkTool.Eraser) {
            const point = this.relativeCoordinatesForEvent(e.clientX, e.clientY);

            // start the new line, saves a uuid to represent the field of the stroke
            this._idGenerator = Utils.GenerateGuid();
            this.inkData.set(this._idGenerator,
                {
                    pathData: [point],
                    color: InkingControl.Instance.selectedColor,
                    width: InkingControl.Instance.selectedWidth,
                    tool: InkingControl.Instance.selectedTool,
                    page: this.props.Document.GetNumber(KeyStore.CurPage, -1)
                });
        }
    }

    onPointerUp = (e: PointerEvent): void => {
        if (this._isDrawing) {
            document.removeEventListener("pointermove", this.onPointerMove);
            document.removeEventListener("pointerup", this.onPointerUp);
            this._isDrawing = false;
            e.stopPropagation();
        }
    }

    @action
    onPointerMove = (e: PointerEvent): void => {
        if (this._isDrawing) {
            e.stopPropagation()
            e.preventDefault();
            if (InkingControl.Instance.selectedTool === InkTool.Eraser) {
                return
            }
            const point = this.relativeCoordinatesForEvent(e.clientX, e.clientY);

            // add points to new line as it is being drawn
            let data = this.inkData;
            let strokeData = data.get(this._idGenerator);
            if (strokeData) {
                strokeData.pathData.push(point);
                data.set(this._idGenerator, strokeData);
            }

            this.inkData = data;
        }
    }

    @action
    handleMouseUp = (e: MouseEvent): void => {
        this._isDrawing = false;
    }

    relativeCoordinatesForEvent = (ex: number, ey: number): { x: number, y: number } => {
        let [x, y] = this.props.getScreenTransform().transformPoint(ex, ey);
        x += InkingCanvas.InkOffset;
        y += InkingCanvas.InkOffset;
        return { x, y };
    }

    @action
    removeLine = (id: string): void => {
        let data = this.inkData;
        data.delete(id);
        this.inkData = data;
    }

    render() {
        // parse data from server
        let curPage = this.props.Document.GetNumber(KeyStore.CurPage, -1)
        let paths = Array.from(this.inkData).reduce((paths, [id, strokeData]) => {
            if (strokeData.page == -1 || strokeData.page == curPage)
                paths.push(<InkingStroke key={id} id={id}
                    line={strokeData.pathData}
                    color={strokeData.color}
                    width={strokeData.width}
                    tool={strokeData.tool}
                    deleteCallback={this.removeLine} />)
            return paths;
        }, [] as JSX.Element[]);
        let svgCanvasStyle = InkingControl.Instance.selectedTool == InkTool.None ? "-none" : "";

        return (
            <div className="inkingCanvas" >
                {this.props.children}
                <svg className={`inkingCanvas-paths${svgCanvasStyle}`} onPointerDown={this.onPointerDown} >
                    {paths}
                </svg>
            </div >
        )
    }
}