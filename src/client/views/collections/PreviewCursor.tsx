import { trace } from "mobx";
import "./PreviewCursor.scss";
import React = require("react");
import { action, IReactionDisposer, observable, reaction } from "mobx";
import { observer } from "mobx-react";
import { Document } from "../../../fields/Document";
import { FieldWaiting, Opt } from "../../../fields/Field";
import { KeyStore } from "../../../fields/KeyStore";
import { ListField } from "../../../fields/ListField";
import { Documents } from "../../documents/Documents";
import { SelectionManager } from "../../util/SelectionManager";
import { Transform } from "../../util/Transform";
import { CollectionFreeFormView } from "./CollectionFreeFormView";


export interface PreviewCursorProps {
    getTransform: () => Transform;
    container: CollectionFreeFormView;
    addLiveTextDocuemnt: (doc: Document) => void;
}

@observer
export class PreviewCursor extends React.Component<PreviewCursorProps>  {
    private _reactionDisposer: Opt<IReactionDisposer>;

    @observable _lastX: number = 0;
    @observable _lastY: number = 0;

    componentDidMount() {
        this._reactionDisposer = reaction(
            () => this.props.container.PreviewCursorVisible,
            (visible: boolean) => this.onCursorPlaced(visible, this.props.container.DownX, this.props.container.DownY))
    }
    componentWillUnmount() {
        if (this._reactionDisposer) {
            this._reactionDisposer();
        }
        this.cleanupInteractions();
    }


    @action
    cleanupInteractions = () => {
        document.removeEventListener("keypress", this.onKeyPress, true);
    }

    @action
    onCursorPlaced = (visible: boolean, downX: number, downY: number): void => {
        if (visible) {
            document.addEventListener("keypress", this.onKeyPress, true);
            this._lastX = downX;
            this._lastY = downY;
        } else
            this.cleanupInteractions();
    }

    @action
    onKeyPress = (e: KeyboardEvent) => {
        //if not these keys, make a textbox if preview cursor is active!
        if (!e.ctrlKey && !e.altKey && !e.defaultPrevented) {
            //make textbox and add it to this collection
            let [x, y] = this.props.getTransform().transformPoint(this._lastX, this._lastY);
            let newBox = Documents.TextDocument({ width: 200, height: 100, x: x, y: y, title: "new" });
            this.props.addLiveTextDocuemnt(newBox);
            e.stopPropagation();
            e.preventDefault();
        }
    }

    render() {
        //get local position and place cursor there!
        let [x, y] = this.props.getTransform().transformPoint(this._lastX, this._lastY);
        return (
            !this.props.container.PreviewCursorVisible ? (null) :
                <div className="previewCursor" id="previewCursor" style={{ transform: `translate(${x}px, ${y}px)` }}>I</div>)

    }
}