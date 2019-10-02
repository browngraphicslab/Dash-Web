import { Doc } from "../../../new_fields/Doc";
import { ImageField } from "../../../new_fields/URLField";
import { Cast } from "../../../new_fields/Types";
import { RouteStore } from "../../../server/RouteStore";
import { Docs } from "../../documents/Documents";
import { Identified } from "../../Network";

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

}