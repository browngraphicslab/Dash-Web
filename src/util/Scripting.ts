// import * as ts from "typescript"
let ts = (window as any).ts;
import { Opt, Field, FieldWaiting } from "../fields/Field";
import { Document as DocumentImport } from "../fields/Document";
import { NumberField as NumberFieldImport } from "../fields/NumberField";
import { TextField as TextFieldImport } from "../fields/TextField";
import { RichTextField as RichTextFieldImport } from "../fields/RichTextField";
import { KeyStore as KeyStoreImport } from "../fields/Key";

export interface ExecutableScript {
    (): any;

    compiled: boolean;
}

function ExecScript(script: string, diagnostics: Opt<any[]>): ExecutableScript {
    const compiled = !(diagnostics && diagnostics != FieldWaiting && diagnostics.some(diag => diag.category == ts.DiagnosticCategory.Error));

    let func: () => Opt<Field>;
    if (compiled) {
        func = function (): Opt<Field> {
            let KeyStore = KeyStoreImport;
            let Document = DocumentImport;
            let NumberField = NumberFieldImport;
            let TextField = TextFieldImport;
            let RichTextField = RichTextFieldImport;
            let window = undefined;
            let document = undefined;
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