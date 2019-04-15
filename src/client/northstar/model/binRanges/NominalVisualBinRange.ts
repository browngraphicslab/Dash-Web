import { NominalBinRange, BinLabel } from '../../model/idea/idea';
import { VisualBinRange } from './VisualBinRange';

export class NominalVisualBinRange extends VisualBinRange {
    public DataBinRange: NominalBinRange;

    constructor(dataBinRange: NominalBinRange) {
        super();
        this.DataBinRange = dataBinRange;
    }

    public AddStep(value: number): number {
        return value + 1;
    }

    public GetValueFromIndex(index: number): number {
        return index;
    }

    public GetBins(): number[] {
        var bins = new Array<number>();
        var idx = 0;
        for (var key in this.DataBinRange.labelsValue) {
            if (this.DataBinRange.labelsValue.hasOwnProperty(key)) {
                bins.push(idx);
                idx++;
            }
        }
        return bins;
    }

    public GetLabel(value: number): string {
        return this.DataBinRange.valuesLabel![value];
    }

    public GetLabels(): Array<BinLabel> {
        var labels = new Array<BinLabel>();
        var count = 0;
        for (var key in this.DataBinRange.valuesLabel) {
            if (this.DataBinRange.valuesLabel.hasOwnProperty(key)) {
                var value = this.DataBinRange.valuesLabel[key];
                labels.push(new BinLabel({
                    value: parseFloat(key),
                    minValue: count++,
                    maxValue: count,
                    label: value
                }));
            }
        }
        return labels;
    }
}