import React = require('react');
import { observer } from "mobx-react";
import { MobileInkOverlayContent, GestureContent, UpdateMobileInkOverlayPosition } from "../server/Message";
import { observable, action } from "mobx";
import { GestureUtils } from "../pen-gestures/GestureUtils";
import "./MobileInkOverlay.scss";


@observer
export default class MobileInkOverlay extends React.Component {
    public static Instance: MobileInkOverlay;

    @observable private _scale: number = 1;
    @observable private _width: number = 0;
    @observable private _height: number = 0;
    @observable private _x: number = -300;
    @observable private _y: number = -300;

    @observable private _offsetX: number = 0;
    @observable private _offsetY: number = 0;
    @observable private _isDragging: boolean = false;
    private _mainCont: React.RefObject<HTMLDivElement> = React.createRef();

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
    initMobileInkOverlay(content: MobileInkOverlayContent) {
        const { width, height } = content;
        const scaledSize = this.initialSize(width ? width : 0, height ? height : 0);
        this._width = scaledSize.width * .5;
        this._height = scaledSize.height * .5;
        this._scale = .5; //scaledSize.scale;
        this._x = 300; // TODO: center on screen
        this._y = 25; // TODO: center on screen
    }

    @action
    updatePosition(content: UpdateMobileInkOverlayPosition) {
        const { dx, dy, dsize } = content;
        console.log(dx, dy, dsize);
    }

    drawStroke = (content: GestureContent) => {
        // TODO: figure out why strokes drawn in corner of mobile interface dont get inserted

        const { points, bounds } = content;
        console.log("received points", points, bounds);

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

    @action
    dragStart = (e: React.PointerEvent) => {
        console.log("pointer down");
        document.removeEventListener("pointermove", this.dragging);
        document.removeEventListener("pointerup", this.dragEnd);
        document.addEventListener("pointermove", this.dragging);
        document.addEventListener("pointerup", this.dragEnd);

        this._isDragging = true;
        this._offsetX = e.pageX - this._mainCont.current!.getBoundingClientRect().left;
        this._offsetY = e.pageY - this._mainCont.current!.getBoundingClientRect().top;

        e.preventDefault();
        e.stopPropagation();
    }

    @action
    dragging = (e: PointerEvent) => {
        const x = e.pageX - this._offsetX;
        const y = e.pageY - this._offsetY;

        // TODO: don't allow drag over library?
        this._x = Math.min(Math.max(x, 0), window.innerWidth - this._width);
        this._y = Math.min(Math.max(y, 0), window.innerHeight - this._height);

        e.preventDefault();
        e.stopPropagation();
    }

    @action
    dragEnd = (e: PointerEvent) => {
        document.removeEventListener("pointermove", this.dragging);
        document.removeEventListener("pointerup", this.dragEnd);

        this._isDragging = false;

        e.preventDefault();
        e.stopPropagation();
    }

    render() {

        return (
            <div className="mobileInkOverlay"
                style={{
                    width: this._width,
                    height: this._height,
                    position: "absolute",
                    transform: `translate(${this._x}px, ${this._y}px)`,
                    zIndex: 30000,
                    pointerEvents: "none",
                    borderStyle: this._isDragging ? "solid" : "dashed"
                }}
                ref={this._mainCont}
            >
                <div className="mobileInkOverlay-border top" onPointerDown={this.dragStart}></div>
                <div className="mobileInkOverlay-border bottom" onPointerDown={this.dragStart}></div>
                <div className="mobileInkOverlay-border left" onPointerDown={this.dragStart}></div>
                <div className="mobileInkOverlay-border right" onPointerDown={this.dragStart}></div>
            </div>
        );
    }
}