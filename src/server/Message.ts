import { Utils } from "../Utils";

export class Message {
    private name: string;
    private guid: string;

    get Name(): string {
        return this.name;
    }

    get Message(): string {
        return this.guid
    }

    constructor(name: string) {
        this.name = name;
        this.guid = Utils.GenerateDeterministicGuid(name)
    }

    GetValue() {
        return this.Name;
    }
}

export namespace MessageStore {
    export const Handshake = new Message("Handshake");
}