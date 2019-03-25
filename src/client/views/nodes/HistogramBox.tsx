import React = require("react")
import { action, computed, observable, reaction } from "mobx";
import { observer } from "mobx-react";
import Measure from "react-measure";
import { Dictionary } from "typescript-collections";
import { Utils as DashUtils } from '../../../Utils';
import { ColumnAttributeModel } from "../../northstar/core/attribute/AttributeModel";
import { AttributeTransformationModel } from "../../northstar/core/attribute/AttributeTransformationModel";
import { FilterModel } from '../../northstar/core/filter/FilterModel';
import { DateTimeVisualBinRange } from "../../northstar/model/binRanges/DateTimeVisualBinRange";
import { NominalVisualBinRange } from "../../northstar/model/binRanges/NominalVisualBinRange";
import { QuantitativeVisualBinRange } from "../../northstar/model/binRanges/QuantitativeVisualBinRange";
import { ChartType, VisualBinRange } from '../../northstar/model/binRanges/VisualBinRange';
import { VisualBinRangeHelper } from "../../northstar/model/binRanges/VisualBinRangeHelper";
import { AggregateBinRange, AggregateFunction, Bin, Brush, DoubleValueAggregateResult, HistogramResult, MarginAggregateParameters, MarginAggregateResult } from "../../northstar/model/idea/idea";
import { ModelHelpers } from "../../northstar/model/ModelHelpers";
import { HistogramOperation } from "../../northstar/operations/HistogramOperation";
import { ArrayUtil } from "../../northstar/utils/ArrayUtil";
import { LABColor } from '../../northstar/utils/LABcolor';
import { PIXIRectangle } from "../../northstar/utils/MathUtil";
import { SizeConverter } from "../../northstar/utils/SizeConverter";
import { StyleConstants } from "../../northstar/utils/StyleContants";
import { Main } from "../Main";
import { FieldView, FieldViewProps } from './FieldView';
import "./HistogramBox.scss";



@observer
export class HistogramBox extends React.Component<FieldViewProps> {

    public static LayoutString(fieldStr: string = "DataKey") { return FieldView.LayoutString(HistogramBox, fieldStr) }

    @observable private _renderer = [];
    @observable private _visualBinRanges: VisualBinRange[] = [];
    @observable private _minValue: number = 0;
    @observable private _maxValue: number = 0;
    @observable private _panelWidth: number = 100;
    @observable private _panelHeight: number = 100;
    @observable private _histoOp?: HistogramOperation;
    @observable private _sizeConverter?: SizeConverter;
    @observable private _chartType: ChartType = ChartType.VerticalBar;
    public HitTargets: Dictionary<PIXIRectangle, FilterModel> = new Dictionary<PIXIRectangle, FilterModel>();



    constructor(props: FieldViewProps) {
        super(props);
    }

    componentDidMount() {
        reaction(() => [this.props.doc.Title],
            () => {
                Main.Instance.GetAllNorthstarColumnAttributes().map(a => {
                    if (a.displayName == this.props.doc.Title) {
                        var atmod = new ColumnAttributeModel(a);
                        this._histoOp = new HistogramOperation(new AttributeTransformationModel(atmod, AggregateFunction.None),
                            new AttributeTransformationModel(atmod, AggregateFunction.Count),
                            new AttributeTransformationModel(atmod, AggregateFunction.Count));
                        this._histoOp.Update();
                    }
                });
            }, { fireImmediately: true });
        reaction(() => [this._visualBinRanges && this._visualBinRanges.slice(), this._panelHeight, this._panelWidth],
            () => this._sizeConverter = new SizeConverter({ x: this._panelWidth, y: this._panelHeight }, this._visualBinRanges, Math.PI / 4));
        reaction(() => [this._histoOp && this._histoOp.Result],
            () => {
                if (!this._histoOp || !(this._histoOp.Result instanceof HistogramResult) || !this._histoOp.Result.binRanges)
                    return;

                let binRanges = this._histoOp.Result.binRanges;
                this._chartType = binRanges[0] instanceof AggregateBinRange ? (binRanges[1] instanceof AggregateBinRange ? ChartType.SinglePoint : ChartType.HorizontalBar) :
                    binRanges[1] instanceof AggregateBinRange ? ChartType.VerticalBar : ChartType.HeatMap;

                this._visualBinRanges.length = 0;
                this._visualBinRanges.push(VisualBinRangeHelper.GetVisualBinRange(this._histoOp.Result.binRanges![0], this._histoOp.Result, this._histoOp.X, this._chartType));
                this._visualBinRanges.push(VisualBinRangeHelper.GetVisualBinRange(this._histoOp.Result.binRanges![1], this._histoOp.Result, this._histoOp.Y, this._chartType));

                if (!this._histoOp.Result.isEmpty) {
                    this._maxValue = Number.MIN_VALUE;
                    this._minValue = Number.MAX_VALUE;
                    for (let key in this._histoOp.Result.bins) {
                        if (this._histoOp.Result.bins.hasOwnProperty(key)) {
                            let bin = this._histoOp.Result.bins[key];
                            let valueAggregateKey = ModelHelpers.CreateAggregateKey(this._histoOp.V, this._histoOp.Result, ModelHelpers.AllBrushIndex(this._histoOp.Result));
                            let value = ModelHelpers.GetAggregateResult(bin, valueAggregateKey) as DoubleValueAggregateResult;
                            if (value && value.hasResult) {
                                this._maxValue = Math.max(this._maxValue, value.result!);
                                this._minValue = Math.min(this._minValue, value.result!);
                            }
                        }
                    }
                }
            }
        );
    }

