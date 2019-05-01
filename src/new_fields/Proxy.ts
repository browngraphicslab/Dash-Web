import { Deserializable } from "../client/util/SerializationHelper";
import { FieldWaiting } from "./Doc";
import { primitive, serializable } from "serializr";
import { observable, action } from "mobx";
import { DocServer } from "../client/DocServer";
import { RefField, Id } from "./RefField";
import { ObjectField, Copy } from "./ObjectField";

@Deserializable("proxy")
export class ProxyField<T extends RefField> extends ObjectField {
    constructor();
    constructor(value: T);
    constructor(fieldId: string);
    constructor(value?: T | string) {
        super();
        if (typeof value === "string") {
            this.fieldId = value;
        } else if (value) {
            this.cache = value;
            this.fieldId = value[Id];
        }
    }

    [Copy]() {
        if (this.cache) return new ProxyField<T>(this.cache);
        return new ProxyField<T>(this.fieldId);
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

    value(callback?: ((field: T | undefined) => void)): T | undefined | FieldWaiting {
        if (this.cache) {
            callback && callback(this.cache);
            return this.cache;
        }
        if (this.failed) {
            return undefined;
        }
        if (!this.promise) {
            this.promise = DocServer.GetRefField(this.fieldId).then(action((field: any) => {
                this.promise = undefined;
                this.cache = field;
                if (field === undefined) this.failed = true;
                return field;
            }));
        }
        callback && this.promise.then(callback);
        return this.promise;
    }
}
