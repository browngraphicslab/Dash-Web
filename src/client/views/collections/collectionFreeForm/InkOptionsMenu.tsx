import React = require("react");
import AntimodeMenu from "../../AntimodeMenu";
import { observer } from "mobx-react";
import { observable, action, computed } from "mobx";
import "./InkOptionsMenu.scss";
import { ActiveInkColor, ActiveInkBezierApprox, SetActiveInkWidth, SetActiveInkColor, SetActiveBezierApprox } from "../../InkingStroke";
import { Scripting } from "../../../util/Scripting";
import { InkTool } from "../../../../fields/InkField";
import { ColorState } from "react-color";
import { Utils } from "../../../../Utils";
import GestureOverlay from "../../GestureOverlay";
import { Doc } from "../../../../fields/Doc";



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
        SetActiveInkColor(Utils.colorString(col));
    }

    @action
    changeBezier = (e: React.PointerEvent): void => {
        SetActiveBezierApprox(!ActiveInkBezierApprox() ? "300" : "");
    }

    @computed get widthPicker() {
        var widthPicker = <button
            className="antimodeMenu-button"
            key="width"
            onPointerDown={action(e => this._widthBtn = !this._widthBtn)}
            style={{ backgroundColor: this._widthBtn ? "121212" : "" }}>
            W
        </button>;
        if (this._widthBtn) {
            widthPicker = <div className="btn2-group" key="width">
                {widthPicker}
                {this._width.map(wid => {
                    return <button
                        className="antimodeMenu-button"
                        key={wid}
                        onPointerDown={action(() => { SetActiveInkWidth(wid); this._widthBtn = false; })}
                        style={{ backgroundColor: this._widthBtn ? "121212" : "" }}>
                        {wid}
                    </button>;
                })}
            </div>;
        }
        return widthPicker;
    }

    @computed get colorPicker() {
        var colorPicker = <button
            className="antimodeMenu-button"
            key="color"
            title="colorChanger"
            onPointerDown={action(e => this._colorBtn = !this._colorBtn)}
            style={{ backgroundColor: this._colorBtn ? "121212" : "" }}>
            <div className="color-preview" style={{ backgroundColor: ActiveInkColor() ?? "121212" }}></div>
        </button>;
        if (this._colorBtn) {
            colorPicker = <div className="btn-group" key="color">
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
        return colorPicker;
    }

    @computed get shapeButtons() {
        return this._buttons.map((btn, i) => <button
            className="antimodeMenu-button"
            title={`Draw ${btn}`}
            key={i}
            onPointerDown={action(e => GestureOverlay.Instance.InkShape = btn)}
            style={{ backgroundColor: btn === GestureOverlay.Instance.InkShape ? "121212" : "" }}>
            {this._icons[i]}
        </button>);
    }

    @computed get bezierButton() {
        return <button
            className="antimodeMenu-button"
            title="Bezier changer"
            key="bezier"
            onPointerDown={e => this.changeBezier(e)}
            style={{ backgroundColor: ActiveInkBezierApprox() ? "121212" : "" }}>
            B
        </button>;
    }

    render() {
        const buttons = [
            <button className="antimodeMenu-button" title="Drag" key="drag" onPointerDown={e => this.dragStart(e)}>  ✜  </button>,
            ...this.shapeButtons,
            this.bezierButton,
            this.widthPicker,
            this.colorPicker,
        ];

        const mobileButtons = [
            this.shapeButtons,
            this.bezierButton,
            this.widthPicker,
            this.colorPicker,
        ];

        return (window.innerWidth < 1000 ? this.getElement(mobileButtons) : this.getElement(buttons));
    }
}
Scripting.addGlobal(function activatePen(penBtn: any) {
    if (penBtn) {
        Doc.SetSelectedTool(InkTool.Pen);
        InkOptionsMenu.Instance.jumpTo(300, 300);
    } else {
        Doc.SetSelectedTool(InkTool.None);
        InkOptionsMenu.Instance.fadeOut(true);
    }
});
