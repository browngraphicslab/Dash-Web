import { Field, FieldId } from "./Field";
import { Types } from "../server/Message";
import { CompileScript, ScriptOptions, CompiledScript } from "../client/util/Scripting";
import { Server } from "../client/Server";

export interface ScriptData {
    script: string;
    options: ScriptOptions;
}

export class ScriptField extends Field {
    readonly script: CompiledScript;

    constructor(script: CompiledScript, id?: FieldId, save: boolean = true) {
        super(id);

        this.script = script;

        if (save) {
            Server.UpdateField(this);
        }
    }

    static FromJson(id: string, data: ScriptData): ScriptField {
        const script = CompileScript(data.script, data.options);
        if (!script.compiled) {
            throw new Error("Can't compile script");
        }
        return new ScriptField(script, id, false);
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

    ToJson(): { _id: string, type: Types, data: ScriptData } {
        const { options, originalScript } = this.script;
        return {
            _id: this.Id,
            type: Types.Script,
            data: {
                script: originalScript,
                options
            },
        };
    }

    Copy(): Field {
        //Script fields are currently immutable, so we can fake copy them
        return this;
    }
}