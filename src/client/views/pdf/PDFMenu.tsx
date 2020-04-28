import React = require("react");
import "./PDFMenu.scss";
import { observable, action, } from "mobx";
import { observer } from "mobx-react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { unimplementedFunction, returnFalse } from "../../../Utils";
import AntimodeMenu from "../AntimodeMenu";
import { Doc, Opt } from "../../../new_fields/Doc";

@observer
export default class PDFMenu extends AntimodeMenu {
    static Instance: PDFMenu;

    private _commentCont = React.createRef<HTMLButtonElement>();

    @observable private _keyValue: string = "";
    @observable private _valueValue: string = "";
    @observable private _added: boolean = false;

    @observable public Highlighting: boolean = false;
    @observable public Status: "pdf" | "annotation" | "" = "";

    public StartDrag: (e: PointerEvent, ele: HTMLElement) => void = unimplementedFunction;
    public Highlight: (color: string) => Opt<Doc> = (color: string) => undefined;
    public Delete: () => void = unimplementedFunction;
    public AddTag: (key: string, value: string) => boolean = returnFalse;
    public PinToPres: () => void = unimplementedFunction;
    public Marquee: { left: number; top: number; width: number; height: number; } | undefined;

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

        if (!this._dragging) {
            this.StartDrag(e, this._commentCont.current!);
            this._dragging = true;
        }
    }

    pointerUp = (e: PointerEvent) => {
        this._dragging = false;
        document.removeEventListener("pointermove", this.pointerMove);
        document.removeEventListener("pointerup", this.pointerUp);
        e.stopPropagation();
        e.preventDefault();
    }

    togglePin = action((e: React.MouseEvent) => {
        this.Pinned = !this.Pinned;
        !this.Pinned && (this.Highlighting = false);
    });

    @action
    highlightClicked = (e: React.MouseEvent) => {
        if (!this.Highlight("rgba(245, 230, 95, 0.616)") && this.Pinned) { // yellowish highlight color for a marker type highlight
            this.Highlighting = !this.Highlighting;
        }
    }

    deleteClicked = (e: React.PointerEvent) => {
        this.Delete();
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

            setTimeout(action(() => this._added = false), 1000);
        }
    }

    render() {
        const buttons = this.Status === "pdf" ?
            [
                <button key="1" className="antimodeMenu-button" title="Click to Highlight" onClick={this.highlightClicked} style={this.Highlighting ? { backgroundColor: "#121212" } : {}}>
                    <FontAwesomeIcon icon="highlighter" size="lg" style={{ transition: "transform 0.1s", transform: this.Highlighting ? "" : "rotate(-45deg)" }} /></button>,
                <button key="2" className="antimodeMenu-button" title="Drag to Annotate" ref={this._commentCont} onPointerDown={this.pointerDown}>
                    <FontAwesomeIcon icon="comment-alt" size="lg" /></button>,
                <button key="4" className="antimodeMenu-button" title="Pin Menu" onClick={this.togglePin} style={this.Pinned ? { backgroundColor: "#121212" } : {}}>
                    <FontAwesomeIcon icon="thumbtack" size="lg" style={{ transition: "transform 0.1s", transform: this.Pinned ? "rotate(45deg)" : "" }} /> </button>
            ] : [
                <button key="5" className="antimodeMenu-button" title="Delete Anchor" onPointerDown={this.deleteClicked}>
                    <FontAwesomeIcon icon="trash-alt" size="lg" /></button>,
                <button key="6" className="antimodeMenu-button" title="Pin to Presentation" onPointerDown={this.PinToPres}>
                    <FontAwesomeIcon icon="map-pin" size="lg" /></button>,
                <div key="7" className="pdfMenu-addTag" >
                    <input onChange={this.keyChanged} placeholder="Key" style={{ gridColumn: 1 }} />
                    <input onChange={this.valueChanged} placeholder="Value" style={{ gridColumn: 3 }} />
                </div>,
                <button key="8" className="antimodeMenu-button" title={`Add tag: ${this._keyValue} with value: ${this._valueValue}`} onPointerDown={this.addTag}>
                    <FontAwesomeIcon style={{ transition: "all .2s" }} color={this._added ? "#42f560" : "white"} icon="check" size="lg" /></button>,
            ];

        return this.getElement(buttons);
    }
}