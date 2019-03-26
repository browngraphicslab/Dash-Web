import React = require("react")
import { ChartType } from '../../northstar/model/binRanges/VisualBinRange';
import { AggregateFunction, Bin, Brush, DoubleValueAggregateResult, HistogramResult, MarginAggregateParameters, MarginAggregateResult } from "../../northstar/model/idea/idea";
import { ModelHelpers } from "../../northstar/model/ModelHelpers";
import { LABColor } from '../../northstar/utils/LABcolor';
import { PIXIRectangle } from "../../northstar/utils/MathUtil";
import { SizeConverter } from "../../northstar/utils/SizeConverter";
import { StyleConstants } from "../../northstar/utils/StyleContants";
import "./HistogramBox.scss";
import { HistogramBox } from "./HistogramBox";
import { computed, runInAction, observable, trace } from "mobx";
import { ArrayUtil } from "../../northstar/utils/ArrayUtil";
import { Utils as DashUtils } from '../../../Utils';
import { observer } from "mobx-react";


export interface HistogramBoxPrimitivesProps {
    HistoBox: HistogramBox;
}

@observer
export class HistogramBoxPrimitives extends React.Component<HistogramBoxPrimitivesProps> {
    @observable _selectedPrims: HistogramBinPrimitive[] = [];

    @computed
    get selectedPrimitives() {
        return this._selectedPrims.map((bp) => this.drawBorder(bp.Rect, StyleConstants.OPERATOR_BACKGROUND_COLOR));
    }
    @computed
    get binPrimitives() {
        if (!this.props.HistoBox.HistoOp || !(this.props.HistoBox.HistoOp.Result instanceof HistogramResult) || !this.props.HistoBox.SizeConverter)
            return (null);
        let prims: JSX.Element[] = [];
        let allBrushIndex = ModelHelpers.AllBrushIndex(this.props.HistoBox.HistoOp.Result);
        for (let key in this.props.HistoBox.HistoOp.Result.bins) {
            if (this.props.HistoBox.HistoOp.Result.bins.hasOwnProperty(key)) {
                let drawPrims = new HistogramBinPrimitiveCollection(key, this.props.HistoBox);
                let filterModel = ModelHelpers.GetBinFilterModel(this.props.HistoBox.HistoOp.Result.bins![key], allBrushIndex, this.props.HistoBox.HistoOp.Result, this.props.HistoBox.HistoOp.X, this.props.HistoBox.HistoOp.Y);

                this.props.HistoBox.HitTargets.setValue(drawPrims.HitGeom, filterModel);

                drawPrims.BinPrimitives.filter(bp => bp.DataValue && bp.BrushIndex !== allBrushIndex).map(binPrimitive => {
                    let toggleFilter = () => {
                        if ([filterModel].filter(h => ArrayUtil.Contains(this.props.HistoBox.HistoOp!.FilterModels, h)).length > 0) {
                            let bp = ArrayUtil.FirstOrDefault<HistogramBinPrimitive>(drawPrims.BinPrimitives, (bp: HistogramBinPrimitive) => bp.BrushIndex == allBrushIndex);
                            if (bp && bp.DataValue) {
                                this._selectedPrims.splice(this._selectedPrims.indexOf(bp), 1);
                            }
                            this.props.HistoBox.HistoOp!.RemoveFilterModels([filterModel]);
                        }
                        else {
                            let bp = ArrayUtil.FirstOrDefault<HistogramBinPrimitive>(drawPrims.BinPrimitives, (bp: HistogramBinPrimitive) => bp.BrushIndex == allBrushIndex);
                            if (bp && bp.DataValue) {
                                this._selectedPrims.push(bp!);
                            }
                            this.props.HistoBox.HistoOp!.AddFilterModels([filterModel]);
                        }
                    }
                    prims.push(this.drawRect(binPrimitive.Rect, binPrimitive.Color, () => runInAction(toggleFilter)));
                    prims.push(this.drawRect(binPrimitive.MarginRect, StyleConstants.MARGIN_BARS_COLOR, () => runInAction(toggleFilter)));
                });
            }
        }
        return prims;
    }
    drawBorder(r: PIXIRectangle, color: number) {
        return <div key={DashUtils.GenerateGuid()} className="histogramboxprimitive-border"
            style={{
                position: "absolute",
                transform: `translate(${r.x}px,${r.y}px)`,
                width: `${r.width - 1}`,
                height: `${r.height}`,
                border: "1px",
                borderStyle: "solid",
                pointerEvents: "none",
                borderColor: `${LABColor.RGBtoHexString(color)}`
            }}
        />
    }