    @computed get xaxislines() { return this.renderGridLinesAndLabels(0); }
    @computed get yaxislines() { return this.renderGridLinesAndLabels(1); }

    drawLine(xFrom: number, yFrom: number, width: number, height: number) {
        return <div key={DashUtils.GenerateGuid()}
            style={{
                position: "absolute",
                width: `${width}px`,
                height: `${height}px`,
                background: "lightgray",
                transform: `translate(${xFrom}px, ${yFrom}px)`
            }} />;
    }

    private renderGridLinesAndLabels(axis: number) {
        let prims: JSX.Element[] = [];
        let sc = this._sizeConverter!;
        let labels = this._visualBinRanges[axis].GetLabels();

        let dim = sc.RenderSize[axis] / sc.MaxLabelSizes[axis].coords[axis] + 5;
        let mod = Math.ceil(labels.length / dim);

        if (axis == 0 && this._visualBinRanges[axis] instanceof NominalVisualBinRange) {
            mod = Math.ceil(
                labels.length / (sc.RenderSize[0] / (12 + 5))); //  (<number>FontStyles.AxisLabel.fontSize + 5)));
        }
        for (let i = 0; i < labels.length; i++) {
            let binLabel = labels[i];
            let xFrom = sc.DataToScreenX(axis === 0 ? binLabel.minValue! : sc.DataMins[0]);
            let xTo = sc.DataToScreenX(axis === 0 ? binLabel.maxValue! : sc.DataMaxs[0]);
            let yFrom = sc.DataToScreenY(axis === 0 ? sc.DataMins[1] : binLabel.minValue!);
            let yTo = sc.DataToScreenY(axis === 0 ? sc.DataMaxs[1] : binLabel.maxValue!);

            prims.push(this.drawLine(xFrom, yFrom, axis == 0 ? 1 : xTo - xFrom, axis == 0 ? yTo - yFrom : 1));
            if (i == labels.length - 1)
                prims.push(this.drawLine(axis == 0 ? xTo : xFrom, axis == 0 ? yFrom : yTo, axis == 0 ? 1 : xTo - xFrom, axis == 0 ? yTo - yFrom : 1));

            if (i % mod === 0 && binLabel.label) {
                let text = binLabel.label;
                if (text.length >= StyleConstants.MAX_CHAR_FOR_HISTOGRAM_LABELS) {
                    text = text.slice(0, StyleConstants.MAX_CHAR_FOR_HISTOGRAM_LABELS - 3) + "...";
                }
                const textHeight = 14; const textWidth = 30;
                let xStart = (axis === 0 ? xFrom + (xTo - xFrom) / 2.0 : xFrom - 10 - textWidth);
                let yStart = (axis === 1 ? yFrom - textHeight / 2 : yFrom);
                let rotation = 0;

                if (axis == 0 && this._visualBinRanges[axis] instanceof NominalVisualBinRange) {
                    rotation = Math.min(90, Math.max(30, textWidth / (xTo - xFrom) * 90));
                    xStart += Math.max(textWidth / 2, (1 - textWidth / (xTo - xFrom)) * textWidth / 2) - textHeight / 2;
                }

                prims.push(
                    <div key={DashUtils.GenerateGuid()} style={{ position: "absolute", transformOrigin: "left top", transform: `translate(${xStart}px, ${yStart}px) rotate(${rotation}deg)` }}>
                        {text}
                    </div>)
            }
        }
        return prims;
    }

