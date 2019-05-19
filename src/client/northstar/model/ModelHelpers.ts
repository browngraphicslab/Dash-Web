
import { action } from "mobx";
import { AggregateFunction, AggregateKey, AggregateParameters, AttributeColumnParameters, AttributeParameters, AverageAggregateParameters, Bin, BinningParameters, Brush, BrushEnum, CountAggregateParameters, DataType, EquiWidthBinningParameters, HistogramResult, MarginAggregateParameters, SingleBinBinningParameters, SingleDimensionAggregateParameters, SumAggregateParameters, AggregateBinRange, NominalBinRange, AlphabeticBinRange, Predicate, Schema, Attribute, AttributeGroup, Exception, AttributeBackendParameters, AttributeCodeParameters } from '../model/idea/idea';
import { ValueComparison } from "../core/filter/ValueComparision";
import { ArrayUtil } from "../utils/ArrayUtil";
import { AttributeModel, ColumnAttributeModel, BackendAttributeModel, CodeAttributeModel } from "../core/attribute/AttributeModel";
import { FilterModel } from "../core/filter/FilterModel";
import { AlphabeticVisualBinRange } from "./binRanges/AlphabeticVisualBinRange";
import { NominalVisualBinRange } from "./binRanges/NominalVisualBinRange";
import { VisualBinRangeHelper } from "./binRanges/VisualBinRangeHelper";
import { AttributeTransformationModel } from "../core/attribute/AttributeTransformationModel";
import { CurrentUserUtils } from "../../../server/authentication/models/current_user_utils";

export class ModelHelpers {

    public static CreateAggregateKey(distinctAttributeParameters: AttributeParameters | undefined, atm: AttributeTransformationModel, histogramResult: HistogramResult,
        brushIndex: number, aggParameters?: SingleDimensionAggregateParameters): AggregateKey {
        {
            if (aggParameters === undefined) {
                aggParameters = ModelHelpers.GetAggregateParameter(distinctAttributeParameters, atm);
            }
            else {
                aggParameters.attributeParameters = ModelHelpers.GetAttributeParameters(atm.AttributeModel);
            }
            return new AggregateKey(
                {
                    aggregateParameterIndex: ModelHelpers.GetAggregateParametersIndex(histogramResult, aggParameters),
                    brushIndex: brushIndex
                });
        }
    }

    public static GetAggregateParametersIndex(histogramResult: HistogramResult, aggParameters?: AggregateParameters): number {
        return Array.from(histogramResult.aggregateParameters!).findIndex((value, i, set) => {
            if (set[i] instanceof CountAggregateParameters && value instanceof CountAggregateParameters) return true;
            if (set[i] instanceof MarginAggregateParameters && value instanceof MarginAggregateParameters) return true;
            if (set[i] instanceof SumAggregateParameters && value instanceof SumAggregateParameters) return true;
            return false;
        });
    }

    public static GetAggregateParameter(distinctAttributeParameters: AttributeParameters | undefined, atm: AttributeTransformationModel): AggregateParameters | undefined {
        var aggParam: AggregateParameters | undefined;
        if (atm.AggregateFunction === AggregateFunction.Avg) {
            var avg = new AverageAggregateParameters();
            avg.attributeParameters = ModelHelpers.GetAttributeParameters(atm.AttributeModel);
            avg.distinctAttributeParameters = distinctAttributeParameters;
            aggParam = avg;
        }
        else if (atm.AggregateFunction === AggregateFunction.Count) {
            var cnt = new CountAggregateParameters();
            cnt.attributeParameters = ModelHelpers.GetAttributeParameters(atm.AttributeModel);
            cnt.distinctAttributeParameters = distinctAttributeParameters;
            aggParam = cnt;
        }
        else if (atm.AggregateFunction === AggregateFunction.Sum) {
            var sum = new SumAggregateParameters();
            sum.attributeParameters = ModelHelpers.GetAttributeParameters(atm.AttributeModel);
            sum.distinctAttributeParameters = distinctAttributeParameters;
            aggParam = sum;
        }
        return aggParam;
    }

    public static GetAggregateParametersWithMargins(distinctAttributeParameters: AttributeParameters | undefined, atms: Array<AttributeTransformationModel>): Array<AggregateParameters> {
        var aggregateParameters = new Array<AggregateParameters>();
        atms.forEach(agg => {
            var aggParams = ModelHelpers.GetAggregateParameter(distinctAttributeParameters, agg);
            if (aggParams) {
                aggregateParameters.push(aggParams);

                var margin = new MarginAggregateParameters();
                margin.aggregateFunction = agg.AggregateFunction;
                margin.attributeParameters = ModelHelpers.GetAttributeParameters(agg.AttributeModel);
                margin.distinctAttributeParameters = distinctAttributeParameters;
                aggregateParameters.push(margin);
            }
        });

        return aggregateParameters;
    }

    public static GetBinningParameters(attr: AttributeTransformationModel, nrOfBins: number, minvalue?: number, maxvalue?: number): BinningParameters {
        if (attr.AggregateFunction === AggregateFunction.None) {
            return new EquiWidthBinningParameters(
                {
                    attributeParameters: ModelHelpers.GetAttributeParameters(attr.AttributeModel),
                    requestedNrOfBins: nrOfBins,
                    minValue: minvalue,
                    maxValue: maxvalue
                });
        }
        else {
            return new SingleBinBinningParameters(
                {
                    attributeParameters: ModelHelpers.GetAttributeParameters(attr.AttributeModel)
                });
        }
    }

