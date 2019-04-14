import { computed } from "mobx";

export class Client {
    private _guid: string;

    constructor(guid: string) {
        this._guid = guid;
    }

    @computed public get GUID(): string { return this._guid; }
}