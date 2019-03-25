import React = require("react")
import { computed, observable, reaction, runInAction } from "mobx";
import { observer } from "mobx-react";
import Measure from "react-measure";
import { Dictionary } from "typescript-collections";
import { CurrentUserUtils } from "../../../server/authentication/models/current_user_utils";
import { Utils as DashUtils } from '../../../Utils';
import { ColumnAttributeModel } from "../../northstar/core/attribute/AttributeModel";
import { AttributeTransformationModel } from "../../northstar/core/attribute/AttributeTransformationModel";
import { FilterModel } from '../../northstar/core/filter/FilterModel';
import { NominalVisualBinRange } from "../../northstar/model/binRanges/NominalVisualBinRange";
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
import { FieldView, FieldViewProps } from './FieldView';
import "./HistogramBox.scss";
import { KeyStore } from "../../../fields/KeyStore";

@observer
export class HistogramBox extends React.Component<FieldViewProps> {

    public static LayoutString(fieldStr: string = "DataKey") { return FieldView.LayoutString(HistogramBox, fieldStr) }

    @observable private _panelWidth: number = 100;
    @observable private _panelHeight: number = 100;
    @observable public HistoOp?: HistogramOperation;
    @observable public VisualBinRanges: VisualBinRange[] = [];
    @observable public MinValue: number = 0;
    @observable public MaxValue: number = 0;
    @observable public SizeConverter?: SizeConverter;
    @observable public ChartType: ChartType = ChartType.VerticalBar;
    public HitTargets: Dictionary<PIXIRectangle, FilterModel> = new Dictionary<PIXIRectangle, FilterModel>();

    constructor(props: FieldViewProps) {
        super(props);
    }

    @computed get xaxislines() { return this.renderGridLinesAndLabels(0); }
    @computed get yaxislines() { return this.renderGridLinesAndLabels(1); }

    componentDidMount() {
        reaction(() => CurrentUserUtils.GetAllNorthstarColumnAttributes().filter(a => a.displayName == this.props.doc.Title),
            (columnAttrs) => columnAttrs.map(a => {
                var atmod = new ColumnAttributeModel(a);
                this.HistoOp = new HistogramOperation(new AttributeTransformationModel(atmod, AggregateFunction.None),
                    new AttributeTransformationModel(atmod, AggregateFunction.Count),
                    new AttributeTransformationModel(atmod, AggregateFunction.Count));
                this.HistoOp.Update();
            })
            , { fireImmediately: true });
        reaction(() => [this.VisualBinRanges && this.VisualBinRanges.slice(), this._panelHeight, this._panelWidth],
            () => this.SizeConverter = new SizeConverter({ x: this._panelWidth, y: this._panelHeight }, this.VisualBinRanges, Math.PI / 4));
        reaction(() => [this.HistoOp && this.HistoOp.Result],
            () => {
                if (!this.HistoOp || !(this.HistoOp.Result instanceof HistogramResult) || !this.HistoOp.Result.binRanges)
                    return;

                let binRanges = this.HistoOp.Result.binRanges;
                this.ChartType = binRanges[0] instanceof AggregateBinRange ? (binRanges[1] instanceof AggregateBinRange ? ChartType.SinglePoint : ChartType.HorizontalBar) :
                    binRanges[1] instanceof AggregateBinRange ? ChartType.VerticalBar : ChartType.HeatMap;

                this.VisualBinRanges.length = 0;
                this.VisualBinRanges.push(VisualBinRangeHelper.GetVisualBinRange(this.HistoOp.Result.binRanges[0], this.HistoOp.Result, this.HistoOp.X, this.ChartType));
                this.VisualBinRanges.push(VisualBinRangeHelper.GetVisualBinRange(this.HistoOp.Result.binRanges[1], this.HistoOp.Result, this.HistoOp.Y, this.ChartType));

                if (!this.HistoOp.Result.isEmpty) {
                    this.MaxValue = Number.MIN_VALUE;
                    this.MinValue = Number.MAX_VALUE;
                    for (let key in this.HistoOp.Result.bins) {
                        if (this.HistoOp.Result.bins.hasOwnProperty(key)) {
                            let bin = this.HistoOp.Result.bins[key];
                            let valueAggregateKey = ModelHelpers.CreateAggregateKey(this.HistoOp.V, this.HistoOp.Result, ModelHelpers.AllBrushIndex(this.HistoOp.Result));
                            let value = ModelHelpers.GetAggregateResult(bin, valueAggregateKey) as DoubleValueAggregateResult;
                            if (value && value.hasResult) {
                                this.MaxValue = Math.max(this.MaxValue, value.result!);
                                this.MinValue = Math.min(this.MinValue, value.result!);
                            }
                        }
                    }
                }
            }
        );
    }

    drawLine(xFrom: number, yFrom: number, width: number, height: number) {
        return <div key={DashUtils.GenerateGuid()} style={{ position: "absolute", width: `${width}px`, height: `${height}px`, background: "lightgray", transform: `translate(${xFrom}px, ${yFrom}px)` }} />;
    }

    drawRect(r: PIXIRectangle, color: number) {
        return <div key={DashUtils.GenerateGuid()} style={{ position: "absolute", transform: `translate(${r.x}px,${r.y}px)`, width: `${r.width - 1}`, height: `${r.height}`, background: LABColor.RGBtoHexString(color) }} />
    }

