import { computed, observable } from "mobx";
import { Utils } from "../Utils";

export class NodeStore {

    public Id: string = Utils.GenerateGuid();

    @observable
    public X: number = 0;

    @observable
    public Y: number = 0;

    @observable
    public Width: number = 0;

    @observable
    public Height: number = 0;

    @computed
    public get Transform(): string {
        return "translate(" + this.X + "px, " + this.Y + "px)";
    }
}