import React = require("react");
import AntimodeMenu from "../../AntimodeMenu";
import { observer } from "mobx-react";
import { unimplementedFunction } from "../../../../Utils";
import { observable, action } from "mobx";
import "./InkOptionsMenu.scss";


@observer
export default class InkOptionsMenu extends AntimodeMenu {
    static Instance: InkOptionsMenu;
    public changeColor: (color: string) => void = unimplementedFunction;
    public changeBezier: (e: React.PointerEvent) => void = unimplementedFunction;
    public changeWidth: (color: string) => void = unimplementedFunction;

    private _palette: (string)[];
    private _width: (string)[];


    public _circle: boolean;
    public _triangle: boolean;
    public _rectangle: boolean;
    public _arrow: boolean;
    public _line: boolean;
    public _widthSelected: string;

    @observable public _circleBt: boolean;
    @observable public _triangleBt: boolean;
    @observable public _rectangleBt: boolean;
    @observable public _arrowBt: boolean;
    @observable public _lineBt: boolean;
    @observable public _colorBt: boolean;
    @observable public _color: string;
    @observable public _bezierBt: boolean;
    @observable public _widthBt: boolean;



    constructor(props: Readonly<{}>) {
        super(props);
        InkOptionsMenu.Instance = this;
        this._canFade = false;

        this._circle = false;
        this._triangle = false;
        this._rectangle = false;
        this._arrow = false;
        this._line = false;
        this._circleBt = false;
        this._triangleBt = false;
        this._rectangleBt = false;
        this._arrowBt = false;
        this._lineBt = false;
        this._colorBt = false;
        this._bezierBt = false;
        this._widthBt = false;

        this._color = "";
        this._widthSelected = "";


        this._palette = [
            "D0021B", "F5A623", "F8E71C", "8B572A", "7ED321", "417505", "9013FE", "4A90E2", "50E3C2", "B8E986", "000000", "4A4A4A", "9B9B9B", "FFFFFF",
        ];

        this._width = [
            "1", "5", "10", "100", "200", "300"
        ];

    }



    drag = (e: React.PointerEvent) => {
        this.dragStart(e);
    }





    @action
    toggleCircle = (e: React.PointerEvent) => {
        const curr = this._circle;
        this.allFalse();
        curr ? this._circle = false : this._circle = true;
        this._circleBt = this._circle;
    }
    @action
    toggleTriangle = (e: React.PointerEvent) => {
        const curr = this._triangle;
        this.allFalse();
        curr ? this._triangle = false : this._triangle = true;
        this._triangleBt = this._triangle;
    }
    @action
    toggleRectangle = (e: React.PointerEvent) => {
        const curr = this._rectangle;
        this.allFalse();
        curr ? this._rectangle = false : this._rectangle = true;
        this._rectangleBt = this._rectangle;
    }
    @action
    toggleArrow = (e: React.PointerEvent) => {
        const curr = this._arrow;
        this.allFalse();
        curr ? this._arrow = false : this._arrow = true;
        this._arrowBt = this._arrow;
    }
    @action
    toggleLine = (e: React.PointerEvent) => {
        const curr = this._line;
        this.allFalse();
        curr ? this._line = false : this._line = true;
        this._lineBt = this._line;
    }

    @action
    changeBezierClick = (e: React.PointerEvent) => {
        const curr = this._bezierBt;
        this.allFalse();
        curr ? this._bezierBt = false : this._bezierBt = true;
        this.changeBezier(e);
    }

    @action
    changeWidthClick = (e: React.PointerEvent) => {
        this._widthBt ? this._widthBt = false : this._widthBt = true;
    }
    @action
    changeColorClick = (e: React.PointerEvent) => {
        this._colorBt ? this._colorBt = false : this._colorBt = true;
    }

