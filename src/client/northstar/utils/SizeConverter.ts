import { PIXIPoint } from "./MathUtil";
import { NominalVisualBinRange } from "../model/binRanges/NominalVisualBinRange";
import { VisualBinRange } from "../model/binRanges/VisualBinRange";
import { Bin, DoubleValueAggregateResult, AggregateKey } from "../model/idea/idea";
import { AttributeTransformationModel } from "../core/attribute/AttributeTransformationModel";
import { ModelHelpers } from "../model/ModelHelpers";

export class SizeConverter {
    public RenderSize: Array<number> = new Array<number>(2);
    public DataMins: Array<number> = new Array<number>(2);;
    public DataMaxs: Array<number> = new Array<number>(2);;
    public DataRanges: Array<number> = new Array<number>(2);;
    public MaxLabelSizes: Array<PIXIPoint> = new Array<PIXIPoint>(2);;

    public LeftOffset: number = 40;
    public RightOffset: number = 20;
    public TopOffset: number = 20;
    public BottomOffset: number = 45;

    public IsSmall: boolean = false;

    constructor(size: { x: number, y: number }, visualBinRanges: Array<VisualBinRange>, labelAngle: number) {
        this.LeftOffset = 40;
        this.RightOffset = 20;
        this.TopOffset = 20;
        this.BottomOffset = 45;
        this.IsSmall = false;

        if (visualBinRanges.length < 1)
            return;

        var xLabels = visualBinRanges[0].GetLabels();
        var yLabels = visualBinRanges[1].GetLabels();
        var xLabelStrings = xLabels.map(l => l.label!).sort(function (a, b) { return b.length - a.length });
        var yLabelStrings = yLabels.map(l => l.label!).sort(function (a, b) { return b.length - a.length });

        var metricsX = { width: 100 }; // RenderUtils.MeasureText(FontStyles.Default.fontFamily.toString(), 12, // FontStyles.AxisLabel.fontSize as number,
        //xLabelStrings[0]!.slice(0, 20)) // StyleConstants.MAX_CHAR_FOR_HISTOGRAM_LABELS));
        var metricsY = { width: 22 }; // RenderUtils.MeasureText(FontStyles.Default.fontFamily.toString(), 12, // FontStyles.AxisLabel.fontSize as number,
        // yLabelStrings[0]!.slice(0, 20)); // StyleConstants.MAX_CHAR_FOR_HISTOGRAM_LABELS));
        this.MaxLabelSizes[0] = new PIXIPoint(metricsX.width, 12);// FontStyles.AxisLabel.fontSize as number);
        this.MaxLabelSizes[1] = new PIXIPoint(metricsY.width, 12); // FontStyles.AxisLabel.fontSize as number);

        this.LeftOffset = Math.max(10, metricsY.width + 10 + 20);

        if (visualBinRanges[0] instanceof NominalVisualBinRange) {
            var lw = this.MaxLabelSizes[0].x + 18;
            this.BottomOffset = Math.max(this.BottomOffset, Math.cos(labelAngle) * lw) + 5;
            this.RightOffset = Math.max(this.RightOffset, Math.sin(labelAngle) * lw);
        }

        this.RenderSize[0] = (size.x - this.LeftOffset - this.RightOffset);
        this.RenderSize[1] = (size.y - this.TopOffset - this.BottomOffset);

        //if (this.RenderSize.reduce((agg, cur) => Math.min(agg, cur), Number.MAX_VALUE) < 40) {
        if ((this.RenderSize[0] < 40 && this.RenderSize[1] < 40) ||
            (this.RenderSize[0] < 0 || this.RenderSize[1] < 0)) {
            this.LeftOffset = 5;
            this.RightOffset = 5;
            this.TopOffset = 5;
            this.BottomOffset = 25;
            this.IsSmall = true;
            this.RenderSize[0] = (size.x - this.LeftOffset - this.RightOffset);
            this.RenderSize[1] = (size.y - this.TopOffset - this.BottomOffset);
        }

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
        return (((x - this.DataMins[0]) / this.DataRanges[0]) * (this.RenderSize[0]) + (this.LeftOffset));
    }
    public DataToScreenY(y: number, flip: boolean = true) {
        var retY = ((y - this.DataMins[1]) / this.DataRanges[1]) * (this.RenderSize[1]);
        return flip ? (this.RenderSize[1]) - retY + (this.TopOffset) : retY + (this.TopOffset);
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