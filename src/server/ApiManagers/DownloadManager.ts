import ApiManager, { Registration } from "./ApiManager";
import { Method } from "../RouteManager";
import RouteSubscriber from "../RouteSubscriber";
import * as Archiver from 'archiver';
import * as express from 'express';
import { Database } from "../database";
import * as path from "path";
import { DashUploadUtils, SizeSuffix } from "../DashUploadUtils";
import { publicDirectory } from "..";
import { serverPathToFile, Directory } from "./UploadManager";

export type Hierarchy = { [id: string]: string | Hierarchy };
export type ZipMutator = (file: Archiver.Archiver) => void | Promise<void>;
export interface DocumentElements {
    data: string | any[];
    title: string;
}

export default class DownloadManager extends ApiManager {

    protected initialize(register: Registration): void {

        /**
         * Let's say someone's using Dash to organize images in collections.
         * This lets them export the hierarchy they've built to their
         * own file system in a useful format.
         * 
         * This handler starts with a single document id (interesting only
         * if it's that of a collection). It traverses the database, captures
         * the nesting of only nested images or collections, writes
         * that to a zip file and returns it to the client for download.
         */
        register({
            method: Method.GET,
            subscription: new RouteSubscriber("imageHierarchyExport").add('docId'),
            secureHandler: async ({ req, res }) => {
                const id = req.params.docId;
                const hierarchy: Hierarchy = {};
                await buildHierarchyRecursive(id, hierarchy);
                return BuildAndDispatchZip(res, zip => writeHierarchyRecursive(zip, hierarchy));
            }
        });

        register({
            method: Method.GET,
            subscription: new RouteSubscriber("downloadId").add("docId"),
            secureHandler: async ({ req, res }) => {
                return BuildAndDispatchZip(res, async zip => {
                    const { id, docs, files } = await getDocs(req.params.docId);
                    const docString = JSON.stringify({ id, docs });
                    zip.append(docString, { name: "doc.json" });
                    files.forEach(val => {
                        zip.file(publicDirectory + val, { name: val.substring(1) });
                    });
                });
            }
        });

        register({
            method: Method.GET,
            subscription: new RouteSubscriber("serializeDoc").add("docId"),
            secureHandler: async ({ req, res }) => {
                const { docs, files } = await getDocs(req.params.docId);
                res.send({ docs, files: Array.from(files) });
            }
        });

    }

}

async function getDocs(id: string) {
    const files = new Set<string>();
    const docs: { [id: string]: any } = {};
    const fn = (doc: any): string[] => {
        const id = doc.id;
        if (typeof id === "string" && id.endsWith("Proto")) {
            //Skip protos
            return [];
        }
        const ids: string[] = [];
        for (const key in doc.fields) {
            if (!doc.fields.hasOwnProperty(key)) {
                continue;
            }
            const field = doc.fields[key];
            if (field === undefined || field === null) {
                continue;
            }

            if (field.__type === "proxy" || field.__type === "prefetch_proxy") {
                ids.push(field.fieldId);
            } else if (field.__type === "script" || field.__type === "computed") {
                if (field.captures) {
                    ids.push(field.captures.fieldId);
                }
            } else if (field.__type === "list") {
                ids.push(...fn(field));
            } else if (typeof field === "string") {
                const re = /"(?:dataD|d)ocumentId"\s*:\s*"([\w\-]*)"/g;
                let match: string[] | null;
                while ((match = re.exec(field)) !== null) {
                    ids.push(match[1]);
                }
            } else if (field.__type === "RichTextField") {
                const re = /"href"\s*:\s*"(.*?)"/g;
                let match: string[] | null;
                while ((match = re.exec(field.Data)) !== null) {
                    const urlString = match[1];
                    const split = new URL(urlString).pathname.split("doc/");
                    if (split.length > 1) {
                        ids.push(split[split.length - 1]);
                    }
                }
                const re2 = /"src"\s*:\s*"(.*?)"/g;
                while ((match = re2.exec(field.Data)) !== null) {
                    const urlString = match[1];
                    const pathname = new URL(urlString).pathname;
                    files.add(pathname);
                }
            } else if (["audio", "image", "video", "pdf", "web"].includes(field.__type)) {
                const url = new URL(field.url);
                const pathname = url.pathname;
                files.add(pathname);
            }
        }

        if (doc.id) {
            docs[doc.id] = doc;
        }
        return ids;
    };
    await Database.Instance.visit([id], fn);
    return { id, docs, files };
}

/**
 * This utility function factors out the process
 * of creating a zip file and sending it back to the client
 * by piping it into a response.
 * 
 * Learn more about piping and readable / writable streams here!
 * https://www.freecodecamp.org/news/node-js-streams-everything-you-need-to-know-c9141306be93/ 
 * 
 * @param res the writable stream response object that will transfer the generated zip file
 * @param mutator the callback function used to actually modify and insert information into the zip instance
 */
