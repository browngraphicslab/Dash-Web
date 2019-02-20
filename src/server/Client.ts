import { computed } from "mobx";

export class Client {
    constructor(guid: string) {
        this.guid = guid
    }

    private guid: string;

    @computed
    public get GUID(): string {
        return this.guid
    }

}