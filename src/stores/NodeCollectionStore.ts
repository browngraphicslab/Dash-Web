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
        const halfWidth = window.innerWidth / 2, halfHeight = window.innerHeight / 2;
        return `translate(${this.X + halfWidth}px, ${this.Y + halfHeight}px) scale(${this.Scale}) translate(${-halfWidth}px, ${-halfHeight}px)`;
    }

    @action
    public AddNodes(stores: NodeStore[]): void {
        stores.forEach(store => this.Nodes.push(store));
    }
}