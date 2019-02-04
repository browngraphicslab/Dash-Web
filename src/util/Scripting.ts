import * as ts from "typescript"
import { Opt, Field } from "../fields/Field";

export class ExecutableScript extends Function {
}

export function CompileScript(script: string): ExecutableScript {
    let result = ts.transpileModule(script, {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS
        }
    })
    console.log(result.outputText);

    return () => { };
}