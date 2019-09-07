import { PostToServer, Utils } from "../../../Utils";
import { RouteStore } from "../../../server/RouteStore";
import { ImageField } from "../../../new_fields/URLField";
import { StrCast, Cast } from "../../../new_fields/Types";
import { Doc, Opt } from "../../../new_fields/Doc";
import { Id } from "../../../new_fields/FieldSymbols";
import requestImageSize = require('../../util/request-image-size');
import Photos = require('googlephotos');
import { RichTextField } from "../../../new_fields/RichTextField";
import { RichTextUtils } from "../../../new_fields/RichTextUtils";
import { EditorState } from "prosemirror-state";
import { FormattedTextBox } from "../../views/nodes/FormattedTextBox";

export namespace GooglePhotosClientUtils {

    export enum ContentCategories {
        NONE = 'NONE',
        LANDSCAPES = 'LANDSCAPES',
        RECEIPTS = 'RECEIPTS',
        CITYSCAPES = 'CITYSCAPES',
        LANDMARKS = 'LANDMARKS',
        SELFIES = 'SELFIES',
        PEOPLE = 'PEOPLE',
        PETS = 'PETS',
        WEDDINGS = 'WEDDINGS',
        BIRTHDAYS = 'BIRTHDAYS',
        DOCUMENTS = 'DOCUMENTS',
        TRAVEL = 'TRAVEL',
        ANIMALS = 'ANIMALS',
        FOOD = 'FOOD',
        SPORT = 'SPORT',
        NIGHT = 'NIGHT',
        PERFORMANCES = 'PERFORMANCES',
        WHITEBOARDS = 'WHITEBOARDS',
        SCREENSHOTS = 'SCREENSHOTS',
        UTILITY = 'UTILITY'
    }

    export enum MediaType {
        ALL_MEDIA = 'ALL_MEDIA',
        PHOTO = 'PHOTO',
        VIDEO = 'VIDEO'
    }

    export type AlbumReference = { id: string } | { title: string };
    export const endpoint = () => fetch(Utils.prepend(RouteStore.googlePhotosAccessToken)).then(async response => new Photos(await response.text()));

    export interface MediaInput {
        url: string;
        description: string;
    }

    export const UploadImageDocuments = async (sources: Doc[], album?: AlbumReference, descriptionKey = "caption") => {
        if (album && "title" in album) {
            album = await (await endpoint()).albums.create(album.title);
        }
        const media: MediaInput[] = [];
        sources.forEach(document => {
            const data = Cast(Doc.GetProto(document).data, ImageField);
            data && media.push({
                url: data.url.href,
                description: parseDescription(document, descriptionKey),
            });
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

    export interface DateRange {
        after: Date;
        before: Date;
    }
    export interface SearchOptions {
        pageSize: number;
        included: ContentCategories[];
        excluded: ContentCategories[];
        date: Opt<Date | DateRange>;
        includeArchivedMedia: boolean;
        type: MediaType;
    }

    const DefaultSearchOptions: SearchOptions = {
        pageSize: 20,
        included: [],
        excluded: [],
        date: undefined,
        includeArchivedMedia: true,
        type: MediaType.ALL_MEDIA
    };

    export interface SearchResponse {
        mediaItems: any[];
        nextPageToken: string;
    }

    export const Search = async (requested: Opt<Partial<SearchOptions>>) => {
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

        return new Promise<any>((resolve, reject) => {
            photos.mediaItems.search(filters, options.pageSize || 20).then(async (response: SearchResponse) => {
                if (!response) {
                    return reject();
                }
                let filenames = await PostToServer(RouteStore.googlePhotosMediaDownload, response);
                console.log(filenames);
                resolve(filenames);
            });
        });
    };

}