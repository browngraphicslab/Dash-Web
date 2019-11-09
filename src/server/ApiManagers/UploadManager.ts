import ApiManager, { Registration } from "./ApiManager";
import { Method, _success } from "../RouteManager";
import * as formidable from 'formidable';
import v4 = require('uuid/v4');
var AdmZip = require('adm-zip');
import * as path from 'path';
import { createReadStream, createWriteStream, unlink, readFileSync } from "fs";
import { publicDirectory, filesDirectory, Partitions } from "..";
import { RouteStore } from "../RouteStore";
import { Database } from "../database";
import { DashUploadUtils } from "../DashUploadUtils";
import { Opt } from "../../new_fields/Doc";
import { ParsedPDF } from "../PdfTypes";
const pdf = require('pdf-parse');
import * as sharp from 'sharp';
import { SharedMediaTypes } from "../SharedMediaTypes";
const imageDataUri = require('image-data-uri');

export default class UploadManager extends ApiManager {

    protected initialize(register: Registration): void {

        register({
            method: Method.POST,
            subscription: "/uploadDoc",
            onValidation: ({ req, res }) => {
                let form = new formidable.IncomingForm();
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
                                    let dirname = path.dirname(entry.entryName) + "/";
                                    let extname = path.extname(entry.entryName);
                                    let basename = path.basename(entry.entryName).split(".")[0];
                                    // zip.extractEntryTo(dirname + basename + "_o" + extname, __dirname + RouteStore.public, true, false);
                                    // zip.extractEntryTo(dirname + basename + "_s" + extname, __dirname + RouteStore.public, true, false);
                                    // zip.extractEntryTo(dirname + basename + "_m" + extname, __dirname + RouteStore.public, true, false);
                                    // zip.extractEntryTo(dirname + basename + "_l" + extname, __dirname + RouteStore.public, true, false);
                                    try {
                                        zip.extractEntryTo(entry.entryName, __dirname + RouteStore.public, true, false);
                                        dirname = "/" + dirname;

                                        createReadStream(publicDirectory + dirname + basename + extname).pipe(createWriteStream(publicDirectory + dirname + basename + "_o" + extname));
                                        createReadStream(publicDirectory + dirname + basename + extname).pipe(createWriteStream(publicDirectory + dirname + basename + "_s" + extname));
                                        createReadStream(publicDirectory + dirname + basename + extname).pipe(createWriteStream(publicDirectory + dirname + basename + "_m" + extname));
                                        createReadStream(publicDirectory + dirname + basename + extname).pipe(createWriteStream(publicDirectory + dirname + basename + "_l" + extname));
                                    } catch (e) {
                                        console.log(e);
                                    }
                                });
                                const json = zip.getEntry("doc.json");
                                let docs: any;
                                try {
                                    let data = JSON.parse(json.getData().toString("utf8"));
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
            subscription: RouteStore.upload,
            onValidation: async ({ req, res }) => {
                let form = new formidable.IncomingForm();
                form.uploadDir = filesDirectory;
                form.keepExtensions = true;
                return new Promise<void>(resolve => {
                    form.parse(req, async (_err, _fields, files) => {
                        let results: DashUploadUtils.ImageFileResponse[] = [];
                        for (const key in files) {
                            const { type, path: location, name } = files[key];
                            const filename = path.basename(location);
                            let uploadInformation: Opt<DashUploadUtils.UploadInformation>;
                            if (filename.endsWith(".pdf")) {
                                let dataBuffer = readFileSync(filesDirectory + filename);
                                const result: ParsedPDF = await pdf(dataBuffer);
                                await new Promise<void>((resolve, reject) => {
                                    const path = filesDirectory + Partitions.PdfText + "/" + filename.substring(0, filename.length - ".pdf".length) + ".txt";
                                    createWriteStream(path).write(result.text, error => {
                                        if (!error) {
                                            resolve();
                                        } else {
                                            reject(error);
                                        }
                                    });
                                });
                            } else {
                                uploadInformation = await DashUploadUtils.UploadImage(filesDirectory + filename, filename);
                            }
                            const exif = uploadInformation ? uploadInformation.exifData : undefined;
                            results.push({ name, type, path: `/files/${filename}`, exif });
                        }
                        _success(res, results);
                        resolve();
                    });
                });
            }
        });

        register({
            method: Method.POST,
            subscription: RouteStore.inspectImage,
            onValidation: async ({ req, res }) => {
                const { source } = req.body;
                if (typeof source === "string") {
                    const uploadInformation = await DashUploadUtils.UploadImage(source);
                    return res.send(await DashUploadUtils.InspectImage(uploadInformation.mediaPaths[0]));
                }
                res.send({});
            }
        });

        register({
            method: Method.POST,
            subscription: RouteStore.dataUriToImage,
            onValidation: ({ req, res }) => {
                const uri = req.body.uri;
                const filename = req.body.name;
                if (!uri || !filename) {
                    res.status(401).send("incorrect parameters specified");
                    return;
                }
                return imageDataUri.outputFile(uri, filesDirectory + filename).then((savedName: string) => {
                    const ext = path.extname(savedName).toLowerCase();
                    const { pngs, jpgs } = SharedMediaTypes;
                    let resizers = [
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
                            createReadStream(savedName).pipe(resizer.resizer).pipe(createWriteStream(filesDirectory + filename + resizer.suffix + ext));
                        });
                    }
                    res.send("/files/" + filename + ext);
                });
            }
        });

    }

}