import { action, observable } from "mobx";
import { observer } from "mobx-react";
import { Document } from "../../../../fields/Document";
import { Documents } from "../../../documents/Documents";
import { Transform } from "../../../util/Transform";
import { CollectionFreeFormView } from "./CollectionFreeFormView";
import "./PreviewCursor.scss";
import React = require("react");


export interface PreviewCursorProps {
    getTransform: () => Transform;
    getContainerTransform: () => Transform;
    container: CollectionFreeFormView;
    addLiveTextDocument: (doc: Document) => void;
}

@observer
export class PreviewCursor extends React.Component<PreviewCursorProps>  {
    @observable _lastX: number = 0;
    @observable _lastY: number = 0;
    @observable public _visible: boolean = false;
    @observable public DownX: number = 0;
    @observable public DownY: number = 0;
    _showOnUp: boolean = false;
    public _previewDivRef = React.createRef<HTMLDivElement>();

    @action
    cleanupInteractions = () => {
        document.removeEventListener("pointerup", this.onPointerUp, true);
    }

    @action
    onPointerDown = (e: React.PointerEvent) => {
        this._visible = false;
        document.removeEventListener("keypress", this.onKeyPress, false);
        this._showOnUp = true;
        this._lastX = this.DownX = e.pageX;
        this._lastY = this.DownY = e.pageY;
        document.addEventListener("pointerup", this.onPointerUp, true);
        document.addEventListener("pointermove", this.onPointerMove, true);
    }
    @action
    onPointerMove = (e: PointerEvent): void => {
        if (Math.abs(this.DownX - e.clientX) > 4 || Math.abs(this.DownY - e.clientY) > 4) {
            this._showOnUp = false;
        }
    }

    @action
    onPointerUp = (e: PointerEvent): void => {
        if (this._showOnUp) {
            document.addEventListener("keypress", this.onKeyPress, false);
            this._visible = true;
        }
        this.cleanupInteractions();
    }

    @action
    onKeyPress = (e: KeyboardEvent) => {
        // Mixing events between React and Native is finicky.  In FormattedTextBox, we set the
        // DASHFormattedTextBoxHandled flag when a text box consumes a key press so that we can ignore
        // the keyPress here.
        //if not these keys, make a textbox if preview cursor is active!
        if (!e.ctrlKey && !e.altKey && !e.defaultPrevented && !(e as any).DASHFormattedTextBoxHandled) {
            //make textbox and add it to this collection
            let [x, y] = this.props.getTransform().transformPoint(this._lastX, this._lastY);
            let newBox = Documents.TextDocument({ width: 200, height: 100, x: x, y: y, title: "typed text" });
            this.props.addLiveTextDocument(newBox);
            document.removeEventListener("keypress", this.onKeyPress, false);
            this._visible = false;
            e.stopPropagation();
        }
    }
    //when focus is lost, this will remove the preview cursor
    @action
    onBlur = (): void => {
        this._visible = false;
        document.removeEventListener("keypress", this.onKeyPress, false);
    }

    render() {
        //get local position and place cursor there!
        let p = this.props.getContainerTransform().transformPoint(this._lastX, this._lastY);
        if (this._visible && this._previewDivRef.current)
            this._previewDivRef.current!.focus();
        return (
            <div className="previewCursorView" tabIndex={0} ref={this._previewDivRef} onBlur={this.onBlur} onPointerDown={this.onPointerDown}>
                {this.props.children}
                {!this._visible ? (null) :
                    <div className="previewCursor" id="previewCursor" style={{ transform: `translate(${p[0]}px, ${p[1]}px)` }}>I</div>}
            </div>
        )
    }
}