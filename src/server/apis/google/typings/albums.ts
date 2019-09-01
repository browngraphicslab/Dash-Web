export namespace Album {

    export type Query = (AddEnrichment | BatchAddMediaItems | BatchRemoveMediaItems | Create | Get | List | Share | Unshare) & { body: any };

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

    export interface Create {
        action: Action.Create;
        body: {
            album: Template;
        };
    }

    export interface Get {
        action: Action.Get;
        albumId: string;
    }

    export interface List {
        action: Action.List;
        parameters: {
            pageSize: number,
            pageToken: string,
            excludeNonAppCreatedData: boolean
        };
    }

    export interface Share {
        action: Action.Share;
        albumId: string;
        body: {
            sharedAlbumOptions: SharedOptions;
        };
    }

    export interface Unshare {
        action: Action.Unshare;
        albumId: string;
    }

    export interface Template {
        title: string;
    }

    export interface Model {
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
        sharedAlbumOptions: SharedOptions;
        shareableUrl: string;
        shareToken: string;
        isJoined: boolean;
        isOwned: boolean;
    }

    export interface SharedOptions {
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

    export type Position = GeneralAlbumPosition | MediaRelativeAlbumPosition | EnrichmentRelativeAlbumPosition;

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

}