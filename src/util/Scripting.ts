// import * as ts from "typescript"
import { Opt, Field } from "../fields/Field";
import { Document } from "../fields/Document";
import { NumberField } from "../fields/NumberField";
import { KeyStore } from "../fields/Key";

export interface ExecutableScript {
    (): any;

    compiled: boolean;
}

function ExecScript(script: string, diagnostics: Opt<any[]>): ExecutableScript {
    const compiled = !(diagnostics && diagnostics.some(diag => diag.category == 1));

    let func: () => Opt<Field>;
    if (compiled) {
        func = function (): Opt<Field> {
            let window = undefined;
            let document = undefined;
            let KS = KeyStore;
            let retVal = eval(script);

            return retVal;
        };
    } else {
        func = () => undefined;
    }

    return Object.assign(func,
        {
            compiled
        });
}

export function CompileScript(script: string): ExecutableScript {
    let result = (window as any).ts.transpileModule(script, {})

    return ExecScript(result.outputText, result.diagnostics);
}