    @action
    setScaling = (r: any) => {
        this._panelWidth = r.entry.width;
        this._panelHeight = r.entry.height;
    }

    @computed
    get binPrimitives() {
        if (!this._histoOp || !(this._histoOp.Result instanceof HistogramResult))
            return undefined;
        let sizeConverter = new SizeConverter({ x: this._panelWidth, y: this._panelHeight, }, this._visualBinRanges, Math.PI / 4);
        let prims: JSX.Element[] = [];
        let selectedBinPrimitiveCollections = new Array<HistogramBinPrimitiveCollection>();
        let allBrushIndex = ModelHelpers.AllBrushIndex(this._histoOp.Result);
        for (let key in this._histoOp.Result.bins) {
            if (this._histoOp.Result.bins.hasOwnProperty(key)) {
                let drawPrims = new HistogramBinPrimitiveCollection(this._histoOp.Result.bins[key], this._histoOp.Result,
                    this._histoOp!.V, this._histoOp!.X, this._histoOp!.Y, this._chartType,
                    this._visualBinRanges, this._minValue, this._maxValue, this._histoOp!.Normalization, sizeConverter);

                this.HitTargets.setValue(drawPrims.HitGeom, drawPrims.FilterModel);

                if (ArrayUtil.Contains(this._histoOp!.FilterModels, drawPrims.FilterModel)) {
                    selectedBinPrimitiveCollections.push(drawPrims);
                }

                drawPrims.BinPrimitives.filter(bp => bp.DataValue && bp.BrushIndex !== allBrushIndex).map(binPrimitive => {
                    prims.push(this.drawRect(binPrimitive.Rect, binPrimitive.Color));
                    prims.push(this.drawRect(binPrimitive.MarginRect, StyleConstants.MARGIN_BARS_COLOR));
                });
            }
        }
        return prims;
    }

    drawRect(rect: PIXIRectangle, color: number) {
        return <div key={DashUtils.GenerateGuid()} style={{
            position: "absolute",
            transform: `translate(${rect.x}px,${rect.y}px)`,
            width: `${rect.width - 1}`,
            height: `${rect.height}`,
            background: LABColor.RGBtoHexString(color)
        }} />
    }

    render() {
        if (!this.binPrimitives || !this._histoOp || !(this._histoOp.Result instanceof HistogramResult) || !this._visualBinRanges.length) {
            return (null);
        }

        return (
            <Measure onResize={this.setScaling}>
                {({ measureRef }) =>
                    <div className="histogrambox-container" ref={measureRef}>
                        {this.xaxislines}
                        {this.yaxislines}
                        {this.binPrimitives}
                        <div className="histogrambox-xlabel">{this._histoOp!.X.AttributeModel.DisplayName}</div>
                    </div>
                }
            </Measure>
        )
    }
}

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
}

export class HistogramBinPrimitiveCollection {
    private static TOLERANCE: number = 0.0001;

    public BinPrimitives: Array<HistogramBinPrimitive> = new Array<HistogramBinPrimitive>();
    public FilterModel: FilterModel;
    public HitGeom: PIXIRectangle = PIXIRectangle.EMPTY;

    private _y: AttributeTransformationModel;
    private _x: AttributeTransformationModel;
    private _value: AttributeTransformationModel;
    private _chartType: ChartType;
    private _histoResult: HistogramResult;
    private _visualBinRanges: Array<VisualBinRange>;

