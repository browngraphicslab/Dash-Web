import React = require("react");
import { observer } from "mobx-react";
import { observable, action } from "mobx";
import "./AntimodeMenu.scss";

/**
 * This is an abstract class that serves as the base for a PDF-style or Marquee-style
 * menu. To use this class, look at PDFMenu.tsx or MarqueeOptionsMenu.tsx for an example.
 */
export default abstract class AntimodeMenu extends React.Component {
    protected _offsetY: number = 0;
    protected _offsetX: number = 0;
    protected _mainCont: React.RefObject<HTMLDivElement> = React.createRef();
    protected _dragging: boolean = false;

    @observable protected _top: number = -300;
    @observable protected _left: number = -300;
    @observable protected _opacity: number = 1;
    @observable protected _transition: string = "opacity 0.5s";
    @observable protected _transitionDelay: string = "";

    @observable public Pinned: boolean = false;

    @action
    /**
     * @param x
     * @param y
     * @param forceJump: If the menu is pinned down, do you want to force it to jump to the new location?
     * Called when you want the menu to show up at a location
     */
    public jumpTo = (x: number, y: number, forceJump: boolean = false) => {
        if (!this.Pinned || forceJump) {
            this._transition = this._transitionDelay = "";
            this._opacity = 1;
            this._left = x;
            this._top = y;
        }
    }

    @action
    /**
     * @param forceOut: Do you want the menu to disappear immediately or to slowly fadeout?
     * Called when you want the menu to disappear
     */
    public fadeOut = (forceOut: boolean) => {
        if (!this.Pinned) {
            if (this._opacity === 0.2) {
                this._transition = "opacity 0.1s";
                this._transitionDelay = "";
                this._opacity = 0;
                this._left = this._top = -300;
            }

            if (forceOut) {
                this._transition = "";
                this._transitionDelay = "";
                this._opacity = 0;
                this._left = this._top = -300;
            }
        }
    }

    @action
    protected pointerLeave = (e: React.PointerEvent) => {
        // if (!this.Pinned) {
        //     this._transition = "opacity 0.5s";
        //     this._transitionDelay = "1s";
        //     this._opacity = 0.2;
        //     setTimeout(() => this.fadeOut(false), 3000);
        // }
    }

    @action
    protected pointerEntered = (e: React.PointerEvent) => {
        this._transition = "opacity 0.1s";
        this._transitionDelay = "";
        this._opacity = 1;
    }

    @action
    protected togglePin = (e: React.MouseEvent) => {
        this.Pinned = !this.Pinned;
    }

    protected dragStart = (e: React.PointerEvent) => {
        document.removeEventListener("pointermove", this.dragging);
        document.addEventListener("pointermove", this.dragging);
        document.removeEventListener("pointerup", this.dragEnd);
        document.addEventListener("pointerup", this.dragEnd);

        this._offsetX = this._mainCont.current!.getBoundingClientRect().width - e.nativeEvent.offsetX;
        this._offsetY = e.nativeEvent.offsetY;

        e.stopPropagation();
        e.preventDefault();
    }

    @action
    protected dragging = (e: PointerEvent) => {
        this._left = e.pageX - this._offsetX;
        this._top = e.pageY - this._offsetY;

        e.stopPropagation();
        e.preventDefault();
    }

    protected dragEnd = (e: PointerEvent) => {
        document.removeEventListener("pointermove", this.dragging);
        document.removeEventListener("pointerup", this.dragEnd);
        e.stopPropagation();
        e.preventDefault();
    }

    protected handleContextMenu = (e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
    }

    protected getDragger = () => {
        return <div className="antimodeMenu-dragger" onPointerDown={this.dragStart} style={{ width: this.Pinned ? "20px" : "0px" }} />
    }

    protected getElement(buttons: JSX.Element[]) {
        return (
            <div className="antimodeMenu-cont" onPointerLeave={this.pointerLeave} onPointerEnter={this.pointerEntered} ref={this._mainCont} onContextMenu={this.handleContextMenu}
                style={{ left: this._left, top: this._top, opacity: this._opacity, transition: this._transition, transitionDelay: this._transitionDelay }}>
                {buttons}
                <div className="antimodeMenu-dragger" onPointerDown={this.dragStart} style={{ width: this.Pinned ? "20px" : "0px" }} />
            </div>
        );
    }

    protected getElementWithRows(rows: JSX.Element[], numRows: number) {
        return (
            <div className="antimodeMenu-cont with-rows" onPointerLeave={this.pointerLeave} onPointerEnter={this.pointerEntered} ref={this._mainCont} onContextMenu={this.handleContextMenu}
                style={{ left: this._left, top: this._top, opacity: this._opacity, transition: this._transition, transitionDelay: this._transitionDelay, height: 35 * numRows + "px" }}>
                {rows}
                {/* <div className="antimodeMenu-dragger" onPointerDown={this.dragStart} style={{ width: this.Pinned ? "20px" : "0px" }} /> */}
            </div>
        );
    }
}