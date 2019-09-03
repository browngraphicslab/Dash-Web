import { Album } from "../../../server/apis/google/typings/albums";
import { PostToServer } from "../../../Utils";
import { RouteStore } from "../../../server/RouteStore";
import { ImageField } from "../../../new_fields/URLField";

export namespace GooglePhotosClientUtils {

    export const Create = async (title: string) => {
        let parameters = {
            action: Album.Action.Create,
            body: { album: { title } }
        } as Album.Create;
        return PostToServer(RouteStore.googlePhotosQuery, parameters);
    };

    export const List = async (options?: Partial<Album.ListOptions>) => {
        let parameters = {
            action: Album.Action.List,
            parameters: {
                pageSize: (options ? options.pageSize : 20) || 20,
                pageToken: (options ? options.pageToken : undefined) || undefined,
                excludeNonAppCreatedData: (options ? options.excludeNonAppCreatedData : false) || false,
            } as Album.ListOptions
        } as Album.List;
        return PostToServer(RouteStore.googlePhotosQuery, parameters);
    };

    export const Get = async (albumId: string) => {
        let parameters = {
            action: Album.Action.Get,
            albumId
        } as Album.Get;
        return PostToServer(RouteStore.googlePhotosQuery, parameters);
    };

    export const toDataURL = (field: ImageField | undefined) => {
        if (!field) {
            return undefined;
        }
        const image = document.createElement("img");
        image.src = field.url.href;
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(image, 0, 0);
        const dataUrl = canvas.toDataURL("image/png");
        return dataUrl.replace(/^data:image\/(png|jpg);base64,/, "");
    };

}