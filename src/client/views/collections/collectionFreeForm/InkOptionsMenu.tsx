import React = require("react");
import AntimodeMenu from "../../AntimodeMenu";
import { observer } from "mobx-react";
import { observable, action } from "mobx";
import "./InkOptionsMenu.scss";
import { InkingStroke } from "../../InkingStroke";
import { Scripting } from "../../../util/Scripting";
import { InkTool } from "../../../../fields/InkField";
import { InkingControl } from "../../InkingControl";
import { StrCast } from "../../../../fields/Types";
import { ColorState } from "react-color";
import { ColorBox } from "../../nodes/ColorBox";

@observer
export default class InkOptionsMenu extends AntimodeMenu {
    static Instance: InkOptionsMenu;

    private _palette = ["D0021B", "F5A623", "F8E71C", "8B572A", "7ED321", "417505", "9013FE", "4A90E2", "50E3C2", "B8E986", "000000", "4A4A4A", "9B9B9B", "FFFFFF"];
    private _width = ["1", "5", "10", "100", "200", "300"];
    private _buttons = ["circle", "triangle", "rectangle", "arrow", "line"];
    private _icons = ["O", "∆", "ロ", "➜", "-"];

    @observable _colorBtn = false;
    @observable _widthBtn = false;

    constructor(props: Readonly<{}>) {
        super(props);
        InkOptionsMenu.Instance = this;
        this._canFade = false; // don't let the inking menu fade away
    }

    @action
    changeColor = (color: string) => {
        const col: ColorState = {
            hex: color, hsl: { a: 0, h: 0, s: 0, l: 0, source: "" }, hsv: { a: 0, h: 0, s: 0, v: 0, source: "" },
            rgb: { a: 0, r: 0, b: 0, g: 0, source: "" }, oldHue: 0, source: "",
        };
        ColorBox.switchColor(col);
    }

    @action
    changeBezier = (e: React.PointerEvent): void => {
        InkingControl.Instance.switchBezier(!InkingStroke.InkBezierApprox ? "300" : "");
    }

    render() {
        var widthPicker = <button
            className="antimodeMenu-button"
            key="width"
            onPointerDown={action(e => this._widthBtn = !this._widthBtn)}
            style={{ backgroundColor: this._widthBtn ? "121212" : "" }}>
            W
        </button>;
        if (this._widthBtn) {
            widthPicker = <div className="btn2-group">
                {widthPicker}
                {this._width.map(wid => {
                    return <button
                        className="antimodeMenu-button"
                        key={wid}
                        onPointerDown={action(() => { InkingControl.Instance.switchWidth(wid); this._widthBtn = false; })}
                        style={{ backgroundColor: this._widthBtn ? "121212" : "" }}>
                        {wid}
                    </button>;
                })}
            </div>;
        }

        var colorPicker = <button
            className="antimodeMenu-button"
            key="color"
            title="colorChanger"
            onPointerDown={action(e => this._colorBtn = !this._colorBtn)}
            style={{ backgroundColor: this._colorBtn ? "121212" : "" }}>
            <div className="color-preview" style={{ backgroundColor: InkingStroke.InkColor ?? "121212" }}></div>
        </button>;
        if (this._colorBtn) {
            colorPicker = <div className="btn-group">
                {colorPicker}
                {this._palette.map(color => {
                    return <button
                        className="antimodeMenu-button"
                        key={color}
                        onPointerDown={action(() => { this.changeColor(color); this._colorBtn = false; })}
                        style={{ backgroundColor: this._colorBtn ? "121212" : "" }}>
                        <div className="color-preview" style={{ backgroundColor: color }}></div>
                    </button>;
                })}
            </div>;
        }

        const buttons = [
            <button className="antimodeMenu-button"
                title="Drag"
                key="drag"
                onPointerDown={e => this.dragStart(e)}>
                ✜
            </button>,
            <>
                {this._buttons.map((btn, i) => <button
                    className="antimodeMenu-button"
                    title={`Draw ${btn}`}
                    key={btn}
                    onPointerDown={action(e => InkingStroke.InkShape = btn)}
                    style={btn === InkingStroke.InkShape ? { backgroundColor: "121212" } : {}}>
                    {this._icons[i]}
                </button>)},
            </>,
            <button
                className="antimodeMenu-button"
                title="Bezier changer"
                key="bezier"
                onPointerDown={e => this.changeBezier(e)}
                style={InkingStroke.InkBezierApprox ? { backgroundColor: "121212" } : {}}>
                B
            </button>,
            widthPicker,
            colorPicker,
        ];
        return this.getElement(buttons);
    }
}
Scripting.addGlobal(function activatePen(pen: any) {
    InkingControl.Instance.switchTool(pen ? InkTool.Pen : InkTool.None);
    if (pen) {
        InkingControl.Instance.switchWidth(StrCast(pen.inkWidth, "1"));
        InkingControl.Instance.switchColor(StrCast(pen.inkColor, "black"));
        InkingControl.Instance.switchBezier(StrCast(pen.inkBezier, ""));
        InkOptionsMenu.Instance.jumpTo(300, 300);
    } else {
        InkOptionsMenu.Instance.fadeOut(true);
    }
});