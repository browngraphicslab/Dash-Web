import { IBaseBrushable } from '../core/brusher/IBaseBrushable';
import { IBaseFilterConsumer } from '../core/filter/IBaseFilterConsumer';
import { IBaseFilterProvider } from '../core/filter/IBaseFilterProvider';
import { AggregateFunction } from '../model/idea/idea';

export class Utils {

    public static EqualityHelper(a: Object, b: Object): boolean {
        if (a === b) return true;
        if (a === undefined && b !== undefined) return false;
        if (a === null && b !== null) return false;
        if (b === undefined && a !== undefined) return false;
        if (b === null && a !== null) return false;
        if ((<any>a).constructor.name !== (<any>b).constructor.name) return false;
        return true;
    }

    public static LowercaseFirstLetter(str: string) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    //
    // this Type Guard tests if dropTarget is an IDropTarget.  If it is, it coerces the compiler
    // to treat the dropTarget parameter as an IDropTarget *ouside* this function scope (ie, in
    // the scope of where this function is called from).
    //

    public static isBaseBrushable<T>(obj: Object): obj is IBaseBrushable<T> {
        let typed = <IBaseBrushable<T>>obj;
        return typed !== null && typed.BrusherModels !== undefined;
    }

    public static isBaseFilterProvider(obj: Object): obj is IBaseFilterProvider {
        let typed = <IBaseFilterProvider>obj;
        return typed !== null && typed.FilterModels !== undefined;
    }

    public static isBaseFilterConsumer(obj: Object): obj is IBaseFilterConsumer {
        let typed = <IBaseFilterConsumer>obj;
        return typed !== null && typed.FilterOperand !== undefined;
    }

    public static EncodeQueryData(data: any): string {
        const ret = [];
        for (let d in data) {
            ret.push(encodeURIComponent(d) + "=" + encodeURIComponent(data[d]));
        }
        return ret.join("&");
    }

    public static ToVegaAggregationString(agg: AggregateFunction): string {
        if (agg === AggregateFunction.Avg) {
            return "average";
        }
        else if (agg === AggregateFunction.Count) {
            return "count";
        }
        else {
            return "";
        }
    }

    public static GetQueryVariable(variable: string) {
        let query = window.location.search.substring(1);
        let vars = query.split("&");
        for (const variable of vars) {
            let pair = variable.split("=");
            if (decodeURIComponent(pair[0]) === variable) {
                return decodeURIComponent(pair[1]);
            }
        }
        return undefined;
    }
}

