import { ObjectField } from "./ObjectField";
import { CompiledScript, CompileScript, scriptingGlobal, ScriptOptions, CompileError, CompileResult } from "../client/util/Scripting";
import { Copy, ToScriptString, ToString, Parent, SelfProxy } from "./FieldSymbols";
import { serializable, createSimpleSchema, map, primitive, object, deserialize, PropSchema, custom, SKIP } from "serializr";
import { Deserializable, autoObject } from "../client/util/SerializationHelper";
import { Doc, Field } from "../new_fields/Doc";
import { Plugins, setter } from "./util";
import { computedFn } from "mobx-utils";
import { ProxyField } from "./Proxy";
import { Cast } from "./Types";

function optional(propSchema: PropSchema) {
    return custom(value => {
        if (value !== undefined) {
            return propSchema.serializer(value);
        }
        return SKIP;
    }, (jsonValue: any, context: any, oldValue: any, callback: (err: any, result: any) => void) => {
        if (jsonValue !== undefined) {
            return propSchema.deserializer(jsonValue, callback, context, oldValue);
        }
        return SKIP;
    });
}

const optionsSchema = createSimpleSchema({
    requiredType: true,
    addReturn: true,
    typecheck: true,
    editable: true,
    readonly: true,
    params: optional(map(primitive()))
});

const scriptSchema = createSimpleSchema({
    options: object(optionsSchema),
    originalScript: true
});

async function deserializeScript(script: ScriptField) {
    const captures: ProxyField<Doc> = (script as any).captures;
    if (captures) {
        const doc = (await captures.value())!;
        const captured: any = {};
        const keys = Object.keys(doc);
        const vals = await Promise.all(keys.map(key => doc[key]) as any);
        keys.forEach((key, i) => captured[key] = vals[i]);
        (script.script.options as any).capturedVariables = captured;
    }
    const comp = CompileScript(script.script.originalScript, script.script.options);
    if (!comp.compiled) {
        throw new Error("Couldn't compile loaded script");
    }
    (script as any).script = comp;
}

@scriptingGlobal
@Deserializable("script", deserializeScript)
export class ScriptField extends ObjectField {
    @serializable(object(scriptSchema))
    readonly script: CompiledScript;
    @serializable(object(scriptSchema))
    readonly setterscript: CompiledScript | undefined;

    @serializable(autoObject())
    private captures?: ProxyField<Doc>;

    constructor(script: CompiledScript, setterscript?: CompileResult) {
        super();

        if (script?.options.capturedVariables) {
            const doc = Doc.assign(new Doc, script.options.capturedVariables);
            this.captures = new ProxyField(doc);
        }
        this.setterscript = setterscript?.compiled ? setterscript : undefined;
        this.script = script;
    }

    //     init(callback: (res: Field) => any) {
    //         const options = this.options!;
    //         const keys = Object.keys(options.options.capturedIds);
    //         Server.GetFields(keys).then(fields => {
    //             let captured: { [name: string]: Field } = {};
    //             keys.forEach(key => captured[options.options.capturedIds[key]] = fields[key]);
    //             const opts: ScriptOptions = {
    //                 addReturn: options.options.addReturn,
    //                 params: options.options.params,
    //                 requiredType: options.options.requiredType,
    //                 capturedVariables: captured
    //             };
    //             const script = CompileScript(options.script, opts);
    //             if (!script.compiled) {
    //                 throw new Error("Can't compile script");
    //             }
    //             this._script = script;
    //             callback(this);
    //         });
    //     }

    [Copy](): ObjectField {
        return new ScriptField(this.script);
    }
    toString() {
        return `${this.script.originalScript}`;
    }

    [ToScriptString]() {
        return "script field";
    }
    [ToString]() {
        return this.script.originalScript;
    }
    public static CompileScript(script: string, params: object = {}, addReturn = false, capturedVariables?: { [name: string]: Field }) {
        const compiled = CompileScript(script, {
            params: { this: Doc.name, self: Doc.name, _last_: "any", ...params },
            typecheck: false,
            editable: true,
            addReturn: addReturn,
            capturedVariables
        });
        return compiled;
    }
    public static MakeFunction(script: string, params: object = {}, capturedVariables?: { [name: string]: Field }) {
        const compiled = ScriptField.CompileScript(script, params, true, capturedVariables);
        return compiled.compiled ? new ScriptField(compiled) : undefined;
    }

    public static MakeScript(script: string, params: object = {}, capturedVariables?: { [name: string]: Field }) {
        const compiled = ScriptField.CompileScript(script, params, false, capturedVariables);
        return compiled.compiled ? new ScriptField(compiled) : undefined;
    }
}

@scriptingGlobal
@Deserializable("computed", deserializeScript)
export class ComputedField extends ScriptField {
    _lastComputedResult: any;
    //TODO maybe add an observable cache based on what is passed in for doc, considering there shouldn't really be that many possible values for doc
    value = computedFn((doc: Doc) => this._valueOutsideReaction(doc));
    _valueOutsideReaction = (doc: Doc) => this._lastComputedResult = this.script.run({ this: doc, self: Cast(doc.rootDocument, Doc, null) || doc, _last_: this._lastComputedResult }, console.log).result;


    constructor(script: CompiledScript, setterscript?: CompiledScript) {
        super(script,
            !setterscript && script?.originalScript.includes("self.timecode") ?
                ScriptField.CompileScript("self['x' + self.timecode] = value", { value: "any" }, true) : setterscript);
    }

    public static MakeScript(script: string, params: object = {}) {
        const compiled = ScriptField.CompileScript(script, params, false);
        return compiled.compiled ? new ComputedField(compiled) : undefined;
    }
    public static MakeFunction(script: string, params: object = {}, capturedVariables?: { [name: string]: Field }, setterScript?: string) {
        const compiled = ScriptField.CompileScript(script, params, true, capturedVariables);
        const setCompiled = setterScript ? ScriptField.CompileScript(setterScript, params, true, capturedVariables) : undefined;
        return compiled.compiled ? new ComputedField(compiled, setCompiled?.compiled ? setCompiled : undefined) : undefined;
    }
    public static MakeInterpolated(fieldKey: string, interpolatorKey: string) {
        const getField = ScriptField.CompileScript(`(self['${fieldKey}-indexed'])[self.${interpolatorKey}]`, {}, true, {});
        const setField = ScriptField.CompileScript(`(self['${fieldKey}-indexed'])[self.${interpolatorKey}] = value`, { value: "any" }, true, {});
        return getField.compiled ? new ComputedField(getField, setField?.compiled ? setField : undefined) : undefined;
    }
}

export namespace ComputedField {
    let useComputed = true;
    export function DisableComputedFields() {
        useComputed = false;
    }

    export function EnableComputedFields() {
        useComputed = true;
    }

    export const undefined = "__undefined";

    export function WithoutComputed<T>(fn: () => T) {
        DisableComputedFields();
        try {
            return fn();
        } finally {
            EnableComputedFields();
        }
    }

    export function initPlugin() {
        Plugins.addGetterPlugin((doc, _, value) => {
            if (useComputed && value instanceof ComputedField) {
                return { value: value._valueOutsideReaction(doc), shouldReturn: true };
            }
        });
    }
}