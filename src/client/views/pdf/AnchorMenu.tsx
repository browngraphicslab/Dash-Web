import React = require("react");
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Tooltip } from "@material-ui/core";
import { action, computed, observable, IReactionDisposer, reaction } from "mobx";
import { observer } from "mobx-react";
import { ColorState } from "react-color";
import { Doc, Opt } from "../../../fields/Doc";
import { returnFalse, setupMoveUpEvents, unimplementedFunction, Utils } from "../../../Utils";
import { AntimodeMenu, AntimodeMenuProps } from "../AntimodeMenu";
import { ButtonDropdown } from "../nodes/formattedText/RichTextMenu";
import "./AnchorMenu.scss";
import { SelectionManager } from "../../util/SelectionManager";

@observer
export class AnchorMenu extends AntimodeMenu<AntimodeMenuProps> {
    static Instance: AnchorMenu;

    private _disposer: IReactionDisposer | undefined;
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
    @observable public Status: "marquee" | "annotation" | "" = "";

    public OnClick: (e: PointerEvent) => void = unimplementedFunction;
    public StartDrag: (e: PointerEvent, ele: HTMLElement) => void = unimplementedFunction;
    public Highlight: (color: string, isPushpin: boolean) => Opt<Doc> = (color: string, isPushpin: boolean) => undefined;
    public Delete: () => void = unimplementedFunction;
    public AddTag: (key: string, value: string) => boolean = returnFalse;
    public PinToPres: () => void = unimplementedFunction;
    public MakePushpin: () => void = unimplementedFunction;
    public IsPushpin: () => boolean = returnFalse;
    public get Active() { return this._left > 0; }

    constructor(props: Readonly<{}>) {
        super(props);

        AnchorMenu.Instance = this;
        AnchorMenu.Instance._canFade = false;
    }

    componentDidMount() {
        this._disposer = reaction(() => SelectionManager.Views(),
            selected => AnchorMenu.Instance.fadeOut(true));
    }

    pointerDown = (e: React.PointerEvent) => {
        setupMoveUpEvents(this, e, (e: PointerEvent) => {
            this.StartDrag(e, this._commentCont.current!);
            return true;
        }, returnFalse, e => this.OnClick?.(e));
    }

    @action
    highlightClicked = (e: React.MouseEvent) => {
        if (!this.Highlight(this.highlightColor, false) && this.Pinned) {
            this.Highlighting = !this.Highlighting;
        }
    }

    @computed get highlighter() {
        const button =
            <button className="antimodeMenu-button color-preview-button" title="" key="highlighter-button" onClick={this.highlightClicked}>
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
            <Tooltip key="highlighter" title={<div className="dash-tooltip">{"Click to Highlight"}</div>}>
                <ButtonDropdown key={"highlighter"} button={button} dropdownContent={dropdownContent} pdf={true} />
            </Tooltip>
        );
    }

    @action changeHighlightColor = (color: string, e: React.PointerEvent) => {
        const col: ColorState = {
            hex: color, hsl: { a: 0, h: 0, s: 0, l: 0, source: "" }, hsv: { a: 0, h: 0, s: 0, v: 0, source: "" },
            rgb: { a: 0, r: 0, b: 0, g: 0, source: "" }, oldHue: 0, source: "",
        };
        e.preventDefault();
        e.stopPropagation();
        this.highlightColor = Utils.colorString(col);
    }

    @action keyChanged = (e: React.ChangeEvent<HTMLInputElement>) => { this._keyValue = e.currentTarget.value; };
    @action valueChanged = (e: React.ChangeEvent<HTMLInputElement>) => { this._valueValue = e.currentTarget.value; };
    @action addTag = (e: React.PointerEvent) => {
        if (this._keyValue.length > 0 && this._valueValue.length > 0) {
            this._added = this.AddTag(this._keyValue, this._valueValue);
            setTimeout(action(() => this._added = false), 1000);
        }
    }

    render() {
        const buttons = this.Status === "marquee" ?
            [
                this.highlighter,

                <Tooltip key="annotate" title={<div className="dash-tooltip">{"Drag to Place Annotation"}</div>}>
                    <button className="antimodeMenu-button annotate" ref={this._commentCont} onPointerDown={this.pointerDown} style={{ cursor: "grab" }}>
                        <FontAwesomeIcon icon="comment-alt" size="lg" />
                    </button>
                </Tooltip>,
            ] : [
                <Tooltip key="trash" title={<div className="dash-tooltip">{"Remove Link Anchor"}</div>}>
                    <button className="antimodeMenu-button" onPointerDown={this.Delete}>
                        <FontAwesomeIcon icon="trash-alt" size="lg" />
                    </button>
                </Tooltip>,
                <Tooltip key="Pin" title={<div className="dash-tooltip">{"Pin to Presentation"}</div>}>
                    <button className="antimodeMenu-button" onPointerDown={this.PinToPres}>
                        <FontAwesomeIcon icon="map-pin" size="lg" />
                    </button>
                </Tooltip>,
                <Tooltip key="pushpin" title={<div className="dash-tooltip">{"toggle pushpin behavior"}</div>}>
                    <button className="antimodeMenu-button" style={{ color: this.IsPushpin() ? "black" : "white", backgroundColor: this.IsPushpin() ? "white" : "black" }} onPointerDown={this.MakePushpin}>
                        <FontAwesomeIcon icon="thumbtack" size="lg" />
                    </button>
                </Tooltip>,
                // <div key="7" className="anchorMenu-addTag" >
                //     <input onChange={this.keyChanged} placeholder="Key" style={{ gridColumn: 1 }} />
                //     <input onChange={this.valueChanged} placeholder="Value" style={{ gridColumn: 3 }} />
                // </div>,
                // <button key="8" className="antimodeMenu-button" title={`Add tag: ${this._keyValue} with value: ${this._valueValue}`} onPointerDown={this.addTag}>
                //     <FontAwesomeIcon style={{ transition: "all .2s" }} color={this._added ? "#42f560" : "white"} icon="check" size="lg" /></button>,
            ];

        return this.getElement(buttons);
    }
}