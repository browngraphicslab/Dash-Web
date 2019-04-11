import { Field, FieldId } from "./Field";
import { Types } from "../server/Message";
import { CompileScript, ScriptOptions, CompiledScript } from "../client/util/Scripting";
import { Server } from "../client/Server";
import { Without } from "../Utils";

export interface SerializableOptions extends Without<ScriptOptions, "capturedVariables"> {
    capturedIds: { [id: string]: string };
}

export interface ScriptData {
    script: string;
    options: SerializableOptions;
}

export class ScriptField extends Field {
    private _script?: CompiledScript;
    get script(): CompiledScript {
        return this._script!;
    }
    private options?: ScriptData;

    constructor(script?: CompiledScript, id?: FieldId, save: boolean = true) {
        super(id);

        this._script = script;

        if (save) {
            Server.UpdateField(this);
        }
    }

    ToScriptString() {
        return "new ScriptField(...)";
    }

    GetValue() {
        return this.script;
    }

    TrySetValue(): boolean {
        throw new Error("Script fields currently can't be modified");
    }

    UpdateFromServer() {
        throw new Error("Script fields currently can't be updated");
    }

    static FromJson(id: string, data: ScriptData): ScriptField {
        let field = new ScriptField(undefined, id, false);
        field.options = data;
        return field;
    }

    init(callback: (res: Field) => any) {
        const options = this.options!;
        const keys = Object.keys(options.options.capturedIds);
        Server.GetFields(keys).then(fields => {
            let captured: { [name: string]: Field } = {};
            keys.forEach(key => captured[options.options.capturedIds[key]] = fields[key]);
            const opts: ScriptOptions = {
                addReturn: options.options.addReturn,
                params: options.options.params,
                requiredType: options.options.requiredType,
                capturedVariables: captured
            };
            const script = CompileScript(options.script, opts);
            if (!script.compiled) {
                throw new Error("Can't compile script");
            }
            this._script = script;
            callback(this);
        });
    }

    ToJson(): { _id: string, type: Types, data: ScriptData } {
        const { options, originalScript } = this.script;
        let capturedIds: { [id: string]: string } = {};
        for (const capt in options.capturedVariables) {
            capturedIds[options.capturedVariables[capt].Id] = capt;
        }
        const opts: SerializableOptions = {
            ...options,
            capturedIds
        };
        delete (opts as any).capturedVariables;
        return {
            _id: this.Id,
            type: Types.Script,
            data: {
                script: originalScript,
                options: opts,
            },
        };
    }

    Copy(): Field {
        //Script fields are currently immutable, so we can fake copy them
        return this;
    }
}