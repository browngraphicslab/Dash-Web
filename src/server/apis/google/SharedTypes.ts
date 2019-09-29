export interface NewMediaItemResult {
    uploadToken: string;
    status: { code: number, message: string };
    mediaItem: MediaItem;
}

export interface MediaItem {
    id: string;
    description: string;
    productUrl: string;
    baseUrl: string;
    mimeType: string;
    mediaMetadata: {
        creationTime: string;
        width: string;
        height: string;
    };
    filename: string;
}

export type MediaItemCreationResult = { newMediaItemResults: NewMediaItemResult[] };