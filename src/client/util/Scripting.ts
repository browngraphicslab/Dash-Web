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
import * as typescriptlib from '!!raw-loader!./type_decls.d';
import { Documents } from "../documents/Documents";
import { Key } from "../../fields/Key";

export interface ScriptSucccess {
    success: true;
    result: any;
}

export interface ScriptError {
    success: false;
    error: any;
}

export type ScriptResult = ScriptSucccess | ScriptError;

export interface CompileSuccess {
    compiled: true;
    run(args?: { [name: string]: any }): ScriptResult;
}

export interface CompileError {
    compiled: false;
    errors: any[];
}

export type CompiledScript = CompileSuccess | CompileError;

function Run(script: string | undefined, customParams: string[], diagnostics: any[]): CompiledScript {
    const errors = diagnostics.some(diag => diag.category === ts.DiagnosticCategory.Error);
    if (errors || !script) {
        return { compiled: false, errors: diagnostics };
    }

    let fieldTypes = [Document, NumberField, TextField, ImageField, RichTextField, ListField, Key];
    let paramNames = ["KeyStore", "Documents", ...fieldTypes.map(fn => fn.name)];
    let params: any[] = [KeyStore, Documents, ...fieldTypes];
    let compiledFunction = new Function(...paramNames, `return ${script}`);
    let run = (args: { [name: string]: any } = {}): ScriptResult => {
        let argsArray: any[] = [];
        for (let name of customParams) {
            if (name === "this") {
                continue;
            }
            argsArray.push(args[name]);
        }
        let thisParam = args.this;
        try {
            const result = compiledFunction.apply(thisParam, params).apply(thisParam, argsArray);
            return { success: true, result };
        } catch (error) {
            return { success: false, error };
        }
    };
    return { compiled: true, run };
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
        return 'node_modules/typescript/lib/lib.d.ts'; // No idea what this means...
    }
    writeFile(fileName: string, content: string) {
        const file = this.files.find(file => file.fileName === fileName);
        if (file) {
            file.content = content;
        } else {
            this.files.push({ fileName, content });
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

export interface ScriptOptions {
    requiredType?: string;
    addReturn?: boolean;
    params?: { [name: string]: string };
}

export function CompileScript(script: string, { requiredType = "", addReturn = false, params = {} }: ScriptOptions = {}): CompiledScript {
    let host = new ScriptingCompilerHost;
    let paramArray: string[] = [];
    if ("this" in params) {
        paramArray.push("this");
    }
    for (const key in params) {
        if (key === "this") continue;
        paramArray.push(key);
    }
    let paramString = paramArray.map(key => `${key}: ${params[key]}`).join(", ");
    let funcScript = `(function(${paramString})${requiredType ? `: ${requiredType}` : ''} {
        ${addReturn ? `return ${script};` : script}
    })`;
    host.writeFile("file.ts", funcScript);
    host.writeFile('node_modules/typescript/lib/lib.d.ts', typescriptlib);
    let program = ts.createProgram(["file.ts"], {}, host);
    let testResult = program.emit();
    let outputText = host.readFile("file.js");

    let diagnostics = ts.getPreEmitDiagnostics(program).concat(testResult.diagnostics);

    return Run(outputText, paramArray, diagnostics);
}

export function OrLiteralType(returnType: string): string {
    return `${returnType} | string | number`;
}

export function ToField(data: any): Opt<Field> {
    if (typeof data === "string") {
        return new TextField(data);
    } else if (typeof data === "number") {
        return new NumberField(data);
    }
    return undefined;
}