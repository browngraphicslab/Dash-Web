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

    @observable private _top: number = -300;
    @observable private _left: number = -300;
    @observable private _opacity: number = 1;
    @observable private _transition: string = "opacity 0.5s";
    @observable private _transitionDelay: string = "";

    @observable public Pinned: boolean = false;

    StartDrag: (e: PointerEvent) => void = emptyFunction;
    Highlight: (d: Doc | undefined, color: string | undefined) => void = emptyFunction;
    Delete: () => void = emptyFunction;

    @observable public Highlighting: boolean = false;
    @observable public Status: "pdf" | "annotation" | "" = "";

    private _offsetY: number = 0;
    private _offsetX: number = 0;
    private _mainCont: React.RefObject<HTMLDivElement>;
    private _dragging: boolean = false;

    constructor(props: Readonly<{}>) {
        super(props);

        PDFMenu.Instance = this;

        this._mainCont = React.createRef();
    }

    pointerDown = (e: React.PointerEvent) => {
        document.removeEventListener("pointermove", this.pointerMove);
        document.addEventListener("pointermove", this.pointerMove);
        document.removeEventListener("pointerup", this.pointerUp);
        document.addEventListener("pointerup", this.pointerUp);

        e.stopPropagation();
        e.preventDefault();
    }

    pointerMove = (e: PointerEvent) => {
        e.stopPropagation();
        e.preventDefault();

        if (this._dragging) {
            return;
        }

        this.StartDrag(e);
        this._dragging = true;
    }

    pointerUp = (e: PointerEvent) => {
        this._dragging = false;
        document.removeEventListener("pointermove", this.pointerMove);
        document.removeEventListener("pointerup", this.pointerUp);
        e.stopPropagation();
        e.preventDefault();
    }

    @action
    jumpTo = (x: number, y: number, forceJump: boolean = false) => {
        if (!this.Pinned || forceJump) {
            this._transition = this._transitionDelay = "";
            this._opacity = 1;
            this._left = x;
            this._top = y;
        }
    }

    @action
    fadeOut = (forceOut: boolean) => {
        if (!this.Pinned) {
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
        if (!this.Pinned) {
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
        this.Pinned = !this.Pinned;
        if (!this.Pinned) {
            this.Highlighting = false;
        }
    }

    @action
    dragging = (e: PointerEvent) => {
        this._left = e.pageX - this._offsetX;
        this._top = e.pageY - this._offsetY;

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

        this._offsetX = this._mainCont.current!.getBoundingClientRect().width - e.nativeEvent.offsetX;
        this._offsetY = e.nativeEvent.offsetY;

        e.stopPropagation();
        e.preventDefault();
    }

    @action
    highlightClicked = (e: React.MouseEvent) => {
        if (!this.Pinned) {
            this.Highlight(undefined, "#f4f442");
        }
        else {
            this.Highlighting = !this.Highlighting;
            this.Highlight(undefined, "#f4f442");
        }
    }

    deleteClicked = (e: React.PointerEvent) => {
        this.Delete();
    }

    handleContextMenu = (e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
    }

    render() {
        let buttons = this.Status === "pdf" ? [
            <button className="pdfMenu-button" title="Click to Highlight" onClick={this.highlightClicked}
                style={this.Highlighting ? { backgroundColor: "#121212" } : {}}>
                <FontAwesomeIcon icon="highlighter" size="lg" style={{ transition: "transform 0.1s", transform: this.Highlighting ? "" : "rotate(-45deg)" }} />
            </button>,
            <button className="pdfMenu-button" title="Drag to Annotate" onPointerDown={this.pointerDown}><FontAwesomeIcon icon="comment-alt" size="lg" /></button>,
            <button className="pdfMenu-button" title="Pin Menu" onClick={this.togglePin}
                style={this.Pinned ? { backgroundColor: "#121212" } : {}}>
                <FontAwesomeIcon icon="thumbtack" size="lg" style={{ transition: "transform 0.1s", transform: this.Pinned ? "rotate(45deg)" : "" }} />
            </button>
        ] : [
                <button className="pdfMenu-button" title="Delete Anchor" onPointerDown={this.deleteClicked}><FontAwesomeIcon icon="trash-alt" size="lg" /></button>
            ];

        return (
            <div className="pdfMenu-cont" onPointerLeave={this.pointerLeave} onPointerEnter={this.pointerEntered} ref={this._mainCont} onContextMenu={this.handleContextMenu}
                style={{ left: this._left, top: this._top, opacity: this._opacity, transition: this._transition, transitionDelay: this._transitionDelay }}>
                {buttons}
                {/* <button className="pdfMenu-button" title="Highlight" onClick={this.highlightClicked}
                    style={this.Highlighting ? { backgroundColor: "#121212" } : {}}>
                    <FontAwesomeIcon icon="highlighter" size="lg" style={{ transition: "transform 0.1s", transform: this.Highlighting ? "" : "rotate(-45deg)" }} />
                </button>
                <button className="pdfMenu-button" title="Annotate" onPointerDown={this.pointerDown}><FontAwesomeIcon icon="comment-alt" size="lg" /></button>
                <button className="pdfMenu-button" title="Pin Menu" onClick={this.togglePin}
                    style={this._pinned ? { backgroundColor: "#121212" } : {}}>
                    <FontAwesomeIcon icon="thumbtack" size="lg" style={{ transition: "transform 0.1s", transform: this._pinned ? "rotate(45deg)" : "" }} />
                </button> */}
                <div className="pdfMenu-dragger" onPointerDown={this.dragStart} style={{ width: this.Pinned ? "20px" : "0px" }} />
            </div >
        );
    }
}