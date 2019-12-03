import { observable } from "mobx";
import { custom, serializable } from "serializr";
import { ColumnAttributeModel } from "../../../client/northstar/core/attribute/AttributeModel";
import { AttributeTransformationModel } from "../../../client/northstar/core/attribute/AttributeTransformationModel";
import { HistogramOperation } from "../../../client/northstar/operations/HistogramOperation";
import { ObjectField } from "../../../new_fields/ObjectField";
import { CurrentUserUtils } from "../../../server/authentication/models/current_user_utils";
import { OmitKeys } from "../../../Utils";
import { Deserializable } from "../../util/SerializationHelper";
import { Copy, ToScriptString } from "../../../new_fields/FieldSymbols";

function serialize(field: HistogramField) {
    const obj = OmitKeys(field, ['Links', 'BrushLinks', 'Result', 'BrushColors', 'FilterModels', 'FilterOperand']).omit;
    return obj;
}

function deserialize(jp: any) {
    let X: AttributeTransformationModel | undefined;
    let Y: AttributeTransformationModel | undefined;
    let V: AttributeTransformationModel | undefined;

    const schema = CurrentUserUtils.GetNorthstarSchema(jp.SchemaName);
    if (schema) {
        CurrentUserUtils.GetAllNorthstarColumnAttributes(schema).map(attr => {
            if (attr.displayName === jp.X.AttributeModel.Attribute.DisplayName) {
                X = new AttributeTransformationModel(new ColumnAttributeModel(attr), jp.X.AggregateFunction);
            }
            if (attr.displayName === jp.Y.AttributeModel.Attribute.DisplayName) {
                Y = new AttributeTransformationModel(new ColumnAttributeModel(attr), jp.Y.AggregateFunction);
            }
            if (attr.displayName === jp.V.AttributeModel.Attribute.DisplayName) {
                V = new AttributeTransformationModel(new ColumnAttributeModel(attr), jp.V.AggregateFunction);
            }
        });
        if (X && Y && V) {
            return new HistogramOperation(jp.SchemaName, X, Y, V, jp.Normalization);
        }
    }
    return HistogramOperation.Empty;
}

@Deserializable("histogramField")
export class HistogramField extends ObjectField {
    @serializable(custom(serialize, deserialize)) @observable public readonly HistoOp: HistogramOperation;
    constructor(data?: HistogramOperation) {
        super();
        this.HistoOp = data ? data : HistogramOperation.Empty;
    }

    toString(): string {
        return JSON.stringify(OmitKeys(this.HistoOp, ['Links', 'BrushLinks', 'Result', 'BrushColors', 'FilterModels', 'FilterOperand']).omit);
    }

    [Copy]() {
        // const y = this.HistoOp;
        // const z = this.HistoOp.Copy;
        return new HistogramField(HistogramOperation.Duplicate(this.HistoOp));
    }

    [ToScriptString]() {
        return this.toString();
    }
}