import { action, computed, observable } from "mobx";
import { Document } from "../../../fields/Document";
import { CurrentUserUtils } from "../../../server/authentication/models/current_user_utils";
import { ColumnAttributeModel } from "../core/attribute/AttributeModel";
import { AttributeTransformationModel } from "../core/attribute/AttributeTransformationModel";
import { CalculatedAttributeManager } from "../core/attribute/CalculatedAttributeModel";
import { BrushLinkModel } from "../core/brusher/BrushLinkModel";
import { FilterModel } from "../core/filter/FilterModel";
import { FilterOperand } from "../core/filter/FilterOperand";
import { IBaseFilterConsumer } from "../core/filter/IBaseFilterConsumer";
import { IBaseFilterProvider } from "../core/filter/IBaseFilterProvider";
import { SETTINGS_SAMPLE_SIZE, SETTINGS_X_BINS, SETTINGS_Y_BINS } from "../model/binRanges/VisualBinRangeHelper";
import { AggregateFunction, AggregateParameters, Attribute, AverageAggregateParameters, DataType, HistogramOperationParameters, QuantitativeBinRange, HistogramResult, Brush, DoubleValueAggregateResult, Bin } from "../model/idea/idea";
import { ModelHelpers } from "../model/ModelHelpers";
import { ArrayUtil } from "../utils/ArrayUtil";
import { BaseOperation } from "./BaseOperation";


export class HistogramOperation extends BaseOperation implements IBaseFilterConsumer, IBaseFilterProvider {
    @observable public FilterOperand: FilterOperand = FilterOperand.AND;
    @observable public Links: Document[] = [];
    @observable public BrushColors: number[] = [];
    @observable public Normalization: number = -1;
    @observable public FilterModels: FilterModel[] = [];
    @observable public X: AttributeTransformationModel;
    @observable public Y: AttributeTransformationModel;
    @observable public V: AttributeTransformationModel;
    @observable public BrusherModels: BrushLinkModel<HistogramOperation>[] = [];
    @observable public BrushableModels: BrushLinkModel<HistogramOperation>[] = [];
    @observable public SchemaName: string;
    @computed public get Schema() { return CurrentUserUtils.GetNorthstarSchema(this.SchemaName); }

    @action
    public AddFilterModels(filterModels: FilterModel[]): void {
        filterModels.filter(f => f !== null).forEach(fm => this.FilterModels.push(fm));
    }
    @action
    public RemoveFilterModels(filterModels: FilterModel[]): void {
        ArrayUtil.RemoveMany(this.FilterModels, filterModels);
    }

    public getValue(axis: number, bin: Bin, result: HistogramResult, brushIndex: number) {
        var aggregateKey = ModelHelpers.CreateAggregateKey(this.Schema!.distinctAttributeParameters, axis == 0 ? this.X : axis == 1 ? this.Y : this.V, result, brushIndex);
        let dataValue = ModelHelpers.GetAggregateResult(bin, aggregateKey) as DoubleValueAggregateResult;
        return dataValue != null && dataValue.hasResult ? dataValue.result : undefined;
    }

    public static Empty = new HistogramOperation("-empty schema-", new AttributeTransformationModel(new ColumnAttributeModel(new Attribute())), new AttributeTransformationModel(new ColumnAttributeModel(new Attribute())), new AttributeTransformationModel(new ColumnAttributeModel(new Attribute())));

    Equals(other: Object): boolean {
        throw new Error("Method not implemented.");
    }

    constructor(schemaName: string, x: AttributeTransformationModel, y: AttributeTransformationModel, v: AttributeTransformationModel, normalized?: number) {
        super();
        this.X = x;
        this.Y = y;
        this.V = v;
        this.Normalization = normalized ? normalized : -1;
        this.SchemaName = schemaName;
    }

    @computed
    public get FilterString(): string {
        let filterModels: FilterModel[] = [];
        let fstring = FilterModel.GetFilterModelsRecursive(this, new Set<IBaseFilterProvider>(), filterModels, true)
        return fstring;
    }

    @computed.struct
    public get BrushString() {
        return [];
        // let brushes = [];
        // this.TypedViewModel.BrusherModels.map(brushLinkModel => {
        //     if (instanceOfIBaseFilterProvider(brushLinkModel.From) && brushLinkModel.From.FilterModels.some && brushLinkModel.From instanceof BaseOperationViewModel) {
        //         let brushFilterModels = [];
        //         let gnode = MainManager.Instance.MainViewModel.FilterDependencyGraph.has(brushLinkModel.From) ?
        //             MainManager.Instance.MainViewModel.FilterDependencyGraph.get(brushLinkModel.From) :
        //             new GraphNode<BaseOperationViewModel, FilterLinkViewModel>(brushLinkModel.From);
        //         let brush = FilterModel.GetFilterModelsRecursive(gnode, new Set<GraphNode<BaseOperationViewModel, FilterLinkViewModel>>(), brushFilterModels, false);
        //         brushes.push(brush);
        //     }
        // });
        // return brushes;
    }


    @computed.struct
    public get SelectionString() {
        let filterModels = new Array<FilterModel>();
        return FilterModel.GetFilterModelsRecursive(this, new Set<IBaseFilterProvider>(), filterModels, false);
    }

    GetAggregateParameters(histoX: AttributeTransformationModel, histoY: AttributeTransformationModel, histoValue: AttributeTransformationModel) {
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

    public QRange: QuantitativeBinRange | undefined;

    public CreateOperationParameters(): HistogramOperationParameters | undefined {
        if (this.X && this.Y && this.V) {
            let [perBinAggregateParameters, globalAggregateParameters] = this.GetAggregateParameters(this.X, this.Y, this.V);
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
        this.BrushColors = this.BrusherModels.map(e => e.Color);
        return super.Update();
    }
}


