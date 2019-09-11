import { PostToServer, Utils } from "../../../Utils";
import { RouteStore } from "../../../server/RouteStore";
import { ImageField } from "../../../new_fields/URLField";
import { Cast, StrCast } from "../../../new_fields/Types";
import { Doc, Opt, DocListCastAsync } from "../../../new_fields/Doc";
import { Id } from "../../../new_fields/FieldSymbols";
import Photos = require('googlephotos');
import { RichTextField } from "../../../new_fields/RichTextField";
import { RichTextUtils } from "../../../new_fields/RichTextUtils";
import { EditorState } from "prosemirror-state";
import { FormattedTextBox } from "../../views/nodes/FormattedTextBox";
import { Docs, DocumentOptions } from "../../documents/Documents";
import { MediaItemCreationResult, NewMediaItemResult, MediaItem } from "../../../server/apis/google/SharedTypes";

export namespace GooglePhotos {

    const endpoint = async () => {
        const getToken = Utils.prepend(RouteStore.googlePhotosAccessToken);
        const token = await (await fetch(getToken)).text();
        return new Photos(token);
    };

    export enum MediaType {
        ALL_MEDIA = 'ALL_MEDIA',
        PHOTO = 'PHOTO',
        VIDEO = 'VIDEO'
    }

    export type AlbumReference = { id: string } | { title: string };

    export interface MediaInput {
        url: string;
        description: string;
    }

    export const ContentCategories = {
        NONE: 'NONE',
        LANDSCAPES: 'LANDSCAPES',
        RECEIPTS: 'RECEIPTS',
        CITYSCAPES: 'CITYSCAPES',
        LANDMARKS: 'LANDMARKS',
        SELFIES: 'SELFIES',
        PEOPLE: 'PEOPLE',
        PETS: 'PETS',
        WEDDINGS: 'WEDDINGS',
        BIRTHDAYS: 'BIRTHDAYS',
        DOCUMENTS: 'DOCUMENTS',
        TRAVEL: 'TRAVEL',
        ANIMALS: 'ANIMALS',
        FOOD: 'FOOD',
        SPORT: 'SPORT',
        NIGHT: 'NIGHT',
        PERFORMANCES: 'PERFORMANCES',
        WHITEBOARDS: 'WHITEBOARDS',
        SCREENSHOTS: 'SCREENSHOTS',
        UTILITY: 'UTILITY'
    };

    export namespace Export {

        export interface AlbumCreationResult {
            albumId: string;
            mediaItems: MediaItem[];
        }

        export const CollectionToAlbum = async (collection: Doc, title?: string, descriptionKey?: string): Promise<Opt<AlbumCreationResult>> => {
            const dataDocument = Doc.GetProto(collection);
            const images = ((await DocListCastAsync(dataDocument.data)) || []).filter(doc => Cast(doc.data, ImageField));
            if (!images || !images.length) {
                return undefined;
            }
            const resolved = title ? title : (StrCast(collection.title) || `Dash Collection (${collection[Id]}`);
            const { id } = await Create.Album(resolved);
            const result = await Transactions.UploadImages(images, { id }, descriptionKey);
            if (result) {
                const mediaItems = result.newMediaItemResults.map(item => item.mediaItem);
                return { albumId: id, mediaItems };
            }
        };

    }

    export namespace Import {

        export type CollectionConstructor = (data: Array<Doc>, options: DocumentOptions, ...args: any) => Doc;

        export const CollectionFromSearch = async (constructor: CollectionConstructor, requested: Opt<Partial<Query.SearchOptions>>): Promise<Doc> => {
            let response = await Query.Search(requested);
            let uploads = await Transactions.WriteMediaItemsToServer(response);
            const children = uploads.map((upload: Transactions.UploadInformation) => {
                let document = Docs.Create.ImageDocument(Utils.fileUrl(upload.fileNames.clean));
                document.fillColumn = true;
                document.contentSize = upload.contentSize;
                return document;
            });
            const options = { width: 500, height: 500 };
            return constructor(children, options);
        };

    }

    export namespace Query {

        export const AppendImageMetadata = (sources: (Doc | string)[]) => {
            let keys = Object.keys(ContentCategories);
            let included: string[] = [];
            let excluded: string[] = [];
            for (let i = 0; i < keys.length; i++) {
                for (let j = 0; j < keys.length; j++) {
                    let value = ContentCategories[keys[i] as keyof typeof ContentCategories];
                    if (j === i) {
                        included.push(value);
                    } else {
                        excluded.push(value);
                    }
                }
                //...
                included = excluded = [];
            }
        };

