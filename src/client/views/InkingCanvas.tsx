import { observer } from "mobx-react";
import { action } from "mobx";
import { InkingControl } from "./InkingControl";
import React = require("react");
import { Transform } from "../util/Transform";
import { Document } from "../../fields/Document";
import { KeyStore } from "../../fields/KeyStore";
import { InkField, InkTool, StrokeData, StrokeMap } from "../../fields/InkField";
import { JsxArgs } from "./nodes/DocumentView";
import { InkingStroke } from "./InkingStroke";
import "./InkingCanvas.scss"
import { CollectionDockingView } from "./collections/CollectionDockingView";
import { Utils } from "../../Utils";


interface InkCanvasProps {
    getScreenTransform: () => Transform;
    Document: Document;
}

@observer
export class InkingCanvas extends React.Component<InkCanvasProps> {

    private _isDrawing: boolean = false;
    private _idGenerator: string = "";

    constructor(props: Readonly<InkCanvasProps>) {
        super(props);
    }

    get inkData(): StrokeMap {
        return new Map(this.props.Document.GetData(KeyStore.Ink, InkField, new Map));
    }

    set inkData(value: StrokeMap) {
        this.props.Document.SetData(KeyStore.Ink, value, InkField);
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
        e.stopPropagation()
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
                page: this.props.Document.GetNumber(KeyStore.CurPage, 0)
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
        x += 50000
        y += 50000
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
        // if (!inkField || inkField == "<Waiting>") {
        //     return (<div className="inking-canvas" style={canvasStyle}
        //         onMouseDown={this.handleMouseDown} onMouseMove={this.handleMouseMove} >
        //         <svg>
        //         </svg>
        //     </div >)
        // }

        let lines = this.inkData;

        // parse data from server
        let paths: Array<JSX.Element> = []
        let curPage = this.props.Document.GetNumber(KeyStore.CurPage, 0)
        Array.from(lines).map(item => {
            let id = item[0];
            let strokeData = item[1];
            if (strokeData.page == 0 || strokeData.page == curPage)
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