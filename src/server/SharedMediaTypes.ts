export namespace SharedMediaTypes {

    export const gifs = [".gif"];
    export const pngs = [".png"];
    export const jpgs = [".jpg", ".jpeg"];
    export const imageFormats = [...pngs, ...jpgs, ...gifs];
    export const videoFormats = [".mov", ".mp4"];

}