// import * as ts from "typescript"
let ts = (window as any).ts;
// // @ts-ignore
// import * as typescriptlib from '!!raw-loader!../../../node_modules/typescript/lib/lib.d.ts'
// // @ts-ignore
// import * as typescriptes5 from '!!raw-loader!../../../node_modules/typescript/lib/lib.es5.d.ts'

// @ts-ignore
import * as typescriptlib from '!!raw-loader!./type_decls.d';
import { Docs } from "../documents/Documents";
import { Doc, Field } from '../../new_fields/Doc';
import { ImageField, PdfField, VideoField, AudioField } from '../../new_fields/URLField';
import { List } from '../../new_fields/List';
import { RichTextField } from '../../new_fields/RichTextField';
import { ScriptField, ComputedField } from '../../fields/ScriptField';

export interface ScriptSucccess {
    success: true;
    result: any;
}

export interface ScriptError {
    success: false;
    error: any;
}

export type ScriptResult = ScriptSucccess | ScriptError;

export interface CompiledScript {
    readonly compiled: true;
    readonly originalScript: string;
    readonly options: Readonly<ScriptOptions>;
    run(args?: { [name: string]: any }): ScriptResult;
}

export interface CompileError {
    compiled: false;
    errors: any[];
}

export type CompileResult = CompiledScript | CompileError;

function Run(script: string | undefined, customParams: string[], diagnostics: any[], originalScript: string, options: ScriptOptions): CompileResult {
    const errors = diagnostics.some(diag => diag.category === ts.DiagnosticCategory.Error);
    if ((options.typecheck !== false && errors) || !script) {
        return { compiled: false, errors: diagnostics };
    }

    let fieldTypes = [Doc, ImageField, PdfField, VideoField, AudioField, List, RichTextField, ScriptField, ComputedField, CompileScript];
    let paramNames = ["Docs", ...fieldTypes.map(fn => fn.name)];
    let params: any[] = [Docs, ...fieldTypes];
    let compiledFunction = new Function(...paramNames, `return ${script}`);
    let { capturedVariables = {} } = options;
    let run = (args: { [name: string]: any } = {}): ScriptResult => {
        let argsArray: any[] = [];
        for (let name of customParams) {
            if (name === "this") {
                continue;
            }
            if (name in args) {
                argsArray.push(args[name]);
            } else {
                argsArray.push(capturedVariables[name]);
            }
        }
        let thisParam = args.this || capturedVariables.this;
        try {
            const result = compiledFunction.apply(thisParam, params).apply(thisParam, argsArray);
            return { success: true, result };
        } catch (error) {
            return { success: false, error };
        }
    };
    return { compiled: true, run, originalScript, options };
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
    capturedVariables?: { [name: string]: Field };
    typecheck?: boolean;
}

export function CompileScript(script: string, options: ScriptOptions = {}): CompileResult {
    const { requiredType = "", addReturn = false, params = {}, capturedVariables = {}, typecheck = true } = options;
    let host = new ScriptingCompilerHost;
    let paramNames: string[] = [];
    if ("this" in params || "this" in capturedVariables) {
        paramNames.push("this");
    }
    for (const key in params) {
        if (key === "this") continue;
        paramNames.push(key);
    }
    let paramList = paramNames.map(key => {
        const val = params[key];
        return `${key}: ${val}`;
    });
    for (const key in capturedVariables) {
        if (key === "this") continue;
        paramNames.push(key);
        paramList.push(`${key}: ${capturedVariables[key].constructor.name}`);
    }
    let paramString = paramList.join(", ");
    let funcScript = `(function(${paramString})${requiredType ? `: ${requiredType}` : ''} {
        ${addReturn ? `return ${script};` : script}
    })`;
    host.writeFile("file.ts", funcScript);
    if (typecheck) host.writeFile('node_modules/typescript/lib/lib.d.ts', typescriptlib);
    let program = ts.createProgram(["file.ts"], {}, host);
    let testResult = program.emit();
    let outputText = host.readFile("file.js");

    let diagnostics = ts.getPreEmitDiagnostics(program).concat(testResult.diagnostics);

    return Run(outputText, paramNames, diagnostics, script, options);
}