import { action } from "mobx";
import { ColumnAttributeModel } from "../../../client/northstar/core/attribute/AttributeModel";
import { AttributeTransformationModel } from "../../../client/northstar/core/attribute/AttributeTransformationModel";
import { HistogramOperation } from "../../../client/northstar/operations/HistogramOperation";
import { BasicField } from "../../../fields/BasicField";
import { Field, FieldId } from "../../../fields/Field";
import { CurrentUserUtils } from "../../../server/authentication/models/current_user_utils";
import { Types } from "../../../server/Message";


export class HistogramField extends BasicField<HistogramOperation> {
    constructor(data?: HistogramOperation, id?: FieldId, save: boolean = true) {
        super(data ? data : HistogramOperation.Empty, save, id);
    }

    omitKeys(obj: any, keys: any) {
        var dup: any = {};
        for (var key in obj) {
            if (keys.indexOf(key) === -1) {
                dup[key] = obj[key];
            }
        }
        return dup;
    }
    toString(): string {
        return JSON.stringify(this.omitKeys(this.Data, ['Links', 'BrushLinks', 'Result', 'BrushColors', 'FilterModels', 'FilterOperand']));
    }

    Copy(): Field {
        return new HistogramField(this.Data.Copy());
    }

    ToScriptString(): string {
        return `new HistogramField("${this.Data}")`;
    }


    ToJson(): { type: Types, data: string, _id: string } {
        return {
            type: Types.HistogramOp,

            data: this.toString(),
            _id: this.Id
        };
    }

    @action
    static FromJson(id: string, data: any): HistogramField {
        let jp = JSON.parse(data);
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
                return new HistogramField(new HistogramOperation(jp.SchemaName, X, Y, V, jp.Normalization), id, false);
            }
        }
        return new HistogramField(HistogramOperation.Empty, id, false);
    }
}