    constructor(bin: Bin, histoResult: HistogramResult,
        value: AttributeTransformationModel, x: AttributeTransformationModel, y: AttributeTransformationModel,
        chartType: ChartType, visualBinRanges: Array<VisualBinRange>,
        minValue: number, maxValue: number, normalization: number, sizeConverter: SizeConverter) {
        this._histoResult = histoResult;
        this._chartType = chartType;
        this._value = value;
        this._x = x;
        this._y = y;
        this._visualBinRanges = visualBinRanges;

        var allBrushIndex = ModelHelpers.AllBrushIndex(this._histoResult);
        var overlapBrushIndex = ModelHelpers.OverlapBrushIndex(this._histoResult);
        this.FilterModel = ModelHelpers.GetBinFilterModel(bin, allBrushIndex, this._histoResult, this._x, this._y);

        var orderedBrushes = new Array<Brush>();
        orderedBrushes.push(histoResult.brushes![0]);
        orderedBrushes.push(histoResult.brushes![overlapBrushIndex]);
        for (var b = 0; b < histoResult.brushes!.length; b++) {
            var brush = histoResult.brushes![b];
            if (brush.brushIndex != 0 && brush.brushIndex != overlapBrushIndex) {
                orderedBrushes.push(brush);
            }
        }
        var binBrushMaxAxis = this.getBinBrushAxisRange(bin, orderedBrushes, normalization); // X= 0, Y = 1

        var brushFactorSum: number = 0;
        for (var b = 0; b < orderedBrushes.length; b++) {
            var brush = orderedBrushes[b];
            var valueAggregateKey = ModelHelpers.CreateAggregateKey(value, histoResult, brush.brushIndex!);
            var doubleRes = ModelHelpers.GetAggregateResult(bin, valueAggregateKey) as DoubleValueAggregateResult;
            var unNormalizedValue = (doubleRes != null && doubleRes.hasResult) ? doubleRes.result : null;
            if (unNormalizedValue == null) {
                continue;
            }
            if (chartType == ChartType.VerticalBar) {
                this.createVerticalBarChartBinPrimitives(bin, brush, binBrushMaxAxis, normalization, sizeConverter); // X = 0, Y = 1, NOne = -1
            }
            else if (chartType == ChartType.HorizontalBar) {
                this.createHorizontalBarChartBinPrimitives(bin, brush, binBrushMaxAxis, normalization, sizeConverter);
            }
            else if (chartType == ChartType.SinglePoint) {
                this.createSinlgePointChartBinPrimitives(bin, brush, unNormalizedValue, sizeConverter);
            }
            else if (chartType == ChartType.HeatMap) {
                var normalizedValue = (unNormalizedValue - minValue) / (Math.abs((maxValue - minValue)) < HistogramBinPrimitiveCollection.TOLERANCE ?
                    unNormalizedValue : (maxValue - minValue));
                brushFactorSum = this.createHeatmapBinPrimitives(bin, brush, unNormalizedValue, brushFactorSum, normalizedValue, sizeConverter);
            }
        }

        // adjust brush rects (stacking or not)
        var sum: number = 0;
        var filtered = this.BinPrimitives.filter(b => b.BrushIndex != allBrushIndex && b.DataValue != 0.0);
        var count: number = filtered.length;
        for (var i = 0; i < count; i++) {
            var bp = filtered[i];

            if (this._chartType == ChartType.VerticalBar) {
                if (this._y.AggregateFunction == AggregateFunction.Count) {
                    bp.Rect = new PIXIRectangle(bp.Rect.x, bp.Rect.y - sum, bp.Rect.width, bp.Rect.height);
                    bp.MarginRect = new PIXIRectangle(bp.MarginRect.x, bp.MarginRect.y - sum, bp.MarginRect.width, bp.MarginRect.height);
                    sum += bp.Rect.height;
                }
                if (this._y.AggregateFunction == AggregateFunction.Avg) {
                    var w = bp.Rect.width / 2.0;
                    bp.Rect = new PIXIRectangle(bp.Rect.x + sum, bp.Rect.y, bp.Rect.width / count, bp.Rect.height);
                    bp.MarginRect = new PIXIRectangle(bp.MarginRect.x - w + sum + (bp.Rect.width / 2.0), bp.MarginRect.y, bp.MarginRect.width, bp.MarginRect.height);
                    sum += bp.Rect.width;
                }
            }
            else if (this._chartType == ChartType.HorizontalBar) {
                if (this._x.AggregateFunction == AggregateFunction.Count) {
                    bp.Rect = new PIXIRectangle(bp.Rect.x + sum, bp.Rect.y, bp.Rect.width, bp.Rect.height);
                    bp.MarginRect = new PIXIRectangle(bp.MarginRect.x + sum, bp.MarginRect.y, bp.MarginRect.width, bp.MarginRect.height);
                    sum += bp.Rect.width;
                }
                if (this._x.AggregateFunction == AggregateFunction.Avg) {
                    var h = bp.Rect.height / 2.0;
                    bp.Rect = new PIXIRectangle(bp.Rect.x, bp.Rect.y + sum, bp.Rect.width, bp.Rect.height / count);
                    bp.MarginRect = new PIXIRectangle(bp.MarginRect.x, bp.MarginRect.y - h + sum + (bp.Rect.height / 2.0), bp.MarginRect.width, bp.MarginRect.height);
                    sum += bp.Rect.height;
                }
            }
            else if (this._chartType == ChartType.HeatMap) {
            }
        }
        this.BinPrimitives = this.BinPrimitives.reverse();
        var f = this.BinPrimitives.filter(b => b.BrushIndex == allBrushIndex);
        this.HitGeom = f.length > 0 ? f[0].Rect : PIXIRectangle.EMPTY;
    }
    private getBinBrushAxisRange(bin: Bin, brushes: Array<Brush>, axis: number): number {
        var binBrushMaxAxis = Number.MIN_VALUE;
        brushes.forEach((Brush) => {
            var maxAggregateKey = ModelHelpers.CreateAggregateKey(axis === 0 ? this._y : this._x, this._histoResult, Brush.brushIndex!);
            var aggResult = ModelHelpers.GetAggregateResult(bin, maxAggregateKey) as DoubleValueAggregateResult;
            if (aggResult != null) {
                if (aggResult.result! > binBrushMaxAxis)
                    binBrushMaxAxis = aggResult.result!;
            }
        });
        return binBrushMaxAxis;
    }
    private createHeatmapBinPrimitives(bin: Bin, brush: Brush, unNormalizedValue: number, brushFactorSum: number, normalizedValue: number, sizeConverter: SizeConverter): number {
        var xFrom: number = 0;
        var xTo: number = 0;
        var yFrom: number = 0;
        var yTo: number = 0;
        var returnBrushFactorSum = brushFactorSum;

        var valueAggregateKey = ModelHelpers.CreateAggregateKey(this._value, this._histoResult, ModelHelpers.AllBrushIndex(this._histoResult));
        var allUnNormalizedValue = ModelHelpers.GetAggregateResult(bin, valueAggregateKey) as DoubleValueAggregateResult;

        var tx = this._visualBinRanges[0].GetValueFromIndex(bin.binIndex!.indices![0]);
        xFrom = sizeConverter.DataToScreenX(tx);
        xTo = sizeConverter.DataToScreenX(this._visualBinRanges[0].AddStep(tx));

        var ty = this._visualBinRanges[1].GetValueFromIndex(bin.binIndex!.indices![1]);
        yFrom = sizeConverter.DataToScreenY(ty);
        yTo = sizeConverter.DataToScreenY(this._visualBinRanges[1].AddStep(ty));

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

        var marginParams = new MarginAggregateParameters();
        marginParams.aggregateFunction = this._value.AggregateFunction;
        var marginAggregateKey = ModelHelpers.CreateAggregateKey(this._value, this._histoResult,
            ModelHelpers.AllBrushIndex(this._histoResult), marginParams);

        this.createBinPrimitive(bin, brush, PIXIRectangle.EMPTY, 0, xFrom, xTo, yFrom, yTo, dataColor, 1, unNormalizedValue);
        return returnBrushFactorSum;
    }

