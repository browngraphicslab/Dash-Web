import React = require("react")
import { computed, observable, runInAction, trace } from "mobx";
import { observer } from "mobx-react";
import { Utils as DashUtils } from '../../../Utils';
import { AttributeTransformationModel } from "../../northstar/core/attribute/AttributeTransformationModel";
import { ChartType } from '../../northstar/model/binRanges/VisualBinRange';
import { AggregateFunction, Bin, Brush, HistogramResult, MarginAggregateParameters, MarginAggregateResult } from "../../northstar/model/idea/idea";
import { ModelHelpers } from "../../northstar/model/ModelHelpers";
import { ArrayUtil } from "../../northstar/utils/ArrayUtil";
import { LABColor } from '../../northstar/utils/LABcolor';
import { PIXIRectangle } from "../../northstar/utils/MathUtil";
import { StyleConstants } from "../../northstar/utils/StyleContants";
import { HistogramBox } from "./HistogramBox";
import "./HistogramBoxPrimitives.scss";
import { HistogramOperation } from "../../northstar/operations/HistogramOperation";
import { FilterModel } from "../../northstar/core/filter/FilterModel";

export interface HistogramBoxPrimitivesProps {
    HistoBox: HistogramBox;
}

@observer
export class HistogramBoxPrimitives extends React.Component<HistogramBoxPrimitivesProps> {
    @observable _selectedPrims: HistogramBinPrimitive[] = [];

    @computed get xaxislines() { return this.renderGridLinesAndLabels(0); }
    @computed get yaxislines() { return this.renderGridLinesAndLabels(1); }
    @computed get selectedPrimitives() {
        return this._selectedPrims.map((bp) => this.drawRect(bp.Rect, bp.BarAxis, undefined, () => { }, "border"));
    }
    private getSelectionToggle(histoOp: HistogramOperation, binPrimitives: HistogramBinPrimitive[], allBrushIndex: number, filterModel: FilterModel) {
        let allBrushPrim = ArrayUtil.FirstOrDefault(binPrimitives, bp => bp.BrushIndex == allBrushIndex);
        return !allBrushPrim ? () => { } : () => runInAction(() => {
            if (ArrayUtil.Contains(histoOp!.FilterModels, filterModel)) {
                this._selectedPrims.splice(this._selectedPrims.indexOf(allBrushPrim!), 1);
                histoOp!.RemoveFilterModels([filterModel]);
            }
            else {
                this._selectedPrims.push(allBrushPrim!);
                histoOp!.AddFilterModels([filterModel]);
            }
        })
    }
    @computed
    get binPrimitives() {
        let histoOp = this.props.HistoBox.HistoOp;
        let histoResult = this.props.HistoBox.HistogramResult;
        if (!histoOp || !histoResult || !histoResult.bins || !this.props.HistoBox.VisualBinRanges.length)
            return (null);
        let allBrushIndex = ModelHelpers.AllBrushIndex(histoResult);
        return Object.keys(histoResult.bins).reduce((prims, key) => {
            let drawPrims = new HistogramBinPrimitiveCollection(histoResult!.bins![key], this.props.HistoBox);
            let filterModel = ModelHelpers.GetBinFilterModel(histoResult!.bins![key], allBrushIndex, histoResult!, histoOp!.X, histoOp!.Y);

            this.props.HistoBox.HitTargets.setValue(drawPrims.HitGeom, filterModel);

            let toggle = this.getSelectionToggle(histoOp!, drawPrims.BinPrimitives, allBrushIndex, filterModel);
            drawPrims.BinPrimitives.filter(bp => bp.DataValue && bp.BrushIndex !== allBrushIndex).map(bp =>
                prims.push(...[{ r: bp.Rect, c: bp.Color }, { r: bp.MarginRect, c: StyleConstants.MARGIN_BARS_COLOR }].map(pair => this.drawRect(pair.r, bp.BarAxis, pair.c, toggle, "bar"))));
            return prims;
        }, [] as JSX.Element[]);
    }


