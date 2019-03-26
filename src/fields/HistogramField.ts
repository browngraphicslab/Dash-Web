import { BasicField } from "./BasicField";
import { Field, FieldId } from "./Field";
import { Types } from "../server/Message";
import { HistogramOperation } from "../client/northstar/operations/HistogramOperation";
import { action } from "mobx";
import { AttributeTransformationModel } from "../client/northstar/core/attribute/AttributeTransformationModel";
import { ColumnAttributeModel } from "../client/northstar/core/attribute/AttributeModel";
import { CurrentUserUtils } from "../server/authentication/models/current_user_utils";


export class HistogramField extends BasicField<HistogramOperation> {
    constructor(data?: HistogramOperation, id?: FieldId, save: boolean = true) {
        super(data ? data : HistogramOperation.Empty, save, id);
    }

    toString(): string {
        return JSON.stringify(this.Data);
    }

    Copy(): Field {
        return new HistogramField(this.Data);
    }

    ToScriptString(): string {
        return `new HistogramField("${this.Data}")`;
    }

    ToJson(): { type: Types, data: string, _id: string } {
        return {
            type: Types.HistogramOp,
            data: JSON.stringify(this.Data),
            _id: this.Id
        }
    }

    @action
    static FromJson(id: string, data: any): HistogramField {
        let jp = JSON.parse(data);
        let X: AttributeTransformationModel | undefined;
        let Y: AttributeTransformationModel | undefined;
        let V: AttributeTransformationModel | undefined;

        CurrentUserUtils.GetAllNorthstarColumnAttributes().map(attr => {
            if (attr.displayName == jp.X.AttributeModel.Attribute.DisplayName) {
                X = new AttributeTransformationModel(new ColumnAttributeModel(attr), jp.X.AggregateFunction);
            }
            if (attr.displayName == jp.Y.AttributeModel.Attribute.DisplayName) {
                Y = new AttributeTransformationModel(new ColumnAttributeModel(attr), jp.Y.AggregateFunction);
            }
            if (attr.displayName == jp.V.AttributeModel.Attribute.DisplayName) {
                V = new AttributeTransformationModel(new ColumnAttributeModel(attr), jp.V.AggregateFunction);
            }
        });
        if (X && Y && V) {
            return new HistogramField(new HistogramOperation(X, Y, V, jp.Normalization), id, false);
        }
        return new HistogramField(HistogramOperation.Empty, id, false);
    }
}