    drawRect(r: PIXIRectangle, color: number, tapHandler: () => void) {
        return <div key={DashUtils.GenerateGuid()} onPointerDown={(e: React.PointerEvent) => { if (e.button == 0) tapHandler() }}
            style={{
                position: "absolute",
                transform: `translate(${r.x}px,${r.y}px)`,
                width: `${r.width - 1}`,
                height: `${r.height}`,
                background: `${LABColor.RGBtoHexString(color)}`
            }}
        />
    }
    render() {
        return <div>
            {this.binPrimitives}
            {this.selectedPrimitives}
        </div>
    }
}


class HistogramBinPrimitive {
    constructor(init?: Partial<HistogramBinPrimitive>) {
        Object.assign(this, init);
    }
    public DataValue: number = 0;
    public Rect: PIXIRectangle = PIXIRectangle.EMPTY;
    public MarginRect: PIXIRectangle = PIXIRectangle.EMPTY;
    public MarginPercentage: number = 0;
    public Color: number = StyleConstants.WARNING_COLOR;
    public Opacity: number = 1;
    public BrushIndex: number = 0;
}

export class HistogramBinPrimitiveCollection {
    private static TOLERANCE: number = 0.0001;

    private _histoBox: HistogramBox;
    private get histoOp() { return this._histoBox.HistoOp!; }
    private get histoResult() { return this.histoOp.Result as HistogramResult; }
    public BinPrimitives: Array<HistogramBinPrimitive> = new Array<HistogramBinPrimitive>();
    public HitGeom: PIXIRectangle = PIXIRectangle.EMPTY;