    private renderGridLinesAndLabels(axis: number) {
        let sc = this.props.HistoBox.SizeConverter;
        let vb = this.props.HistoBox.VisualBinRanges;
        if (!vb.length || !sc.Initialized)
            return (null);

        let prims: JSX.Element[] = [];
        let labels = vb[axis].GetLabels();
        labels.map((binLabel, i) => {
            let r = sc.DataToScreenRange(binLabel.minValue!, binLabel.maxValue!, axis);

            prims.push(this.drawLine(r.xFrom, r.yFrom, axis == 0 ? 1 : r.xTo - r.xFrom, axis == 0 ? r.yTo - r.yFrom : 1));
            if (i == labels.length - 1)
                prims.push(this.drawLine(axis == 0 ? r.xTo : r.xFrom, axis == 0 ? r.yFrom : r.yTo, axis == 0 ? 1 : r.xTo - r.xFrom, axis == 0 ? r.yTo - r.yFrom : 1));
        });
        return prims;
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
        let transXpercent = (xFrom) / this.props.HistoBox.SizeConverter.RenderDimension;
        let transYpercent = (yFrom) / this.props.HistoBox.SizeConverter.RenderDimension;
        let trans2Xpercent = width == 1 ? "1px" : `${(xFrom + width) / this.props.HistoBox.SizeConverter.RenderDimension * 100}%`;
        let trans2Ypercent = height == 1 ? "1px" : `${(yFrom + height) / this.props.HistoBox.SizeConverter.RenderDimension * 100}%`;
        return <div key={DashUtils.GenerateGuid()} className="histogramboxprimitives-placer" style={{ transform: `translate(${transXpercent * 100}%, ${transYpercent * 100}%)` }}>
            <div className="histogramboxprimitives-line"
                style={{
                    width: trans2Xpercent,
                    height: trans2Ypercent,
                }}
            /></div>;
    }

    drawRect(r: PIXIRectangle, barAxis: number, color: number | undefined, tapHandler: () => void, classExt: string) {
        let widthPercent = (r.width - 0) / this.props.HistoBox.SizeConverter.RenderDimension;
        let heightPercent = r.height / this.props.HistoBox.SizeConverter.RenderDimension;
        let transXpercent = (r.x) / this.props.HistoBox.SizeConverter.RenderDimension;
        let transYpercent = (r.y) / this.props.HistoBox.SizeConverter.RenderDimension;
        return (<div key={DashUtils.GenerateGuid()} className={`histogramboxprimitives-placer`} style={{ transform: `translate(${transXpercent * 100}%, ${transYpercent * 100}%)` }}>
            <div className={`histogramboxprimitives-${classExt}`} onPointerDown={(e: React.PointerEvent) => { if (e.button == 0) tapHandler() }}
                style={{
                    borderBottomStyle: barAxis == 1 ? "none" : "solid",
                    borderLeftStyle: barAxis == 0 ? "none" : "solid",
                    width: `${widthPercent * 100}%`,
                    height: `${heightPercent * 100}%`,
                    background: color ? `${LABColor.RGBtoHexString(color)}` : ""
                }}
            /></div>);
    }
    render() {
        if (!this.props.HistoBox.SizeConverter.Initialized)
            return (null);
        let xaxislines = this.xaxislines;
        let yaxislines = this.yaxislines;
        return <div className="histogramboxprimitives-container" style={{
            width: "100%",
            height: "100%",
        }}>
            {xaxislines}
            {yaxislines}
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
    public BarAxis: number = -1;
}

export class HistogramBinPrimitiveCollection {
    private static TOLERANCE: number = 0.0001;

