import { observable } from "mobx";
import { custom, serializable } from "serializr";
import { ColumnAttributeModel } from "../../../client/northstar/core/attribute/AttributeModel";
import { AttributeTransformationModel } from "../../../client/northstar/core/attribute/AttributeTransformationModel";
import { HistogramOperation } from "../../../client/northstar/operations/HistogramOperation";
import { ObjectField } from "../../../new_fields/ObjectField";
import { CurrentUserUtils } from "../../../server/authentication/models/current_user_utils";
import { OmitKeys } from "../../../Utils";
import { Deserializable } from "../../util/SerializationHelper";

function serialize(field: HistogramField) {
    return OmitKeys(field.HistoOp, ['Links', 'BrushLinks', 'Result', 'BrushColors', 'FilterModels', 'FilterOperand']).omit;
}

function deserialize(jp: any) {
    let X: AttributeTransformationModel | undefined;
    let Y: AttributeTransformationModel | undefined;
    let V: AttributeTransformationModel | undefined;

    let schema = CurrentUserUtils.GetNorthstarSchema(jp.SchemaName);
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
            return new HistogramField(new HistogramOperation(jp.SchemaName, X, Y, V, jp.Normalization));
        }
    }
    return new HistogramField(HistogramOperation.Empty);
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

    Copy(): HistogramField {
        return new HistogramField(this.HistoOp.Copy());
    }
}