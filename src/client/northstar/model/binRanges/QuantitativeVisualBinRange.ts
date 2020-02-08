import { QuantitativeBinRange } from '../idea/idea';
import { VisualBinRange } from './VisualBinRange';
import { format } from "d3-format";

export class QuantitativeVisualBinRange extends VisualBinRange {

    public DataBinRange: QuantitativeBinRange;

    constructor(dataBinRange: QuantitativeBinRange) {
        super();
        this.DataBinRange = dataBinRange;
    }

    public AddStep(value: number): number {
        return value + this.DataBinRange.step!;
    }

    public GetValueFromIndex(index: number): number {
        return this.DataBinRange.minValue! + (index * this.DataBinRange.step!);
    }

    public GetLabel(value: number): string {
        return QuantitativeVisualBinRange.NumberFormatter(value);
    }

    public static NumberFormatter(val: number): string {
        if (val === 0) {
            return "0";
        }
        if (val < 1) {
            /*if (val < Math.abs(0.001))  {
                return val.toExponential(2);
            }*/
            return format(".3")(val);
        }
        return format("~s")(val);
    }

    public GetBins(): number[] {
        const bins = new Array<number>();

        for (let v: number = this.DataBinRange.minValue!; v < this.DataBinRange.maxValue!; v += this.DataBinRange.step!) {
            bins.push(v);
        }
        return bins;
    }

    public static Initialize(dataMinValue: number, dataMaxValue: number, targetBinNumber: number, isIntegerRange: boolean): QuantitativeVisualBinRange {
        const extent = QuantitativeVisualBinRange.getExtent(dataMinValue, dataMaxValue, targetBinNumber, isIntegerRange);
        const dataBinRange = new QuantitativeBinRange();
        dataBinRange.minValue = extent[0];
        dataBinRange.maxValue = extent[1];
        dataBinRange.step = extent[2];

        return new QuantitativeVisualBinRange(dataBinRange);
    }

    private static getExtent(dataMin: number, dataMax: number, m: number, isIntegerRange: boolean): number[] {
        if (dataMin === dataMax) {
            // dataMin -= 0.1;
            dataMax += 0.1;
        }
        const span = dataMax - dataMin;

        let step = Math.pow(10, Math.floor(Math.log10(span / m)));
        const err = m / span * step;

        if (err <= .15) {
            step *= 10;
        }
        else if (err <= .35) {
            step *= 5;
        }
        else if (err <= .75) {
            step *= 2;
        }

        if (isIntegerRange) {
            step = Math.ceil(step);
        }
        const ret: number[] = new Array<number>(3);
        const minDivStep = Math.floor(dataMin / step);
        const maxDivStep = Math.floor(dataMax / step);
        ret[0] = minDivStep * step; // Math.floor(Math.Round(dataMin, 8)/step)*step;
        ret[1] = maxDivStep * step + step; // Math.floor(Math.Round(dataMax, 8)/step)*step + step;
        ret[2] = step;

        return ret;
    }
}