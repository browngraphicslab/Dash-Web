import { DragManager } from "./DragManager";
import { CollectionViewType } from "../views/collections/CollectionBaseView";
import { Doc, DocListCast } from "../../new_fields/Doc";
import { DocumentType } from "../documents/DocumentTypes";
import { ObjectField } from "../../new_fields/ObjectField";
import { StrCast } from "../../new_fields/Types";
import { Docs } from "../documents/Documents";
import { ScriptField } from "../../new_fields/ScriptField";


function makeTemplate(doc: Doc): boolean {
    let layoutDoc = doc.layout instanceof Doc && doc.layout.isTemplateField ? doc.layout : doc;
    let layout = StrCast(layoutDoc.layout).match(/fieldKey={"[^"]*"}/)![0];
    let fieldKey = layout.replace('fieldKey={"', "").replace(/"}$/, "");
    let docs = DocListCast(layoutDoc[fieldKey]);
    let any = false;
    docs.map(d => {
        if (!StrCast(d.title).startsWith("-")) {
            any = true;
            return Doc.MakeMetadataFieldTemplate(d, Doc.GetProto(layoutDoc));
        }
        if (d.type === DocumentType.COL) return makeTemplate(d);
        return false;
    });
    return any;
}
export function convertDropDataToButtons(data: DragManager.DocumentDragData) {
    data && data.draggedDocuments.map((doc, i) => {
        let dbox = doc;
        if (!doc.onDragStart && !doc.onClick && doc.viewType !== CollectionViewType.Linear) {
            let layoutDoc = doc.layout instanceof Doc && doc.layout.isTemplateField ? doc.layout : doc;
            if (layoutDoc.type === DocumentType.COL) {
                layoutDoc.isTemplateDoc = makeTemplate(layoutDoc);
            } else {
                layoutDoc.isTemplateDoc = (layoutDoc.type === DocumentType.TEXT || layoutDoc.layout instanceof Doc) && !data.userDropAction;
            }
            dbox = Docs.Create.FontIconDocument({ nativeWidth: 100, nativeHeight: 100, width: 100, height: 100, backgroundColor: StrCast(doc.backgroundColor), title: "Custom", icon: layoutDoc.isTemplateDoc ? "font" : "bolt" });
            dbox.dragFactory = layoutDoc;
            dbox.removeDropProperties = doc.removeDropProperties instanceof ObjectField ? ObjectField.MakeCopy(doc.removeDropProperties) : undefined;
            dbox.onDragStart = ScriptField.MakeFunction('getCopy(this.dragFactory, true)');
        } else if (doc.viewType === CollectionViewType.Linear) {
            dbox.ignoreClick = true;
        }
        data.droppedDocuments[i] = dbox;
    });
}
