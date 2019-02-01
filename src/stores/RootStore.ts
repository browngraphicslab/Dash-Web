import { action, observable } from "mobx";

// This globally accessible store might come in handy, although you may decide that you don't need it.
export class RootStore {

    private constructor() {
        // initialization code
    }

    private static _instance: RootStore;

    public static get Instance(): RootStore {
        return this._instance || (this._instance = new this());
    }
}