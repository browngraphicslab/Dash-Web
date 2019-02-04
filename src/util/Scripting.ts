import * as ts from "typescript"
import { Opt, Field } from "../fields/Field";

export interface ExecutableScript {
    (): any;

    compiled: boolean;
}

function ExecScript(script: string, diagnostics: Opt<ts.Diagnostic[]>): ExecutableScript {
    const compiled = !(diagnostics && diagnostics.some(diag => diag.category == ts.DiagnosticCategory.Error));

    let func: () => Opt<Field>;
    if (compiled) {
        func = function (): Opt<Field> {
            let window = undefined;
            let document = undefined;
            let retVal = eval.call(undefined, script);

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
    let result = ts.transpileModule(script, {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS
        }
    })

    return ExecScript(result.outputText, result.diagnostics);
}