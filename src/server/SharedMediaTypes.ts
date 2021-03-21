import { ExifData } from 'exif';
import { File } from 'formidable';

export namespace AcceptableMedia {
    export const gifs = [".gif"];
    export const pngs = [".png"];
    export const jpgs = [".jpg", ".jpeg"];
    export const webps = [".webp"];
    export const tiffs = [".tiff"];
    export const imageFormats = [...pngs, ...jpgs, ...gifs, ...webps, ...tiffs];
    export const videoFormats = [".mov", ".mp4", ".quicktime", ".x-matroska;codecs=avc1"];
    export const applicationFormats = [".pdf"];
    export const audioFormats = [".wav", ".mp3", ".mpeg", ".flac", ".au", ".aiff", ".m4a", ".webm"];
}

export namespace Upload {

    export function isImageInformation(uploadResponse: Upload.FileInformation): uploadResponse is Upload.ImageInformation {
        return "nativeWidth" in uploadResponse;
    }

    export interface FileInformation {
        accessPaths: AccessPathInfo;
        rawText?: string;
    }

    export type FileResponse<T extends FileInformation = FileInformation> = { source: File, result: T | Error };

    export type ImageInformation = FileInformation & InspectionResults;

    export interface AccessPathInfo {
        [suffix: string]: { client: string, server: string };
    }

    export interface InspectionResults {
        source: string;
        requestable: string;
        exifData: EnrichedExifData;
        contentSize: number;
        contentType: string;
        nativeWidth: number;
        nativeHeight: number;
        filename?: string;
    }

    export interface EnrichedExifData {
        data: ExifData;
        error?: string;
    }

}