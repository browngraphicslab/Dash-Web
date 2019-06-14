import React = require("react");
import "./PDFMenu.scss";
import { observable, action } from "mobx";
import { observer } from "mobx-react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { emptyFunction } from "../../../Utils";
import { Doc } from "../../../new_fields/Doc";

@observer
export default class PDFMenu extends React.Component {
    static Instance: PDFMenu;

    @observable private _top: number = 0;
    @observable private _left: number = 0;
    @observable private _opacity: number = 1;
    @observable private _transition: string = "opacity 0.5s";
    @observable private _transitionDelay: string = "";
    @observable private _pinned: boolean = false;

    StartDrag: (e: PointerEvent) => void = emptyFunction;
    Highlight: (d: Doc | undefined) => void = emptyFunction;
    @observable Highlighting: boolean = false;

    private _timeout: NodeJS.Timeout | undefined;

    constructor(props: Readonly<{}>) {
        super(props);

        PDFMenu.Instance = this;
    }

    pointerDown = (e: React.PointerEvent) => {
        document.removeEventListener("pointermove", this.StartDrag);
        document.addEventListener("pointermove", this.StartDrag);
        document.removeEventListener("pointerup", this.pointerUp)
        document.addEventListener("pointerup", this.pointerUp)

        e.stopPropagation();
        e.preventDefault();
    }

    pointerUp = (e: PointerEvent) => {
        document.removeEventListener("pointermove", this.StartDrag);
        document.removeEventListener("pointerup", this.pointerUp);
        e.stopPropagation();
        e.preventDefault();
    }

    @action
    jumpTo = (x: number, y: number) => {
        if (!this._pinned) {
            this._transition = this._transitionDelay = "";
            this._opacity = 1;
            this._left = x;
            this._top = y;
        }
    }

    @action
    fadeOut = (forceOut: boolean) => {
        if (!this._pinned) {
            if (this._opacity === 0.2) {
                this._transition = "opacity 0.1s";
                this._transitionDelay = "";
                this._opacity = 0;
                this._left = this._top = -300;
            }

            if (forceOut) {
                this._transition = "";
                this._transitionDelay = "";
                this._opacity = 0;
                this._left = this._top = -300;
            }
        }
    }

    @action
    pointerLeave = (e: React.PointerEvent) => {
        if (!this._pinned) {
            this._transition = "opacity 0.5s";
            this._transitionDelay = "1s";
            this._opacity = 0.2;
            setTimeout(() => this.fadeOut(false), 3000);
        }
    }

    @action
    pointerEntered = (e: React.PointerEvent) => {
        this._transition = "opacity 0.1s";
        this._transitionDelay = "";
        this._opacity = 1;
    }

    @action
    togglePin = (e: React.MouseEvent) => {
        this._pinned = !this._pinned;
        this.Highlighting = this._pinned === false;
    }

    @action
    dragging = (e: PointerEvent) => {
        this._left += e.movementX;
        this._top += e.movementY;

        e.stopPropagation();
        e.preventDefault();
    }

    dragEnd = (e: PointerEvent) => {
        document.removeEventListener("pointermove", this.dragging);
        document.removeEventListener("pointerup", this.dragEnd);
        e.stopPropagation();
        e.preventDefault();
    }

    dragStart = (e: React.PointerEvent) => {
        document.removeEventListener("pointermove", this.dragging);
        document.addEventListener("pointermove", this.dragging);
        document.removeEventListener("pointerup", this.dragEnd);
        document.addEventListener("pointerup", this.dragEnd);

        e.stopPropagation();
        e.preventDefault();
    }

    @action
    highlightClicked = (e: React.MouseEvent) => {
        if (!this._pinned) {
            this.Highlight(undefined);
        }
        else {
            this.Highlighting = !this.Highlighting;
            this.Highlight(undefined);
        }
    }

    render() {
        return (
            <div className="pdfMenu-cont" onPointerLeave={this.pointerLeave} onPointerEnter={this.pointerEntered}
                style={{ left: this._left, top: this._top, opacity: this._opacity, transition: this._transition, transitionDelay: this._transitionDelay }}>
                <button className="pdfMenu-button" title="Highlight" onClick={this.highlightClicked}
                    style={this.Highlighting ? { backgroundColor: "#121212" } : {}}>
                    <FontAwesomeIcon icon="highlighter" size="lg" style={{ transition: "transform 0.1s", transform: this.Highlighting ? "" : "rotate(-45deg)" }} />
                </button>
                <button className="pdfMenu-button" title="Annotate" onPointerDown={this.pointerDown}><FontAwesomeIcon icon="comment-alt" size="lg" /></button>
                <button className="pdfMenu-button" title="Pin Menu" onClick={this.togglePin}
                    style={this._pinned ? { backgroundColor: "#121212" } : {}}>
                    <FontAwesomeIcon icon="thumbtack" size="lg" style={{ transition: "transform 0.1s", transform: this._pinned ? "rotate(45deg)" : "" }} />
                </button>
                <div className="pdfMenu-dragger" onPointerDown={this.dragStart} style={{ width: this._pinned ? "20px" : "0px" }} />
            </div >
        )
    }
}