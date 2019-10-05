import { Doc, DocListCast, DocListCastAsync, Opt } from "../../../new_fields/Doc";
import { ImageField } from "../../../new_fields/URLField";
import { Cast, StrCast } from "../../../new_fields/Types";
import { RouteStore } from "../../../server/RouteStore";
import { Docs } from "../../documents/Documents";
import { Identified } from "../../Network";
import { Id } from "../../../new_fields/FieldSymbols";
import { Utils } from "../../../Utils";

export namespace ImageUtils {

    export const ExtractExif = async (document: Doc): Promise<boolean> => {
        const field = Cast(document.data, ImageField);
        if (!field) {
            return false;
        }
        const source = field.url.href;
        const response = await Identified.PostToServer(RouteStore.inspectImage, { source });
        const { error, data } = response.exifData;
        document.exif = error || Docs.Get.DocumentHierarchyFromJson(data);
        return data !== undefined;
    };

    export type Hierarchy = { [id: string]: string | Hierarchy };

    export const ExportHierarchyToFileSystem = async (doc: Doc): Promise<void> => {
        const hierarchy: Hierarchy = {};
        await HierarchyTraverserRecursive(doc, hierarchy);
        const a = document.createElement("a");
        a.href = Utils.prepend(`${RouteStore.imageHierarchyExport}/${JSON.stringify(hierarchy)}`);
        a.download = `Full Export of ${StrCast(doc.title)}`;
        a.click();
    };

    const HierarchyTraverserRecursive = async (collection: Doc, hierarchy: Hierarchy) => {
        const children = await DocListCastAsync(collection.data);
        if (children) {
            const local: Hierarchy = {};
            hierarchy[collection[Id]] = local;
            for (const child of children) {
                let imageData: Opt<ImageField>;
                if (imageData = Cast(child.data, ImageField)) {
                    local[child[Id]] = imageData.url.href;
                } else {
                    await HierarchyTraverserRecursive(child, local);
                }
            }
        }
    };

}