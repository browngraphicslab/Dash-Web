import { DragManager } from "./DragManager";
import { Doc, DocListCast, Opt } from "../../new_fields/Doc";
import { DocumentType } from "../documents/DocumentTypes";
import { ObjectField } from "../../new_fields/ObjectField";
import { StrCast } from "../../new_fields/Types";
import { Docs } from "../documents/Documents";
import { ScriptField, ComputedField } from "../../new_fields/ScriptField";
import { RichTextField } from "../../new_fields/RichTextField";
import { ImageField } from "../../new_fields/URLField";

// 
// converts 'doc' into a template that can be used to render other documents.
// the title of doc is used to determine which field is being templated, so
// passing a value for 'rename' allows the doc to be given a meangingful name 
// after it has been converted to
export function makeTemplate(doc: Doc, first: boolean = true, rename: Opt<string> = undefined): boolean {
    const layoutDoc = doc.layout instanceof Doc && doc.layout.isTemplateForField ? doc.layout : doc;
    if (layoutDoc.layout instanceof Doc) { // its already a template
        return true;
    }
    const layout = StrCast(layoutDoc.layout).match(/fieldKey={'[^']*'}/)![0];
    const fieldKey = layout.replace("fieldKey={'", "").replace(/'}$/, "");
    const docs = DocListCast(layoutDoc[fieldKey]);
    let any = false;
    docs.forEach(d => {
        if (!StrCast(d.title).startsWith("-")) {
            const params = StrCast(d.title).match(/\(([a-zA-Z0-9._\-]*)\)/)?.[1].replace("()", "");
            if (params) {
                any = makeTemplate(d, false) || any;
                d.PARAMS = params;
            } else {
                any = Doc.MakeMetadataFieldTemplate(d, Doc.GetProto(layoutDoc)) || any;
            }
        } else if (d.type === DocumentType.COL || d.data instanceof RichTextField) {
            any = makeTemplate(d, false) || any;
        }
    });
    if (first) {
        if (docs.length) { // bcz: feels hacky : if the root level document has items, it's not a field template, but we still want its caption to be a textTemplate
            if (doc.caption instanceof RichTextField && !doc.caption.Empty()) {
                doc["caption-textTemplate"] = ComputedField.MakeFunction(`copyField(this.caption)`);
            }
        } else {
            any = Doc.MakeMetadataFieldTemplate(doc, Doc.GetProto(layoutDoc)) || any;
        }
    }
    if (layoutDoc[fieldKey] instanceof RichTextField || layoutDoc[fieldKey] instanceof ImageField) {
        if (!StrCast(layoutDoc.title).startsWith("-")) {
            any = Doc.MakeMetadataFieldTemplate(layoutDoc, Doc.GetProto(layoutDoc));
        }
    }
    rename && (doc.title = rename);
    return any;
}
export function convertDropDataToButtons(data: DragManager.DocumentDragData) {
    data && data.draggedDocuments.map((doc, i) => {
        let dbox = doc;
        // bcz: isButtonBar is intended to allow a collection of linear buttons to be dropped and nested into another collection of buttons... it's not being used yet, and isn't very elegant
        if (!doc.onDragStart && !doc.isButtonBar) {
            const layoutDoc = doc.layout instanceof Doc && doc.layout.isTemplateForField ? doc.layout : doc;
            if (layoutDoc.type !== DocumentType.FONTICON) {
                !layoutDoc.isTemplateDoc && makeTemplate(layoutDoc);
            }
            layoutDoc.isTemplateDoc = true;
            dbox = Docs.Create.FontIconDocument({
                _nativeWidth: 100, _nativeHeight: 100, _width: 100, _height: 100,
                backgroundColor: StrCast(doc.backgroundColor), title: StrCast(layoutDoc.title), icon: layoutDoc.isTemplateDoc ? "font" : "bolt"
            });
            dbox.dragFactory = layoutDoc;
            dbox.removeDropProperties = doc.removeDropProperties instanceof ObjectField ? ObjectField.MakeCopy(doc.removeDropProperties) : undefined;
            dbox.onDragStart = ScriptField.MakeFunction('makeDelegate(this.dragFactory)');
        } else if (doc.isButtonBar) {
            dbox.ignoreClick = true;
        }
        data.droppedDocuments[i] = dbox;
    });
}
