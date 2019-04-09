import { FilterModel } from '../core/filter/FilterModel'
import { ErrorResult, Exception, OperationParameters, OperationReference, Result, ResultParameters } from '../model/idea/idea';
import { action, computed, observable } from "mobx";
import { Gateway } from '../manager/Gateway';

export abstract class BaseOperation {
    private _interactionTimeoutId: number = 0;
    private static _currentOperations: Map<number, PollPromise> = new Map<number, PollPromise>();
    //public InteractionTimeout: EventDelegate<InteractionTimeoutEventArgs> = new EventDelegate<InteractionTimeoutEventArgs>();

    @observable public Error: string = "";
    @observable public OverridingFilters: FilterModel[] = [];
    //@observable 
    @observable public Result?: Result = undefined;
    @observable public ComputationStarted: boolean = false;
    public OperationReference?: OperationReference = undefined;

    private static _nextId = 0;
    public RequestSalt: string = "";
    public Id: number;

    constructor() {
        this.Id = BaseOperation._nextId++;
    }

    @computed
    public get FilterString(): string {

        // let filterModels: FilterModel[] = [];
        // return FilterModel.GetFilterModelsRecursive(this, new Set<GraphNode<BaseOperationViewModel, FilterLinkViewModel>>(), filterModels, true)
        // if (this.OverridingFilters.length > 0) {
        //     return "(" + this.OverridingFilters.filter(fm => fm !== null).map(fm => fm.ToPythonString()).join(" || ") + ")";
        // }
        // let rdg = MainManager.Instance.MainViewModel.FilterReverseDependencyGraph;
        // let sliceModel = this.TypedViewModel.IncomingSliceModel;
        // if (sliceModel !== null && sliceModel.Source !== null && instanceOfIBaseFilterProvider(sliceModel.Source) && rdg.has(sliceModel.Source)) {
        //     let filterModels = sliceModel.Source.FilterModels.map(f => f);
        //     return FilterModel.GetFilterModelsRecursive(rdg.get(sliceModel.Source), new Set<GraphNode<BaseOperationViewModel, FilterLinkViewModel>>(), filterModels, false);
        // }

        // if (rdg.has(this.TypedViewModel)) {
        //     let filterModels = [];
        //     return FilterModel.GetFilterModelsRecursive(rdg.get(this.TypedViewModel), new Set<GraphNode<BaseOperationViewModel, FilterLinkViewModel>>(), filterModels, true)
        // }
        return "";
    }


    @action
    public SetResult(result: Result): void {
        this.Result = result;
    }

    public async Update(): Promise<void> {

        try {
            if (BaseOperation._currentOperations.has(this.Id)) {
                BaseOperation._currentOperations.get(this.Id)!.Cancel();
                if (this.OperationReference) {
                    Gateway.Instance.PauseOperation(this.OperationReference.toJSON());
                }
            }

            let operationParameters = this.CreateOperationParameters();
            if (this.Result)
                this.Result.progress = 0; // bcz: used to set Result to undefined, but that causes the display to blink
            this.Error = "";
            let salt = Math.random().toString();
            this.RequestSalt = salt;

            if (!operationParameters) {
                this.ComputationStarted = false;
                return;
            }

            this.ComputationStarted = true;
            //let start = performance.now();
            let promise = Gateway.Instance.StartOperation(operationParameters.toJSON());
            promise.catch(err => {
                action(() => {
                    this.Error = err;
                    console.error(err);
                });
            });
            let operationReference = await promise;


            if (operationReference) {
                this.OperationReference = operationReference;

                let resultParameters = new ResultParameters();
                resultParameters.operationReference = operationReference;

                let pollPromise = new PollPromise(salt, operationReference);
                BaseOperation._currentOperations.set(this.Id, pollPromise);

                pollPromise.Start(async () => {
                    let result = await Gateway.Instance.GetResult(resultParameters.toJSON());
                    if (result instanceof ErrorResult) {
                        throw new Error((result as ErrorResult).message);
                    }
                    if (this.RequestSalt === pollPromise.RequestSalt) {
                        if (result && (!this.Result || this.Result.progress !== result.progress)) {
                            /*if (operationViewModel.Result !== null && operationViewModel.Result !== undefined) {
                                let t1 = performance.now();
                                console.log((t1 - start) + " milliseconds.");
                                start = performance.now();
                            }*/
                            this.SetResult(result);
                        }

                        if (!result || result.progress! < 1) {
                            return true;
                        }
                    }
                    return false;
                }, 100).catch((err: Error) => action(() => {
                    this.Error = err.message;
                    console.error(err.message);
                })()
                );
            }
        }
        catch (err) {
            console.error(err as Exception);
            // ErrorDialog.Instance.HandleError(err, operationViewModel);
        }
    }

    public CreateOperationParameters(): OperationParameters | undefined { return undefined; }

    private interactionTimeout() {
        // clearTimeout(this._interactionTimeoutId);
        // this.InteractionTimeout.Fire(new InteractionTimeoutEventArgs(this.TypedViewModel, InteractionTimeoutType.Timeout));
    }
}

export class PollPromise {
    public RequestSalt: string;
    public OperationReference: OperationReference;

    private _notCanceled: boolean = true;
    private _poll: undefined | (() => Promise<boolean>);
    private _delay: number = 0;

    public constructor(requestKey: string, operationReference: OperationReference) {
        this.RequestSalt = requestKey;
        this.OperationReference = operationReference;
    }

    public Cancel(): void {
        this._notCanceled = false;
    }

    public Start(poll: () => Promise<boolean>, delay: number): Promise<void> {
        this._poll = poll;
        this._delay = delay;
        return this.pollRecursive();
    }

    private pollRecursive = (): Promise<void> => {
        return Promise.resolve().then(this._poll).then((flag) => {
            this._notCanceled && flag && new Promise((res) => (setTimeout(res, this._delay)))
                .then(this.pollRecursive);
        });
    }
}


export class InteractionTimeoutEventArgs {
    constructor(public Sender: object, public Type: InteractionTimeoutType) {
    }
}

export enum InteractionTimeoutType {
    Reset = 0,
    Timeout = 1
}
