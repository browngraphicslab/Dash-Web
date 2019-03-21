import { observer } from "mobx-react";
import { observable } from "mobx";
import { action, computed } from "mobx";
import { InkingControl } from "./InkingControl";
import React = require("react");
import { Transform } from "../util/Transform";
import { Document } from "../../fields/Document";
import { KeyStore } from "../../fields/KeyStore";
import { InkField, InkTool, StrokeData, StrokeMap } from "../../fields/InkField";
import { InkingStroke } from "./InkingStroke";
import "./InkingCanvas.scss"
import { Utils } from "../../Utils";
import { FieldWaiting } from "../../fields/Field";

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
    handleMouseDown = (e: React.PointerEvent): void => {
        if (e.button != 0 ||
            InkingControl.Instance.selectedTool === InkTool.None) {
            return;
        }
        e.stopPropagation()
        if (InkingControl.Instance.selectedTool === InkTool.Eraser) {
            return
        }
        const point = this.relativeCoordinatesForEvent(e);

        // start the new line, saves a uuid to represent the field of the stroke
        this._idGenerator = Utils.GenerateGuid();
        let data = this.inkData;
        data.set(this._idGenerator,
            {
                pathData: [point],
                color: InkingControl.Instance.selectedColor,
                width: InkingControl.Instance.selectedWidth,
                tool: InkingControl.Instance.selectedTool,
                page: this.props.Document.GetNumber(KeyStore.CurPage, -1)
            });
        this.inkData = data;
        this._isDrawing = true;
    }

    @action
    handleMouseMove = (e: React.PointerEvent): void => {
        if (!this._isDrawing ||
            InkingControl.Instance.selectedTool === InkTool.None) {
            return;
        }
        e.stopPropagation()
        if (InkingControl.Instance.selectedTool === InkTool.Eraser) {
            return
        }
        const point = this.relativeCoordinatesForEvent(e);

        // add points to new line as it is being drawn
        let data = this.inkData;
        let strokeData = data.get(this._idGenerator);
        if (strokeData) {
            strokeData.pathData.push(point);
            data.set(this._idGenerator, strokeData);
        }

        this.inkData = data;
    }

    @action
    handleMouseUp = (e: MouseEvent): void => {
        this._isDrawing = false;
    }

    relativeCoordinatesForEvent = (e: React.MouseEvent): { x: number, y: number } => {
        let [x, y] = this.props.getScreenTransform().transformPoint(e.clientX, e.clientY);
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
        // styling for cursor
        let canvasStyle = {};
        if (InkingControl.Instance.selectedTool === InkTool.None) {
            canvasStyle = { pointerEvents: "none" };
        } else {
            canvasStyle = { pointerEvents: "auto", cursor: "crosshair" };
        }

        // get data from server
        // let inkField = this.props.Document.GetT(KeyStore.Ink, InkField);
        // if (!inkField || inkField == FieldWaiting) {
        //     return (<div className="inking-canvas" style={canvasStyle}
        //         onMouseDown={this.handleMouseDown} onMouseMove={this.handleMouseMove} >
        //         <svg>
        //         </svg>
        //     </div >)
        // }

        let lines = this.inkData;

        // parse data from server
        let paths: Array<JSX.Element> = []
        let curPage = this.props.Document.GetNumber(KeyStore.CurPage, -1)
        Array.from(lines).map(item => {
            let id = item[0];
            let strokeData = item[1];
            if (strokeData.page == -1 || strokeData.page == curPage)
                paths.push(<InkingStroke key={id} id={id}
                    line={strokeData.pathData}
                    color={strokeData.color}
                    width={strokeData.width}
                    tool={strokeData.tool}
                    deleteCallback={this.removeLine} />)
        })

        return (

            <div className="inking-canvas" style={canvasStyle}
                onPointerDown={this.handleMouseDown} onPointerMove={this.handleMouseMove} >
                <svg>
                    {paths}
                </svg>
            </div >
        )
    }
}