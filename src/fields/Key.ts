import { Field, FieldId } from "./Field"
import { Utils } from "../Utils";
import { observable } from "mobx";
import { Types } from "../server/Message";
import { ObjectID } from "bson";
import { Server } from "../client/Server";

export class Key extends Field {
    private name: string;

    get Name(): string {
        return this.name;
    }

    constructor(name: string, id?: string, save: boolean = true) {
        super(id || Utils.GenerateDeterministicGuid(name));

        this.name = name;
        if (save) {
            Server.UpdateField(this)
        }
    }

    UpdateFromServer(data: string) {
        this.name = data;
    }

    TrySetValue(value: any): boolean {
        throw new Error("Method not implemented.");
    }

    GetValue() {
        return this.Name;
    }

    Copy(): Field {
        return this;
    }

    ToScriptString(): string {
        return name;
    }

    ToJson(): { type: Types, data: string, _id: string } {
        return {
            type: Types.Key,
            data: this.name,
            _id: this.Id
        }
    }
}