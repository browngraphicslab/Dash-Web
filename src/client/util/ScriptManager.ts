import { Doc, DocListCast } from "../../fields/Doc";
import { List } from "../../fields/List";
import { Docs } from "../documents/Documents";
import { Scripting, ScriptParam } from "./Scripting";
import { StrCast, Cast } from "../../fields/Types";
import { listSpec } from "../../fields/Schema";
import { ScriptingBox } from "../views/nodes/ScriptingBox";


export class ScriptManager {

    private static _instance: ScriptManager;
    public static get Instance(): ScriptManager {
        return this._instance || (this._instance = new this());
    }
    private constructor() {
        ScriptingBox.DeleteScript = this.deleteScript;
        ScriptingBox.AddScript = this.addScript;
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
        const scriptList = ScriptManager.Instance.getAllScripts();
        scriptList.push(scriptDoc);
        if (ScriptManager.Instance.ScriptManagerDoc) {
            ScriptManager.Instance.ScriptManagerDoc.data = new List<Doc>(scriptList);
            return true;
        }
        return false;
    }

    public deleteScript(scriptDoc: Doc): boolean {

        if (scriptDoc.funcName) {
            Scripting.removeGlobal(StrCast(scriptDoc.funcName));
        }
        const scriptList = ScriptManager.Instance.getAllScripts();
        const index = ScriptManager.Instance.getAllScripts().indexOf(scriptDoc);
        if (index > -1) {
            scriptList.splice(index, 1);
            if (ScriptManager.Instance.ScriptManagerDoc) {
                ScriptManager.Instance.ScriptManagerDoc.data = new List<Doc>(scriptList);
                return true;
            }
        }
        return false;
    }
}

const scriptList = ScriptManager.Instance.getAllScripts();

scriptList.forEach((scriptDoc: Doc) => {

    const params = Cast(scriptDoc.compileParams, listSpec("string"), []);
    const p = params.reduce((o: ScriptParam, p: string) => { o[p] = "any"; return o; }, {} as ScriptParam);
    const f = new Function(...Array.from(Object.keys(p)), StrCast(scriptDoc.rawScript));

    let parameters = "(";
    params.forEach((element: string, i: number) => {
        if (i === params.length - 1) {
            parameters = parameters + element + ")";
        } else {
            parameters = parameters + element + ", ";
        }
    });

    if (parameters === "(") {
        Scripting.addGlobal(f, StrCast(scriptDoc.description), StrCast(scriptDoc.funcName));
    } else {
        Scripting.addGlobal(f, StrCast(scriptDoc.description), parameters, StrCast(scriptDoc.funcName));
    }

});