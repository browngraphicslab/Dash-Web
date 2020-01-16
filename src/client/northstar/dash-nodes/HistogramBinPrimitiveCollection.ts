import React = require("react");
import { AttributeTransformationModel } from "../../northstar/core/attribute/AttributeTransformationModel";
import { ChartType } from '../../northstar/model/binRanges/VisualBinRange';
import { AggregateFunction, Bin, Brush, DoubleValueAggregateResult, HistogramResult, MarginAggregateParameters, MarginAggregateResult } from "../../northstar/model/idea/idea";
import { ModelHelpers } from "../../northstar/model/ModelHelpers";
import { LABColor } from '../../northstar/utils/LABColor';
import { PIXIRectangle } from "../../northstar/utils/MathUtil";
import { StyleConstants } from "../../northstar/utils/StyleContants";
import { HistogramBox } from "./HistogramBox";
import "./HistogramBoxPrimitives.scss";

export class HistogramBinPrimitive {
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
    public BarAxis: number = -1;
}

export class HistogramBinPrimitiveCollection {
    private static TOLERANCE: number = 0.0001;

    private _histoBox: HistogramBox;
    private get histoOp() { return this._histoBox.HistoOp; }
    private get histoResult() { return this.histoOp.Result as HistogramResult; }
    private get sizeConverter() { return this._histoBox.SizeConverter; }
    public BinPrimitives: Array<HistogramBinPrimitive> = new Array<HistogramBinPrimitive>();
    public HitGeom: PIXIRectangle = PIXIRectangle.EMPTY;

    constructor(bin: Bin, histoBox: HistogramBox) {
        this._histoBox = histoBox;
        let brushing = this.setupBrushing(bin, this.histoOp.Normalization); // X= 0, Y = 1, V = 2

        brushing.orderedBrushes.reduce((brushFactorSum, brush) => {
            switch (histoBox.ChartType) {
                case ChartType.VerticalBar: return this.createVerticalBarChartBinPrimitives(bin, brush, brushing.maxAxis, this.histoOp.Normalization);
                case ChartType.HorizontalBar: return this.createHorizontalBarChartBinPrimitives(bin, brush, brushing.maxAxis, this.histoOp.Normalization);
                case ChartType.SinglePoint: return this.createSinglePointChartBinPrimitives(bin, brush);
                case ChartType.HeatMap: return this.createHeatmapBinPrimitives(bin, brush, brushFactorSum);
            }
        }, 0);

        // adjust brush rects (stacking or not)
        var allBrushIndex = ModelHelpers.AllBrushIndex(this.histoResult);
        var filteredBinPrims = this.BinPrimitives.filter(b => b.BrushIndex !== allBrushIndex && b.DataValue !== 0.0);
        filteredBinPrims.reduce((sum, fbp) => {
            if (histoBox.ChartType === ChartType.VerticalBar) {
                if (this.histoOp.Y.AggregateFunction === AggregateFunction.Count) {
                    fbp.Rect = new PIXIRectangle(fbp.Rect.x, fbp.Rect.y - sum, fbp.Rect.width, fbp.Rect.height);
                    fbp.MarginRect = new PIXIRectangle(fbp.MarginRect.x, fbp.MarginRect.y - sum, fbp.MarginRect.width, fbp.MarginRect.height);
                    return sum + fbp.Rect.height;
                }
                if (this.histoOp.Y.AggregateFunction === AggregateFunction.Avg) {
                    var w = fbp.Rect.width / 2.0;
                    fbp.Rect = new PIXIRectangle(fbp.Rect.x + sum, fbp.Rect.y, fbp.Rect.width / filteredBinPrims.length, fbp.Rect.height);
                    fbp.MarginRect = new PIXIRectangle(fbp.MarginRect.x - w + sum + (fbp.Rect.width / 2.0), fbp.MarginRect.y, fbp.MarginRect.width, fbp.MarginRect.height);
                    return sum + fbp.Rect.width;
                }
            }
            else if (histoBox.ChartType === ChartType.HorizontalBar) {
                if (this.histoOp.X.AggregateFunction === AggregateFunction.Count) {
                    fbp.Rect = new PIXIRectangle(fbp.Rect.x + sum, fbp.Rect.y, fbp.Rect.width, fbp.Rect.height);
                    fbp.MarginRect = new PIXIRectangle(fbp.MarginRect.x + sum, fbp.MarginRect.y, fbp.MarginRect.width, fbp.MarginRect.height);
                    return sum + fbp.Rect.width;
                }
                if (this.histoOp.X.AggregateFunction === AggregateFunction.Avg) {
                    var h = fbp.Rect.height / 2.0;
                    fbp.Rect = new PIXIRectangle(fbp.Rect.x, fbp.Rect.y + sum, fbp.Rect.width, fbp.Rect.height / filteredBinPrims.length);
                    fbp.MarginRect = new PIXIRectangle(fbp.MarginRect.x, fbp.MarginRect.y - h + sum + (fbp.Rect.height / 2.0), fbp.MarginRect.width, fbp.MarginRect.height);
                    return sum + fbp.Rect.height;
                }
            }
            return 0;
        }, 0);
        this.BinPrimitives = this.BinPrimitives.reverse();
        var f = this.BinPrimitives.filter(b => b.BrushIndex === allBrushIndex);
        this.HitGeom = f.length > 0 ? f[0].Rect : PIXIRectangle.EMPTY;
    }

