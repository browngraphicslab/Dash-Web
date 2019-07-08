import React = require("react");
import "./PDFMenu.scss";
import { observable, action, runInAction } from "mobx";
import { observer } from "mobx-react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { emptyFunction, returnFalse } from "../../../Utils";
import { Doc } from "../../../new_fields/Doc";

@observer
export default class PDFMenu extends React.Component {
    static Instance: PDFMenu;

    @observable private _top: number = -300;
    @observable private _left: number = -300;
    @observable private _opacity: number = 1;
    @observable private _transition: string = "opacity 0.5s";
    @observable private _transitionDelay: string = "";


    StartDrag: (e: PointerEvent, ele: HTMLDivElement) => void = emptyFunction;
    Highlight: (d: Doc | undefined, color: string | undefined) => void = emptyFunction;
    Delete: () => void = emptyFunction;
    Snippet: (marquee: { left: number, top: number, width: number, height: number }) => void = emptyFunction;
    AddTag: (key: string, value: string) => boolean = returnFalse;
    PinToPres: () => void = emptyFunction;

    @observable public Highlighting: boolean = false;
    @observable public Status: "pdf" | "annotation" | "snippet" | "" = "";
    @observable public Pinned: boolean = false;

    public Marquee: { left: number; top: number; width: number; height: number; } | undefined;

    private _offsetY: number = 0;
    private _offsetX: number = 0;
    private _mainCont: React.RefObject<HTMLDivElement> = React.createRef();
    private _commentCont: React.RefObject<HTMLDivElement> = React.createRef();
    private _snippetButton: React.RefObject<HTMLButtonElement> = React.createRef();
    private _dragging: boolean = false;
    @observable private _keyValue: string = "";
    @observable private _valueValue: string = "";
    @observable private _added: boolean = false;

    constructor(props: Readonly<{}>) {
        super(props);

        PDFMenu.Instance = this;
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

        this.StartDrag(e, this._commentCont.current!);
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

    snippetStart = (e: React.PointerEvent) => {
        document.removeEventListener("pointermove", this.snippetDrag);
        document.addEventListener("pointermove", this.snippetDrag);
        document.removeEventListener("pointerup", this.snippetEnd);
        document.addEventListener("pointerup", this.snippetEnd);

        e.stopPropagation();
        e.preventDefault();
    }

    snippetDrag = (e: PointerEvent) => {
        e.stopPropagation();
        e.preventDefault();
        if (this._dragging) {
            return;
        }
        this._dragging = true;

        if (this.Marquee) {
            this.Snippet(this.Marquee);
        }
    }

    snippetEnd = (e: PointerEvent) => {
        this._dragging = false;
        document.removeEventListener("pointermove", this.snippetDrag);
        document.removeEventListener("pointerup", this.snippetEnd);
        e.stopPropagation();
        e.preventDefault();
    }

    @action
    keyChanged = (e: React.ChangeEvent<HTMLInputElement>) => {
        this._keyValue = e.currentTarget.value;
    }

    @action
    valueChanged = (e: React.ChangeEvent<HTMLInputElement>) => {
        this._valueValue = e.currentTarget.value;
    }

    @action
    addTag = (e: React.PointerEvent) => {
        if (this._keyValue.length > 0 && this._valueValue.length > 0) {
            this._added = this.AddTag(this._keyValue, this._valueValue);

            setTimeout(
                () => {
                    runInAction(() => {
                        this._added = false;
                    });
                }, 1000
            );
        }
    }

    render() {
        let buttons = this.Status === "pdf" || this.Status === "snippet" ? [
            <button className="pdfMenu-button" title="Click to Highlight" onClick={this.highlightClicked} key="1"
                style={this.Highlighting ? { backgroundColor: "#121212" } : {}}>
                <FontAwesomeIcon icon="highlighter" size="lg" style={{ transition: "transform 0.1s", transform: this.Highlighting ? "" : "rotate(-45deg)" }} />
            </button>,
            <button className="pdfMenu-button" title="Drag to Annotate" ref={this._commentCont} onPointerDown={this.pointerDown}><FontAwesomeIcon icon="comment-alt" size="lg" key="2" /></button>,
            this.Status === "snippet" ? <button className="pdfMenu-button" title="Drag to Snippetize Selection" onPointerDown={this.snippetStart} ref={this._snippetButton}><FontAwesomeIcon icon="cut" size="lg" /></button> : undefined,
            <button className="pdfMenu-button" title="Pin Menu" onClick={this.togglePin} key="3"
                style={this.Pinned ? { backgroundColor: "#121212" } : {}}>
                <FontAwesomeIcon icon="thumbtack" size="lg" style={{ transition: "transform 0.1s", transform: this.Pinned ? "rotate(45deg)" : "" }} />
            </button>
        ] : [
                <button className="pdfMenu-button" title="Delete Anchor" onPointerDown={this.deleteClicked}><FontAwesomeIcon icon="trash-alt" size="lg" key="1" /></button>,
                <button className="pdfMenu-button" title="Pin to Presentation" onPointerDown={this.PinToPres}><FontAwesomeIcon icon="map-pin" size="lg" key="2" /></button>,
                <div className="pdfMenu-addTag" key="3">
                    <input onChange={this.keyChanged} placeholder="Key" style={{ gridColumn: 1 }} />
                    <input onChange={this.valueChanged} placeholder="Value" style={{ gridColumn: 3 }} />
                </div>,
                <button className="pdfMenu-button" title={`Add tag: ${this._keyValue} with value: ${this._valueValue}`} onPointerDown={this.addTag}><FontAwesomeIcon style={{ transition: "all .2s" }} color={this._added ? "#42f560" : "white"} icon="check" size="lg" key="4" /></button>,
            ];

        return (
            <div className="pdfMenu-cont" onPointerLeave={this.pointerLeave} onPointerEnter={this.pointerEntered} ref={this._mainCont} onContextMenu={this.handleContextMenu}
                style={{ left: this._left, top: this._top, opacity: this._opacity, transition: this._transition, transitionDelay: this._transitionDelay }}>
                {buttons}
                <div className="pdfMenu-dragger" onPointerDown={this.dragStart} style={{ width: this.Pinned ? "20px" : "0px" }} />
            </div >
        );
    }
}