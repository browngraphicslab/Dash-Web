import React = require('react');
import { observer } from "mobx-react";
import { MobileInkOverlayContent, GestureContent, UpdateMobileInkOverlayPositionContent, MobileDocumentUploadContent } from "../server/Message";
import { observable, action } from "mobx";
import { GestureUtils } from "../pen-gestures/GestureUtils";
import "./MobileInkOverlay.scss";
import { StrCast, Cast } from '../new_fields/Types';
import { DragManager } from "../client/util/DragManager";
import { DocServer } from '../client/DocServer';
import { Doc, DocListCastAsync } from '../new_fields/Doc';
import { listSpec } from '../new_fields/Schema';


@observer
export default class MobileInkOverlay extends React.Component {
    public static Instance: MobileInkOverlay;

    @observable private _scale: number = 1;
    @observable private _width: number = 0;
    @observable private _height: number = 0;
    @observable private _x: number = -300;
    @observable private _y: number = -300;
    @observable private _text: string = "";

    @observable private _offsetX: number = 0;
    @observable private _offsetY: number = 0;
    @observable private _isDragging: boolean = false;
    private _mainCont: React.RefObject<HTMLDivElement> = React.createRef();

    constructor(props: Readonly<{}>) {
        super(props);
        MobileInkOverlay.Instance = this;
    }

    initialSize(mobileWidth: number, mobileHeight: number) {
        const maxWidth = window.innerWidth - 30;
        const maxHeight = window.innerHeight - 30; // -30 for padding
        if (mobileWidth > maxWidth || mobileHeight > maxHeight) {
            const scale = Math.min(maxWidth / mobileWidth, maxHeight / mobileHeight);
            return { width: mobileWidth * scale, height: mobileHeight * scale, scale: scale };
        }
        return { width: mobileWidth, height: mobileHeight, scale: 1 };
    }

    @action
    initMobileInkOverlay(content: MobileInkOverlayContent) {
        const { width, height, text } = content;
        const scaledSize = this.initialSize(width ? width : 0, height ? height : 0);
        this._width = scaledSize.width;
        this._height = scaledSize.height;
        this._scale = scaledSize.scale;
        this._x = 300; // TODO: center on screen
        this._y = 25; // TODO: center on screen
        this._text = text ? text : "";
    }

    @action
    updatePosition(content: UpdateMobileInkOverlayPositionContent) {
        const { dx, dy, dsize } = content;
        if (dx) this._x += dx;
        if (dy) this._y += dy;
        // TODO: scale dsize
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

        const target = document.elementFromPoint(this._x + 10, this._y + 10);
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

    uploadDocument = async (content: MobileDocumentUploadContent) => {
        const { docId } = content;
        const doc = await DocServer.GetRefField(docId);

        if (doc && doc instanceof Doc) {
            const target = document.elementFromPoint(this._x + 10, this._y + 10);
            const dragData = new DragManager.DocumentDragData([doc]);
            const complete = new DragManager.DragCompleteEvent(false, dragData);

            if (target) {
                target.dispatchEvent(
                    new CustomEvent<DragManager.DropEvent>("dashOnDrop",
                        {
                            bubbles: true,
                            detail: {
                                x: this._x,
                                y: this._y,
                                complete: complete,
                                altKey: false,
                                metaKey: false,
                                ctrlKey: false,
                                shiftKey: false
                            }
                        }
                    )
                );
            } else {
                alert("TARGET IS UNDEFINED");
            }
        }
    }

    @action
    dragStart = (e: React.PointerEvent) => {
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
                    borderStyle: this._isDragging ? "solid" : "dashed",
                }
                }
                ref={this._mainCont}
            >
                <p>{this._text}</p>
                <div className="mobileInkOverlay-border top" onPointerDown={this.dragStart}></div>
                <div className="mobileInkOverlay-border bottom" onPointerDown={this.dragStart}></div>
                <div className="mobileInkOverlay-border left" onPointerDown={this.dragStart}></div>
                <div className="mobileInkOverlay-border right" onPointerDown={this.dragStart}></div>
            </div >
        );
    }
}