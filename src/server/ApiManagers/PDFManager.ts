import ApiManager, { Registration } from "./ApiManager";
import { Method } from "../RouteManager";
import RouteSubscriber from "../RouteSubscriber";
import { existsSync, createReadStream, createWriteStream } from "fs";
import * as Pdfjs from 'pdfjs-dist';
import { createCanvas } from "canvas";
const imageSize = require("probe-image-size");
import * as express from "express";
import * as path from "path";
import { Directory, serverPathToFile, clientPathToFile, pathToDirectory } from "./UploadManager";
import { red } from "colors";
import { resolve } from "path";

export default class PDFManager extends ApiManager {

    protected initialize(register: Registration): void {

        register({
            method: Method.POST,
            subscription: new RouteSubscriber("thumbnail"),
            secureHandler: async ({ req, res }) => {
                const { coreFilename, pageNum, subtree } = req.body;
                return getOrCreateThumbnail(coreFilename, pageNum, res, subtree);
            }
        });

    }

}

async function getOrCreateThumbnail(coreFilename: string, pageNum: number, res: express.Response, subtree?: string): Promise<void> {
    const resolved = `${coreFilename}-${pageNum}.png`;
    return new Promise<void>(async resolve => {
        const path = serverPathToFile(Directory.pdf_thumbnails, resolved);
        if (existsSync(path)) {
            const existingThumbnail = createReadStream(path);
            const { err, viewport } = await new Promise<any>(resolve => {
                imageSize(existingThumbnail, (err: any, viewport: any) => resolve({ err, viewport }));
            });
            if (err) {
                console.log(red(`In PDF thumbnail response, unable to determine dimensions of ${resolved}:`));
                console.log(err);
                return;
            }
            dispatchThumbnail(res, viewport, resolved);
        } else {
            await CreateThumbnail(coreFilename, pageNum, res, subtree);
        }
        resolve();
    });
}

async function CreateThumbnail(coreFilename: string, pageNum: number, res: express.Response, subtree?: string) {
    const sourcePath = resolve(pathToDirectory(Directory.pdfs), `${subtree ?? ""}${coreFilename}.pdf`);
    const documentProxy = await Pdfjs.getDocument(sourcePath).promise;
    const factory = new NodeCanvasFactory();
    const page = await documentProxy.getPage(pageNum);
    const viewport = page.getViewport(1 as any);
    const { canvas, context } = factory.create(viewport.width, viewport.height);
    const renderContext = {
        canvasContext: context,
        canvasFactory: factory,
        viewport
    };
    await page.render(renderContext).promise;
    const pngStream = canvas.createPNGStream();
    const resolved = `${coreFilename}-${pageNum}.png`;
    const pngFile = serverPathToFile(Directory.pdf_thumbnails, resolved);
    const out = createWriteStream(pngFile);
    pngStream.pipe(out);
    return new Promise<void>((resolve, reject) => {
        out.on("finish", () => {
            dispatchThumbnail(res, viewport, resolved);
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