    private createSinlgePointChartBinPrimitives(bin: Bin, brush: Brush, unNormalizedValue: number, sizeConverter: SizeConverter): void {
        var yAggregateKey = ModelHelpers.CreateAggregateKey(this._y, this._histoResult, brush.brushIndex!);
        var marginParams = new MarginAggregateParameters();
        marginParams.aggregateFunction = this._y.AggregateFunction;

        var xAggregateKey = ModelHelpers.CreateAggregateKey(this._x, this._histoResult, brush.brushIndex!);
        var marginParams = new MarginAggregateParameters();
        marginParams.aggregateFunction = this._x.AggregateFunction;

        var xValue = ModelHelpers.GetAggregateResult(bin, xAggregateKey) as DoubleValueAggregateResult;;
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
        var yAggregateKey = ModelHelpers.CreateAggregateKey(this._y, this._histoResult, brush.brushIndex!);
        var marginParams = new MarginAggregateParameters();
        marginParams.aggregateFunction = this._y.AggregateFunction;
        var yMarginAggregateKey = ModelHelpers.CreateAggregateKey(this._y, this._histoResult,
            brush.brushIndex!, marginParams);
        var dataValue = ModelHelpers.GetAggregateResult(bin, yAggregateKey) as DoubleValueAggregateResult;

        if (dataValue != null && dataValue.hasResult) {
            var yValue = normalization != 0 || binBrushMaxAxis == 0 ? dataValue.result! : (dataValue.result! - 0) / (binBrushMaxAxis - 0) * sizeConverter.DataRanges[1];

            var yFrom = sizeConverter.DataToScreenY(Math.min(0, yValue));
            var yTo = sizeConverter.DataToScreenY(Math.max(0, yValue));;

            var xValue = this._visualBinRanges[0].GetValueFromIndex(bin.binIndex!.indices![0])!;
            var xFrom = sizeConverter.DataToScreenX(xValue);
            var xTo = sizeConverter.DataToScreenX(this._visualBinRanges[0].AddStep(xValue));

            var marginResult = ModelHelpers.GetAggregateResult(bin, yMarginAggregateKey)!;
            var yMarginAbsolute = marginResult == null ? 0 : (marginResult as MarginAggregateResult).absolutMargin!;
            var marginRect = new PIXIRectangle(xFrom + (xTo - xFrom) / 2.0 - 1,
                sizeConverter.DataToScreenY(yValue + yMarginAbsolute), 2,
                sizeConverter.DataToScreenY(yValue - yMarginAbsolute) - sizeConverter.DataToScreenY(yValue + yMarginAbsolute));

            this.createBinPrimitive(bin, brush, marginRect, 0, xFrom, xTo, yFrom, yTo,
                this.baseColorFromBrush(brush), normalization != 0 ? 1 : 0.6 * binBrushMaxAxis / sizeConverter.DataRanges[1] + 0.4, dataValue.result!);
        }
    }

