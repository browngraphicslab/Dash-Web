import { Album } from "../../../server/apis/google/typings/albums";
import { PostToServer } from "../../../Utils";
import { RouteStore } from "../../../server/RouteStore";

export namespace GooglePhotosClientUtils {

    export const Create = async (title: string) => {
        let parameters = {
            action: Album.Action.Create,
            body: { album: { title } }
        } as Album.Create;
        return PostToServer(RouteStore.googlePhotos, parameters);
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
        return PostToServer(RouteStore.googlePhotos, parameters);
    };

    export const Get = async (albumId: string) => {
        let parameters = {
            action: Album.Action.Get,
            albumId
        } as Album.Get;
        return PostToServer(RouteStore.googlePhotos, parameters);
    };

}