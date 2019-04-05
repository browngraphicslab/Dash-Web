import { BinLabel } from '../../model/idea/idea'

export abstract class VisualBinRange {

    public abstract AddStep(value: number): number;

    public abstract GetValueFromIndex(index: number): number;

    public abstract GetBins(): Array<number>;

    public GetLabel(value: number): string {
        return value.toString();
    }

    public GetLabels(): Array<BinLabel> {
        var labels = new Array<BinLabel>();
        var bins = this.GetBins();
        bins.forEach(b => {
            labels.push(new BinLabel({
                value: b,
                minValue: b,
                maxValue: this.AddStep(b),
                label: this.GetLabel(b)
            }));
        });
        return labels;
    }
}

export enum ChartType {
    HorizontalBar = 0, VerticalBar = 1, HeatMap = 2, SinglePoint = 3
}