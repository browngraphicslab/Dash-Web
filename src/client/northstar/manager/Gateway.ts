import { Catalog, OperationReference, Result, CompileResults } from "../model/idea/idea"
import { computed, observable, action } from "mobx";

export class Gateway {

    private static _instance: Gateway;

    private constructor() {
    }

    public static get Instance() {
        return this._instance || (this._instance = new this());
    }

    public async GetCatalog(): Promise<Catalog> {
        try {
            const json = await this.MakeGetRequest("catalog");
            const cat = Catalog.fromJS(json);
            return cat;
        }
        catch (error) {
            throw new Error("can not reach northstar's backend");
        }
    }

    public async ClearCatalog(): Promise<void> {
        try {
            const json = await this.MakePostJsonRequest("Datamart/ClearAllAugmentations", {});
        }
        catch (error) {
            throw new Error("can not reach northstar's backend");
        }
    }

    public async TerminateServer(): Promise<void> {
        try {
            const url = Gateway.ConstructUrl("terminateServer");
            const response = await fetch(url,
                {
                    redirect: "follow",
                    method: "POST",
                    credentials: "include"
                });
        }
        catch (error) {
            throw new Error("can not reach northstar's backend");
        }
    }

    public async Compile(data: any): Promise<CompileResults | undefined> {
        const json = await this.MakePostJsonRequest("compile", data);
        if (json != null) {
            const cr = CompileResults.fromJS(json);
            return cr;
        }
    }

    public async SubmitResult(data: any): Promise<void> {
        try {
            console.log(data);
            const url = Gateway.ConstructUrl("submitProblem");
            const response = await fetch(url,
                {
                    redirect: "follow",
                    method: "POST",
                    credentials: "include",
                    body: JSON.stringify(data)
                });
        }
        catch (error) {
            throw new Error("can not reach northstar's backend");
        }
    }

    public async SpecifyProblem(data: any): Promise<void> {
        try {
            console.log(data);
            const url = Gateway.ConstructUrl("specifyProblem");
            const response = await fetch(url,
                {
                    redirect: "follow",
                    method: "POST",
                    credentials: "include",
                    body: JSON.stringify(data)
                });
        }
        catch (error) {
            throw new Error("can not reach northstar's backend");
        }
    }

    public async ExportToScript(solutionId: string): Promise<string> {
        try {
            const url = Gateway.ConstructUrl("exportsolution/script/" + solutionId);
            const response = await fetch(url,
                {
                    redirect: "follow",
                    method: "GET",
                    credentials: "include"
                });
            return await response.text();
        }
        catch (error) {
            throw new Error("can not reach northstar's backend");
        }
    }


    public async StartOperation(data: any): Promise<OperationReference | undefined> {
        const json = await this.MakePostJsonRequest("operation", data);
        if (json != null) {
            const or = OperationReference.fromJS(json);
            return or;
        }
    }

    public async GetResult(data: any): Promise<Result | undefined> {
        const json = await this.MakePostJsonRequest("result", data);
        if (json != null) {
            const res = Result.fromJS(json);
            return res;
        }
    }

    public async PauseOperation(data: any): Promise<void> {
        const url = Gateway.ConstructUrl("pause");
        await fetch(url,
            {
                redirect: "follow",
                method: "POST",
                credentials: "include",
                body: JSON.stringify(data)
            });
    }

    public async MakeGetRequest(endpoint: string, signal?: AbortSignal): Promise<any> {
        const url = Gateway.ConstructUrl(endpoint);
        const response = await fetch(url,
            {
                redirect: "follow",
                method: "GET",
                credentials: "include",
                signal
            });
        const json = await response.json();
        return json;
    }

    public async MakePostJsonRequest(endpoint: string, data: any, signal?: AbortSignal): Promise<any> {
        const url = Gateway.ConstructUrl(endpoint);
        const response = await fetch(url,
            {
                redirect: "follow",
                method: "POST",
                credentials: "include",
                body: JSON.stringify(data),
                signal
            });
        const json = await response.json();
        return json;
    }


    public static ConstructUrl(appendix: string): string {
        let base = Settings.Instance.ServerUrl;
        if (base.slice(-1) == "/") {
            base = base.slice(0, -1);
        }
        let url = base + "/" + Settings.Instance.ServerApiPath + "/" + appendix;
        return url;
    }
}

declare var ENV: any;

export class Settings {
    private _environment: any;

    @observable
    public ServerUrl: string = document.URL;

    @observable
    public ServerApiPath?: string;

    @observable
    public SampleSize?: number;

    @observable
    public XBins?: number;

    @observable
    public YBins?: number;

    @observable
    public SplashTimeInMS?: number;

    @observable
    public ShowFpsCounter?: boolean;

    @observable
    public IsMenuFixed?: boolean;

    @observable
    public ShowShutdownButton?: boolean;

    @observable
    public IsDarpa?: boolean;

    @observable
    public IsIGT?: boolean;

    @observable
    public DegreeOfParallelism?: number;

    @observable
    public ShowWarnings?: boolean;

    @computed
    public get IsDev(): boolean {
        return ENV.IsDev;
    }

    @computed
    public get TestDataFolderPath(): string {
        return this.Origin + "testdata/";
    }

    @computed
    public get Origin(): string {
        return window.location.origin + "/";
    }

    private static _instance: Settings;

    @action
    public Update(environment: any): void {
        /*let serverParam = new URL(document.URL).searchParams.get("serverUrl");
        if (serverParam) {
            if (serverParam === "debug") {
                this.ServerUrl = `http://${window.location.hostname}:1234`;
            }
            else {
                this.ServerUrl = serverParam;
            }
        }
        else {
            this.ServerUrl = environment["SERVER_URL"] ? environment["SERVER_URL"] : document.URL;
        }*/
        this.ServerUrl = environment["SERVER_URL"] ? environment["SERVER_URL"] : document.URL;
        this.ServerApiPath = environment["SERVER_API_PATH"];
        this.SampleSize = environment["SAMPLE_SIZE"];
        this.XBins = environment["X_BINS"];
        this.YBins = environment["Y_BINS"];
        this.SplashTimeInMS = environment["SPLASH_TIME_IN_MS"];
        this.ShowFpsCounter = environment["SHOW_FPS_COUNTER"];
        this.ShowShutdownButton = environment["SHOW_SHUTDOWN_BUTTON"];
        this.IsMenuFixed = environment["IS_MENU_FIXED"];
        this.IsDarpa = environment["IS_DARPA"];
        this.IsIGT = environment["IS_IGT"];
        this.DegreeOfParallelism = environment["DEGREE_OF_PARALLISM"];
    }

    public static get Instance(): Settings {
        if (!this._instance) {
            this._instance = new Settings();
        }
        return this._instance;
    }
}
