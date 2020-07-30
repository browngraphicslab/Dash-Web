import React = require("react");
import "./PDFMenu.scss";
import { observable, action, computed, } from "mobx";
import { observer } from "mobx-react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { unimplementedFunction, returnFalse, Utils } from "../../../Utils";
import AntimodeMenu from "../AntimodeMenu";
import { Doc, Opt } from "../../../fields/Doc";
import { ColorState } from "react-color";
import { ButtonDropdown } from "../nodes/formattedText/RichTextMenu";


@observer
export default class PDFMenu extends AntimodeMenu {
    static Instance: PDFMenu;

    private _commentCont = React.createRef<HTMLButtonElement>();
    private _palette = [
        "rgba(208, 2, 27, 0.8)",
        "rgba(238, 0, 0, 0.8)",
        "rgba(245, 166, 35, 0.8)",
        "rgba(248, 231, 28, 0.8)",
        "rgba(245, 230, 95, 0.616)",
        "rgba(139, 87, 42, 0.8)",
        "rgba(126, 211, 33, 0.8)",
        "rgba(65, 117, 5, 0.8)",
        "rgba(144, 19, 254, 0.8)",
        "rgba(238, 169, 184, 0.8)",
        "rgba(224, 187, 228, 0.8)",
        "rgba(225, 223, 211, 0.8)",
        "rgba(255, 255, 255, 0.8)",
        "rgba(155, 155, 155, 0.8)",
        "rgba(0, 0, 0, 0.8)"];

    @observable private _keyValue: string = "";
    @observable private _valueValue: string = "";
    @observable private _added: boolean = false;
    @observable private highlightColor: string = "rgba(245, 230, 95, 0.616)";

    @observable public _colorBtn = false;
    @observable public Highlighting: boolean = false;
    @observable public Status: "pdf" | "annotation" | "" = "";

    public StartDrag: (e: PointerEvent, ele: HTMLElement) => void = unimplementedFunction;
    public Highlight: (color: string) => Opt<Doc> = (color: string) => undefined;
    public Delete: () => void = unimplementedFunction;
    public AddTag: (key: string, value: string) => boolean = returnFalse;
    public PinToPres: () => void = unimplementedFunction;
    public Marquee: { left: number; top: number; width: number; height: number; } | undefined;
    public get Active() { return this._left > 0; }

    constructor(props: Readonly<{}>) {
        super(props);

        PDFMenu.Instance = this;
        PDFMenu.Instance._canFade = false;
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

    @action
    highlightClicked = (e: React.MouseEvent) => {
        if (!this.Highlight(this.highlightColor) && this.Pinned) {
            this.Highlighting = !this.Highlighting;
        }
    }

    @computed get highlighter() {
        const button =
            <button className="antimodeMenu-button color-preview-button" title="" key="highilghter-button" onPointerDown={this.highlightClicked}>
                <FontAwesomeIcon icon="highlighter" size="lg" style={{ transition: "transform 0.1s", transform: this.Highlighting ? "" : "rotate(-45deg)" }} />
                <div className="color-preview" style={{ backgroundColor: this.highlightColor }}></div>
            </button>;

        const dropdownContent =
            <div className="dropdown">
                <p>Change highlighter color:</p>
                <div className="color-wrapper">
                    {this._palette.map(color => {
                        if (color) {
                            return this.highlightColor === color ?
                                <button className="color-button active" key={`active ${color}`} style={{ backgroundColor: color }} onPointerDown={e => this.changeHighlightColor(color, e)}></button> :
                                <button className="color-button" key={`inactive ${color}`} style={{ backgroundColor: color }} onPointerDown={e => this.changeHighlightColor(color, e)}></button>;
                        }
                    })}
                </div>
            </div>;
        return (
            <ButtonDropdown key={"highlighter"} button={button} dropdownContent={dropdownContent} />
        );
    }

    @action
    changeHighlightColor = (color: string, e: React.PointerEvent) => {
        const col: ColorState = {
            hex: color, hsl: { a: 0, h: 0, s: 0, l: 0, source: "" }, hsv: { a: 0, h: 0, s: 0, v: 0, source: "" },
            rgb: { a: 0, r: 0, b: 0, g: 0, source: "" }, oldHue: 0, source: "",
        };
        e.preventDefault();
        e.stopPropagation();
        this.highlightColor = Utils.colorString(col);
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
                this.highlighter,
                <button key="2" className="antimodeMenu-button" title="Drag to Annotate" ref={this._commentCont} onPointerDown={this.pointerDown}>
                    <FontAwesomeIcon icon="comment-alt" size="lg" /></button>,
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