import React = require("react")
import { computed, observable, reaction, runInAction, trace } from "mobx";
import { observer } from "mobx-react";
import { Utils as DashUtils } from '../../../Utils';
import { FilterModel } from "../../northstar/core/filter/FilterModel";
import { ModelHelpers } from "../../northstar/model/ModelHelpers";
import { ArrayUtil } from "../../northstar/utils/ArrayUtil";
import { LABColor } from '../../northstar/utils/LABcolor';
import { PIXIRectangle } from "../../northstar/utils/MathUtil";
import { StyleConstants } from "../../northstar/utils/StyleContants";
import { HistogramBinPrimitiveCollection, HistogramBinPrimitive } from "./HistogramBinPrimitiveCollection";
import { HistogramBox } from "./HistogramBox";
import "./HistogramBoxPrimitives.scss";

export interface HistogramPrimitivesProps {
    HistoBox: HistogramBox;
}
@observer
export class HistogramBoxPrimitives extends React.Component<HistogramPrimitivesProps> {
    private get histoOp() { return this.props.HistoBox.HistoOp; }
    private get renderDimension() { return this.props.HistoBox.SizeConverter.RenderDimension; }
    @observable _selectedPrims: HistogramBinPrimitive[] = [];
    @computed get xaxislines() { return this.renderGridLinesAndLabels(0); }
    @computed get yaxislines() { return this.renderGridLinesAndLabels(1); }
    @computed get selectedPrimitives() { return this._selectedPrims.map(bp => this.drawRect(bp.Rect, bp.BarAxis, undefined, "border")); }
    @computed get binPrimitives() {
        let histoResult = this.props.HistoBox.HistogramResult;
        if (!histoResult || !histoResult.bins || !this.props.HistoBox.VisualBinRanges.length)
            return (null);
        trace();
        let allBrushIndex = ModelHelpers.AllBrushIndex(histoResult);
        return Object.keys(histoResult.bins).reduce((prims, key) => {
            let drawPrims = new HistogramBinPrimitiveCollection(histoResult!.bins![key], this.props.HistoBox);
            let toggle = this.getSelectionToggle(drawPrims.BinPrimitives, allBrushIndex,
                ModelHelpers.GetBinFilterModel(histoResult!.bins![key], allBrushIndex, histoResult!, this.histoOp.X, this.histoOp.Y));
            drawPrims.BinPrimitives.filter(bp => bp.DataValue && bp.BrushIndex !== allBrushIndex).map(bp =>
                prims.push(...[{ r: bp.Rect, c: bp.Color }, { r: bp.MarginRect, c: StyleConstants.MARGIN_BARS_COLOR }].map(pair => this.drawRect(pair.r, bp.BarAxis, pair.c, "bar", toggle))));
            return prims;
        }, [] as JSX.Element[]);
    }

    componentDidMount() {
        reaction(() => this.props.HistoBox.HistoOp.FilterString, () => this._selectedPrims.length = this.histoOp.FilterModels.length = 0);
    }

    private getSelectionToggle(binPrimitives: HistogramBinPrimitive[], allBrushIndex: number, filterModel: FilterModel) {
        let allBrushPrim = ArrayUtil.FirstOrDefault(binPrimitives, bp => bp.BrushIndex === allBrushIndex);
        return !allBrushPrim ? () => { } : () => runInAction(() => {
            if (ArrayUtil.Contains(this.histoOp.FilterModels, filterModel)) {
                this._selectedPrims.splice(this._selectedPrims.indexOf(allBrushPrim!), 1);
                this.histoOp.RemoveFilterModels([filterModel]);
            }
            else {
                this._selectedPrims.push(allBrushPrim!);
                this.histoOp.AddFilterModels([filterModel]);
            }
        })
    }

    private renderGridLinesAndLabels(axis: number) {
        if (!this.props.HistoBox.SizeConverter.Initialized)
            return (null);
        let labels = this.props.HistoBox.VisualBinRanges[axis].GetLabels();
        return labels.reduce((prims, binLabel, i) => {
            let r = this.props.HistoBox.SizeConverter.DataToScreenRange(binLabel.minValue!, binLabel.maxValue!, axis);
            prims.push(this.drawLine(r.xFrom, r.yFrom, axis === 0 ? 0 : r.xTo - r.xFrom, axis === 0 ? r.yTo - r.yFrom : 0));
            if (i === labels.length - 1)
                prims.push(this.drawLine(axis === 0 ? r.xTo : r.xFrom, axis === 0 ? r.yFrom : r.yTo, axis === 0 ? 0 : r.xTo - r.xFrom, axis === 0 ? r.yTo - r.yFrom : 0));
            return prims;
        }, [] as JSX.Element[]);
    }

    drawEntity(xFrom: number, yFrom: number, entity: JSX.Element) {
        let transXpercent = xFrom / this.renderDimension * 100;
        let transYpercent = yFrom / this.renderDimension * 100;
        return (<div key={DashUtils.GenerateGuid()} className={`histogramboxprimitives-placer`} style={{ transform: `translate(${transXpercent}%, ${transYpercent}%)` }}>
            {entity}
        </div>);
    }
    drawLine(xFrom: number, yFrom: number, width: number, height: number) {
        if (height < 0) {
            yFrom += height;
            height = -height;
        }
        if (width < 0) {
            xFrom += width;
            width = -width;
        }
        let trans2Xpercent = width === 0 ? `1px` : `${(xFrom + width) / this.renderDimension * 100}%`;
        let trans2Ypercent = height === 0 ? `1px` : `${(yFrom + height) / this.renderDimension * 100}%`;
        let line = (<div className="histogramboxprimitives-line" style={{ width: trans2Xpercent, height: trans2Ypercent, }} />);
        return this.drawEntity(xFrom, yFrom, line);
    }
    drawRect(r: PIXIRectangle, barAxis: number, color: number | undefined, classExt: string, tapHandler: () => void = () => { }) {
        if (r.height < 0) {
            r.y += r.height;
            r.height = -r.height;
        }
        if (r.width < 0) {
            r.x += r.width;
            r.width = -r.width;
        }
        let widthPercent = r.width / this.renderDimension * 100;
        let heightPercent = r.height / this.renderDimension * 100;
        let rect = (<div className={`histogramboxprimitives-${classExt}`} onPointerDown={(e: React.PointerEvent) => { if (e.button === 0) tapHandler() }}
            style={{
                borderBottomStyle: barAxis === 1 ? "none" : "solid",
                borderLeftStyle: barAxis === 0 ? "none" : "solid",
                width: `${widthPercent}%`,
                height: `${heightPercent}%`,
                background: color ? `${LABColor.RGBtoHexString(color)}` : ""
            }}
        />);
        return this.drawEntity(r.x, r.y, rect);
    }
    render() {
        return <div className="histogramboxprimitives-container">
            {this.xaxislines}
            {this.yaxislines}
            {this.binPrimitives}
            {this.selectedPrimitives}
        </div>
    }
}