    public static GetAttributeParametersFromAttributeModel(am: AttributeModel): AttributeParameters {
        if (am instanceof ColumnAttributeModel) {
            return new AttributeColumnParameters(
                {
                    rawName: am.CodeName,
                    visualizationHints: am.VisualizationHints
                });
        }
        else if (am instanceof BackendAttributeModel) {
            return new AttributeBackendParameters(
                {
                    rawName: am.CodeName,
                    visualizationHints: am.VisualizationHints,
                    id: (am).Id
                });
        }
        else if (am instanceof CodeAttributeModel) {
            return new AttributeCodeParameters(
                {
                    rawName: am.CodeName,
                    visualizationHints: am.VisualizationHints,
                    code: (am).Code
                });
        }
        else {
            throw new Exception();
        }
    }

    public static GetAttributeParameters(am: AttributeModel): AttributeParameters {
        return this.GetAttributeParametersFromAttributeModel(am);
    }

    public static OverlapBrushIndex(histogramResult: HistogramResult): number {
        var brush = ArrayUtil.First(histogramResult.brushes!, (b: any) => b.brushEnum === BrushEnum.Overlap);
        return ModelHelpers.GetBrushIndex(histogramResult, brush);
    }

    public static AllBrushIndex(histogramResult: HistogramResult): number {
        var brush = ArrayUtil.First(histogramResult.brushes!, (b: any) => b.brushEnum === BrushEnum.All);
        return ModelHelpers.GetBrushIndex(histogramResult, brush);
    }

    public static RestBrushIndex(histogramResult: HistogramResult): number {
        var brush = ArrayUtil.First(histogramResult.brushes!, (b: Brush) => b.brushEnum === BrushEnum.Rest);
        return ModelHelpers.GetBrushIndex(histogramResult, brush);
    }

    public static GetBrushIndex(histogramResult: HistogramResult, brush: Brush): number {
        return ArrayUtil.IndexOfWithEqual(histogramResult.brushes!, brush);
    }

    public static GetAggregateResult(bin: Bin, aggregateKey: AggregateKey) {
        if (aggregateKey.aggregateParameterIndex === -1 || aggregateKey.brushIndex === -1) {
            return null;
        }
        return bin.aggregateResults![aggregateKey.aggregateParameterIndex! * bin.ySize! + aggregateKey.brushIndex!];
    }

    @action
    public static PossibleAggegationFunctions(atm: AttributeTransformationModel): Array<AggregateFunction> {
        var ret = new Array<AggregateFunction>();
        ret.push(AggregateFunction.None);
        ret.push(AggregateFunction.Count);
        if (atm.AttributeModel.DataType === DataType.Float ||
            atm.AttributeModel.DataType === DataType.Double ||
            atm.AttributeModel.DataType === DataType.Int) {
            ret.push(AggregateFunction.Avg);
            ret.push(AggregateFunction.Sum);
        }
        return ret;
    }

    public static GetBinFilterModel(
        bin: Bin, brushIndex: number, histogramResult: HistogramResult,
        xAom: AttributeTransformationModel, yAom: AttributeTransformationModel): FilterModel {
        var dimensions: Array<AttributeTransformationModel> = [xAom, yAom];
        var filterModel = new FilterModel();

        for (var i = 0; i < histogramResult.binRanges!.length; i++) {
            if (!(histogramResult.binRanges![i] instanceof AggregateBinRange)) {
                var binRange = VisualBinRangeHelper.GetNonAggregateVisualBinRange(histogramResult.binRanges![i]);
                var dataFrom = binRange.GetValueFromIndex(bin.binIndex!.indices![i]);
                var dataTo = binRange.AddStep(dataFrom);

                if (binRange instanceof NominalVisualBinRange) {
                    var tt = binRange.GetLabel(dataFrom);
                    filterModel.ValueComparisons.push(new ValueComparison(dimensions[i].AttributeModel, Predicate.EQUALS, tt));
                }
                else if (binRange instanceof AlphabeticVisualBinRange) {
                    filterModel.ValueComparisons.push(new ValueComparison(dimensions[i].AttributeModel, Predicate.STARTS_WITH,
                        binRange.GetLabel(dataFrom)));
                }
                else {
                    filterModel.ValueComparisons.push(new ValueComparison(dimensions[i].AttributeModel, Predicate.GREATER_THAN_EQUAL, dataFrom));
                    filterModel.ValueComparisons.push(new ValueComparison(dimensions[i].AttributeModel, Predicate.LESS_THAN, dataTo));
                }
            }
        }

        return filterModel;
    }

    public GetAllAttributes(schema: Schema) {
        if (!schema || !schema.rootAttributeGroup) {
            return [];
        }
        const recurs = (attrs: Attribute[], g: AttributeGroup) => {
            if (g.attributes) {
                attrs.push.apply(attrs, g.attributes);
                if (g.attributeGroups) {
                    g.attributeGroups.forEach(ng => recurs(attrs, ng));
                }
            }
        };
        const allAttributes: Attribute[] = new Array<Attribute>();
        recurs(allAttributes, schema.rootAttributeGroup);
        return allAttributes;
    }
}