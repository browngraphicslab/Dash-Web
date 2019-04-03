import { BinRange, NominalBinRange, QuantitativeBinRange, Exception, AlphabeticBinRange, DateTimeBinRange, AggregateBinRange, DoubleValueAggregateResult, HistogramResult, AttributeParameters } from "../idea/idea";
import { VisualBinRange, ChartType } from "./VisualBinRange";
import { NominalVisualBinRange } from "./NominalVisualBinRange";
import { QuantitativeVisualBinRange } from "./QuantitativeVisualBinRange";
import { AlphabeticVisualBinRange } from "./AlphabeticVisualBinRange";
import { DateTimeVisualBinRange } from "./DateTimeVisualBinRange";
import { Settings } from "../../manager/Gateway";
import { ModelHelpers } from "../ModelHelpers";
import { AttributeTransformationModel } from "../../core/attribute/AttributeTransformationModel";

export const SETTINGS_X_BINS = 15;
export const SETTINGS_Y_BINS = 15;
export const SETTINGS_SAMPLE_SIZE = 100000;

export class VisualBinRangeHelper {

    public static GetNonAggregateVisualBinRange(dataBinRange: BinRange): VisualBinRange {
        if (dataBinRange instanceof NominalBinRange) {
            return new NominalVisualBinRange(dataBinRange as NominalBinRange);
        }
        else if (dataBinRange instanceof QuantitativeBinRange) {
            return new QuantitativeVisualBinRange(dataBinRange as QuantitativeBinRange);
        }
        else if (dataBinRange instanceof AlphabeticBinRange) {
            return new AlphabeticVisualBinRange(dataBinRange as AlphabeticBinRange);
        }
        else if (dataBinRange instanceof DateTimeBinRange) {
            return new DateTimeVisualBinRange(dataBinRange as DateTimeBinRange);
        }
        throw new Exception()
    }

    public static GetVisualBinRange(distinctAttributeParameters: AttributeParameters | undefined, dataBinRange: BinRange, histoResult: HistogramResult, attr: AttributeTransformationModel, chartType: ChartType): VisualBinRange {

        if (!(dataBinRange instanceof AggregateBinRange)) {
            return VisualBinRangeHelper.GetNonAggregateVisualBinRange(dataBinRange);
        }
        else {
            var aggregateKey = ModelHelpers.CreateAggregateKey(distinctAttributeParameters, attr, histoResult, ModelHelpers.AllBrushIndex(histoResult));
            var minValue = Number.MAX_VALUE;
            var maxValue = Number.MIN_VALUE;
            for (var b = 0; b < histoResult.brushes!.length; b++) {
                var brush = histoResult.brushes![b];
                aggregateKey.brushIndex = brush.brushIndex;
                for (var key in histoResult.bins) {
                    if (histoResult.bins.hasOwnProperty(key)) {
                        var bin = histoResult.bins[key];
                        var res = <DoubleValueAggregateResult>ModelHelpers.GetAggregateResult(bin, aggregateKey);
                        if (res && res.hasResult && res.result) {
                            minValue = Math.min(minValue, res.result);
                            maxValue = Math.max(maxValue, res.result);
                        }
                    }
                }
            };

            let visualBinRange = QuantitativeVisualBinRange.Initialize(minValue, maxValue, 10, false);

            if (chartType == ChartType.HorizontalBar || chartType == ChartType.VerticalBar) {
                visualBinRange = QuantitativeVisualBinRange.Initialize(Math.min(0, minValue),
                    Math.max(0, (visualBinRange as QuantitativeVisualBinRange).DataBinRange.maxValue!),
                    SETTINGS_X_BINS, false);
            }
            else if (chartType == ChartType.SinglePoint) {
                visualBinRange = QuantitativeVisualBinRange.Initialize(Math.min(0, minValue), Math.max(0, maxValue),
                    SETTINGS_X_BINS, false);
            }
            return visualBinRange;
        }
    }
}
