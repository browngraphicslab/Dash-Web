import * as ts from "typescript";
export { ts };
// export const ts = (window as any).ts;

// // @ts-ignore
// import * as typescriptlib from '!!raw-loader!../../../node_modules/typescript/lib/lib.d.ts'
// // @ts-ignore
// import * as typescriptes5 from '!!raw-loader!../../../node_modules/typescript/lib/lib.es5.d.ts'

// @ts-ignore
import * as typescriptlib from '!!raw-loader!./type_decls.d';
import { Doc, Field } from '../../new_fields/Doc';

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

export namespace Scripting {
    export function addGlobal(global: { name: string }): void;
    export function addGlobal(name: string, global: any): void;
    export function addGlobal(nameOrGlobal: any, global?: any) {
        let n: string;
        let obj: any;
        if (global !== undefined && typeof nameOrGlobal === "string") {
            n = nameOrGlobal;
            obj = global;
        } else if (nameOrGlobal && typeof nameOrGlobal.name === "string") {
            n = nameOrGlobal.name;
            obj = nameOrGlobal;
        } else {
            throw new Error("Must either register an object with a name, or give a name and an object");
        }
        if (scriptingGlobals.hasOwnProperty(n)) {
            throw new Error(`Global with name ${n} is already registered, choose another name`);
        }
        scriptingGlobals[n] = obj;
    }

    export function makeMutableGlobalsCopy(globals?: { [name: string]: any }) {
        return { ..._scriptingGlobals, ...(globals || {}) };
    }

    export function setScriptingGlobals(globals: { [key: string]: any }) {
        scriptingGlobals = globals;
    }

    export function resetScriptingGlobals() {
        scriptingGlobals = _scriptingGlobals;
    }

    // const types = Object.keys(ts.SyntaxKind).map(kind => ts.SyntaxKind[kind]);
    export function printNodeType(node: any, indentation = "") {
        console.log(indentation + ts.SyntaxKind[node.kind]);
    }

    export function getGlobals() {
        return Object.keys(scriptingGlobals);
    }
}

export function scriptingGlobal(constructor: { new(...args: any[]): any }) {
    Scripting.addGlobal(constructor);
}

const _scriptingGlobals: { [name: string]: any } = {};
let scriptingGlobals: { [name: string]: any } = _scriptingGlobals;

function Run(script: string | undefined, customParams: string[], diagnostics: any[], originalScript: string, options: ScriptOptions): CompileResult {
    const errors = diagnostics.some(diag => diag.category === ts.DiagnosticCategory.Error);
    if ((options.typecheck !== false && errors) || !script) {
        return { compiled: false, errors: diagnostics };
    }

    let paramNames = Object.keys(scriptingGlobals);
    let params = paramNames.map(key => scriptingGlobals[key]);
    // let fieldTypes = [Doc, ImageField, PdfField, VideoField, AudioField, List, RichTextField, ScriptField, ComputedField, CompileScript];
    // let paramNames = ["Docs", ...fieldTypes.map(fn => fn.name)];
    // let params: any[] = [Docs, ...fieldTypes];
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
        let batch: { end(): void } | undefined = undefined;
        try {
            if (!options.editable) {
                batch = Doc.MakeReadOnly();
            }
            const result = compiledFunction.apply(thisParam, params).apply(thisParam, argsArray);
            if (batch) {
                batch.end();
            }
            return { success: true, result };
        } catch (error) {
            if (batch) {
                batch.end();
            }
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

export type Traverser = (node: ts.Node, indentation: string) => boolean | void;
export type TraverserParam = Traverser | { onEnter: Traverser, onLeave: Traverser };
export interface ScriptOptions {
    requiredType?: string;
    addReturn?: boolean;
    params?: { [name: string]: string };
    capturedVariables?: { [name: string]: Field };
    typecheck?: boolean;
    editable?: boolean;
    traverser?: TraverserParam;
    transformer?: ts.TransformerFactory<ts.SourceFile>;
    globals?: { [name: string]: any };
}

// function forEachNode(node:ts.Node, fn:(node:any) => void);
function forEachNode(node: ts.Node, onEnter: Traverser, onExit?: Traverser, indentation = "") {
    return onEnter(node, indentation) || ts.forEachChild(node, (n: any) => {
        forEachNode(n, onEnter, onExit, indentation + "    ");
    }) || (onExit && onExit(node, indentation));
}

export function CompileScript(script: string, options: ScriptOptions = {}): CompileResult {
    const { requiredType = "", addReturn = false, params = {}, capturedVariables = {}, typecheck = true } = options;
    if (options.globals) {
        Scripting.setScriptingGlobals(options.globals);
    }
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
    if (options.traverser) {
        const sourceFile = ts.createSourceFile('script.ts', script, ts.ScriptTarget.ES2015, true);
        const onEnter = typeof options.traverser === "object" ? options.traverser.onEnter : options.traverser;
        const onLeave = typeof options.traverser === "object" ? options.traverser.onLeave : undefined;
        forEachNode(sourceFile, onEnter, onLeave);
    }
    if (options.transformer) {
        const sourceFile = ts.createSourceFile('script.ts', script, ts.ScriptTarget.ES2015, true);
        const result = ts.transform(sourceFile, [options.transformer]);
        const transformed = result.transformed;
        const printer = ts.createPrinter({
            newLine: ts.NewLineKind.LineFeed
        });
        script = printer.printFile(transformed[0]);
        result.dispose();
    }
    let funcScript = `(function(${paramString})${requiredType ? `: ${requiredType}` : ''} {
        ${addReturn ? `return ${script};` : script}
    })`;
    host.writeFile("file.ts", funcScript);

    if (typecheck) host.writeFile('node_modules/typescript/lib/lib.d.ts', typescriptlib);
    let program = ts.createProgram(["file.ts"], {}, host);
    let testResult = program.emit();
    let outputText = host.readFile("file.js");

    let diagnostics = ts.getPreEmitDiagnostics(program).concat(testResult.diagnostics);

    const result = Run(outputText, paramNames, diagnostics, script, options);

    if (options.globals) {
        Scripting.resetScriptingGlobals();
    }
    return result;
}

Scripting.addGlobal(CompileScript);