import ApiManager, { Registration } from "./ApiManager";
import RouteManager, { Method } from "../RouteManager";
import RouteSubscriber from "../RouteSubscriber";
import { RouteStore } from "../RouteStore";
import * as Archiver from 'archiver';
import * as express from 'express';
import { Database } from "../database";
import * as path from "path";
import { DashUploadUtils } from "../DashUploadUtils";

export type Hierarchy = { [id: string]: string | Hierarchy };
export type ZipMutator = (file: Archiver.Archiver) => void | Promise<void>;
export interface DocumentElements {
    data: string | any[];
    title: string;
}

export default class ExportManager extends ApiManager {

    protected initialize(register: Registration): void {

        register({
            method: Method.GET,
            subscription: new RouteSubscriber(RouteStore.imageHierarchyExport).add('docId'),
            onValidation: async ({ req, res }) => {
                const id = req.params.docId;
                const hierarchy: Hierarchy = {};
                await buildHierarchyRecursive(id, hierarchy);
                BuildAndDispatchZip(res, zip => writeHierarchyRecursive(zip, hierarchy));
            }
        });
    }

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
    const zip = Archiver('zip');
    zip.pipe(res);
    await mutator(zip);
    zip.finalize();
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

async function getData(seedId: string): Promise<DocumentElements> {
    return new Promise<DocumentElements>((resolve, reject) => {
        Database.Instance.getDocument(seedId, async (result: any) => {
            const { data, proto, title } = result.fields;
            if (data) {
                if (data.url) {
                    resolve({ data: data.url, title });
                } else if (data.fields) {
                    resolve({ data: data.fields, title });
                } else {
                    reject();
                }
            }
            if (proto) {
                getData(proto.fieldId).then(resolve, reject);
            }
        });
    });
}

async function writeHierarchyRecursive(file: Archiver.Archiver, hierarchy: Hierarchy, prefix = "Dash Export"): Promise<void> {
    for (const key of Object.keys(hierarchy)) {
        const result = hierarchy[key];
        if (typeof result === "string") {
            let path: string;
            let matches: RegExpExecArray | null;
            if ((matches = /\:1050\/files\/(upload\_[\da-z]{32}.*)/g.exec(result)) !== null) {
                path = `${__dirname}/public/files/${matches[1]}`;
            } else {
                const information = await DashUploadUtils.UploadImage(result);
                path = information.mediaPaths[0];
            }
            file.file(path, { name: key, prefix });
        } else {
            await writeHierarchyRecursive(file, result, `${prefix}/${key}`);
        }
    }
}