import { DragManager } from "./DragManager";
import { Doc, DocListCast } from "../../new_fields/Doc";
import { DocumentType } from "../documents/DocumentTypes";
import { ObjectField } from "../../new_fields/ObjectField";
import { StrCast } from "../../new_fields/Types";
import { Docs } from "../documents/Documents";
import { ScriptField, ComputedField } from "../../new_fields/ScriptField";
import { RichTextField } from "../../new_fields/RichTextField";

export function makeTemplate(doc: Doc): boolean {
    const layoutDoc = doc.layout instanceof Doc && doc.layout.isTemplateForField ? doc.layout : doc;
    const layout = StrCast(layoutDoc.layout).match(/fieldKey={'[^']*'}/)![0];
    const fieldKey = layout.replace("fieldKey={'", "").replace(/'}$/, "");
    const docs = DocListCast(layoutDoc[fieldKey]);
    let any = false;
    docs.forEach(d => {
        if (!StrCast(d.title).startsWith("-")) {
            any = Doc.MakeMetadataFieldTemplate(d, Doc.GetProto(layoutDoc)) || any;
        } else if (d.type === DocumentType.COL || d.data instanceof RichTextField) {
            any = makeTemplate(d) || any;
        }
    });
    if (layoutDoc[fieldKey] instanceof RichTextField) {
        if (!StrCast(layoutDoc.title).startsWith("-")) {
            any = Doc.MakeMetadataFieldTemplate(layoutDoc, Doc.GetProto(layoutDoc));
        }
    }
    return any;
}
export function convertDropDataToButtons(data: DragManager.DocumentDragData) {
    data && data.draggedDocuments.map((doc, i) => {
        let dbox = doc;
        // bcz: isButtonBar is intended to allow a collection of linear buttons to be dropped and nested into another collection of buttons... it's not being used yet, and isn't very elegant
        if (!doc.onDragStart && !doc.onClick && !doc.isButtonBar) {
            const layoutDoc = doc.layout instanceof Doc && doc.layout.isTemplateForField ? doc.layout : doc;
            if (layoutDoc.type === DocumentType.COL || layoutDoc.type === DocumentType.TEXT) {
                layoutDoc.isTemplateDoc = makeTemplate(layoutDoc);
            } else {
                layoutDoc.isTemplateDoc = (layoutDoc.layout instanceof Doc) && !data.userDropAction;
            }
            dbox = Docs.Create.FontIconDocument({ _nativeWidth: 100, _nativeHeight: 100, _width: 100, _height: 100, backgroundColor: StrCast(doc.backgroundColor), title: "Custom", icon: layoutDoc.isTemplateDoc ? "font" : "bolt" });
            dbox.dragFactory = layoutDoc;
            dbox.removeDropProperties = doc.removeDropProperties instanceof ObjectField ? ObjectField.MakeCopy(doc.removeDropProperties) : undefined;
            dbox.onDragStart = ScriptField.MakeFunction('getCopy(this.dragFactory, true)');
        } else if (doc.isButtonBar) {
            dbox.ignoreClick = true;
        }
        data.droppedDocuments[i] = dbox;
    });
}
