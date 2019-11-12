import ApiManager, { Registration } from "./ApiManager";
import { Method } from "../RouteManager";
import RouteSubscriber from "../RouteSubscriber";
import { exists, createReadStream, createWriteStream } from "fs";
import { filesDirectory } from "..";
import * as Pdfjs from 'pdfjs-dist';
import { createCanvas } from "canvas";
const probe = require("probe-image-size");
import * as express from "express";
import * as path from "path";

export default class PDFManager extends ApiManager {

    protected initialize(register: Registration): void {

        register({
            method: Method.GET,
            subscription: new RouteSubscriber("thumbnail").add("filename"),
            onValidation: ({ req, res }) => {
                let filename = req.params.filename;
                let noExt = filename.substring(0, filename.length - ".png".length);
                let pagenumber = parseInt(noExt.split('-')[1]);
                return new Promise<void>(resolve => {
                    exists(filesDirectory + filename, (exists: boolean) => {
                        console.log(`${filesDirectory + filename} ${exists ? "exists" : "does not exist"}`);
                        if (exists) {
                            let input = createReadStream(filesDirectory + filename);
                            probe(input, (err: any, result: any) => {
                                if (err) {
                                    console.log(err);
                                    console.log(`error on ${filename}`);
                                    return;
                                }
                                res.send({ path: "/files/" + filename, width: result.width, height: result.height });
                            });
                        }
                        else {
                            LoadPage(filesDirectory + filename.substring(0, filename.length - noExt.split('-')[1].length - ".PNG".length - 1) + ".pdf", pagenumber, res);
                        }
                        resolve();
                    });
                });
            }
        });

        function LoadPage(file: string, pageNumber: number, res: express.Response) {
            console.log(file);
            Pdfjs.getDocument(file).promise
                .then((pdf: Pdfjs.PDFDocumentProxy) => {
                    let factory = new NodeCanvasFactory();
                    console.log(pageNumber);
                    pdf.getPage(pageNumber).then((page: Pdfjs.PDFPageProxy) => {
                        console.log("reading " + page);
                        let viewport = page.getViewport(1 as any);
                        let canvasAndContext = factory.create(viewport.width, viewport.height);
                        let renderContext = {
                            canvasContext: canvasAndContext.context,
                            viewport: viewport,
                            canvasFactory: factory
                        };
                        console.log("read " + pageNumber);

                        page.render(renderContext).promise
                            .then(() => {
                                console.log("saving " + pageNumber);
                                let stream = canvasAndContext.canvas.createPNGStream();
                                let pngFile = `${file.substring(0, file.length - ".pdf".length)}-${pageNumber}.PNG`;
                                let out = createWriteStream(pngFile);
                                stream.pipe(out);
                                out.on("finish", () => {
                                    console.log(`Success! Saved to ${pngFile}`);
                                    let name = path.basename(pngFile);
                                    res.send({ path: "/files/" + name, width: viewport.width, height: viewport.height });
                                });
                            }, (reason: string) => {
                                console.error(reason + ` ${pageNumber}`);
                            });
                    });
                });
        }

    }

}

class NodeCanvasFactory {
    create = (width: number, height: number) => {
        var canvas = createCanvas(width, height);
        var context = canvas.getContext('2d');
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