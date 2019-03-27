import { PIXIPoint } from "./MathUtil";
import { VisualBinRange } from "../model/binRanges/VisualBinRange";
import { Bin, DoubleValueAggregateResult, AggregateKey } from "../model/idea/idea";
import { ModelHelpers } from "../model/ModelHelpers";
import { observable, action, computed } from "mobx";

export class SizeConverter {
    public DataMins: Array<number> = new Array<number>(2);
    public DataMaxs: Array<number> = new Array<number>(2);
    public DataRanges: Array<number> = new Array<number>(2);
    public MaxLabelSizes: Array<PIXIPoint> = new Array<PIXIPoint>(2);
    public RenderDimension: number = 300;

    @observable _leftOffset: number = 40;
    @observable _rightOffset: number = 20;
    @observable _topOffset: number = 20;
    @observable _bottomOffset: number = 45;
    @observable _labelAngle: number = 0;
    @observable _isSmall: boolean = false;
    @observable public Initialized = 0;

    @action public SetIsSmall(isSmall: boolean) { this._isSmall = isSmall; }
    @action public SetLabelAngle(angle: number) { this._labelAngle = angle; }
    @computed public get IsSmall() { return this._isSmall; }
    @computed public get LabelAngle() { return this._labelAngle; }
    @computed public get LeftOffset() { return this.IsSmall ? 5 : this._leftOffset; }
    @computed public get RightOffset() { return this.IsSmall ? 5 : !this._labelAngle ? this._bottomOffset : Math.max(this._rightOffset, Math.cos(this._labelAngle) * (this.MaxLabelSizes[0].x + 18)); }
    @computed public get TopOffset() { return this.IsSmall ? 5 : this._topOffset; }
    @computed public get BottomOffset() { return this.IsSmall ? 25 : !this._labelAngle ? this._bottomOffset : Math.max(this._bottomOffset, Math.sin(this._labelAngle) * (this.MaxLabelSizes[0].x + 18)) + 18; }

    public SetVisualBinRanges(visualBinRanges: Array<VisualBinRange>) {
        this.Initialized++;
        var xLabels = visualBinRanges[0].GetLabels();
        var yLabels = visualBinRanges[1].GetLabels();
        var xLabelStrings = xLabels.map(l => l.label!).sort(function (a, b) { return b.length - a.length });
        var yLabelStrings = yLabels.map(l => l.label!).sort(function (a, b) { return b.length - a.length });

        var metricsX = { width: 75 }; // RenderUtils.MeasureText(FontStyles.Default.fontFamily.toString(), 12, // FontStyles.AxisLabel.fontSize as number,
        //xLabelStrings[0]!.slice(0, 20)) // StyleConstants.MAX_CHAR_FOR_HISTOGRAM_LABELS));
        var metricsY = { width: 22 }; // RenderUtils.MeasureText(FontStyles.Default.fontFamily.toString(), 12, // FontStyles.AxisLabel.fontSize as number,
        // yLabelStrings[0]!.slice(0, 20)); // StyleConstants.MAX_CHAR_FOR_HISTOGRAM_LABELS));
        this.MaxLabelSizes[0] = new PIXIPoint(metricsX.width, 12);// FontStyles.AxisLabel.fontSize as number);
        this.MaxLabelSizes[1] = new PIXIPoint(metricsY.width, 12); // FontStyles.AxisLabel.fontSize as number);

        this._leftOffset = Math.max(10, metricsY.width + 10 + 20);

        this.DataMins[0] = xLabels.map(l => l.minValue!).reduce((m, c) => Math.min(m, c), Number.MAX_VALUE);
        this.DataMins[1] = yLabels.map(l => l.minValue!).reduce((m, c) => Math.min(m, c), Number.MAX_VALUE);
        this.DataMaxs[0] = xLabels.map(l => l.maxValue!).reduce((m, c) => Math.max(m, c), Number.MIN_VALUE);
        this.DataMaxs[1] = yLabels.map(l => l.maxValue!).reduce((m, c) => Math.max(m, c), Number.MIN_VALUE);

        this.DataRanges[0] = this.DataMaxs[0] - this.DataMins[0];
        this.DataRanges[1] = this.DataMaxs[1] - this.DataMins[1];
    }

    public DataToScreenNormalizedRange(dataValue: number, normalization: number, axis: number, binBrushMaxAxis: number) {
        var value = normalization != 1 - axis || binBrushMaxAxis == 0 ? dataValue : (dataValue - 0) / (binBrushMaxAxis - 0) * this.DataRanges[axis];
        var from = this.DataToScreenCoord(Math.min(0, value), axis);
        var to = this.DataToScreenCoord(Math.max(0, value), axis);
        return [from, value, to];
    }

    public DataToScreenPointRange(axis: number, bin: Bin, aggregateKey: AggregateKey) {
        var value = ModelHelpers.GetAggregateResult(bin, aggregateKey) as DoubleValueAggregateResult;
        if (value.hasResult)
            return [this.DataToScreenCoord(value.result!, axis) - 5,
            this.DataToScreenCoord(value.result!, axis) + 5];
        return [undefined, undefined];
    }

    public DataToScreenAxisRange(visualBinRanges: VisualBinRange[], index: number, bin: Bin) {
        var value = visualBinRanges[0].GetValueFromIndex(bin.binIndex!.indices![index]);
        return [this.DataToScreenX(value), this.DataToScreenX(visualBinRanges[index].AddStep(value))]
    }

    public DataToScreenX(x: number): number {
        return ((x - this.DataMins[0]) / this.DataRanges[0]) * this.RenderDimension;
    }
    public DataToScreenY(y: number, flip: boolean = true) {
        var retY = ((y - this.DataMins[1]) / this.DataRanges[1]) * this.RenderDimension;
        return flip ? (this.RenderDimension) - retY : retY;
    }
    public DataToScreenCoord(v: number, axis: number) {
        if (axis == 0)
            return this.DataToScreenX(v);
        return this.DataToScreenY(v);
    }
    public DataToScreenRange(minVal: number, maxVal: number, axis: number) {
        let xFrom = this.DataToScreenX(axis === 0 ? minVal : this.DataMins[0]);
        let xTo = this.DataToScreenX(axis === 0 ? maxVal : this.DataMaxs[0]);
        let yFrom = this.DataToScreenY(axis === 1 ? minVal : this.DataMins[1]);
        let yTo = this.DataToScreenY(axis === 1 ? maxVal : this.DataMaxs[1]);
        return { xFrom, yFrom, xTo, yTo }
    }
}