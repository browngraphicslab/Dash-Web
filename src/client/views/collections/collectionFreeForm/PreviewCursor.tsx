import { action, observable, trace, computed, reaction } from "mobx";
import { observer } from "mobx-react";
import { Document } from "../../../../fields/Document";
import { Documents } from "../../../documents/Documents";
import { Transform } from "../../../util/Transform";
import { CollectionFreeFormView } from "./CollectionFreeFormView";
import "./PreviewCursor.scss";
import React = require("react");
import { interfaceDeclaration } from "babel-types";


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

    @action
    cleanupInteractions = () => {
        document.removeEventListener("pointerup", this.onPointerUp, true);
        document.removeEventListener("pointermove", this.onPointerMove, true);
    }

    @action
    onPointerDown = (e: React.PointerEvent) => {
        if (e.button == 0 && this.props.container.props.active()) {
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
            this._visible = false;
        }
    }

    @action
    onPointerUp = (e: PointerEvent): void => {
        if (this._showOnUp) {
            document.addEventListener("keypress", this.onKeyPress, false);
            this._lastX = this.DownX;
            this._lastY = this.DownY;
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

    getPoint = () => this.props.getContainerTransform().transformPoint(this._lastX, this._lastY);
    getVisible = () => this._visible;
    setVisible = (v: boolean) => {
        this._visible = v;
        document.removeEventListener("keypress", this.onKeyPress, false);
    }
    render() {
        return (
            <div className="previewCursorView" onPointerDown={this.onPointerDown}>
                {this.props.children}
                <PreviewCursorPrompt setVisible={this.setVisible} getPoint={this.getPoint} getVisible={this.getVisible} />
            </div>
        )
    }
}

export interface PromptProps {
    getPoint: () => number[];
    getVisible: () => boolean;
    setVisible: (v: boolean) => void;
}

@observer
export class PreviewCursorPrompt extends React.Component<PromptProps> {
    private _promptRef = React.createRef<HTMLDivElement>();

    //when focus is lost, this will remove the preview cursor
    @action onBlur = (): void => this.props.setVisible(false);

    render() {
        let p = this.props.getPoint();
        if (this.props.getVisible() && this._promptRef.current)
            this._promptRef.current.focus();
        return <div className="previewCursor" id="previewCursor" onBlur={this.onBlur} tabIndex={0} ref={this._promptRef}
            style={{ transform: `translate(${p[0]}px, ${p[1]}px)`, opacity: this.props.getVisible() ? 1 : 0 }}>
            I
        </div >;
    }
}