import { observable, computed } from "mobx";
import React = require("react");
import { DocumentView } from "./views/nodes/DocumentView";
import { SelectionManager } from "./util/SelectionManager";
import { observer } from "mobx-react";
import './DocumentDecorations.scss'

@observer
export class DocumentDecorations extends React.Component {
    static Instance: DocumentDecorations
    constructor(props: Readonly<{}>) {
        super(props)

        DocumentDecorations.Instance = this
    }

    get x(): number {
        return SelectionManager.SelectedDocuments().reduce((left, element) => Math.min(element.screenRect.left, left), Number.MAX_VALUE);
    }

    get y(): number {
        return SelectionManager.SelectedDocuments().reduce((top, element) => Math.min(element.screenRect.top, top), Number.MAX_VALUE);
    }

    get height(): number {
        return (SelectionManager.SelectedDocuments().reduce((bottom, element) => Math.max(element.screenRect.bottom, bottom),
            Number.MIN_VALUE)) - this.y;
    }

    get width(): number {
        return SelectionManager.SelectedDocuments().reduce((right, element) => Math.max(element.screenRect.right, right),
            Number.MIN_VALUE) - this.x;
    }

    private _resizer = ""
    private _isPointerDown = false;
    @observable private _opacity = 1;

    @computed
    get opacity(): number {
        return this._opacity
    }

    set opacity(o: number) {
        this._opacity = Math.min(Math.max(0, o), 1)
    }

    onPointerDown = (e: React.PointerEvent): void => {
        e.stopPropagation();
        if (e.button === 0) {
            this._isPointerDown = true;
            this._resizer = e.currentTarget.id;
            document.removeEventListener("pointermove", this.onPointerMove);
            document.addEventListener("pointermove", this.onPointerMove);
            document.removeEventListener("pointerup", this.onPointerUp);
            document.addEventListener("pointerup", this.onPointerUp);
        }
    }

    onPointerMove = (e: PointerEvent): void => {
        e.stopPropagation();
        e.preventDefault();
        if (!this._isPointerDown) {
            return;
        }

        let dX = 0, dY = 0, dW = 0, dH = 0;

        switch (this._resizer) {
            case "":
                break;
            case "documentDecorations-topLeftResizer":
                dX = -1
                dY = -1
                dW = -(e.movementX)
                dH = -(e.movementY)
                break;
            case "documentDecorations-topRightResizer":
                dW = e.movementX
                dY = -1
                dH = -(e.movementY)
                break;
            case "documentDecorations-topResizer":
                dY = -1
                dH = -(e.movementY)
                break;
            case "documentDecorations-bottomLeftResizer":
                dX = -1
                dW = -(e.movementX)
                dH = e.movementY
                break;
            case "documentDecorations-bottomRightResizer":
                dW = e.movementX
                dH = e.movementY
                break;
            case "documentDecorations-bottomResizer":
                dH = e.movementY
                break;
            case "documentDecorations-leftResizer":
                dX = -1
                dW = -(e.movementX)
                break;
            case "documentDecorations-rightResizer":
                dW = e.movementX
                break;
        }

        SelectionManager.SelectedDocuments().forEach(element => {
            const rect = element.screenRect;
            if (rect.width !== 0) {
                let scale = element.width / rect.width;
                let actualdW = Math.max(element.width + (dW * scale), 20);
                let actualdH = Math.max(element.height + (dH * scale), 20);
                element.x += dX * (actualdW - element.width);
                element.y += dY * (actualdH - element.height);
                element.width = actualdW;
                element.height = actualdH;
            }
        })

        this.forceUpdate()
    }

    onPointerUp = (e: PointerEvent): void => {
        e.stopPropagation();
        if (e.button === 0) {
            e.preventDefault();
            this._isPointerDown = false;
            document.removeEventListener("pointermove", this.onPointerMove);
            document.removeEventListener("pointerup", this.onPointerUp);
        }
    }

    render() {
        return (
            <div id="documentDecorations-container" style={{
                width: `${this.width + 40}px`,
                height: `${this.height + 40}px`,
                left: this.x - 20,
                top: this.y - 20,
                opacity: this.opacity
            }}>
                <div id="documentDecorations-topLeftResizer" className="documentDecorations-resizer" onPointerDown={this.onPointerDown} onContextMenu={(e) => e.preventDefault()}></div>
                <div id="documentDecorations-topResizer" className="documentDecorations-resizer" onPointerDown={this.onPointerDown} onContextMenu={(e) => e.preventDefault()}></div>
                <div id="documentDecorations-topRightResizer" className="documentDecorations-resizer" onPointerDown={this.onPointerDown} onContextMenu={(e) => e.preventDefault()}></div>
                <div id="documentDecorations-leftResizer" className="documentDecorations-resizer" onPointerDown={this.onPointerDown} onContextMenu={(e) => e.preventDefault()}></div>
                <div id="documentDecorations-centerCont"></div>
                <div id="documentDecorations-rightResizer" className="documentDecorations-resizer" onPointerDown={this.onPointerDown} onContextMenu={(e) => e.preventDefault()}></div>
                <div id="documentDecorations-bottomLeftResizer" className="documentDecorations-resizer" onPointerDown={this.onPointerDown} onContextMenu={(e) => e.preventDefault()}></div>
                <div id="documentDecorations-bottomResizer" className="documentDecorations-resizer" onPointerDown={this.onPointerDown} onContextMenu={(e) => e.preventDefault()}></div>
                <div id="documentDecorations-bottomRightResizer" className="documentDecorations-resizer" onPointerDown={this.onPointerDown} onContextMenu={(e) => e.preventDefault()}></div>

            </div>
        )
    }
}