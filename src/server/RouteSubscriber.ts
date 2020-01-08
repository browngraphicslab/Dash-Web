export default class RouteSubscriber {
    private _root: string;
    private requestParameters: string[] = [];

    constructor(root: string) {
        this._root = `/${root}`;
    }

    add(...parameters: string[]) {
        this.requestParameters.push(...parameters);
        return this;
    }

    public get root() {
        return this._root;
    }

    public get build() {
        let output = this._root;
        if (this.requestParameters.length) {
            output = `${output}/:${this.requestParameters.join("/:")}`;
        }
        return output;
    }

}