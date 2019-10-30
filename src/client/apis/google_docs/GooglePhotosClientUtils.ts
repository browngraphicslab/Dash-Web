import { Utils } from "../../../Utils";
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
import { NewMediaItemResult, MediaItem } from "../../../server/apis/google/SharedTypes";
import { AssertionError } from "assert";
import { DocumentView } from "../../views/nodes/DocumentView";
import { Networking } from "../../Network";
import GoogleAuthenticationManager from "../GoogleAuthenticationManager";

export namespace GooglePhotos {

    const endpoint = async () => new Photos(await GoogleAuthenticationManager.Instance.fetchOrGenerateAccessToken());

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
        UTILITY: 'UTILITY',
        ARTS: 'ARTS',
        CRAFTS: 'CRAFTS',
        FASHION: 'FASHION',
        HOUSES: 'HOUSES',
        GARDENS: 'GARDENS',
        FLOWERS: 'FLOWERS',
        HOLIDAYS: 'HOLIDAYS'
    };

    export namespace Export {

        export interface AlbumCreationResult {
            albumId: string;
            mediaItems: MediaItem[];
        }

        export interface AlbumCreationOptions {
            collection: Doc;
            title?: string;
            descriptionKey?: string;
            tag?: boolean;
        }

        export const CollectionToAlbum = async (options: AlbumCreationOptions): Promise<Opt<AlbumCreationResult>> => {
            await GoogleAuthenticationManager.Instance.fetchOrGenerateAccessToken();
            const { collection, title, descriptionKey, tag } = options;
            const dataDocument = Doc.GetProto(collection);
            const images = ((await DocListCastAsync(dataDocument.data)) || []).filter(doc => Cast(doc.data, ImageField));
            if (!images || !images.length) {
                return undefined;
            }
            const resolved = title ? title : (StrCast(collection.title) || `Dash Collection (${collection[Id]}`);
            const { id, productUrl } = await Create.Album(resolved);
            const response = await Transactions.UploadImages(images, { id }, descriptionKey);
            if (response) {
                const { results, failed } = response;
                let index: Opt<number>;
                while ((index = failed.pop()) !== undefined) {
                    Doc.RemoveDocFromList(dataDocument, "data", images.splice(index, 1)[0]);
                }
                const mediaItems: MediaItem[] = results.map(item => item.mediaItem);
                if (mediaItems.length !== images.length) {
                    throw new AssertionError({ actual: mediaItems.length, expected: images.length });
                }
                const idMapping = new Doc;
                for (let i = 0; i < images.length; i++) {
                    const image = Doc.GetProto(images[i]);
                    const mediaItem = mediaItems[i];
                    if (!mediaItem) {
                        continue;
                    }
                    image.googlePhotosId = mediaItem.id;
                    image.googlePhotosAlbumUrl = productUrl;
                    image.googlePhotosUrl = mediaItem.productUrl || mediaItem.baseUrl;
                    idMapping[mediaItem.id] = image;
                }
                collection.googlePhotosAlbumUrl = productUrl;
                collection.googlePhotosIdMapping = idMapping;
                if (tag) {
                    await Query.TagChildImages(collection);
                }
                collection.albumId = id;
                Transactions.AddTextEnrichment(collection, `Find me at ${Utils.prepend(`/doc/${collection[Id]}?sharing=true`)}`);
                return { albumId: id, mediaItems };
            }
        };

    }

    export namespace Import {

        export type CollectionConstructor = (data: Array<Doc>, options: DocumentOptions, ...args: any) => Doc;

        export const CollectionFromSearch = async (constructor: CollectionConstructor, requested: Opt<Partial<Query.SearchOptions>>): Promise<Doc> => {
            await GoogleAuthenticationManager.Instance.fetchOrGenerateAccessToken();
            let response = await Query.ContentSearch(requested);
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

        const delimiter = ", ";
        const comparator = (a: string, b: string) => (a < b) ? -1 : (a > b ? 1 : 0);

        export const TagChildImages = async (collection: Doc) => {
            await GoogleAuthenticationManager.Instance.fetchOrGenerateAccessToken();
            const idMapping = await Cast(collection.googlePhotosIdMapping, Doc);
            if (!idMapping) {
                throw new Error("Appending image metadata requires that the targeted collection have already been mapped to an album!");
            }
            const tagMapping = new Map<string, string>();
            const images = (await DocListCastAsync(collection.data))!.map(Doc.GetProto);
            images && images.forEach(image => tagMapping.set(image[Id], ContentCategories.NONE));
            const values = Object.values(ContentCategories);
            for (let value of values) {
                if (value !== ContentCategories.NONE) {
                    const results = await ContentSearch({ included: [value] });
                    if (results.mediaItems) {
                        const ids = results.mediaItems.map(item => item.id);
                        for (let id of ids) {
                            const image = await Cast(idMapping[id], Doc);
                            if (image) {
                                const key = image[Id];
                                const tags = tagMapping.get(key)!;
                                if (!tags.includes(value)) {
                                    tagMapping.set(key, tags + delimiter + value);
                                }
                            }
                        }
                    }
                }
            }
            images && images.forEach(image => {
                const concatenated = tagMapping.get(image[Id])!;
                const tags = concatenated.split(delimiter);
                if (tags.length > 1) {
                    const cleaned = concatenated.replace(ContentCategories.NONE + delimiter, "");
                    image.googlePhotosTags = cleaned.split(delimiter).sort(comparator).join(delimiter);
                } else {
                    image.googlePhotosTags = ContentCategories.NONE;
                }
            });

        };

        interface DateRange {
            after: Date;
            before: Date;
        }

        const DefaultSearchOptions: SearchOptions = {
            pageSize: 50,
            included: [],
            excluded: [],
            date: undefined,
            includeArchivedMedia: true,
            excludeNonAppCreatedData: false,
            type: MediaType.ALL_MEDIA,
        };

        export interface SearchOptions {
            pageSize: number;
            included: string[];
            excluded: string[];
            date: Opt<Date | DateRange>;
            includeArchivedMedia: boolean;
            excludeNonAppCreatedData: boolean;
            type: MediaType;
        }

        export interface SearchResponse {
            mediaItems: any[];
            nextPageToken: string;
        }

        export const AlbumSearch = async (albumId: string, pageSize = 100): Promise<MediaItem[]> => {
            const photos = await endpoint();
            let mediaItems: MediaItem[] = [];
            let nextPageTokenStored: Opt<string> = undefined;
            let found = 0;
            do {
                const response: any = await photos.mediaItems.search(albumId, pageSize, nextPageTokenStored);
                mediaItems.push(...response.mediaItems);
                nextPageTokenStored = response.nextPageToken;
            } while (found);
            return mediaItems;
        };

        export const ContentSearch = async (requested: Opt<Partial<SearchOptions>>): Promise<SearchResponse> => {
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
                photos.mediaItems.search(filters, options.pageSize || 100).then(resolve);
            });
        };

        export const GetImage = async (mediaItemId: string): Promise<Transactions.MediaItem> => {
            return (await endpoint()).mediaItems.get(mediaItemId);
        };

    }

    namespace Create {

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

        export const ListAlbums = async () => (await endpoint()).albums.list();

        export const AddTextEnrichment = async (collection: Doc, content?: string) => {
            const photos = await endpoint();
            const albumId = StrCast(collection.albumId);
            if (albumId && albumId.length) {
                const enrichment = new photos.TextEnrichment(content || Utils.prepend("/doc/" + collection[Id]));
                const position = new photos.AlbumPosition(photos.AlbumPosition.POSITIONS.FIRST_IN_ALBUM);
                const enrichmentItem = await photos.albums.addEnrichment(albumId, enrichment, position);
                if (enrichmentItem) {
                    return enrichmentItem.id;
                }
            }
        };

        export const WriteMediaItemsToServer = async (body: { mediaItems: any[] }): Promise<UploadInformation[]> => {
            const uploads = await Networking.PostToServer(RouteStore.googlePhotosMediaDownload, body);
            return uploads;
        };

        export const UploadThenFetch = async (sources: Doc[], album?: AlbumReference, descriptionKey = "caption") => {
            const response = await UploadImages(sources, album, descriptionKey);
            if (!response) {
                return undefined;
            }
            const baseUrls: string[] = await Promise.all(response.results.map(item => {
                return new Promise<string>(resolve => Query.GetImage(item.mediaItem.id).then(item => resolve(item.baseUrl)));
            }));
            return baseUrls;
        };

        export interface ImageUploadResults {
            results: NewMediaItemResult[];
            failed: number[];
        }

        export const UploadImages = async (sources: Doc[], album?: AlbumReference, descriptionKey = "caption"): Promise<Opt<ImageUploadResults>> => {
            await GoogleAuthenticationManager.Instance.fetchOrGenerateAccessToken();
            if (album && "title" in album) {
                album = await Create.Album(album.title);
            }
            const media: MediaInput[] = [];
            for (let source of sources) {
                const data = Cast(Doc.GetProto(source).data, ImageField);
                if (!data) {
                    return;
                }
                const url = data.url.href;
                const target = Doc.MakeAlias(source);
                const description = parseDescription(target, descriptionKey);
                await DocumentView.makeCustomViewClicked(target, undefined);
                media.push({ url, description });
            }
            if (media.length) {
                const results = await Networking.PostToServer(RouteStore.googlePhotosMediaUpload, { media, album });
                return results;
            }
        };

        const parseDescription = (document: Doc, descriptionKey: string) => {
            let description: string = Utils.prepend(`/doc/${document[Id]}?sharing=true`);
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