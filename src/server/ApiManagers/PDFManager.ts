import ApiManager, { Registration } from "./ApiManager";
import { Method } from "../RouteManager";
import RouteSubscriber from "../RouteSubscriber";
import { existsSync, createReadStream, createWriteStream } from "fs";
import * as Pdfjs from 'pdfjs-dist';
import { createCanvas } from "canvas";
const imageSize = require("probe-image-size");
import * as express from "express";
import * as path from "path";
import { Directory, serverPathToFile, clientPathToFile } from "./UploadManager";
import { red } from "colors";

export default class PDFManager extends ApiManager {

    protected initialize(register: Registration): void {

        register({
            method: Method.GET,
            subscription: new RouteSubscriber("thumbnail").add("filename"),
            secureHandler: ({ req, res }) => getOrCreateThumbnail(req.params.filename, res)
        });

    }

}

async function getOrCreateThumbnail(thumbnailName: string, res: express.Response): Promise<void> {
    const noExtension = thumbnailName.substring(0, thumbnailName.length - ".png".length);
    const pageString = noExtension.split('-')[1];
    const pageNumber = parseInt(pageString);
    return new Promise<void>(async resolve => {
        const path = serverPathToFile(Directory.pdf_thumbnails, thumbnailName);
        if (existsSync(path)) {
            const existingThumbnail = createReadStream(path);
            const { err, viewport } = await new Promise<any>(resolve => {
                imageSize(existingThumbnail, (err: any, viewport: any) => resolve({ err, viewport }));
            });
            if (err) {
                console.log(red(`In PDF thumbnail response, unable to determine dimensions of ${thumbnailName}:`));
                console.log(err);
                return;
            }
            dispatchThumbnail(res, viewport, thumbnailName);
        } else {
            const offset = thumbnailName.length - pageString.length - 5;
            const name = thumbnailName.substring(0, offset) + ".pdf";
            const path = serverPathToFile(Directory.pdfs, name);
            await CreateThumbnail(path, pageNumber, res);
        }
        resolve();
    });
}

async function CreateThumbnail(file: string, pageNumber: number, res: express.Response) {
    const documentProxy = await Pdfjs.getDocument(file).promise;
    const factory = new NodeCanvasFactory();
    const page = await documentProxy.getPage(pageNumber);
    const viewport = page.getViewport(1 as any);
    const { canvas, context } = factory.create(viewport.width, viewport.height);
    const renderContext = {
        canvasContext: context,
        canvasFactory: factory,
        viewport
    };
    await page.render(renderContext).promise;
    const pngStream = canvas.createPNGStream();
    const filenames = path.basename(file).split(".");
    const thumbnailName = `${filenames[0]}-${pageNumber}.png`;
    const pngFile = serverPathToFile(Directory.pdf_thumbnails, thumbnailName);
    const out = createWriteStream(pngFile);
    pngStream.pipe(out);
    return new Promise<void>((resolve, reject) => {
        out.on("finish", () => {
            dispatchThumbnail(res, viewport, thumbnailName);
            resolve();
        });
        out.on("error", error => {
            console.log(red(`In PDF thumbnail creation, encountered the following error when piping ${pngFile}:`));
            console.log(error);
            reject();
        });
    });
}

function dispatchThumbnail(res: express.Response, { width, height }: Pdfjs.PDFPageViewport, thumbnailName: string) {
    res.send({
        path: clientPathToFile(Directory.pdf_thumbnails, thumbnailName),
        width,
        height
    });
}

class NodeCanvasFactory {

    create = (width: number, height: number) => {
        const canvas = createCanvas(width, height);
        const context = canvas.getContext('2d');
        return {
            canvas,
            context
        };
    }

    reset = (canvasAndContext: any, width: number, height: number) => {
        canvasAndContext.canvas.width = width;
        canvasAndContext.canvas.height = height;
    }

    destroy = (canvasAndContext: any) => {
        canvasAndContext.canvas.width = 0;
        canvasAndContext.canvas.height = 0;
        canvasAndContext.canvas = null;
        canvasAndContext.context = null;
    }
}