import React = require("react");
import { Touchable } from "./Touchable";
import { PointData } from "../../new_fields/InkField";
import { observer } from "mobx-react";
import { computed, observable, action, runInAction } from "mobx";
import "./InkSelectDecorations.scss";

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
        const left = Number.MAX_VALUE;
        const top = Number.MAX_VALUE;
        const right = -Number.MAX_VALUE;
        const bottom = -Number.MAX_VALUE;
        this._selectedInkNodes.forEach((value: PointData, key: string) => {
            // value.pathData.map(val => {
            //     left = Math.min(val.x, left);
            //     top = Math.min(val.y, top);
            //     right = Math.max(val.x, right);
            //     bottom = Math.max(val.y, bottom);
            // });
        });
        return { x: left, y: top, b: bottom, r: right };
    }

    render() {
        const bounds = this.Bounds;
        return <div style={{
            top: bounds.y, left: bounds.x,
            height: bounds.b - bounds.y,
            width: bounds.r - bounds.x
        }} />;
    }
}