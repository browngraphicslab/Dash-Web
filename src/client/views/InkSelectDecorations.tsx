import React = require("react");
import { Touchable } from "./Touchable";
import { StrokeData } from "../../new_fields/InkField";
import { observer } from "mobx-react";
import { computed, observable, action, runInAction } from "mobx";
import "./InkSelectDecorations.scss"

@observer
export default class InkSelectDecorations extends Touchable {
    static Instance: InkSelectDecorations;

    @observable private _selectedInkNodes: Map<any, any> = new Map();

    constructor(props: Readonly<{}>) {
        super(props);

        InkSelectDecorations.Instance = this;
    }

    @action
    public SetSelected = (inkNodes: Map<any, any>, keepOld: boolean = false) => {
        if (!keepOld) {
            this._selectedInkNodes = new Map();
        }
        inkNodes.forEach((value: any, key: any) => {
            runInAction(() => this._selectedInkNodes.set(key, value));
        });
    }

    @computed
    get Bounds(): { x: number, y: number, b: number, r: number } {
        let left = Number.MAX_VALUE;
        let top = Number.MAX_VALUE;
        let right = -Number.MAX_VALUE;
        let bottom = -Number.MAX_VALUE;
        this._selectedInkNodes.forEach((value: StrokeData, key: string) => {
            value.pathData.map(val => {
                left = Math.min(val.x, left);
                top = Math.min(val.y, top);
                right = Math.max(val.x, right);
                bottom = Math.max(val.y, bottom);
            });
        });
        return { x: left, y: top, b: bottom, r: right };
    }

    render() {
        let bounds = this.Bounds;
        return (
            <div style={{
                top: bounds.y, left: bounds.x,
                height: bounds.b - bounds.y,
                width: bounds.r - bounds.x
            }}>

            </div>
        )
    }
}