    constructor(key: string, histoBox: HistogramBox) {
        this._histoBox = histoBox;
        let bin = this.histoResult.bins![key];

        var overlapBrushIndex = ModelHelpers.OverlapBrushIndex(this.histoResult);
        var orderedBrushes = new Array<Brush>();
        orderedBrushes.push(this.histoResult.brushes![0]);
        orderedBrushes.push(this.histoResult.brushes![overlapBrushIndex]);
        for (var b = 0; b < this.histoResult.brushes!.length; b++) {
            var brush = this.histoResult.brushes![b];
            if (brush.brushIndex != 0 && brush.brushIndex != overlapBrushIndex) {
                orderedBrushes.push(brush);
            }
        }
        var binBrushMaxAxis = this.getBinBrushAxisRange(bin, orderedBrushes, this.histoOp.Normalization); // X= 0, Y = 1

        var brushFactorSum: number = 0;
        for (var b = 0; b < orderedBrushes.length; b++) {
            var brush = orderedBrushes[b];
            var valueAggregateKey = ModelHelpers.CreateAggregateKey(this.histoOp.V, this.histoResult, brush.brushIndex!);
            var doubleRes = ModelHelpers.GetAggregateResult(bin, valueAggregateKey) as DoubleValueAggregateResult;
            var unNormalizedValue = (doubleRes != null && doubleRes.hasResult) ? doubleRes.result : null;
            if (unNormalizedValue)
                switch (histoBox.ChartType) {
                    case ChartType.VerticalBar:
                        this.createVerticalBarChartBinPrimitives(bin, brush, binBrushMaxAxis, this.histoOp.Normalization, histoBox.SizeConverter!); // X = 0, Y = 1, NOne = -1
                        break;
                    case ChartType.HorizontalBar:
                        this.createHorizontalBarChartBinPrimitives(bin, brush, binBrushMaxAxis, this.histoOp.Normalization, histoBox.SizeConverter!);
                        break;
                    case ChartType.SinglePoint:
                        this.createSinlgePointChartBinPrimitives(bin, brush, unNormalizedValue, histoBox.SizeConverter!);
                        break;
                    case ChartType.HeatMap:
                        var normalizedValue = (unNormalizedValue - histoBox.MinValue) / (Math.abs((histoBox.MaxValue - histoBox.MinValue)) < HistogramBinPrimitiveCollection.TOLERANCE ?
                            unNormalizedValue : histoBox.MaxValue - histoBox.MinValue);
                        brushFactorSum = this.createHeatmapBinPrimitives(bin, brush, unNormalizedValue, brushFactorSum, normalizedValue, histoBox.SizeConverter!);
                }
        }

        // adjust brush rects (stacking or not)
        var sum: number = 0;
        var allBrushIndex = ModelHelpers.AllBrushIndex(this.histoResult);
        var filteredBinPrims = this.BinPrimitives.filter(b => b.BrushIndex != allBrushIndex && b.DataValue != 0.0);
        var count: number = filteredBinPrims.length;
        filteredBinPrims.map(fbp => {
            if (histoBox.ChartType == ChartType.VerticalBar) {
                if (this.histoOp.X.AggregateFunction == AggregateFunction.Count) {
                    fbp.Rect = new PIXIRectangle(fbp.Rect.x, fbp.Rect.y - sum, fbp.Rect.width, fbp.Rect.height);
                    fbp.MarginRect = new PIXIRectangle(fbp.MarginRect.x, fbp.MarginRect.y - sum, fbp.MarginRect.width, fbp.MarginRect.height);
                    sum += fbp.Rect.height;
                }
                if (this.histoOp.Y.AggregateFunction == AggregateFunction.Avg) {
                    var w = fbp.Rect.width / 2.0;
                    fbp.Rect = new PIXIRectangle(fbp.Rect.x + sum, fbp.Rect.y, fbp.Rect.width / count, fbp.Rect.height);
                    fbp.MarginRect = new PIXIRectangle(fbp.MarginRect.x - w + sum + (fbp.Rect.width / 2.0), fbp.MarginRect.y, fbp.MarginRect.width, fbp.MarginRect.height);
                    sum += fbp.Rect.width;
                }
            }
            else if (histoBox.ChartType == ChartType.HorizontalBar) {
                if (this.histoOp.X.AggregateFunction == AggregateFunction.Count) {
                    fbp.Rect = new PIXIRectangle(fbp.Rect.x + sum, fbp.Rect.y, fbp.Rect.width, fbp.Rect.height);
                    fbp.MarginRect = new PIXIRectangle(fbp.MarginRect.x + sum, fbp.MarginRect.y, fbp.MarginRect.width, fbp.MarginRect.height);
                    sum += fbp.Rect.width;
                }
                if (this.histoOp.X.AggregateFunction == AggregateFunction.Avg) {
                    var h = fbp.Rect.height / 2.0;
                    fbp.Rect = new PIXIRectangle(fbp.Rect.x, fbp.Rect.y + sum, fbp.Rect.width, fbp.Rect.height / count);
                    fbp.MarginRect = new PIXIRectangle(fbp.MarginRect.x, fbp.MarginRect.y - h + sum + (fbp.Rect.height / 2.0), fbp.MarginRect.width, fbp.MarginRect.height);
                    sum += fbp.Rect.height;
                }
            }
        });
        this.BinPrimitives = this.BinPrimitives.reverse();
        var f = this.BinPrimitives.filter(b => b.BrushIndex == allBrushIndex);
        this.HitGeom = f.length > 0 ? f[0].Rect : PIXIRectangle.EMPTY;
    }
    private getBinBrushAxisRange(bin: Bin, brushes: Array<Brush>, axis: number): number {
        var binBrushMaxAxis = Number.MIN_VALUE;
        brushes.forEach((Brush) => {
            var maxAggregateKey = ModelHelpers.CreateAggregateKey(axis === 0 ? this.histoOp.Y : this.histoOp.X, this.histoResult, Brush.brushIndex!);
            var aggResult = ModelHelpers.GetAggregateResult(bin, maxAggregateKey) as DoubleValueAggregateResult;
            if (aggResult != null) {
                if (aggResult.result! > binBrushMaxAxis)
                    binBrushMaxAxis = aggResult.result!;
            }
        });
        return binBrushMaxAxis;
    }
    private createHeatmapBinPrimitives(bin: Bin, brush: Brush, unNormalizedValue: number, brushFactorSum: number, normalizedValue: number, sizeConverter: SizeConverter): number {

        var valueAggregateKey = ModelHelpers.CreateAggregateKey(this.histoOp.V, this.histoResult, ModelHelpers.AllBrushIndex(this.histoResult));
        var allUnNormalizedValue = ModelHelpers.GetAggregateResult(bin, valueAggregateKey) as DoubleValueAggregateResult;

        var tx = this._histoBox.VisualBinRanges[0].GetValueFromIndex(bin.binIndex!.indices![0]);
        var xFrom = sizeConverter.DataToScreenX(tx);
        var xTo = sizeConverter.DataToScreenX(this._histoBox.VisualBinRanges[0].AddStep(tx));

        var ty = this._histoBox.VisualBinRanges[1].GetValueFromIndex(bin.binIndex!.indices![1]);
        var yFrom = sizeConverter.DataToScreenY(ty);
        var yTo = sizeConverter.DataToScreenY(this._histoBox.VisualBinRanges[1].AddStep(ty));

        var returnBrushFactorSum = brushFactorSum;
        if (allUnNormalizedValue.hasResult) {
            var brushFactor = (unNormalizedValue / allUnNormalizedValue.result!);
            returnBrushFactorSum += brushFactor;
            returnBrushFactorSum = Math.min(returnBrushFactorSum, 1.0);

            var tempRect = new PIXIRectangle(xFrom, yTo, xTo - xFrom, yFrom - yTo);
            var ratio = (tempRect.width / tempRect.height);
            var newHeight = Math.sqrt((1.0 / ratio) * ((tempRect.width * tempRect.height) * returnBrushFactorSum));
            var newWidth = newHeight * ratio;

            xFrom = (tempRect.x + (tempRect.width - newWidth) / 2.0);
            yTo = (tempRect.y + (tempRect.height - newHeight) / 2.0);
            xTo = (xFrom + newWidth);
            yFrom = (yTo + newHeight);
        }
        var alpha = 0.0;
        var color = this.baseColorFromBrush(brush);
        var lerpColor = LABColor.Lerp(
            LABColor.FromColor(StyleConstants.MIN_VALUE_COLOR),
            LABColor.FromColor(color),
            (alpha + Math.pow(normalizedValue, 1.0 / 3.0) * (1.0 - alpha)));
        var dataColor = LABColor.ToColor(lerpColor);

        this.createBinPrimitive(bin, brush, PIXIRectangle.EMPTY, 0, xFrom, xTo, yFrom, yTo, dataColor, 1, unNormalizedValue);
        return returnBrushFactorSum;
    }

