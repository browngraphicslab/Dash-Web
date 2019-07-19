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
    @observable width?: number;
    @observable height?: number;
    constructor(props: OverlayWindowProps) {
        super(props);

        const opts = props.overlayOptions;
        this.x = opts.x;
        this.y = opts.y;
        this.width = opts.width;
        this.height = opts.height;
    }

    onPointerDown = (_: React.PointerEvent) => {
        document.removeEventListener("pointermove", this.onPointerMove);
        document.removeEventListener("pointerup", this.onPointerUp);
        document.addEventListener("pointermove", this.onPointerMove);
        document.addEventListener("pointerup", this.onPointerUp);
    }

    @action
    onPointerMove = (e: PointerEvent) => {
        this.x += e.movementX;
        this.y += e.movementY;
    }

    onPointerUp = (e: PointerEvent) => {
        document.removeEventListener("pointermove", this.onPointerMove);
        document.removeEventListener("pointerup", this.onPointerUp);
    }

    render() {
        return (
            <div className="overlayWindow-outerDiv" style={{ transform: `translate(${this.x}px, ${this.y}px)`, width: this.width, height: this.height }}>
                <div className="overlayWindow-titleBar" onPointerDown={this.onPointerDown} >
                    {this.props.overlayOptions.title || "Untitled"}
                    <button onClick={this.props.onClick} className="overlayWindow-closeButton">X</button>
                </div>
                {this.props.children}
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
        ele = <OverlayWindow onClick={remove} key={Utils.GenerateGuid()} overlayOptions={options}>{ele}</OverlayWindow>;
        this._elements.push(ele);
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