import { action, computed, observable, trace } from "mobx";
import { Document } from "../../../fields/Document";
import { FieldWaiting } from "../../../fields/Field";
import { KeyStore } from "../../../fields/KeyStore";
import { CurrentUserUtils } from "../../../server/authentication/models/current_user_utils";
import { ColumnAttributeModel } from "../core/attribute/AttributeModel";
import { AttributeTransformationModel } from "../core/attribute/AttributeTransformationModel";
import { CalculatedAttributeManager } from "../core/attribute/CalculatedAttributeModel";
import { FilterModel } from "../core/filter/FilterModel";
import { FilterOperand } from "../core/filter/FilterOperand";
import { IBaseFilterConsumer } from "../core/filter/IBaseFilterConsumer";
import { IBaseFilterProvider } from "../core/filter/IBaseFilterProvider";
import { HistogramField } from "../dash-fields/HistogramField";
import { SETTINGS_SAMPLE_SIZE, SETTINGS_X_BINS, SETTINGS_Y_BINS } from "../model/binRanges/VisualBinRangeHelper";
import { AggregateFunction, AggregateParameters, Attribute, AverageAggregateParameters, Bin, DataType, DoubleValueAggregateResult, HistogramOperationParameters, HistogramResult, QuantitativeBinRange } from "../model/idea/idea";
import { ModelHelpers } from "../model/ModelHelpers";
import { ArrayUtil } from "../utils/ArrayUtil";
import { BaseOperation } from "./BaseOperation";

export class HistogramOperation extends BaseOperation implements IBaseFilterConsumer, IBaseFilterProvider {
    public static Empty = new HistogramOperation("-empty schema-", new AttributeTransformationModel(new ColumnAttributeModel(new Attribute())), new AttributeTransformationModel(new ColumnAttributeModel(new Attribute())), new AttributeTransformationModel(new ColumnAttributeModel(new Attribute())));
    @observable public FilterOperand: FilterOperand = FilterOperand.AND;
    @observable public Links: Document[] = [];
    @observable public BrushLinks: { l: Document, b: Document }[] = [];
    @observable public BrushColors: number[] = [];
    @observable public FilterModels: FilterModel[] = [];

    @observable public Normalization: number = -1;
    @observable public X: AttributeTransformationModel;
    @observable public Y: AttributeTransformationModel;
    @observable public V: AttributeTransformationModel;
    @observable public SchemaName: string;
    @observable public QRange: QuantitativeBinRange | undefined;
    @computed public get Schema() { return CurrentUserUtils.GetNorthstarSchema(this.SchemaName); }

    constructor(schemaName: string, x: AttributeTransformationModel, y: AttributeTransformationModel, v: AttributeTransformationModel, normalized?: number) {
        super();
        this.X = x;
        this.Y = y;
        this.V = v;
        this.Normalization = normalized ? normalized : -1;
        this.SchemaName = schemaName;
    }

    Equals(other: Object): boolean {
        throw new Error("Method not implemented.");
    }

    @action
    public AddFilterModels(filterModels: FilterModel[]): void {
        filterModels.filter(f => f !== null).forEach(fm => this.FilterModels.push(fm));
    }
    @action
    public RemoveFilterModels(filterModels: FilterModel[]): void {
        ArrayUtil.RemoveMany(this.FilterModels, filterModels);
    }

    @computed
    public get FilterString(): string {
        let filterModels: FilterModel[] = [];
        return FilterModel.GetFilterModelsRecursive(this, new Set<IBaseFilterProvider>(), filterModels, true)
    }

    @computed
    public get BrushString(): string[] {
        trace();
        let brushes: string[] = [];
        this.BrushLinks.map(brushLink => {
            let brushHistogram = brushLink.b.GetT(KeyStore.Data, HistogramField);
            if (brushHistogram && brushHistogram !== FieldWaiting) {
                let filterModels: FilterModel[] = [];
                brushes.push(FilterModel.GetFilterModelsRecursive(brushHistogram.Data, new Set<IBaseFilterProvider>(), filterModels, false));
            }
        });
        return brushes;
    }

    private getAggregateParameters(histoX: AttributeTransformationModel, histoY: AttributeTransformationModel, histoValue: AttributeTransformationModel) {
        let allAttributes = new Array<AttributeTransformationModel>(histoX, histoY, histoValue);
        allAttributes = ArrayUtil.Distinct(allAttributes.filter(a => a.AggregateFunction !== AggregateFunction.None));

        let numericDataTypes = [DataType.Int, DataType.Double, DataType.Float];
        let perBinAggregateParameters: AggregateParameters[] = ModelHelpers.GetAggregateParametersWithMargins(this.Schema!.distinctAttributeParameters, allAttributes);
        let globalAggregateParameters: AggregateParameters[] = [];
        [histoX, histoY]
            .filter(a => a.AggregateFunction === AggregateFunction.None && ArrayUtil.Contains(numericDataTypes, a.AttributeModel.DataType))
            .forEach(a => {
                let avg = new AverageAggregateParameters();
                avg.attributeParameters = ModelHelpers.GetAttributeParameters(a.AttributeModel);
                globalAggregateParameters.push(avg);
            });
        return [perBinAggregateParameters, globalAggregateParameters];
    }

    public CreateOperationParameters(): HistogramOperationParameters | undefined {
        if (this.X && this.Y && this.V) {
            let [perBinAggregateParameters, globalAggregateParameters] = this.getAggregateParameters(this.X, this.Y, this.V);
            return new HistogramOperationParameters({
                enableBrushComputation: true,
                adapterName: this.SchemaName,
                filter: this.FilterString,
                brushes: this.BrushString,
                binningParameters: [ModelHelpers.GetBinningParameters(this.X, SETTINGS_X_BINS, this.QRange ? this.QRange.minValue : undefined, this.QRange ? this.QRange.maxValue : undefined),
                ModelHelpers.GetBinningParameters(this.Y, SETTINGS_Y_BINS)],
                sampleStreamBlockSize: SETTINGS_SAMPLE_SIZE,
                perBinAggregateParameters: perBinAggregateParameters,
                globalAggregateParameters: globalAggregateParameters,
                sortPerBinAggregateParameter: undefined,
                attributeCalculatedParameters: CalculatedAttributeManager
                    .AllCalculatedAttributes.map(a => ModelHelpers.GetAttributeParametersFromAttributeModel(a)),
                degreeOfParallism: 1, // Settings.Instance.DegreeOfParallelism,
                isCachable: false
            });
        }
    }

    @action
    public async Update(): Promise<void> {
        this.BrushColors = this.BrushLinks.map(e => e.l.GetNumber(KeyStore.BackgroundColor, 0));
        return super.Update();
    }
}