    private _histoBox: HistogramBox;
    private get histoOp() { return this._histoBox.HistoOp!; }
    private get histoResult() { return this.histoOp.Result as HistogramResult; }
    private get sizeConverter() { return this._histoBox.SizeConverter!; }
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
        var filteredBinPrims = this.BinPrimitives.filter(b => b.BrushIndex != allBrushIndex && b.DataValue != 0.0);
        filteredBinPrims.reduce((sum, fbp) => {
            if (histoBox.ChartType == ChartType.VerticalBar) {
                if (this.histoOp.X.AggregateFunction == AggregateFunction.Count) {
                    fbp.Rect = new PIXIRectangle(fbp.Rect.x, fbp.Rect.y - sum, fbp.Rect.width, fbp.Rect.height);
                    fbp.MarginRect = new PIXIRectangle(fbp.MarginRect.x, fbp.MarginRect.y - sum, fbp.MarginRect.width, fbp.MarginRect.height);
                    return sum + fbp.Rect.height;
                }
                if (this.histoOp.Y.AggregateFunction == AggregateFunction.Avg) {
                    var w = fbp.Rect.width / 2.0;
                    fbp.Rect = new PIXIRectangle(fbp.Rect.x + sum, fbp.Rect.y, fbp.Rect.width / filteredBinPrims.length, fbp.Rect.height);
                    fbp.MarginRect = new PIXIRectangle(fbp.MarginRect.x - w + sum + (fbp.Rect.width / 2.0), fbp.MarginRect.y, fbp.MarginRect.width, fbp.MarginRect.height);
                    return sum + fbp.Rect.width;
                }
            }
            else if (histoBox.ChartType == ChartType.HorizontalBar) {
                if (this.histoOp.X.AggregateFunction == AggregateFunction.Count) {
                    fbp.Rect = new PIXIRectangle(fbp.Rect.x + sum, fbp.Rect.y, fbp.Rect.width, fbp.Rect.height);
                    fbp.MarginRect = new PIXIRectangle(fbp.MarginRect.x + sum, fbp.MarginRect.y, fbp.MarginRect.width, fbp.MarginRect.height);
                    return sum + fbp.Rect.width;
                }
                if (this.histoOp.X.AggregateFunction == AggregateFunction.Avg) {
                    var h = fbp.Rect.height / 2.0;
                    fbp.Rect = new PIXIRectangle(fbp.Rect.x, fbp.Rect.y + sum, fbp.Rect.width, fbp.Rect.height / filteredBinPrims.length);
                    fbp.MarginRect = new PIXIRectangle(fbp.MarginRect.x, fbp.MarginRect.y - h + sum + (fbp.Rect.height / 2.0), fbp.MarginRect.width, fbp.MarginRect.height);
                    return sum + fbp.Rect.height;
                }
            }
            return 0;
        }, 0);
        this.BinPrimitives = this.BinPrimitives.reverse();
        var f = this.BinPrimitives.filter(b => b.BrushIndex == allBrushIndex);
        this.HitGeom = f.length > 0 ? f[0].Rect : PIXIRectangle.EMPTY;
    }
    private setupBrushing(bin: Bin, normalization: number) {
        var overlapBrushIndex = ModelHelpers.OverlapBrushIndex(this.histoResult);
        var orderedBrushes = [this.histoResult.brushes![0], this.histoResult.brushes![overlapBrushIndex]];
        this.histoResult.brushes!.map(brush => brush.brushIndex != 0 && brush.brushIndex != overlapBrushIndex && orderedBrushes.push(brush));
        return {
            orderedBrushes,
            maxAxis: orderedBrushes.reduce((prev, Brush) => {
                let aggResult = this.histoOp.getValue(normalization, bin, this.histoResult, Brush.brushIndex!);
                return aggResult != undefined && aggResult > prev ? aggResult : prev;
            }, Number.MIN_VALUE)
        };
    }
    private createHeatmapBinPrimitives(bin: Bin, brush: Brush, brushFactorSum: number): number {

        let unNormalizedValue = this.histoOp!.getValue(2, bin, this.histoResult, brush.brushIndex!);
        if (unNormalizedValue == undefined)
            return brushFactorSum;

        var normalizedValue = (unNormalizedValue - this._histoBox.ValueRange[0]) / (Math.abs((this._histoBox.ValueRange[1] - this._histoBox.ValueRange[0])) < HistogramBinPrimitiveCollection.TOLERANCE ?
            unNormalizedValue : this._histoBox.ValueRange[1] - this._histoBox.ValueRange[0]);

        let allUnNormalizedValue = this.histoOp.getValue(2, bin, this.histoResult, ModelHelpers.AllBrushIndex(this.histoResult))

        // bcz: are these calls needed?  
        let [xFrom, xTo] = this.sizeConverter.DataToScreenAxisRange(this._histoBox.VisualBinRanges, 0, bin);
        let [yFrom, yTo] = this.sizeConverter.DataToScreenAxisRange(this._histoBox.VisualBinRanges, 1, bin);

        var returnBrushFactorSum = brushFactorSum;
        if (allUnNormalizedValue != undefined) {
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
        let unNormalizedValue = this._histoBox.HistoOp!.getValue(2, bin, this.histoResult, brush.brushIndex!);
        if (unNormalizedValue != undefined) {
            let [xFrom, xTo] = this.sizeConverter.DataToScreenPointRange(0, bin, ModelHelpers.CreateAggregateKey(this.histoOp.X, this.histoResult, brush.brushIndex!));
            let [yFrom, yTo] = this.sizeConverter.DataToScreenPointRange(1, bin, ModelHelpers.CreateAggregateKey(this.histoOp.Y, this.histoResult, brush.brushIndex!));

            if (xFrom != undefined && yFrom != undefined && xTo != undefined && yTo != undefined)
                this.createBinPrimitive(-1, brush, PIXIRectangle.EMPTY, 0, xFrom, xTo, yFrom, yTo, this.baseColorFromBrush(brush), 1, unNormalizedValue);
        }
        return 0;
    }

    private createVerticalBarChartBinPrimitives(bin: Bin, brush: Brush, binBrushMaxAxis: number, normalization: number): number {
        let dataValue = this.histoOp.getValue(1, bin, this.histoResult, brush.brushIndex!);
        if (dataValue != undefined) {
            let [yFrom, yValue, yTo] = this.sizeConverter.DataToScreenNormalizedRange(dataValue, normalization, 1, binBrushMaxAxis);
            let [xFrom, xTo] = this.sizeConverter.DataToScreenAxisRange(this._histoBox.VisualBinRanges, 0, bin);

            var yMarginAbsolute = this.getMargin(bin, brush, this.histoOp.Y);
            var marginRect = new PIXIRectangle(xFrom + (xTo - xFrom) / 2.0 - 1,
                this.sizeConverter.DataToScreenY(yValue + yMarginAbsolute), 2,
                this.sizeConverter.DataToScreenY(yValue - yMarginAbsolute) - this.sizeConverter.DataToScreenY(yValue + yMarginAbsolute));

            this.createBinPrimitive(1, brush, marginRect, 0, xFrom, xTo, yFrom, yTo,
                this.baseColorFromBrush(brush), normalization != 0 ? 1 : 0.6 * binBrushMaxAxis / this.sizeConverter.DataRanges[1] + 0.4, dataValue);
        }
        return 0;
    }

    private createHorizontalBarChartBinPrimitives(bin: Bin, brush: Brush, binBrushMaxAxis: number, normalization: number): number {
        let dataValue = this.histoOp.getValue(0, bin, this.histoResult, brush.brushIndex!);
        if (dataValue != undefined) {
            let [xFrom, xValue, xTo] = this.sizeConverter.DataToScreenNormalizedRange(dataValue, normalization, 0, binBrushMaxAxis);
            let [yFrom, yTo] = this.sizeConverter.DataToScreenAxisRange(this._histoBox.VisualBinRanges, 1, bin);

            var xMarginAbsolute = this.sizeConverter.IsSmall ? 0 : this.getMargin(bin, brush, this.histoOp.X);
            var marginRect = new PIXIRectangle(this.sizeConverter.DataToScreenX(xValue - xMarginAbsolute),
                yTo + (yFrom - yTo) / 2.0 - 1,
                this.sizeConverter.DataToScreenX(xValue + xMarginAbsolute) - this.sizeConverter.DataToScreenX(xValue - xMarginAbsolute),
                2.0);

            this.createBinPrimitive(0, brush, marginRect, 0, xFrom, xTo, yFrom, yTo,
                this.baseColorFromBrush(brush), normalization != 1 ? 1 : 0.6 * binBrushMaxAxis / this.sizeConverter.DataRanges[0] + 0.4, dataValue);
        }
        return 0;
    }


    private getMargin(bin: Bin, brush: Brush, axis: AttributeTransformationModel) {
        var marginParams = new MarginAggregateParameters();
        marginParams.aggregateFunction = axis.AggregateFunction;
        var marginAggregateKey = ModelHelpers.CreateAggregateKey(axis, this.histoResult, brush.brushIndex!, marginParams);
        var marginResult = ModelHelpers.GetAggregateResult(bin, marginAggregateKey) as MarginAggregateResult;
        return !marginResult ? 0 : marginResult.absolutMargin!;
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
        if (brush.brushIndex == ModelHelpers.RestBrushIndex(this.histoResult)) {
            return StyleConstants.HIGHLIGHT_COLOR;
        }
        else if (brush.brushIndex == ModelHelpers.OverlapBrushIndex(this.histoResult)) {
            return StyleConstants.OVERLAP_COLOR;
        }
        else if (brush.brushIndex == ModelHelpers.AllBrushIndex(this.histoResult)) {
            return 0x00ff00;
        }
        else if (this.histoOp.BrushColors.length > 0) {
            return this.histoOp.BrushColors[brush.brushIndex! % this.histoOp.BrushColors.length];
        }
        return StyleConstants.HIGHLIGHT_COLOR;
    }
}