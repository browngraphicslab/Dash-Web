export namespace AcceptibleMedia {
    export const gifs = [".gif"];
    export const pngs = [".png"];
    export const jpgs = [".jpg", ".jpeg"];
    export const webps = [".webp"];
    export const tiffs = [".tiff"];
    export const imageFormats = [...pngs, ...jpgs, ...gifs, ...webps, ...tiffs];
    export const videoFormats = [".mov", ".mp4"];
    export const applicationFormats = [".pdf"];
}