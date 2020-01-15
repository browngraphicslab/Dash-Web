import React = require('react');
import { observer } from "mobx-react";
import { MobileInkBoxContent, GestureContent } from "../server/Message";
import { observable, action } from "mobx";
import { GestureUtils } from "../pen-gestures/GestureUtils";


@observer
export default class MobileInkOverlay extends React.Component {
    public static Instance: MobileInkOverlay;

    private _mobileWidth: number = 0;
    private _mobileHeight: number = 0;
    @observable private _width: number = 0;
    @observable private _height: number = 0;
    @observable private _x: number = -300;
    @observable private _y: number = -300;

    constructor(props: Readonly<{}>) {
        super(props);
        MobileInkOverlay.Instance = this;
    }

    @action
    initMobileInkOverlay(content: MobileInkBoxContent) {
        const { width, height } = content;
        this._mobileWidth = width ? width : 0;
        this._mobileHeight = height ? height : 0;
        this._width = width ? width : 0;
        this._height = height ? height : 0;
        this._x = 300; // TODO: center on screen
        this._y = 25; // TODO: center on screen
    }

    drawStroke = (content: GestureContent) => {
        const { points, bounds } = content;
        const scale = 1;

        const B = {
            right: bounds.right + this._x,
            left: bounds.left + this._x, // TODO: scale
            bottom: bounds.bottom + this._y,
            top: bounds.top + this._y, // TODO: scale
            width: bounds.width * scale,
            height: bounds.height * scale,
        };

        const target = document.elementFromPoint(points[0].X, points[0].Y);
        target?.dispatchEvent(
            new CustomEvent<GestureUtils.GestureEvent>("dashOnGesture",
                {
                    bubbles: true,
                    detail: {
                        points: points,
                        gesture: GestureUtils.Gestures.Stroke,
                        bounds: B
                    }
                }
            )
        );
    }

    render() {
        return (
            <div className="mobileInkOverlay" style={{
                width: this._width,
                height: this._height,
                position: "absolute",
                transform: `translate(${this._x}px, ${this._y}px)`,
                zIndex: 30000,
                pointerEvents: "none"
            }}></div>
        );
    }
}