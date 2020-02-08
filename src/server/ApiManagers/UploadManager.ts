import ApiManager, { Registration } from "./ApiManager";
import { Method, _success } from "../RouteManager";
import * as formidable from 'formidable';
import v4 = require('uuid/v4');
const AdmZip = require('adm-zip');
import { extname, basename, dirname } from 'path';
import { createReadStream, createWriteStream, unlink, readFileSync } from "fs";
import { publicDirectory, filesDirectory } from "..";
import { Database } from "../database";
import { DashUploadUtils, SizeSuffix } from "../DashUploadUtils";
import * as sharp from 'sharp';
import { AcceptibleMedia } from "../SharedMediaTypes";
import { normalize } from "path";
const imageDataUri = require('image-data-uri');

export enum Directory {
    parsed_files = "parsed_files",
    images = "images",
    videos = "videos",
    pdfs = "pdfs",
    text = "text",
    pdf_thumbnails = "pdf_thumbnails"
}

export function serverPathToFile(directory: Directory, filename: string) {
    return normalize(`${filesDirectory}/${directory}/${filename}`);
}

export function pathToDirectory(directory: Directory) {
    return normalize(`${filesDirectory}/${directory}`);
}

export function clientPathToFile(directory: Directory, filename: string) {
    return `/files/${directory}/${filename}`;
}

export default class UploadManager extends ApiManager {