    private createSinlgePointChartBinPrimitives(bin: Bin, brush: Brush, unNormalizedValue: number, sizeConverter: SizeConverter): void {
        var yAggregateKey = ModelHelpers.CreateAggregateKey(this.histoOp.Y, this.histoResult, brush.brushIndex!);
        var xAggregateKey = ModelHelpers.CreateAggregateKey(this.histoOp.X, this.histoResult, brush.brushIndex!);

        var xValue = ModelHelpers.GetAggregateResult(bin, xAggregateKey) as DoubleValueAggregateResult;
        if (!xValue.hasResult)
            return;
        var xFrom = sizeConverter.DataToScreenX(xValue.result!) - 5;
        var xTo = sizeConverter.DataToScreenX(xValue.result!) + 5;

        var yValue = ModelHelpers.GetAggregateResult(bin, yAggregateKey) as DoubleValueAggregateResult;;
        if (!yValue.hasResult)
            return;
        var yFrom = sizeConverter.DataToScreenY(yValue.result!) + 5;
        var yTo = sizeConverter.DataToScreenY(yValue.result!);

        this.createBinPrimitive(bin, brush, PIXIRectangle.EMPTY, 0, xFrom, xTo, yFrom, yTo, this.baseColorFromBrush(brush), 1, unNormalizedValue);
    }

    private createVerticalBarChartBinPrimitives(bin: Bin, brush: Brush, binBrushMaxAxis: number, normalization: number, sizeConverter: SizeConverter): void {
        var yAggregateKey = ModelHelpers.CreateAggregateKey(this.histoOp.Y, this.histoResult, brush.brushIndex!);
        var marginParams = new MarginAggregateParameters();
        marginParams.aggregateFunction = this.histoOp.Y.AggregateFunction;
        var yMarginAggregateKey = ModelHelpers.CreateAggregateKey(this.histoOp.Y, this.histoResult,
            brush.brushIndex!, marginParams);
        var dataValue = ModelHelpers.GetAggregateResult(bin, yAggregateKey) as DoubleValueAggregateResult;

        if (dataValue != null && dataValue.hasResult) {
            var yValue = normalization != 0 || binBrushMaxAxis == 0 ? dataValue.result! : (dataValue.result! - 0) / (binBrushMaxAxis - 0) * sizeConverter.DataRanges[1];

            var yFrom = sizeConverter.DataToScreenY(Math.min(0, yValue));
            var yTo = sizeConverter.DataToScreenY(Math.max(0, yValue));;

            var xValue = this._histoBox.VisualBinRanges[0].GetValueFromIndex(bin.binIndex!.indices![0])!;
            var xFrom = sizeConverter.DataToScreenX(xValue);
            var xTo = sizeConverter.DataToScreenX(this._histoBox.VisualBinRanges[0].AddStep(xValue));

            var marginResult = ModelHelpers.GetAggregateResult(bin, yMarginAggregateKey) as MarginAggregateResult;
            var yMarginAbsolute = !marginResult ? 0 : marginResult.absolutMargin!;
            var marginRect = new PIXIRectangle(xFrom + (xTo - xFrom) / 2.0 - 1,
                sizeConverter.DataToScreenY(yValue + yMarginAbsolute), 2,
                sizeConverter.DataToScreenY(yValue - yMarginAbsolute) - sizeConverter.DataToScreenY(yValue + yMarginAbsolute));

            this.createBinPrimitive(bin, brush, marginRect, 0, xFrom, xTo, yFrom, yTo,
                this.baseColorFromBrush(brush), normalization != 0 ? 1 : 0.6 * binBrushMaxAxis / sizeConverter.DataRanges[1] + 0.4, dataValue.result!);
        }
    }

