import { serializable, primitive, alias } from "serializr";
import { Utils } from "../Utils";
import { Id, HandleUpdate, ToScriptString, ToString } from "./FieldSymbols";
import { afterDocDeserialize } from "../client/util/SerializationHelper";

export type FieldId = string;
export abstract class RefField {
    @serializable(alias("id", primitive({ afterDeserialize: afterDocDeserialize })))
    private __id: FieldId;
    readonly [Id]: FieldId;

    constructor(id?: FieldId) {
        this.__id = id || Utils.GenerateGuid();
        this[Id] = this.__id;
    }

    protected [HandleUpdate]?(diff: any): void | Promise<void>;

    abstract [ToScriptString](): string;
    abstract [ToString](): string;
}
