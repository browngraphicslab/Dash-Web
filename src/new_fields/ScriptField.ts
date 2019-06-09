import { ObjectField } from "./ObjectField";
import { CompiledScript, CompileScript } from "../client/util/Scripting";
import { Copy, ToScriptString, Parent, SelfProxy } from "./FieldSymbols";
import { serializable, createSimpleSchema, map, primitive, object, deserialize, PropSchema, custom, SKIP } from "serializr";
import { Deserializable } from "../client/util/SerializationHelper";
import { computed } from "mobx";

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
    params: optional(map(primitive()))
});

const scriptSchema = createSimpleSchema({
    options: object(optionsSchema),
    originalScript: true
});

function deserializeScript(script: ScriptField) {
    const comp = CompileScript(script.script.originalScript, script.script.options);
    if (!comp.compiled) {
        throw new Error("Couldn't compile loaded script");
    }
    (script as any).script = comp;
}

@Deserializable("script", deserializeScript)
export class ScriptField extends ObjectField {
    @serializable(object(scriptSchema))
    readonly script: CompiledScript;

    constructor(script: CompiledScript) {
        super();

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

    [ToScriptString]() {
        return "script field";
    }
}

@Deserializable("computed", deserializeScript)
export class ComputedField extends ScriptField {
    @computed
    get value() {
        const val = this.script.run({ this: this[Parent] });
        if (val.success) {
            return val.result;
        }
        return undefined;
    }
}