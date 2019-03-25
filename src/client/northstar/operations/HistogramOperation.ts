import { reaction, computed, action, observable } from "mobx";
import { Attribute, DataType, QuantitativeBinRange, HistogramOperationParameters, AggregateParameters, AggregateFunction, AverageAggregateParameters } from "../model/idea/idea";
import { ArrayUtil } from "../utils/ArrayUtil";
import { CalculatedAttributeManager } from "../core/attribute/CalculatedAttributeModel";
import { ModelHelpers } from "../model/ModelHelpers";
import { SETTINGS_X_BINS, SETTINGS_Y_BINS, SETTINGS_SAMPLE_SIZE } from "../model/binRanges/VisualBinRangeHelper";
import { AttributeTransformationModel } from "../core/attribute/AttributeTransformationModel";
import { BaseOperation } from "./BaseOperation";
import { CurrentUserUtils } from "../../../server/authentication/models/current_user_utils";
import { FilterModel } from "../core/filter/FilterModel";


export class HistogramOperation extends BaseOperation {
    @observable public Normalization: number = -1;
    @observable public FilterModels: FilterModel[] = [];
    @observable public X: AttributeTransformationModel;
    @observable public Y: AttributeTransformationModel;
    @observable public V: AttributeTransformationModel;
    constructor(x: AttributeTransformationModel, y: AttributeTransformationModel, v: AttributeTransformationModel) {
        super();
        this.X = x;
        this.Y = y;
        this.V = v;
        reaction(() => this.createOperationParamsCache, () => this.Update());
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
        return "";
        // let filterModels = new Array<FilterModel>();
        // let rdg = MainManager.Instance.MainViewModel.FilterReverseDependencyGraph;
        // let graphNode: GraphNode<BaseOperationViewModel, FilterLinkViewModel>;
        // if (rdg.has(this.TypedViewModel)) {
        //     graphNode = MainManager.Instance.MainViewModel.FilterReverseDependencyGraph.get(this.TypedViewModel);
        // }
        // else {
        //     graphNode = new GraphNode<BaseOperationViewModel, FilterLinkViewModel>(this.TypedViewModel);
        // }
        // return FilterModel.GetFilterModelsRecursive(graphNode, new Set<GraphNode<BaseOperationViewModel, FilterLinkViewModel>>(), filterModels, false);
    }

    GetAggregateParameters(histoX: AttributeTransformationModel, histoY: AttributeTransformationModel, histoValue: AttributeTransformationModel) {
        let allAttributes = new Array<AttributeTransformationModel>(histoX, histoY, histoValue);
        allAttributes = ArrayUtil.Distinct(allAttributes.filter(a => a.AggregateFunction !== AggregateFunction.None));

        let numericDataTypes = [DataType.Int, DataType.Double, DataType.Float];
        let perBinAggregateParameters: AggregateParameters[] = ModelHelpers.GetAggregateParametersWithMargins(allAttributes);
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

    @computed
    get createOperationParamsCache() {
        return this.CreateOperationParameters();
    }

    public QRange: QuantitativeBinRange | undefined;

    public CreateOperationParameters(): HistogramOperationParameters | undefined {
        if (this.X && this.Y && this.V) {
            let [perBinAggregateParameters, globalAggregateParameters] = this.GetAggregateParameters(this.X, this.Y, this.V);
            return new HistogramOperationParameters({
                enableBrushComputation: true,
                adapterName: CurrentUserUtils.ActiveSchema!.displayName,
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
        // this.TypedViewModel.BrushColors = this.TypedViewModel.BrusherModels.map(e => e.Color);
        return super.Update();
    }
}


