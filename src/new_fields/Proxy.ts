import { Deserializable } from "../client/util/SerializationHelper";
import { RefField, Id, ObjectField } from "./Doc";
import { primitive, serializable } from "serializr";
import { observable } from "mobx";

@Deserializable("proxy")
export class ProxyField<T extends RefField> extends ObjectField {
    constructor();
    constructor(value: T);
    constructor(value?: T) {
        super();
        if (value) {
            this.cache = value;
            this.fieldId = value[Id];
        }
    }

    @serializable(primitive())
    readonly fieldId: string = "";

    // This getter/setter and nested object thing is 
    // because mobx doesn't play well with observable proxies
    @observable.ref
    private _cache: { readonly field: T | undefined } = { field: undefined };
    private get cache(): T | undefined {
        return this._cache.field;
    }
    private set cache(field: T | undefined) {
        this._cache = { field };
    }

    private failed = false;
    private promise?: Promise<any>;

    value(callback?: ((field: T | undefined) => void)): T | undefined | null {
        if (this.cache) {
            callback && callback(this.cache);
            return this.cache;
        }
        if (this.failed) {
            return undefined;
        }
        if (!this.promise) {
            // this.promise = Server.GetField(this.fieldId).then(action((field: any) => {
            //     this.promise = undefined;
            //     this.cache = field;
            //     if (field === undefined) this.failed = true;
            //     return field;
            // }));
            this.promise = new Promise(r => r());
        }
        callback && this.promise.then(callback);
        return null;
    }
}
