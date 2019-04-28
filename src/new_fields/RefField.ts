import { serializable, primitive, alias } from "serializr";
import { Utils } from "../Utils";

export type FieldId = string;
export const HandleUpdate = Symbol("HandleUpdate");
export const Id = Symbol("Id");
export abstract class RefField {
    @serializable(alias("id", primitive()))
    private __id: FieldId;
    readonly [Id]: FieldId;

    constructor(id?: FieldId) {
        this.__id = id || Utils.GenerateGuid();
        this[Id] = this.__id;
    }

    protected [HandleUpdate]?(diff: any): void;
}
