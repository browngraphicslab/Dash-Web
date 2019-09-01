import request = require('request-promise');

const apiEndpoint = "https://photoslibrary.googleapis.com";

export type GooglePhotosQuery = AlbumsQuery;

export type AlbumsQuery = (AddEnrichment | BatchAddMediaItems | BatchRemoveMediaItems | CreateAlbum | GetAlbum | ListAlbum | ShareAlbum | UnshareAlbum) & { body: any };

export enum Action {
    AddEnrichment,
    BatchAddMediaItems,
    BatchRemoveMediaItems,
    Create,
    Get,
    List,
    Share,
    Unshare
}

export interface AddEnrichment {
    action: Action.AddEnrichment;
    albumId: string;
    body: {
        newEnrichmentItem: NewEnrichmentItem;
        albumPosition: MediaRelativeAlbumPosition;
    };
}

export interface BatchAddMediaItems {
    action: Action.BatchAddMediaItems;
    albumId: string;
    body: {
        mediaItemIds: string[];
    };
}

export interface BatchRemoveMediaItems {
    action: Action.BatchRemoveMediaItems;
    albumId: string;
    body: {
        mediaItemIds: string[];
    };
}

export interface CreateAlbum {
    action: Action.Create;
    body: {
        album: AlbumTemplate;
    };
}

export interface GetAlbum {
    action: Action.Get;
    albumId: string;
}

export interface ListAlbum {
    action: Action.List;
    parameters: {
        pageSize: number,
        pageToken: string,
        excludeNonAppCreatedData: boolean
    };
}

export interface ShareAlbum {
    action: Action.Share;
    albumId: string;
    body: {
        sharedAlbumOptions: SharedAlbumOptions;
    };
}

export interface UnshareAlbum {
    action: Action.Unshare;
    albumId: string;
}

export interface AlbumTemplate {
    title: string;
}

export interface Album {
    id: string;
    title: string;
    productUrl: string;
    isWriteable: boolean;
    shareInfo: ShareInfo;
    mediaItemsCount: string;
    coverPhotoBaseUrl: string;
    coverPhotoMediaItemId: string;
}

export interface ShareInfo {
    sharedAlbumOptions: SharedAlbumOptions;
    shareableUrl: string;
    shareToken: string;
    isJoined: boolean;
    isOwned: boolean;
}

export interface SharedAlbumOptions {
    isCollaborative: boolean;
    isCommentable: boolean;
}

export enum PositionType {
    POSITION_TYPE_UNSPECIFIED,
    FIRST_IN_ALBUM,
    LAST_IN_ALBUM,
    AFTER_MEDIA_ITEM,
    AFTER_ENRICHMENT_ITEM
}

export type AlbumPosition = GeneralAlbumPosition | MediaRelativeAlbumPosition | EnrichmentRelativeAlbumPosition;

interface GeneralAlbumPosition {
    position: PositionType.FIRST_IN_ALBUM | PositionType.LAST_IN_ALBUM | PositionType.POSITION_TYPE_UNSPECIFIED;
}

interface MediaRelativeAlbumPosition {
    position: PositionType.AFTER_MEDIA_ITEM;
    relativeMediaItemId: string;
}

interface EnrichmentRelativeAlbumPosition {
    position: PositionType.AFTER_ENRICHMENT_ITEM;
    relativeEnrichmentItemId: string;
}

export interface Location {
    locationName: string;
    latlng: {
        latitude: number,
        longitude: number
    };
}

export interface NewEnrichmentItem {
    textEnrichment: {
        text: string;
    };
    locationEnrichment: {
        location: Location
    };
    mapEnrichment: {
        origin: { location: Location },
        destination: { location: Location }
    };
}

export namespace GooglePhotos {

    export const ExecuteQuery = async (authToken: string, query: AlbumsQuery) => {
        let options = {
            headers: { 'Content-Type': 'application/json' },
            auth: { 'bearer': authToken },
            body: query.body,
            json: true
        };
        const result = await request.post(apiEndpoint + '/v1/albums', options);
        return result;
    };

}
