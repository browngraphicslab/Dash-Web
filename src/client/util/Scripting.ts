// import * as ts from "typescript"
let ts = (window as any).ts;
import { Opt, Field } from "../../fields/Field";
import { Document } from "../../fields/Document";
import { NumberField } from "../../fields/NumberField";
import { ImageField } from "../../fields/ImageField";
import { TextField } from "../../fields/TextField";
import { RichTextField } from "../../fields/RichTextField";
import { KeyStore } from "../../fields/KeyStore";
import { ListField } from "../../fields/ListField";
// // @ts-ignore
// import * as typescriptlib from '!!raw-loader!../../../node_modules/typescript/lib/lib.d.ts'
// // @ts-ignore
// import * as typescriptes5 from '!!raw-loader!../../../node_modules/typescript/lib/lib.es5.d.ts'

// @ts-ignore
import * as typescriptlib from '!!raw-loader!./type_decls.d'
import { Documents } from "../documents/Documents";
import { Key } from "../../fields/Key";


export interface ExecutableScript {
    (): any;

    compiled: boolean;
}

function Compile(script: string | undefined, diagnostics: Opt<any[]>, scope: { [name: string]: any }): ExecutableScript {
    const compiled = !(diagnostics && diagnostics.some(diag => diag.category === ts.DiagnosticCategory.Error));

    let func: () => Opt<Field>;
    if (compiled && script) {
        let fieldTypes = [Document, NumberField, TextField, ImageField, RichTextField, ListField, Key];
        let paramNames = ["KeyStore", "Documents", ...fieldTypes.map(fn => fn.name)];
        let params: any[] = [KeyStore, Documents, ...fieldTypes]
        for (let prop in scope) {
            if (prop === "this") {
                continue;
            }
            paramNames.push(prop);
            params.push(scope[prop]);
        }
        let thisParam = scope.this;
        let compiledFunction = new Function(...paramNames, script);
        func = function (): Opt<Field> {
            return compiledFunction.apply(thisParam, params)
        };
    } else {
        func = () => undefined;
    }

    Object.assign(func, { compiled });
    return func as ExecutableScript;
}

interface File {
    fileName: string;
    content: string;
}

// class ScriptingCompilerHost implements ts.CompilerHost {
class ScriptingCompilerHost {
    files: File[] = [];

    // getSourceFile(fileName: string, languageVersion: ts.ScriptTarget, onError?: ((message: string) => void) | undefined, shouldCreateNewSourceFile?: boolean | undefined): ts.SourceFile | undefined {
    getSourceFile(fileName: string, languageVersion: any, onError?: ((message: string) => void) | undefined, shouldCreateNewSourceFile?: boolean | undefined): any | undefined {
        let contents = this.readFile(fileName);
        if (contents !== undefined) {
            return ts.createSourceFile(fileName, contents, languageVersion, true);
        }
        return undefined;
    }
    // getDefaultLibFileName(options: ts.CompilerOptions): string {
    getDefaultLibFileName(options: any): string {
        return 'node_modules/typescript/lib/lib.d.ts' // No idea what this means...
    }
    writeFile(fileName: string, content: string) {
        const file = this.files.find(file => file.fileName === fileName);
        if (file) {
            file.content = content;
        } else {
            this.files.push({ fileName, content })
        }
    }
    getCurrentDirectory(): string {
        return '';
    }
    getCanonicalFileName(fileName: string): string {
        return this.useCaseSensitiveFileNames() ? fileName : fileName.toLowerCase();
    }
    useCaseSensitiveFileNames(): boolean {
        return true;
    }
    getNewLine(): string {
        return '\n';
    }
    fileExists(fileName: string): boolean {
        return this.files.some(file => file.fileName === fileName);
    }
    readFile(fileName: string): string | undefined {
        let file = this.files.find(file => file.fileName === fileName);
        if (file) {
            return file.content;
        }
        return undefined;
    }
}

export function CompileScript(script: string, scope?: { [name: string]: any }, addReturn: boolean = false): ExecutableScript {
    let host = new ScriptingCompilerHost;
    let funcScript = `(function() {
        ${addReturn ? `return ${script};` : script}
    }).apply(this)`
    host.writeFile("file.ts", funcScript);
    host.writeFile('node_modules/typescript/lib/lib.d.ts', typescriptlib);
    let program = ts.createProgram(["file.ts"], {}, host);
    let testResult = program.emit();
    let outputText = "return " + host.readFile("file.js");

    let diagnostics = ts.getPreEmitDiagnostics(program).concat(testResult.diagnostics);

    return Compile(outputText, diagnostics, scope || {});
}

export function ToField(data: any): Opt<Field> {
    if (typeof data === "string") {
        return new TextField(data);
    } else if (typeof data === "number") {
        return new NumberField(data);
    }
    return undefined;
}