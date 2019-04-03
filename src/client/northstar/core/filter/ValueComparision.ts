import { Predicate } from '../../model/idea/idea'
import { Utils } from '../../utils/Utils'
import { AttributeModel } from '../attribute/AttributeModel';

export class ValueComparison {

    public attributeModel: AttributeModel;
    public Value: any;
    public Predicate: Predicate;

    public constructor(attributeModel: AttributeModel, predicate: Predicate, value: any) {
        this.attributeModel = attributeModel;
        this.Value = value;
        this.Predicate = predicate;
    }

    public Equals(other: Object): boolean {
        if (!Utils.EqualityHelper(this, other))
            return false;
        if (this.Predicate !== (other as ValueComparison).Predicate)
            return false;
        let isComplex = (typeof this.Value === "object");
        if (!isComplex && this.Value != (other as ValueComparison).Value)
            return false;
        if (isComplex && !this.Value.Equals((other as ValueComparison).Value))
            return false;
        return true;
    }

    public ToPythonString(): string {
        var op = "";
        switch (this.Predicate) {
            case Predicate.EQUALS:
                op = "==";
                break;
            case Predicate.GREATER_THAN:
                op = ">";
                break;
            case Predicate.GREATER_THAN_EQUAL:
                op = ">=";
                break;
            case Predicate.LESS_THAN:
                op = "<";
                break;
            case Predicate.LESS_THAN_EQUAL:
                op = "<=";
                break;
            default:
                op = "==";
                break;
        }

        var val = this.Value.toString();
        if (typeof this.Value === 'string' || this.Value instanceof String) {
            val = "\"" + val + "\"";
        }
        var ret = " ";
        var rawName = this.attributeModel.CodeName;
        switch (this.Predicate) {
            case Predicate.STARTS_WITH:
                ret += rawName + " != null && " + rawName + ".StartsWith(" + val + ") ";
                return ret;
            case Predicate.ENDS_WITH:
                ret += rawName + " != null && " + rawName + ".EndsWith(" + val + ") ";
                return ret;
            case Predicate.CONTAINS:
                ret += rawName + " != null && " + rawName + ".Contains(" + val + ") ";
                return ret;
            default:
                ret += rawName + " " + op + " " + val + " ";
                return ret;
        }
    }
}