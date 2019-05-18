import { MetricType } from "./Idea";
import { Dictionary } from 'typescript-collections';


export class MetricTypeMapping {

    public static GetMetricInterpretation(metricType: MetricType): MetricInterpretation {
        if (metricType === MetricType.Accuracy ||
            metricType === MetricType.F1 ||
            metricType === MetricType.F1Macro ||
            metricType === MetricType.F1Micro ||
            metricType === MetricType.JaccardSimilarityScore ||
            metricType === MetricType.ObjectDetectionAveragePrecision ||
            metricType === MetricType.Precision ||
            metricType === MetricType.PrecisionAtTopK ||
            metricType === MetricType.NormalizedMutualInformation ||
            metricType === MetricType.Recall ||
            metricType === MetricType.RocAucMacro ||
            metricType === MetricType.RocAuc ||
            metricType === MetricType.RocAucMicro ||
            metricType === MetricType.RSquared) {
            return MetricInterpretation.HigherIsBetter;
        }
        return MetricInterpretation.LowerIsBetter;
    }
}

export enum MetricInterpretation {
    HigherIsBetter, LowerIsBetter
}