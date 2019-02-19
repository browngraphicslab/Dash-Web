import { observable, computed } from "mobx";
import React = require("react");
import { SelectionManager } from "../util/SelectionManager";
import { observer } from "mobx-react";
import './DocumentDecorations.scss'
import { CollectionFreeFormView } from "./collections/CollectionFreeFormView";
import ContentEditable from 'react-contenteditable'
import { KeyStore } from '../../fields/Key'

@observer
export class DocumentDecorations extends React.Component<{}, { value: string }> {
    static Instance: DocumentDecorations
    private _resizer = ""
    private _isPointerDown = false;
    @observable private _opacity = 1;
    private keyinput: React.RefObject<HTMLInputElement>;

    constructor(props: Readonly<{}>) {
        super(props)
        DocumentDecorations.Instance = this
        this.state = { value: document.title };
        this.handleChange = this.handleChange.bind(this);
        this.keyinput = React.createRef();
    }

    handleChange(event: any) {
        this.setState({ value: event.target.value });
        console.log("Input box has changed")
    };

    enterPressed(e: any) {
        var key = e.keyCode || e.which;
        // enter pressed
        if (key == 13) {
            var text = e.target.value;
            if (text[0] == '#') {
                console.log("hashtag");
                // TODO: Change field with switch statement
            }
            e.target.blur();
        }
    }

    @computed
    get Bounds(): { x: number, y: number, b: number, r: number } {
        return SelectionManager.SelectedDocuments().reduce((bounds, element) => {
            if (element.props.ContainingCollectionView != undefined &&
                !(element.props.ContainingCollectionView instanceof CollectionFreeFormView)) {
                return bounds;
            }
            var spt = element.TransformToScreenPoint(0, 0);
            var bpt = element.TransformToScreenPoint(element.width, element.height);
            return {
                x: Math.min(spt.ScreenX, bounds.x), y: Math.min(spt.ScreenY, bounds.y),
                r: Math.max(bpt.ScreenX, bounds.r), b: Math.max(bpt.ScreenY, bounds.b)
            }
        }, { x: Number.MAX_VALUE, y: Number.MAX_VALUE, r: Number.MIN_VALUE, b: Number.MIN_VALUE });
    }

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
            console.log("Pointer down");
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
                element.props.Document.SetNumber(KeyStore.X, element.props.Document.GetNumber(KeyStore.X, 0) + dX * (actualdW - element.width));
                element.props.Document.SetNumber(KeyStore.Y, element.props.Document.GetNumber(KeyStore.Y, 0) + dY * (actualdH - element.height));
                if (Math.abs(dW) > Math.abs(dH))
                    element.width = actualdW;
                else
                    element.height = actualdH;
            }
        })
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
        var bounds = this.Bounds;
        return (
            <div id="documentDecorations-container" style={{
                width: (bounds.r - bounds.x + 20 + 20) + "px",
                height: (bounds.b - bounds.y + 40 + 20) + "px",
                left: bounds.x - 20,
                top: bounds.y - 20 - 20,
                opacity: this.opacity
            }}>
                <input ref={this.keyinput} className="title" type="text" name="dynbox" value={this.state.value} onChange={this.handleChange} onPointerDown={this.onPointerDown} onKeyPress={this.enterPressed} />
                {/* <div className="title" onPointerDown={this.onPointerDown}>{document.title}</div> */}
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