    private setupBrushing(bin: Bin, normalization: number) {
        var overlapBrushIndex = ModelHelpers.OverlapBrushIndex(this.histoResult);
        var orderedBrushes = [this.histoResult.brushes![0], this.histoResult.brushes![overlapBrushIndex]];
        this.histoResult.brushes!.map(brush => brush.brushIndex !== 0 && brush.brushIndex !== overlapBrushIndex && orderedBrushes.push(brush));
        return {
            orderedBrushes,
            maxAxis: orderedBrushes.reduce((prev, Brush) => {
                let aggResult = this.getBinValue(normalization, bin, Brush.brushIndex!);
                return aggResult !== undefined && aggResult > prev ? aggResult : prev;
            }, Number.MIN_VALUE)
        };
    }

    private createHeatmapBinPrimitives(bin: Bin, brush: Brush, brushFactorSum: number): number {

        let unNormalizedValue = this.getBinValue(2, bin, brush.brushIndex!);
        if (unNormalizedValue === undefined) {
            return brushFactorSum;
        }

        var normalizedValue = (unNormalizedValue - this._histoBox.ValueRange[0]) / (Math.abs((this._histoBox.ValueRange[1] - this._histoBox.ValueRange[0])) < HistogramBinPrimitiveCollection.TOLERANCE ?
            unNormalizedValue : this._histoBox.ValueRange[1] - this._histoBox.ValueRange[0]);

        let allUnNormalizedValue = this.getBinValue(2, bin, ModelHelpers.AllBrushIndex(this.histoResult));

        // bcz: are these calls needed?  
        let [xFrom, xTo] = this.sizeConverter.DataToScreenXAxisRange(this._histoBox.VisualBinRanges, 0, bin);
        let [yFrom, yTo] = this.sizeConverter.DataToScreenYAxisRange(this._histoBox.VisualBinRanges, 1, bin);

        var returnBrushFactorSum = brushFactorSum;
        if (allUnNormalizedValue !== undefined) {
            var brushFactor = (unNormalizedValue / allUnNormalizedValue);
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

        this.createBinPrimitive(-1, brush, PIXIRectangle.EMPTY, 0, xFrom, xTo, yFrom, yTo, dataColor, 1, unNormalizedValue);
        return returnBrushFactorSum;
    }

    private createSinglePointChartBinPrimitives(bin: Bin, brush: Brush): number {
        let unNormalizedValue = this.getBinValue(2, bin, brush.brushIndex!);
        if (unNormalizedValue !== undefined) {
            let [xFrom, xTo] = this.sizeConverter.DataToScreenPointRange(0, bin, ModelHelpers.CreateAggregateKey(this.histoOp.Schema!.distinctAttributeParameters, this.histoOp.X, this.histoResult, brush.brushIndex!));
            let [yFrom, yTo] = this.sizeConverter.DataToScreenPointRange(1, bin, ModelHelpers.CreateAggregateKey(this.histoOp.Schema!.distinctAttributeParameters, this.histoOp.Y, this.histoResult, brush.brushIndex!));

            if (xFrom !== undefined && yFrom !== undefined && xTo !== undefined && yTo !== undefined) {
                this.createBinPrimitive(-1, brush, PIXIRectangle.EMPTY, 0, xFrom, xTo, yFrom, yTo, this.baseColorFromBrush(brush), 1, unNormalizedValue);
            }
        }
        return 0;
    }

    private createVerticalBarChartBinPrimitives(bin: Bin, brush: Brush, binBrushMaxAxis: number, normalization: number): number {
        let dataValue = this.getBinValue(1, bin, brush.brushIndex!);
        if (dataValue !== undefined) {
            let [yFrom, yValue, yTo] = this.sizeConverter.DataToScreenNormalizedRange(dataValue, normalization, 1, binBrushMaxAxis);
            let [xFrom, xTo] = this.sizeConverter.DataToScreenXAxisRange(this._histoBox.VisualBinRanges, 0, bin);

            var yMarginAbsolute = this.getMargin(bin, brush, this.histoOp.Y);
            var marginRect = new PIXIRectangle(xFrom + (xTo - xFrom) / 2.0 - 1,
                this.sizeConverter.DataToScreenY(yValue + yMarginAbsolute), 2,
                this.sizeConverter.DataToScreenY(yValue - yMarginAbsolute) - this.sizeConverter.DataToScreenY(yValue + yMarginAbsolute));

            this.createBinPrimitive(1, brush, marginRect, 0, xFrom, xTo, yFrom, yTo,
                this.baseColorFromBrush(brush), normalization !== 0 ? 1 : 0.6 * binBrushMaxAxis / this.sizeConverter.DataRanges[1] + 0.4, dataValue);
        }
        return 0;
    }

    private createHorizontalBarChartBinPrimitives(bin: Bin, brush: Brush, binBrushMaxAxis: number, normalization: number): number {
        let dataValue = this.getBinValue(0, bin, brush.brushIndex!);
        if (dataValue !== undefined) {
            let [xFrom, xValue, xTo] = this.sizeConverter.DataToScreenNormalizedRange(dataValue, normalization, 0, binBrushMaxAxis);
            let [yFrom, yTo] = this.sizeConverter.DataToScreenYAxisRange(this._histoBox.VisualBinRanges, 1, bin);

            var xMarginAbsolute = this.sizeConverter.IsSmall ? 0 : this.getMargin(bin, brush, this.histoOp.X);
            var marginRect = new PIXIRectangle(this.sizeConverter.DataToScreenX(xValue - xMarginAbsolute),
                yTo + (yFrom - yTo) / 2.0 - 1,
                this.sizeConverter.DataToScreenX(xValue + xMarginAbsolute) - this.sizeConverter.DataToScreenX(xValue - xMarginAbsolute),
                2.0);

            this.createBinPrimitive(0, brush, marginRect, 0, xFrom, xTo, yFrom, yTo,
                this.baseColorFromBrush(brush), normalization !== 1 ? 1 : 0.6 * binBrushMaxAxis / this.sizeConverter.DataRanges[0] + 0.4, dataValue);
        }
        return 0;
    }

    public getBinValue(axis: number, bin: Bin, brushIndex: number) {
        var aggregateKey = ModelHelpers.CreateAggregateKey(this.histoOp.Schema!.distinctAttributeParameters, axis === 0 ? this.histoOp.X : axis === 1 ? this.histoOp.Y : this.histoOp.V, this.histoResult, brushIndex);
        let dataValue = ModelHelpers.GetAggregateResult(bin, aggregateKey) as DoubleValueAggregateResult;
        return dataValue !== null && dataValue.hasResult ? dataValue.result : undefined;
    }

    private getMargin(bin: Bin, brush: Brush, axis: AttributeTransformationModel) {
        var marginParams = new MarginAggregateParameters();
        marginParams.aggregateFunction = axis.AggregateFunction;
        var marginAggregateKey = ModelHelpers.CreateAggregateKey(this.histoOp.Schema!.distinctAttributeParameters, axis, this.histoResult, brush.brushIndex!, marginParams);
        let aggResult = ModelHelpers.GetAggregateResult(bin, marginAggregateKey);
        return aggResult instanceof MarginAggregateResult && aggResult.absolutMargin ? aggResult.absolutMargin : 0;
    }

    private createBinPrimitive(barAxis: number, brush: Brush, marginRect: PIXIRectangle,
        marginPercentage: number, xFrom: number, xTo: number, yFrom: number, yTo: number, color: number, opacity: number, dataValue: number) {
        var binPrimitive = new HistogramBinPrimitive(
            {
                Rect: new PIXIRectangle(xFrom, yTo, xTo - xFrom, yFrom - yTo),
                MarginRect: marginRect,
                MarginPercentage: marginPercentage,
                BrushIndex: brush.brushIndex,
                Color: color,
                Opacity: opacity,
                DataValue: dataValue,
                BarAxis: barAxis
            });
        this.BinPrimitives.push(binPrimitive);
    }

    private baseColorFromBrush(brush: Brush): number {
        let bc = StyleConstants.BRUSH_COLORS;
        if (brush.brushIndex === ModelHelpers.RestBrushIndex(this.histoResult)) {
            return StyleConstants.HIGHLIGHT_COLOR;
        }
        else if (brush.brushIndex === ModelHelpers.OverlapBrushIndex(this.histoResult)) {
            return StyleConstants.OVERLAP_COLOR;
        }
        else if (brush.brushIndex === ModelHelpers.AllBrushIndex(this.histoResult)) {
            return 0x00ff00;
        }
        else if (bc.length > 0) {
            return bc[brush.brushIndex! % bc.length];
        }
        // else if (this.histoOp.BrushColors.length > 0) {
        //     return this.histoOp.BrushColors[brush.brushIndex! % this.histoOp.BrushColors.length];
        // }
        return StyleConstants.HIGHLIGHT_COLOR;
    }
}
