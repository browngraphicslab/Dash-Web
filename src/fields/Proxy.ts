import { Deserializable } from "../client/util/SerializationHelper";
import { FieldWaiting } from "./Doc";
import { primitive, serializable } from "serializr";
import { observable, action, runInAction } from "mobx";
import { DocServer } from "../client/DocServer";
import { RefField } from "./RefField";
import { ObjectField } from "./ObjectField";
import { Id, Copy, ToScriptString, ToString } from "./FieldSymbols";
import { scriptingGlobal } from "../client/util/Scripting";
import { Plugins } from "./util";

function deserializeProxy(field: any) {
    if (!field.cache) {
        field.cache = DocServer.GetCachedRefField(field.fieldId) as any;
    }
}
@Deserializable("proxy", deserializeProxy)
export class ProxyField<T extends RefField> extends ObjectField {
    constructor();
    constructor(value: T);
    constructor(fieldId: string);
    constructor(value?: T | string) {
        super();
        if (typeof value === "string") {
            this.cache = DocServer.GetCachedRefField(value) as any;
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

    [ToScriptString]() {
        return "invalid";
    }
    [ToString]() {
        return "ProxyField";
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

    value(): T | undefined | FieldWaiting<T> {
        if (this.cache) {
            return this.cache;
        }
        if (this.failed) {
            return undefined;
        }
        if (!this.promise) {
            const cached = DocServer.GetCachedRefField(this.fieldId);
            if (cached !== undefined) {
                runInAction(() => this.cache = cached as any);
                return cached as any;
            }
            this.promise = DocServer.GetRefField(this.fieldId).then(action((field: any) => {
                this.promise = undefined;
                this.cache = field;
                if (field === undefined) this.failed = true;
                return field;
            }));
        }
        return this.promise as any;
    }
    promisedValue(): string { return !this.cache && !this.failed && !this.promise ? this.fieldId : ""; }
    setPromise(promise: any) {
        this.promise = promise;
    }
    @action
    setValue(field: any) {
        this.promise = undefined;
        this.cache = field;
        if (field === undefined) this.failed = true;
        return field;
    }
}

export namespace ProxyField {
    let useProxy = true;
    export function DisableProxyFields() {
        useProxy = false;
    }

    export function EnableProxyFields() {
        useProxy = true;
    }

    export function WithoutProxy<T>(fn: () => T) {
        DisableProxyFields();
        try {
            return fn();
        } finally {
            EnableProxyFields();
        }
    }

    export function initPlugin() {
        Plugins.addGetterPlugin((doc, _, value) => {
            if (useProxy && value instanceof ProxyField) {
                return { value: value.value() };
            }
        });
    }
}

function prefetchValue(proxy: PrefetchProxy<RefField>) {
    return proxy.value() as any;
}

@scriptingGlobal
@Deserializable("prefetch_proxy", prefetchValue)
export class PrefetchProxy<T extends RefField> extends ProxyField<T> {
}
