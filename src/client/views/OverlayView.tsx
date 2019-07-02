import * as React from "react";
import { observer } from "mobx-react";
import { observable, action } from "mobx";

export type OverlayDisposer = () => void;

export type OverlayElementOptions = {
    x: number;
    y: number;
    width?: number;
    height?: number;
};

@observer
export class OverlayView extends React.Component {
    public static Instance: OverlayView;
    @observable.shallow
    private _elements: { ele: JSX.Element, options: OverlayElementOptions }[] = [];

    constructor(props: any) {
        super(props);
        if (!OverlayView.Instance) {
            OverlayView.Instance = this;
        }
    }

    @action
    addElement(ele: JSX.Element, options: OverlayElementOptions): OverlayDisposer {
        const eleWithPosition = { ele, options };
        this._elements.push(eleWithPosition);
        return action(() => {
            const index = this._elements.indexOf(eleWithPosition);
            if (index !== -1) this._elements.splice(index, 1);
        });
    }

    render() {
        return (
            <div>
                {this._elements.map(({ ele, options: { x, y, width, height } }) => (
                    <div style={{ position: "absolute", transform: `translate(${x}px, ${y}px)`, width, height }}>{ele}</div>
                ))}
            </div>
        );
    }
}