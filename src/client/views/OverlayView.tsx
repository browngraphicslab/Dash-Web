import * as React from "react";
import { observer } from "mobx-react";
import { observable, action } from "mobx";
import { Utils } from "../../Utils";

import './OverlayView.scss';

export type OverlayDisposer = () => void;

export type OverlayElementOptions = {
    x: number;
    y: number;
    width?: number;
    height?: number;
    title?: string;
};

export interface OverlayWindowProps {
    children: JSX.Element;
    overlayOptions: OverlayElementOptions;
    onClick: () => void;
}

@observer
export class OverlayWindow extends React.Component<OverlayWindowProps> {
    @observable x: number;
    @observable y: number;
    @observable width: number;
    @observable height: number;
    constructor(props: OverlayWindowProps) {
        super(props);

        const opts = props.overlayOptions;
        this.x = opts.x;
        this.y = opts.y;
        this.width = opts.width || 200;
        this.height = opts.height || 200;
    }

    onPointerDown = (_: React.PointerEvent) => {
        document.removeEventListener("pointermove", this.onPointerMove);
        document.removeEventListener("pointerup", this.onPointerUp);
        document.addEventListener("pointermove", this.onPointerMove);
        document.addEventListener("pointerup", this.onPointerUp);
    }

    onResizerPointerDown = (_: React.PointerEvent) => {
        document.removeEventListener("pointermove", this.onResizerPointerMove);
        document.removeEventListener("pointerup", this.onResizerPointerUp);
        document.addEventListener("pointermove", this.onResizerPointerMove);
        document.addEventListener("pointerup", this.onResizerPointerUp);
    }

    @action
    onPointerMove = (e: PointerEvent) => {
        this.x += e.movementX;
        this.x = Math.max(Math.min(this.x, window.innerWidth - this.width), 0);
        this.y += e.movementY;
        this.y = Math.max(Math.min(this.y, window.innerHeight - this.height), 0);
    }

    @action
    onResizerPointerMove = (e: PointerEvent) => {
        this.width += e.movementX;
        this.width = Math.max(this.width, 30);
        this.height += e.movementY;
        this.height = Math.max(this.height, 30);
    }

    onPointerUp = (e: PointerEvent) => {
        document.removeEventListener("pointermove", this.onPointerMove);
        document.removeEventListener("pointerup", this.onPointerUp);
    }

    onResizerPointerUp = (e: PointerEvent) => {
        document.removeEventListener("pointermove", this.onResizerPointerMove);
        document.removeEventListener("pointerup", this.onResizerPointerUp);
    }

    render() {
        return (
            <div className="overlayWindow-outerDiv" style={{ transform: `translate(${this.x}px, ${this.y}px)`, width: this.width, height: this.height }}>
                <div className="overlayWindow-titleBar" onPointerDown={this.onPointerDown} >
                    {this.props.overlayOptions.title || "Untitled"}
                    <button onClick={this.props.onClick} className="overlayWindow-closeButton">X</button>
                </div>
                <div className="overlayWindow-content">
                    {this.props.children}
                </div>
                <div className="overlayWindow-resizeDragger" onPointerDown={this.onResizerPointerDown}></div>
            </div>
        );
    }
}

@observer
export class OverlayView extends React.Component {
    public static Instance: OverlayView;
    @observable.shallow
    private _elements: JSX.Element[] = [];

    constructor(props: any) {
        super(props);
        if (!OverlayView.Instance) {
            OverlayView.Instance = this;
        }
    }

    @action
    addElement(ele: JSX.Element, options: OverlayElementOptions): OverlayDisposer {
        const remove = action(() => {
            const index = this._elements.indexOf(ele);
            if (index !== -1) this._elements.splice(index, 1);
        });
        ele = <div key={Utils.GenerateGuid()} className="overlayView-wrapperDiv" style={{
            transform: `translate(${options.x}px, ${options.y}px)`,
            width: options.width,
            height: options.height
        }}>{ele}</div>;
        this._elements.push(ele);
        return remove;
    }

    @action
    addWindow(contents: JSX.Element, options: OverlayElementOptions): OverlayDisposer {
        const remove = action(() => {
            const index = this._elements.indexOf(contents);
            if (index !== -1) this._elements.splice(index, 1);
        });
        contents = <OverlayWindow onClick={remove} key={Utils.GenerateGuid()} overlayOptions={options}>{contents}</OverlayWindow>;
        this._elements.push(contents);
        return remove;
    }

    render() {
        return (
            <div>
                {this._elements}
            </div>
        );
    }
}