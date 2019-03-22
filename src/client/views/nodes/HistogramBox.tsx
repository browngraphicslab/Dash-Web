import React = require("react")
import { observer } from "mobx-react";
import { FieldView, FieldViewProps } from './FieldView';
import "./VideoBox.scss";
import { observable, reaction } from "mobx";
import { HistogramOperation } from "../../northstar/operations/HistogramOperation";
import { ColumnAttributeModel } from "../../northstar/core/attribute/AttributeModel";
import { AttributeTransformationModel } from "../../northstar/core/attribute/AttributeTransformationModel";
import { AggregateFunction, HistogramResult, DoubleValueAggregateResult } from "../../northstar/model/idea/idea";
import { ModelHelpers } from "../../northstar/model/ModelHelpers";
import { CurrentUserUtils } from "../../../server/authentication/models/current_user_utils";

@observer
export class HistogramBox extends React.Component<FieldViewProps> {

    public static LayoutString(fieldStr: string = "DataKey") { return FieldView.LayoutString(HistogramBox, fieldStr) }

    constructor(props: FieldViewProps) {
        super(props);
    }

    @observable _histoResult?: HistogramResult;
    _histoOp?: HistogramOperation;

    componentDidMount() {
        CurrentUserUtils.GetAllNorthstarColumnAttributes().map(a => {
            if (a.displayName == this.props.doc.Title) {
                var atmod = new ColumnAttributeModel(a);
                this._histoOp = new HistogramOperation(new AttributeTransformationModel(atmod, AggregateFunction.None),
                    new AttributeTransformationModel(atmod, AggregateFunction.Count),
                    new AttributeTransformationModel(atmod, AggregateFunction.Count));
                reaction(() => [this._histoOp && this._histoOp.Result],
                    () => this._histoResult = this._histoOp ? this._histoOp.Result as HistogramResult : undefined
                );
                this._histoOp.Update();
            }
        })
    }

    twoString() {
        let str = "";
        if (this._histoResult && !this._histoResult.isEmpty) {
            for (let key in this._histoResult.bins) {
                if (this._histoResult.bins.hasOwnProperty(key)) {
                    let bin = this._histoResult.bins[key];
                    str += JSON.stringify(bin.binIndex!.toJSON()) + " = ";
                    let valueAggregateKey = ModelHelpers.CreateAggregateKey(this._histoOp!.V, this._histoResult, ModelHelpers.AllBrushIndex(this._histoResult));
                    let value = ModelHelpers.GetAggregateResult(bin, valueAggregateKey) as DoubleValueAggregateResult;
                    if (value && value.hasResult && value.result) {
                        str += value.result;
                    }
                }
            }
        }
        return str;
    }

    render() {
        if (!this._histoResult)
            return (null);
        return (
            <div className="histogrambox-container">
                `HISTOGRAM RESULT : ${this.twoString()}`
            </div>
        )
    }
}