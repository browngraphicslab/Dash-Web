import { DateTimeBinRange, DateTimeStep, DateTimeStepGranularity } from '../idea/idea';
import { VisualBinRange } from './VisualBinRange';

export class DateTimeVisualBinRange extends VisualBinRange {
    public DataBinRange: DateTimeBinRange;

    constructor(dataBinRange: DateTimeBinRange) {
        super();
        this.DataBinRange = dataBinRange;
    }

    public AddStep(value: number): number {
        return DateTimeVisualBinRange.AddToDateTimeTicks(value, this.DataBinRange.step!);
    }

    public GetValueFromIndex(index: number): number {
        var v = this.DataBinRange.minValue!;
        for (var i = 0; i < index; i++) {
            v = this.AddStep(v);
        }
        return v;
    }

    public GetBins(): number[] {
        var bins = new Array<number>();
        for (var v: number = this.DataBinRange.minValue!;
            v < this.DataBinRange.maxValue!;
            v = DateTimeVisualBinRange.AddToDateTimeTicks(v, this.DataBinRange.step!)) {
            bins.push(v);
        }
        return bins;
    }

    private pad(n: number, size: number) {
        var sign = n < 0 ? '-' : '';
        return sign + new Array(size).concat([Math.abs(n)]).join('0').slice(-size);
    }


    public GetLabel(value: number): string {
        var dt = DateTimeVisualBinRange.TicksToDate(value);
        if (this.DataBinRange.step!.dateTimeStepGranularity === DateTimeStepGranularity.Second ||
            this.DataBinRange.step!.dateTimeStepGranularity === DateTimeStepGranularity.Minute) {
            return ("" + this.pad(dt.getMinutes(), 2) + ":" + this.pad(dt.getSeconds(), 2));
            //return dt.ToString("mm:ss");
        }
        else if (this.DataBinRange.step!.dateTimeStepGranularity === DateTimeStepGranularity.Hour) {
            return (this.pad(dt.getHours(), 2) + ":" + this.pad(dt.getMinutes(), 2));
            //return dt.ToString("HH:mm");
        }
        else if (this.DataBinRange.step!.dateTimeStepGranularity === DateTimeStepGranularity.Day) {
            return ((dt.getMonth() + 1) + "/" + dt.getDate() + "/" + dt.getFullYear());
            //return dt.ToString("MM/dd/yyyy");
        }
        else if (this.DataBinRange.step!.dateTimeStepGranularity === DateTimeStepGranularity.Month) {
            //return dt.ToString("MM/yyyy");
            return ((dt.getMonth() + 1) + "/" + dt.getFullYear());
        }
        else if (this.DataBinRange.step!.dateTimeStepGranularity === DateTimeStepGranularity.Year) {
            return "" + dt.getFullYear();
        }
        return "n/a";
    }

    public static TicksToDate(ticks: number): Date {
        var dd = new Date((ticks - 621355968000000000) / 10000);
        dd.setMinutes(dd.getMinutes() + dd.getTimezoneOffset());
        return dd;
    }


    public static DateToTicks(date: Date): number {
        var copiedDate = new Date(date.getTime());
        copiedDate.setMinutes(copiedDate.getMinutes() - copiedDate.getTimezoneOffset());
        var t = copiedDate.getTime() * 10000 + 621355968000000000;
        /*var dd = new Date((ticks - 621355968000000000) / 10000);
        dd.setMinutes(dd.getMinutes() + dd.getTimezoneOffset());
        return dd;*/
        return t;
    }

    public static AddToDateTimeTicks(ticks: number, dateTimeStep: DateTimeStep): number {
        var copiedDate = DateTimeVisualBinRange.TicksToDate(ticks);
        var returnDate: Date = new Date(Date.now());
        if (dateTimeStep.dateTimeStepGranularity === DateTimeStepGranularity.Second) {
            returnDate = new Date(copiedDate.setSeconds(copiedDate.getSeconds() + dateTimeStep.dateTimeStepValue!));
        }
        else if (dateTimeStep.dateTimeStepGranularity === DateTimeStepGranularity.Minute) {
            returnDate = new Date(copiedDate.setMinutes(copiedDate.getMinutes() + dateTimeStep.dateTimeStepValue!));
        }
        else if (dateTimeStep.dateTimeStepGranularity === DateTimeStepGranularity.Hour) {
            returnDate = new Date(copiedDate.setHours(copiedDate.getHours() + dateTimeStep.dateTimeStepValue!));
        }
        else if (dateTimeStep.dateTimeStepGranularity === DateTimeStepGranularity.Day) {
            returnDate = new Date(copiedDate.setDate(copiedDate.getDate() + dateTimeStep.dateTimeStepValue!));
        }
        else if (dateTimeStep.dateTimeStepGranularity === DateTimeStepGranularity.Month) {
            returnDate = new Date(copiedDate.setMonth(copiedDate.getMonth() + dateTimeStep.dateTimeStepValue!));
        }
        else if (dateTimeStep.dateTimeStepGranularity === DateTimeStepGranularity.Year) {
            returnDate = new Date(copiedDate.setFullYear(copiedDate.getFullYear() + dateTimeStep.dateTimeStepValue!));
        }
        return DateTimeVisualBinRange.DateToTicks(returnDate);
    }
}