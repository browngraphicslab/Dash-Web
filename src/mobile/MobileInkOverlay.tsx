import React = require('react');
import { observer } from "mobx-react";
import { MobileInkBoxContent, GestureContent } from "../server/Message";
import { observable, action } from "mobx";
import { GestureUtils } from "../pen-gestures/GestureUtils";


@observer
export default class MobileInkOverlay extends React.Component {
    public static Instance: MobileInkOverlay;

    @observable private _scale: number = 1;
    @observable private _width: number = 0;
    @observable private _height: number = 0;
    @observable private _x: number = -300;
    @observable private _y: number = -300;

    constructor(props: Readonly<{}>) {
        super(props);
        MobileInkOverlay.Instance = this;
    }

    initialSize(mobileWidth: number, mobileHeight: number) {
        const maxWidth = window.innerWidth - 30; // TODO: may not be window ?? figure out how to not include library ????
        const maxHeight = window.innerHeight - 30; // -30 for padding
        const scale = Math.min(maxWidth / mobileWidth, maxHeight / mobileHeight);
        return { width: mobileWidth * scale, height: mobileHeight * scale, scale: scale };
    }

    @action
    initMobileInkOverlay(content: MobileInkBoxContent) {
        const { width, height } = content;
        const scaledSize = this.initialSize(width ? width : 0, height ? height : 0);
        this._width = scaledSize.width;
        this._height = scaledSize.height;
        this._scale = scaledSize.scale;
        this._x = 300; // TODO: center on screen
        this._y = 25; // TODO: center on screen
    }

    drawStroke = (content: GestureContent) => {
        const { points, bounds } = content;

        const B = {
            right: (bounds.right * this._scale) + this._x,
            left: (bounds.left * this._scale) + this._x, // TODO: scale
            bottom: (bounds.bottom * this._scale) + this._y,
            top: (bounds.top * this._scale) + this._y, // TODO: scale
            width: bounds.width * this._scale,
            height: bounds.height * this._scale,
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