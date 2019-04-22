import { Deserializable, autoObject } from "../client/util/SerializationHelper";
import { Field, ObjectField, Update, OnUpdate, Self } from "./Doc";
import { setter, getter } from "./util";
import { serializable, alias, list } from "serializr";
import { observable } from "mobx";

@Deserializable("list")
class ListImpl<T extends Field> extends ObjectField {
    constructor(fields: T[] = []) {
        super();
        this.__fields = fields;
        const list = new Proxy<this>(this, {
            set: setter,
            get: getter,
            deleteProperty: () => { throw new Error("Currently properties can't be deleted from documents, assign to undefined instead"); },
            defineProperty: () => { throw new Error("Currently properties can't be defined on documents using Object.defineProperty"); },
        });
        return list;
    }

    [key: number]: T | null | undefined;

    @serializable(alias("fields", list(autoObject())))
    @observable
    private __fields: (T | null | undefined)[];

    private [Update] = (diff: any) => {
        console.log(diff);
        const update = this[OnUpdate];
        update && update(diff);
    }

    private [Self] = this;
}
export type List<T extends Field> = ListImpl<T> & T[];
export const List: { new <T extends Field>(): List<T> } = ListImpl as any;