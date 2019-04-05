import { AttributeParameters, Brush, MarginAggregateParameters, SingleDimensionAggregateParameters, Solution } from '../model/idea/idea'
import { Utils } from '../utils/Utils'

import { FilterModel } from '../core/filter/FilterModel'

(SingleDimensionAggregateParameters as any).prototype.Equals = function (other: Object) {
    if (!Utils.EqualityHelper(this, other)) return false;
    if (!Utils.EqualityHelper((this as SingleDimensionAggregateParameters).attributeParameters!,
        (other as SingleDimensionAggregateParameters).attributeParameters!)) return false;
    if (!((this as SingleDimensionAggregateParameters).attributeParameters! as any).Equals((other as SingleDimensionAggregateParameters).attributeParameters)) return false;
    return true;
}

{
    (AttributeParameters as any).prototype.Equals = function (other: AttributeParameters) {
        return (<any>this).constructor.name === (<any>other).constructor.name &&
            this.rawName === other.rawName;
    }
}

{
    (Solution as any).prototype.Equals = function (other: Object) {
        if (!Utils.EqualityHelper(this, other)) return false;
        if ((this as Solution).solutionId !== (other as Solution).solutionId) return false;
        return true;
    }
}

{
    (MarginAggregateParameters as any).prototype.Equals = function (other: Object) {
        if (!Utils.EqualityHelper(this, other)) return false;
        if (!Utils.EqualityHelper((this as SingleDimensionAggregateParameters).attributeParameters!,
            (other as SingleDimensionAggregateParameters).attributeParameters!)) return false;
        if (!((this as SingleDimensionAggregateParameters).attributeParameters! as any).Equals((other as SingleDimensionAggregateParameters).attributeParameters!)) return false;

        if ((this as MarginAggregateParameters).aggregateFunction !== (other as MarginAggregateParameters).aggregateFunction) return false;
        return true;
    }
}

{
    (Brush as any).prototype.Equals = function (other: Object) {
        if (!Utils.EqualityHelper(this, other)) return false;
        if ((this as Brush).brushEnum !== (other as Brush).brushEnum) return false;
        if ((this as Brush).brushIndex !== (other as Brush).brushIndex) return false;
        return true;
    }
}