import { computed, observable, action } from "mobx";
import { NodeStore } from "./NodeStore";
import { Document } from "../fields/Document";

export class NodeCollectionStore extends NodeStore {

    @observable
    public Scale: number = 1;

    @observable
    public Nodes: NodeStore[] = new Array<NodeStore>();

    @observable
    public Docs: Document[] = [];

    @computed
    public get Transform(): string {
        return "translate(" + this.X + "px," + this.Y + "px) scale(" + this.Scale + "," + this.Scale + ")";
    }

    @action
    public AddNodes(stores: NodeStore[]): void {
        stores.forEach(store => this.Nodes.push(store));
    }
}