    protected initialize(register: Registration): void {

        register({
            method: Method.POST,
            subscription: "/uploadFormData",
            secureHandler: async ({ req, res }) => {
                const form = new formidable.IncomingForm();
                form.uploadDir = pathToDirectory(Directory.parsed_files);
                form.keepExtensions = true;
                return new Promise<void>(resolve => {
                    form.parse(req, async (_err, _fields, files) => {
                        const results: any[] = [];
                        for (const key in files) {
                            const result = await DashUploadUtils.upload(files[key]);
                            result && results.push(result);
                        }
                        _success(res, results);
                        resolve();
                    });
                });
            }
        });

        register({
            method: Method.POST,
            subscription: "/uploadRemoteImage",
            secureHandler: async ({ req, res }) => {
                const { sources } = req.body;
                if (Array.isArray(sources)) {
                    const results = await Promise.all(sources.map(source => DashUploadUtils.UploadImage(source)));
                    return res.send(results);
                }
                res.send();
            }
        });

        register({
            method: Method.POST,
            subscription: "/uploadDoc",
            secureHandler: ({ req, res }) => {
                const form = new formidable.IncomingForm();
                form.keepExtensions = true;
                // let path = req.body.path;
                const ids: { [id: string]: string } = {};
                let remap = true;
                const getId = (id: string): string => {
                    if (!remap) return id;
                    if (id.endsWith("Proto")) return id;
                    if (id in ids) {
                        return ids[id];
                    } else {
                        return ids[id] = v4();
                    }
                };
                const mapFn = (doc: any) => {
                    if (doc.id) {
                        doc.id = getId(doc.id);
                    }
                    for (const key in doc.fields) {
                        if (!doc.fields.hasOwnProperty(key)) {
                            continue;
                        }
                        const field = doc.fields[key];
                        if (field === undefined || field === null) {
                            continue;
                        }

                        if (field.__type === "proxy" || field.__type === "prefetch_proxy") {
                            field.fieldId = getId(field.fieldId);
                        } else if (field.__type === "script" || field.__type === "computed") {
                            if (field.captures) {
                                field.captures.fieldId = getId(field.captures.fieldId);
                            }
                        } else if (field.__type === "list") {
                            mapFn(field);
                        } else if (typeof field === "string") {
                            const re = /("(?:dataD|d)ocumentId"\s*:\s*")([\w\-]*)"/g;
                            doc.fields[key] = (field as any).replace(re, (match: any, p1: string, p2: string) => {
                                return `${p1}${getId(p2)}"`;
                            });
                        } else if (field.__type === "RichTextField") {
                            const re = /("href"\s*:\s*")(.*?)"/g;
                            field.Data = field.Data.replace(re, (match: any, p1: string, p2: string) => {
                                return `${p1}${getId(p2)}"`;
                            });
                        }
                    }
                };
                return new Promise<void>(resolve => {
                    form.parse(req, async (_err, fields, files) => {
                        remap = fields.remap !== "false";
                        let id: string = "";
                        try {
                            for (const name in files) {
                                const path_2 = files[name].path;
                                const zip = new AdmZip(path_2);
                                zip.getEntries().forEach((entry: any) => {
                                    if (!entry.entryName.startsWith("files/")) return;
                                    let directory = dirname(entry.entryName) + "/";
                                    const extension = extname(entry.entryName);
                                    const base = basename(entry.entryName).split(".")[0];
                                    try {
                                        zip.extractEntryTo(entry.entryName, publicDirectory, true, false);
                                        directory = "/" + directory;

                                        createReadStream(publicDirectory + directory + base + extension).pipe(createWriteStream(publicDirectory + directory + base + "_o" + extension));
                                        createReadStream(publicDirectory + directory + base + extension).pipe(createWriteStream(publicDirectory + directory + base + "_s" + extension));
                                        createReadStream(publicDirectory + directory + base + extension).pipe(createWriteStream(publicDirectory + directory + base + "_m" + extension));
                                        createReadStream(publicDirectory + directory + base + extension).pipe(createWriteStream(publicDirectory + directory + base + "_l" + extension));
                                    } catch (e) {
                                        console.log(e);
                                    }
                                });
                                const json = zip.getEntry("doc.json");
                                let docs: any;
                                try {
                                    const data = JSON.parse(json.getData().toString("utf8"));
                                    docs = data.docs;
                                    id = data.id;
                                    docs = Object.keys(docs).map(key => docs[key]);
                                    docs.forEach(mapFn);
                                    await Promise.all(docs.map((doc: any) => new Promise(res => Database.Instance.replace(doc.id, doc, (err, r) => {
                                        err && console.log(err);
                                        res();
                                    }, true, "newDocuments"))));
                                } catch (e) { console.log(e); }
                                unlink(path_2, () => { });
                            }
                            if (id) {
                                res.send(JSON.stringify(getId(id)));
                            } else {
                                res.send(JSON.stringify("error"));
                            }
                        } catch (e) { console.log(e); }
                        resolve();
                    });
                });
            }
        });

        register({
            method: Method.POST,
            subscription: "/inspectImage",
            secureHandler: async ({ req, res }) => {
                const { source } = req.body;
                if (typeof source === "string") {
                    return res.send(await DashUploadUtils.InspectImage(source));
                }
                res.send({});
            }
        });

        register({
            method: Method.POST,
            subscription: "/uploadURI",
            secureHandler: ({ req, res }) => {
                const uri = req.body.uri;
                const filename = req.body.name;
                if (!uri || !filename) {
                    res.status(401).send("incorrect parameters specified");
                    return;
                }
                return imageDataUri.outputFile(uri, serverPathToFile(Directory.images, filename)).then((savedName: string) => {
                    const ext = extname(savedName).toLowerCase();
                    const { pngs, jpgs } = AcceptibleMedia;
                    const resizers = [
                        { resizer: sharp().resize(100, undefined, { withoutEnlargement: true }), suffix: "_s" },
                        { resizer: sharp().resize(400, undefined, { withoutEnlargement: true }), suffix: "_m" },
                        { resizer: sharp().resize(900, undefined, { withoutEnlargement: true }), suffix: "_l" },
                    ];
                    let isImage = false;
                    if (pngs.includes(ext)) {
                        resizers.forEach(element => {
                            element.resizer = element.resizer.png();
                        });
                        isImage = true;
                    } else if (jpgs.includes(ext)) {
                        resizers.forEach(element => {
                            element.resizer = element.resizer.jpeg();
                        });
                        isImage = true;
                    }
                    if (isImage) {
                        resizers.forEach(resizer => {
                            const path = serverPathToFile(Directory.images, filename + resizer.suffix + ext);
                            createReadStream(savedName).pipe(resizer.resizer).pipe(createWriteStream(path));
                        });
                    }
                    res.send(clientPathToFile(Directory.images, filename + ext));
                });
            }
        });

    }

}