    private createHorizontalBarChartBinPrimitives(bin: Bin, brush: Brush, binBrushMaxAxis: number, normalization: number, sizeConverter: SizeConverter): void {
        var xAggregateKey = ModelHelpers.CreateAggregateKey(this.histoOp.X, this.histoResult, brush.brushIndex!);
        var marginParams = new MarginAggregateParameters();
        marginParams.aggregateFunction = this.histoOp.X.AggregateFunction;
        var xMarginAggregateKey = ModelHelpers.CreateAggregateKey(this.histoOp.X, this.histoResult,
            brush.brushIndex!, marginParams);
        var dataValue = ModelHelpers.GetAggregateResult(bin, xAggregateKey) as DoubleValueAggregateResult;

        if (dataValue != null && dataValue.hasResult) {
            var xValue = normalization != 1 || binBrushMaxAxis == 0 ? dataValue.result! : (dataValue.result! - 0) / (binBrushMaxAxis - 0) * sizeConverter.DataRanges[0];
            var xFrom = sizeConverter.DataToScreenX(Math.min(0, xValue));
            var xTo = sizeConverter.DataToScreenX(Math.max(0, xValue));

            var yValue = this._histoBox.VisualBinRanges[1].GetValueFromIndex(bin.binIndex!.indices![1]);
            var yFrom = yValue;
            var yTo = this._histoBox.VisualBinRanges[1].AddStep(yValue);

            var marginResult = ModelHelpers.GetAggregateResult(bin, xMarginAggregateKey) as MarginAggregateResult;
            var xMarginAbsolute = sizeConverter.IsSmall || !marginResult ? 0 : marginResult.absolutMargin!;

            var marginRect = new PIXIRectangle(sizeConverter.DataToScreenX(xValue - xMarginAbsolute),
                yTo + (yFrom - yTo) / 2.0 - 1,
                sizeConverter.DataToScreenX(xValue + xMarginAbsolute) - sizeConverter.DataToScreenX(xValue - xMarginAbsolute),
                2.0);

            this.createBinPrimitive(bin, brush, marginRect, 0, xFrom, xTo, yFrom, yTo,
                this.baseColorFromBrush(brush), normalization != 1 ? 1 : 0.6 * binBrushMaxAxis / sizeConverter.DataRanges[0] + 0.4, dataValue.result!);
        }
    }

    private createBinPrimitive(bin: Bin, brush: Brush, marginRect: PIXIRectangle,
        marginPercentage: number, xFrom: number, xTo: number, yFrom: number, yTo: number, color: number, opacity: number, dataValue: number) {
        // hitgeom todo

        var binPrimitive = new HistogramBinPrimitive(
            {
                Rect: new PIXIRectangle(
                    xFrom,
                    yTo,
                    xTo - xFrom,
                    yFrom - yTo),
                MarginRect: marginRect,
                MarginPercentage: marginPercentage,
                BrushIndex: brush.brushIndex,
                Color: color,
                Opacity: opacity,
                DataValue: dataValue
            });
        this.BinPrimitives.push(binPrimitive);
    }

    private baseColorFromBrush(brush: Brush): number {
        var baseColor: number = StyleConstants.HIGHLIGHT_COLOR;
        if (brush.brushIndex == ModelHelpers.RestBrushIndex(this.histoResult)) {
            baseColor = StyleConstants.HIGHLIGHT_COLOR;
        }
        else if (brush.brushIndex == ModelHelpers.OverlapBrushIndex(this.histoResult)) {
            baseColor = StyleConstants.OVERLAP_COLOR;
        }
        else if (brush.brushIndex == ModelHelpers.AllBrushIndex(this.histoResult)) {
            baseColor = 0x00ff00;
        }
        else {
            if (this._histoBox.HistoOp!.BrushColors.length > 0) {
                baseColor = this._histoBox.HistoOp!.BrushColors[brush.brushIndex! % this._histoBox.HistoOp!.BrushColors.length];
            }
            else {
                baseColor = StyleConstants.HIGHLIGHT_COLOR;
            }
        }
        return baseColor;
    }
}