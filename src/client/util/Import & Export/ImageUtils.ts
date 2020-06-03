import { Doc } from "../../../fields/Doc";
import { ImageField } from "../../../fields/URLField";
import { Cast, StrCast } from "../../../fields/Types";
import { Docs } from "../../documents/Documents";
import { Networking } from "../../Network";
import { Id } from "../../../fields/FieldSymbols";
import { Utils } from "../../../Utils";

export namespace ImageUtils {

    export const ExtractExif = async (document: Doc): Promise<boolean> => {
        const field = Cast(document.data, ImageField);
        if (!field) {
            return false;
        }
        const source = field.url.href;
        const {
            contentSize,
            nativeWidth,
            nativeHeight,
            exifData: { error, data }
        } = await Networking.PostToServer("/inspectImage", { source });
        document.exif = error || Docs.Get.FromJson({ data });
        const proto = Doc.GetProto(document);
        proto["data-nativeWidth"] = nativeWidth;
        proto["data-nativeHeight"] = nativeHeight;
        proto["data-path"] = source;
        proto.contentSize = contentSize ? contentSize : undefined;
        return data !== undefined;
    };

    export const ExportHierarchyToFileSystem = async (collection: Doc): Promise<void> => {
        const a = document.createElement("a");
        a.href = Utils.prepend(`/imageHierarchyExport/${collection[Id]}`);
        a.download = `Dash Export [${StrCast(collection.title)}].zip`;
        a.click();
    };

}