        interface DateRange {
            after: Date;
            before: Date;
        }

        const DefaultSearchOptions: SearchOptions = {
            pageSize: 20,
            included: [],
            excluded: [],
            date: undefined,
            includeArchivedMedia: true,
            type: MediaType.ALL_MEDIA,
        };

        export interface SearchOptions {
            pageSize: number;
            included: ContentCategories[];
            excluded: ContentCategories[];
            date: Opt<Date | DateRange>;
            includeArchivedMedia: boolean;
            type: MediaType;
        }

        export interface SearchResponse {
            mediaItems: any[];
            nextPageToken: string;
        }

        export const Search = async (requested: Opt<Partial<SearchOptions>>): Promise<SearchResponse> => {
            const options = requested || DefaultSearchOptions;
            const photos = await endpoint();
            const filters = new photos.Filters(options.includeArchivedMedia === undefined ? true : options.includeArchivedMedia);

            const included = options.included || [];
            const excluded = options.excluded || [];
            const contentFilter = new photos.ContentFilter();
            included.length && included.forEach(category => contentFilter.addIncludedContentCategories(category));
            excluded.length && excluded.forEach(category => contentFilter.addExcludedContentCategories(category));
            filters.setContentFilter(contentFilter);

            const date = options.date;
            if (date) {
                const dateFilter = new photos.DateFilter();
                if (date instanceof Date) {
                    dateFilter.addDate(date);
                } else {
                    dateFilter.addRange(date.after, date.before);
                }
                filters.setDateFilter(dateFilter);
            }

            filters.setMediaTypeFilter(new photos.MediaTypeFilter(options.type || MediaType.ALL_MEDIA));

            return new Promise<SearchResponse>(resolve => {
                photos.mediaItems.search(filters, options.pageSize || 20).then(resolve);
            });
        };

        export const GetImage = async (mediaItemId: string): Promise<Transactions.MediaItem> => {
            return (await endpoint()).mediaItems.get(mediaItemId);
        };

    }

    export namespace Create {

        export const Album = async (title: string) => {
            return (await endpoint()).albums.create(title);
        };

    }

    export namespace Transactions {

        export interface UploadInformation {
            mediaPaths: string[];
            fileNames: { [key: string]: string };
            contentSize?: number;
            contentType?: string;
        }

        export interface MediaItem {
            id: string;
            filename: string;
            baseUrl: string;
        }

        export const WriteMediaItemsToServer = async (body: { mediaItems: any[] }): Promise<UploadInformation[]> => {
            const uploads = await PostToServer(RouteStore.googlePhotosMediaDownload, body);
            return uploads;
        };

        export const UploadThenFetch = async (sources: (Doc | string)[], album?: AlbumReference, descriptionKey = "caption") => {
            const result = await UploadImages(sources, album, descriptionKey);
            if (!result) {
                return undefined;
            }
            const baseUrls: string[] = await Promise.all(result.newMediaItemResults.map((result: any) => {
                return new Promise<string>(resolve => Query.GetImage(result.mediaItem.id).then(item => resolve(item.baseUrl)));
            }));
            return baseUrls;
        };

        export const UploadImages = async (sources: (Doc | string)[], album?: AlbumReference, descriptionKey = "caption"): Promise<Opt<MediaItemCreationResult>> => {
            if (album && "title" in album) {
                album = await Create.Album(album.title);
            }
            const media: MediaInput[] = [];
            sources.forEach(source => {
                let url: string;
                let description: string;
                if (source instanceof Doc) {
                    const data = Cast(Doc.GetProto(source).data, ImageField);
                    if (!data) {
                        return;
                    }
                    url = data.url.href;
                    description = parseDescription(source, descriptionKey);
                } else {
                    url = source;
                    description = Utils.GenerateGuid();
                }
                media.push({ url, description });
            });
            if (media.length) {
                return PostToServer(RouteStore.googlePhotosMediaUpload, { media, album });
            }
        };

        const parseDescription = (document: Doc, descriptionKey: string) => {
            let description: string = Utils.prepend("/doc/" + document[Id]);
            const target = document[descriptionKey];
            if (typeof target === "string") {
                description = target;
            } else if (target instanceof RichTextField) {
                description = RichTextUtils.ToPlainText(EditorState.fromJSON(FormattedTextBox.Instance.config, JSON.parse(target.Data)));
            }
            return description;
        };

    }

}