    private createHorizontalBarChartBinPrimitives(bin: Bin, brush: Brush, binBrushMaxAxis: number, normalization: number, sizeConverter: SizeConverter): void {
        var xAggregateKey = ModelHelpers.CreateAggregateKey(this._x, this._histoResult, brush.brushIndex!);
        var marginParams = new MarginAggregateParameters();
        marginParams.aggregateFunction = this._x.AggregateFunction;
        var xMarginAggregateKey = ModelHelpers.CreateAggregateKey(this._x, this._histoResult,
            brush.brushIndex!, marginParams);
        var dataValue = ModelHelpers.GetAggregateResult(bin, xAggregateKey) as DoubleValueAggregateResult;

        if (dataValue != null && dataValue.hasResult) {
            var xValue = normalization != 1 || binBrushMaxAxis == 0 ? dataValue.result! : (dataValue.result! - 0) / (binBrushMaxAxis - 0) * sizeConverter.DataRanges[0];
            var xFrom = sizeConverter.DataToScreenX(Math.min(0, xValue));
            var xTo = sizeConverter.DataToScreenX(Math.max(0, xValue));

            var yValue = this._visualBinRanges[1].GetValueFromIndex(bin.binIndex!.indices![1]);
            var yFrom = yValue;
            var yTo = this._visualBinRanges[1].AddStep(yValue);

            var marginResult = ModelHelpers.GetAggregateResult(bin, xMarginAggregateKey);
            var xMarginAbsolute = sizeConverter.IsSmall || marginResult == null ? 0 : (marginResult as MarginAggregateResult).absolutMargin!;

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
        if (brush.brushIndex == ModelHelpers.RestBrushIndex(this._histoResult)) {
            baseColor = StyleConstants.HIGHLIGHT_COLOR;
        }
        else if (brush.brushIndex == ModelHelpers.OverlapBrushIndex(this._histoResult)) {
            baseColor = StyleConstants.OVERLAP_COLOR;
        }
        else if (brush.brushIndex == ModelHelpers.AllBrushIndex(this._histoResult)) {
            baseColor = 0x00ff00;
        }
        else {
            // if (this._histogramOperationViewModel.BrushColors.length > 0) {
            //     baseColor = this._histogramOperationViewModel.BrushColors[brush.brushIndex! % this._histogramOperationViewModel.BrushColors.length];
            // }
            // else {
            baseColor = StyleConstants.HIGHLIGHT_COLOR;
            // }
        }
        return baseColor;
    }
}