    private renderGridLinesAndLabels(axis: number) {
        let sc = this.SizeConverter!;
        let labels = this.VisualBinRanges[axis].GetLabels();

        let dim = sc.RenderSize[axis] / sc.MaxLabelSizes[axis].coords[axis] + 5;
        let mod = Math.ceil(labels.length / dim);

        if (axis == 0 && this.VisualBinRanges[axis] instanceof NominalVisualBinRange) {
            mod = Math.ceil(
                labels.length / (sc.RenderSize[0] / (12 + 5))); //  (<number>FontStyles.AxisLabel.fontSize + 5)));
        }
        let prims: JSX.Element[] = [];
        labels.map((binLabel, i) => {
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

                if (axis == 0 && this.VisualBinRanges[axis] instanceof NominalVisualBinRange) {
                    rotation = Math.min(90, Math.max(30, textWidth / (xTo - xFrom) * 90));
                    xStart += Math.max(textWidth / 2, (1 - textWidth / (xTo - xFrom)) * textWidth / 2) - textHeight / 2;
                }

                prims.push(
                    <div key={DashUtils.GenerateGuid()} className="histogrambox-gridlabel" style={{ transform: `translate(${xStart}px, ${yStart}px) rotate(${rotation}deg)` }}>
                        {text}
                    </div>)
            }
        });
        return prims;
    }

    @computed
    get binPrimitives() {
        if (!this.HistoOp || !(this.HistoOp.Result instanceof HistogramResult) || !this.SizeConverter)
            return undefined;
        let prims: JSX.Element[] = [];
        let selectedBinPrimitiveCollections = new Array<HistogramBinPrimitiveCollection>();
        let allBrushIndex = ModelHelpers.AllBrushIndex(this.HistoOp.Result);
        for (let key in this.HistoOp.Result.bins) {
            if (this.HistoOp.Result.bins.hasOwnProperty(key)) {
                let drawPrims = new HistogramBinPrimitiveCollection(key, this);

                this.HitTargets.setValue(drawPrims.HitGeom, drawPrims.FilterModel);

                if (ArrayUtil.Contains(this.HistoOp.FilterModels, drawPrims.FilterModel)) {
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

    render() {
        if (!this.binPrimitives || !this.VisualBinRanges.length) {
            return (null);
        }

        return (
            <Measure onResize={(r: any) => runInAction(() => { this._panelWidth = r.entry.width; this._panelHeight = r.entry.height })}>
                {({ measureRef }) =>
                    <div className="histogrambox-container" ref={measureRef} style={{ transform: `translate(${-this.props.doc.GetNumber(KeyStore.Width, 0) / 2}px, ${-this.props.doc.GetNumber(KeyStore.Height, 0) / 2}px)` }}>
                        {this.xaxislines}
                        {this.yaxislines}
                        {this.binPrimitives}
                        <div className="histogrambox-xaxislabel">{this.HistoOp!.X.AttributeModel.DisplayName}</div>
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
    private _histoBox: HistogramBox;
    private get histoOp() { return this._histoBox.HistoOp!; }
    private get histoResult() { return this.histoOp.Result as HistogramResult; }

    constructor(key: string, histoBox: HistogramBox) {
        this._histoBox = histoBox;
        let bin = this.histoResult.bins![key];

        var allBrushIndex = ModelHelpers.AllBrushIndex(this.histoResult);
        var overlapBrushIndex = ModelHelpers.OverlapBrushIndex(this.histoResult);
        this.FilterModel = ModelHelpers.GetBinFilterModel(bin, allBrushIndex, this.histoResult, this.histoOp.X, this.histoOp.Y);

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
        var xFrom: number = 0;
        var xTo: number = 0;
        var yFrom: number = 0;
        var yTo: number = 0;
        var returnBrushFactorSum = brushFactorSum;

        var valueAggregateKey = ModelHelpers.CreateAggregateKey(this.histoOp.V, this.histoResult, ModelHelpers.AllBrushIndex(this.histoResult));
        var allUnNormalizedValue = ModelHelpers.GetAggregateResult(bin, valueAggregateKey) as DoubleValueAggregateResult;

        var tx = this._histoBox.VisualBinRanges[0].GetValueFromIndex(bin.binIndex!.indices![0]);
        xFrom = sizeConverter.DataToScreenX(tx);
        xTo = sizeConverter.DataToScreenX(this._histoBox.VisualBinRanges[0].AddStep(tx));

        var ty = this._histoBox.VisualBinRanges[1].GetValueFromIndex(bin.binIndex!.indices![1]);
        yFrom = sizeConverter.DataToScreenY(ty);
        yTo = sizeConverter.DataToScreenY(this._histoBox.VisualBinRanges[1].AddStep(ty));

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
        marginParams.aggregateFunction = this.histoOp.V.AggregateFunction;
        var marginAggregateKey = ModelHelpers.CreateAggregateKey(this.histoOp.V, this.histoResult,
            ModelHelpers.AllBrushIndex(this.histoResult), marginParams);

        this.createBinPrimitive(bin, brush, PIXIRectangle.EMPTY, 0, xFrom, xTo, yFrom, yTo, dataColor, 1, unNormalizedValue);
        return returnBrushFactorSum;
    }

    private createSinlgePointChartBinPrimitives(bin: Bin, brush: Brush, unNormalizedValue: number, sizeConverter: SizeConverter): void {
        var yAggregateKey = ModelHelpers.CreateAggregateKey(this.histoOp.Y, this.histoResult, brush.brushIndex!);
        var marginParams = new MarginAggregateParameters();
        marginParams.aggregateFunction = this.histoOp.Y.AggregateFunction;

        var xAggregateKey = ModelHelpers.CreateAggregateKey(this.histoOp.X, this.histoResult, brush.brushIndex!);
        var marginParams = new MarginAggregateParameters();
        marginParams.aggregateFunction = this.histoOp.X.AggregateFunction;

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