import { Doc, DocListCast } from "../../fields/Doc";
import { List } from "../../fields/List";
import { Scripting } from "./Scripting";
import { StrCast, Cast } from "../../fields/Types";
import { listSpec } from "../../fields/Schema";
import { Docs } from "../documents/Documents";

export class ScriptManager {

    static _initialized = false;
    private static _instance: ScriptManager;
    public static get Instance(): ScriptManager {
        return this._instance || (this._instance = new this());
    }
    private constructor() {
        console.log("CONSTRUCTED");
        if (!ScriptManager._initialized) {
            ScriptManager._initialized = true;
            this.getAllScripts().forEach(scriptDoc => ScriptManager.addScriptToGlobals(scriptDoc));
        }
    }

    public get ScriptManagerDoc(): Doc | undefined {
        return Docs.Prototypes.MainScriptDocument();
    }
    public getAllScripts(): Doc[] {
        const sdoc = ScriptManager.Instance.ScriptManagerDoc;
        if (sdoc) {
            const docs = DocListCast(sdoc.data);
            return docs;
        }
        return [];
    }

    public addScript(scriptDoc: Doc): boolean {
        console.log("in add script method");

        const scriptList = this.getAllScripts();
        scriptList.push(scriptDoc);
        if (ScriptManager.Instance.ScriptManagerDoc) {
            ScriptManager.Instance.ScriptManagerDoc.data = new List<Doc>(scriptList);
            ScriptManager.addScriptToGlobals(scriptDoc);
            console.log("script added");
            return true;
        }
        return false;
    }

    public deleteScript(scriptDoc: Doc): boolean {

        console.log("in delete script method");

        if (scriptDoc.functionName) {
            Scripting.removeGlobal(StrCast(scriptDoc.functionName));
        }
        const scriptList = this.getAllScripts();
        const index = scriptList.indexOf(scriptDoc);
        if (index > -1) {
            scriptList.splice(index, 1);
            if (ScriptManager.Instance.ScriptManagerDoc) {
                ScriptManager.Instance.ScriptManagerDoc.data = new List<Doc>(scriptList);
                return true;
            }
        }
        return false;
    }

    public static addScriptToGlobals(scriptDoc: Doc): void {

        Scripting.removeGlobal(StrCast(scriptDoc.functionName));

        const params = Cast(scriptDoc.compileParams, listSpec("string"), []);
        const paramNames = params.reduce((o: string, p: string) => {
            if (params.indexOf(p) === params.length - 1) {
                o = o + p.split(":")[0].trim();
            } else {
                o = o + p.split(":")[0].trim() + ",";
            }
            return o;
        }, "" as string);

        const f = new Function(paramNames, StrCast(scriptDoc.rawScript));

        Object.defineProperty(f, 'name', { value: StrCast(scriptDoc.functionName), writable: false });

        let parameters = "(";
        params.forEach((element: string, i: number) => {
            if (i === params.length - 1) {
                parameters = parameters + element + ")";
            } else {
                parameters = parameters + element + ", ";
            }
        });

        if (parameters === "(") {
            Scripting.addGlobal(f, StrCast(scriptDoc.functionDescription));
        } else {
            Scripting.addGlobal(f, StrCast(scriptDoc.functionDescription), parameters);
        }
    }
}