import { PostToServer, Utils } from "../../../Utils";
import { RouteStore } from "../../../server/RouteStore";
import { ImageField } from "../../../new_fields/URLField";
import { StrCast, Cast } from "../../../new_fields/Types";
import { Doc, Opt } from "../../../new_fields/Doc";
import { Id } from "../../../new_fields/FieldSymbols";
import requestImageSize = require('../../util/request-image-size');
import Photos = require('googlephotos');

export namespace GooglePhotosClientUtils {

    export type AlbumReference = { id: string } | { title: string };
    export const endpoint = () => fetch(Utils.prepend(RouteStore.googlePhotosAccessToken)).then(async response => new Photos(await response.text()));

    export interface MediaInput {
        url: string;
        description: string;
    }

    export const UploadMedia = async (sources: Doc[], album?: AlbumReference) => {
        if (album && "title" in album) {
            album = (await endpoint()).albums.create(album.title);
        }
        const media: MediaInput[] = [];
        sources.forEach(document => {
            const data = Cast(Doc.GetProto(document).data, ImageField);
            const description = StrCast(document.caption);
            if (!data) {
                return undefined;
            }
            media.push({
                url: data.url.href,
                description,
            } as MediaInput);
        });
        if (media.length) {
            return PostToServer(RouteStore.googlePhotosMediaUpload, { media, album });
        }
        return undefined;
    };

}