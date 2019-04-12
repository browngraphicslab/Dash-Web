import { action, observable, trace, computed, reaction } from "mobx";
import { observer } from "mobx-react";
import { Document } from "../../../../fields/Document";
import { Documents } from "../../../documents/Documents";
import { Transform } from "../../../util/Transform";
import { CollectionFreeFormView } from "./CollectionFreeFormView";
import "./PreviewCursor.scss";
import React = require("react");
import { Main, PreviewCursorPrompt } from "../../Main";


export interface PreviewCursorProps {
    getTransform: () => Transform;
    container: CollectionFreeFormView;
    addLiveTextDocument: (doc: Document) => void;
}

@observer
export class PreviewCursor extends React.Component<PreviewCursorProps>  {
    @observable _lastX: number = 0;
    @observable _lastY: number = 0;
    @observable public DownX: number = 0;
    @observable public DownY: number = 0;
    _showOnUp: boolean = false;

    @action
    cleanupInteractions = () => {
        document.removeEventListener("pointerup", this.onPointerUp, true);
        document.removeEventListener("pointermove", this.onPointerMove, true);
    }

    @action
    onPointerDown = (e: React.PointerEvent) => {
        if (e.button === 0 && this.props.container.props.active()) {
            document.removeEventListener("keypress", this.onKeyPress, false);
            this._showOnUp = true;
            this.DownX = e.pageX;
            this.DownY = e.pageY;
            document.addEventListener("pointerup", this.onPointerUp, true);
            document.addEventListener("pointermove", this.onPointerMove, true);
        }
    }
    @action
    onPointerMove = (e: PointerEvent): void => {
        if (Math.abs(this.DownX - e.clientX) > 4 || Math.abs(this.DownY - e.clientY) > 4) {
            this._showOnUp = false;
            PreviewCursorPrompt.Visible = false;
        }
    }

    onPointerUp = (e: PointerEvent): void => {
        if (this._showOnUp) {
            PreviewCursorPrompt.Show(this.hideCursor, this.DownX, this.DownY);
            document.addEventListener("keypress", this.onKeyPress, false);
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
            let [x, y] = this.props.getTransform().transformPoint(this.DownX, this.DownY);
            let newBox = Documents.TextDocument({ width: 200, height: 100, x: x, y: y, title: "typed text" });
            this.props.addLiveTextDocument(newBox);
            PreviewCursorPrompt.Visible = false;
            e.stopPropagation();
        }
    }

    hideCursor = () => {
        document.removeEventListener("keypress", this.onKeyPress, false);
    }
    render() {
        return (
            <div className="previewCursorView" onPointerDown={this.onPointerDown}>
                {this.props.children}
            </div>
        );
    }
}