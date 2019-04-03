;
import { computed, observable } from "mobx";
import { AggregateFunction } from "../../model/idea/idea";
import { AttributeModel } from "./AttributeModel";
import { IEquatable } from "../../utils/IEquatable";

export class AttributeTransformationModel implements IEquatable {

    @observable public AggregateFunction: AggregateFunction;
    @observable public AttributeModel: AttributeModel;

    constructor(attributeModel: AttributeModel, aggregateFunction: AggregateFunction = AggregateFunction.None) {
        this.AttributeModel = attributeModel;
        this.AggregateFunction = aggregateFunction;
    }

    @computed
    public get PresentedName(): string {
        var displayName = this.AttributeModel.DisplayName;
        if (this.AggregateFunction === AggregateFunction.Count) {
            return "count";
        }
        if (this.AggregateFunction === AggregateFunction.Avg)
            displayName = "avg(" + displayName + ")";
        else if (this.AggregateFunction === AggregateFunction.Max)
            displayName = "max(" + displayName + ")";
        else if (this.AggregateFunction === AggregateFunction.Min)
            displayName = "min(" + displayName + ")";
        else if (this.AggregateFunction === AggregateFunction.Sum)
            displayName = "sum(" + displayName + ")";
        else if (this.AggregateFunction === AggregateFunction.SumE)
            displayName = "sumE(" + displayName + ")";

        return displayName;
    }

    public clone(): AttributeTransformationModel {
        var clone = new AttributeTransformationModel(this.AttributeModel);
        clone.AggregateFunction = this.AggregateFunction;
        return clone;
    }

    public Equals(other: AttributeTransformationModel): boolean {
        return this.AggregateFunction == other.AggregateFunction &&
            this.AttributeModel.Equals(other.AttributeModel);
    }
}