    allFalse = () => {
        this._circle = false;
        this._triangle = false;
        this._rectangle = false;
        this._arrow = false;
        this._line = false;
        this._circleBt = false;
        this._triangleBt = false;
        this._rectangleBt = false;
        this._arrowBt = false;
        this._lineBt = false;
        this._bezierBt = false;
    }

    render() {
        var widthPicker;
        if (this._widthBt) {
            widthPicker = <div className="btn2-group">
                <button
                    className="antimodeMenu-button"
                    key="width"
                    onPointerDown={this.changeWidthClick}
                    style={this._widthBt ? { backgroundColor: "121212" } : {}}>
                    W
                </button>
                {this._width.map(wid => {
                    return <button
                        className="antimodeMenu-button"
                        key={wid}
                        onPointerDown={() => this.changeWidth(wid)}
                        style={this._colorBt ? { backgroundColor: "121212" } : {}}>
                        {wid}
                    </button>;

                })}
            </div>;
        } else {
            widthPicker = <button
                className="antimodeMenu-button"
                key="width"
                onPointerDown={this.changeWidthClick}
                style={this._widthBt ? { backgroundColor: "121212" } : {}}>
                W
        </button>;
        }

        var colorPicker;
        if (this._colorBt) {
            colorPicker = <div className="btn-group">
                <button
                    className="antimodeMenu-button"
                    key="color"
                    onPointerDown={this.changeColorClick}
                    style={this._colorBt ? { backgroundColor: "121212" } : {}}>
                    <div className="color-preview" style={this._color === "" ? { backgroundColor: "121212" } : { backgroundColor: this._color }}></div>
                </button>
                {this._palette.map(color => {
                    return <button
                        className="antimodeMenu-button"
                        key={color}
                        onPointerDown={() => this.changeColor(color)}
                        style={this._colorBt ? { backgroundColor: "121212" } : {}}>
                        <div className="color-preview" style={{ backgroundColor: color }}></div>
                    </button>;
                })}
            </div>;
        } else {
            colorPicker = <button
                className="antimodeMenu-button"
                title="colorChanger"
                key="color"
                onPointerDown={this.changeColorClick}
                style={this._colorBt ? { backgroundColor: "121212" } : {}}>
                <div className="color-preview" style={this._color === "" ? { backgroundColor: "121212" } : { backgroundColor: this._color }}></div>
            </button>;
        }


        const buttons = [
            <button
                className="antimodeMenu-button"
                title="Drag"
                key="drag"
                onPointerDown={this.drag}>
                ✜
            </button>,
            <button
                className="antimodeMenu-button"
                title="Draw Circle"
                key="circle"
                onPointerDown={this.toggleCircle}
                style={this._circleBt ? { backgroundColor: "121212" } : {}}>
                O
            </button>,
            <button
                className="antimodeMenu-button"
                title="Draw Traingle"
                key="triangle"
                onPointerDown={this.toggleTriangle}
                style={this._triangleBt ? { backgroundColor: "121212" } : {}}>
                ∆
            </button>,
            <button
                className="antimodeMenu-button"
                title="Draw Rectangle"
                key="rectangle"
                onPointerDown={this.toggleRectangle}
                style={this._rectangleBt ? { backgroundColor: "121212" } : {}}>
                ロ
            </button>,
            <button
                className="antimodeMenu-button"
                title="Draw Arrow"
                key="arrow"
                onPointerDown={this.toggleArrow}
                style={this._arrowBt ? { backgroundColor: "121212" } : {}}>
                ➜
                </button>,
            <button
                className="antimodeMenu-button"
                title="Draw Line"
                key="line"
                onPointerDown={this.toggleLine}
                style={this._lineBt ? { backgroundColor: "121212" } : {}}>
                –
            </button>,
            <button
                className="antimodeMenu-button"
                title="Bezier changer"
                key="bezier"
                onPointerDown={this.changeBezierClick}
                style={this._bezierBt ? { backgroundColor: "121212" } : {}}>
                B
            </button>,
            widthPicker,
            colorPicker,
        ];
        return this.getElement(buttons);
    }
}