export async function BuildAndDispatchZip(res: express.Response, mutator: ZipMutator): Promise<void> {
    res.set('Content-disposition', `attachment;`);
    res.set('Content-Type', "application/zip");
    const zip = Archiver('zip');
    zip.pipe(res);
    await mutator(zip);
    return zip.finalize();
}

/**
 * This function starts with a single document id as a seed,
 * typically that of a collection, and then descends the entire tree
 * of image or collection documents that are reachable from that seed. 
 * @param seedId the id of the root of the subtree we're trying to capture, interesting only if it's a collection
 * @param hierarchy the data structure we're going to use to record the nesting of the collections and images as we descend
 */

/*
Below is an example of the JSON hierarchy built from two images contained inside a collection titled 'a nested collection',
following the general recursive structure shown immediately below
{
    "parent folder name":{
        "first child's fild name":"first child's url"
        ...
        "nth child's fild name":"nth child's url"
    }
}
{ 
    "a nested collection (865c4734-c036-4d67-a588-c71bb43d1440)":{ 
        "an image of a cat (ace99ffd-8ed8-4026-a5d5-a353fff57bdd).jpg":"https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Cat03.jpg/1200px-Cat03.jpg",
        "1*SGJw31T5Q9Zfsk24l2yirg.gif (9321cc9b-9b3e-4cb6-b99c-b7e667340f05).gif":"https://cdn-media-1.freecodecamp.org/images/1*SGJw31T5Q9Zfsk24l2yirg.gif"
    }
}
*/
async function buildHierarchyRecursive(seedId: string, hierarchy: Hierarchy): Promise<void> {
    const { title, data } = await getData(seedId);
    const label = `${title} (${seedId})`;
    // is the document a collection?
    if (Array.isArray(data)) {
        // recurse over all documents in the collection.
        const local: Hierarchy = {}; // create a child hierarchy for this level, which will get passed in as the parent of the recursive call
        hierarchy[label] = local; // store it at the index in the parent, so we'll end up with a map of maps of maps
        await Promise.all(data.map(proxy => buildHierarchyRecursive(proxy.fieldId, local)));
    } else {
        // now, data can only be a string, namely the url of the image
        const filename = label + path.extname(data); // this is the file name under which the output image will be stored
        hierarchy[filename] = data;
    }
}

/**
 * This is a very specific utility method to help traverse the database
 * to parse data and titles out of images and collections alone.
 * 
 * We don't know if the document id given to is corresponds to a view document or a data
 * document. If it's a data document, the response from the database will have
 * a data field. If not, call recursively on the proto, and resolve with *its* data
 * 
 * @param targetId the id of the Dash document whose data is being requests
 * @returns the data of the document, as well as its title
 */
async function getData(targetId: string): Promise<DocumentElements> {
    return new Promise<DocumentElements>((resolve, reject) => {
        Database.Instance.getDocument(targetId, async (result: any) => {
            const { data, proto, title } = result.fields;
            if (data) {
                if (data.url) {
                    resolve({ data: data.url, title });
                } else if (data.fields) {
                    resolve({ data: data.fields, title });
                } else {
                    reject();
                }
            } else if (proto) {
                getData(proto.fieldId).then(resolve, reject);
            } else {
                reject();
            }
        });
    });
}

/**
 * 
 * @param file the zip file to which we write the files
 * @param hierarchy the data structure from which we read, defining the nesting of the documents in the zip
 * @param prefix lets us create nested folders in the zip file by continually appending to the end
 * of the prefix with each layer of recursion.
 * 
 * Function Call #1 => "Dash Export"
 * Function Call #2 => "Dash Export/a nested collection"
 * Function Call #3 => "Dash Export/a nested collection/lowest level collection"
 * ...
 */
async function writeHierarchyRecursive(file: Archiver.Archiver, hierarchy: Hierarchy, prefix = "Dash Export"): Promise<void> {
    for (const documentTitle of Object.keys(hierarchy)) {
        const result = hierarchy[documentTitle];
        // base case or leaf node, we've hit a url (image)
        if (typeof result === "string") {
            let path: string;
            let matches: RegExpExecArray | null;
            if ((matches = /\:1050\/files\/images\/(upload\_[\da-z]{32}.*)/g.exec(result)) !== null) {
                // image already exists on our server
                path = serverPathToFile(Directory.images, matches[1]);
            } else {
                // the image doesn't already exist on our server (may have been dragged
                // and dropped in the browser and thus hosted remotely) so we upload it
                // to our server and point the zip file to it, so it can bundle up the bytes
                const information = await DashUploadUtils.UploadImage(result);
                path = information.serverAccessPaths[SizeSuffix.Original];
            }
            // write the file specified by the path to the directory in the
            // zip file given by the prefix.
            file.file(path, { name: documentTitle, prefix });
        } else {
            // we've hit a collection, so we have to recurse
            await writeHierarchyRecursive(file, result, `${prefix}/${documentTitle}`);
        }
    }
}