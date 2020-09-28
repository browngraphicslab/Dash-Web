import * as rp from 'request-promise';
import { DocServer } from '../DocServer';
import { Doc } from '../../fields/Doc';
import { Id } from '../../fields/FieldSymbols';
import { Utils } from '../../Utils';
import { DocumentType } from '../documents/DocumentTypes';

export namespace SearchUtil {
    export type HighlightingResult = { [id: string]: { [key: string]: string[] } };

    export interface IdSearchResult {
        ids: string[];
        lines: string[][];
        numFound: number;
        highlighting: HighlightingResult | undefined;
    }

    export interface DocSearchResult {
        docs: Doc[];
        lines: string[][];
        numFound: number;
        highlighting: HighlightingResult | undefined;
    }

    export interface SearchParams {
        hl?: string;
        "hl.fl"?: string;
        start?: number;
        rows?: number;
        fq?: string;
        sort?: string;
        allowAliases?: boolean;
        onlyAliases?: boolean;
        "facet"?: string;
        "facet.field"?: string;
    }
    export function Search(query: string, returnDocs: true, options?: SearchParams): Promise<DocSearchResult>;
    export function Search(query: string, returnDocs: false, options?: SearchParams): Promise<IdSearchResult>;
    export async function Search(query: string, returnDocs: boolean, options: SearchParams = {}) {
        query = query || "*"; //If we just have a filter query, search for * as the query
        const rpquery = Utils.prepend("/dashsearch");
        let replacedQuery = query.replace(/type_t:([^ )])/g, (substring, arg) => `{!join from=id to=proto_i}*:* AND ${arg}`);
        if (options.onlyAliases) {
            const header = query.match(/_[atnb]?:/) ? replacedQuery : "DEFAULT:" + replacedQuery;
            replacedQuery = `{!join from=id to=proto_i}* AND ${header}`;
        }
        console.log("Q: " + replacedQuery + " fq: " + options.fq);
        const gotten = await rp.get(rpquery, { qs: { ...options, q: replacedQuery } });
        const result: IdSearchResult = gotten.startsWith("<") ? { ids: [], docs: [], numFound: 0, lines: [] } : JSON.parse(gotten);
        if (!returnDocs) {
            return result;
        }

        const { ids, highlighting } = result;

        const txtresult = query !== "*" && JSON.parse(await rp.get(Utils.prepend("/textsearch"), {
            qs: { ...options, q: query.replace(/^[ \+\?\*\|]*/, "") }, // a leading '+' leads to a server crash since findInFiles doesn't handle regex failures
        }));

        const fileids = txtresult ? txtresult.ids : [];
        const newIds: string[] = [];
        const newLines: string[][] = [];
        if (fileids) {
            await Promise.all(fileids.map(async (tr: string, i: number) => {
                const docQuery = "fileUpload_t:" + tr.substr(0, 7); //If we just have a filter query, search for * as the query
                const docResult = JSON.parse(await rp.get(Utils.prepend("/dashsearch"), { qs: { ...options, q: docQuery } }));
                newIds.push(...docResult.ids);
                newLines.push(...docResult.ids.map((dr: any) => txtresult.lines[i]));
            }));
        }


        const theDocs: Doc[] = [];
        const theLines: string[][] = [];
        const textDocMap = await DocServer.GetRefFields(newIds);
        const textDocs = newIds.map((id: string) => textDocMap[id]).map(doc => doc as Doc);
        for (let i = 0; i < textDocs.length; i++) {
            const testDoc = textDocs[i];
            if (testDoc instanceof Doc && testDoc.type !== DocumentType.KVP && theDocs.findIndex(d => Doc.AreProtosEqual(d, testDoc)) === -1) {
                theDocs.push(Doc.GetProto(testDoc));
                theLines.push(newLines[i].map(line => line.replace(query, query.toUpperCase())));
            }
        }

        const docMap = await DocServer.GetRefFields(ids);
        const docs = ids.map((id: string) => docMap[id]).map(doc => doc as Doc);
        for (let i = 0; i < ids.length; i++) {
            const testDoc = docs[i];
            if (testDoc instanceof Doc && testDoc.type !== DocumentType.KVP && (options.allowAliases || testDoc.proto === undefined || theDocs.findIndex(d => Doc.AreProtosEqual(d, testDoc)) === -1)) {
                theDocs.push(testDoc);
                theLines.push([]);
            } else {
                result.numFound--;
            }
        }

        return { docs: theDocs, numFound: Math.max(0, result.numFound), highlighting, lines: theLines };
    }

    export async function GetAliasesOfDocument(doc: Doc): Promise<Doc[]>;
    export async function GetAliasesOfDocument(doc: Doc, returnDocs: false): Promise<string[]>;
    export async function GetAliasesOfDocument(doc: Doc, returnDocs = true): Promise<Doc[] | string[]> {
        const proto = Doc.GetProto(doc);
        const protoId = proto[Id];
        if (returnDocs) {
            return (await Search("", returnDocs, { fq: `proto_i:"${protoId}"`, allowAliases: true })).docs;
        } else {
            return (await Search("", returnDocs, { fq: `proto_i:"${protoId}"`, allowAliases: true })).ids;
        }
        // return Search(`{!join from=id to=proto_i}id:${protoId}`, true);
    }

    export async function GetViewsOfDocument(doc: Doc): Promise<Doc[]> {
        const results = await Search("", true, { fq: `proto_i:"${doc[Id]}"` });
        return results.docs;
    }

    export async function GetContextsOfDocument(doc: Doc): Promise<{ contexts: Doc[], aliasContexts: Doc[] }> {
        const docContexts = (await Search("", true, { fq: `data_l:"${doc[Id]}"` })).docs;
        const aliases = await GetAliasesOfDocument(doc, false);
        const aliasContexts = (await Promise.all(aliases.map(doc => Search("", true, { fq: `data_l:"${doc}"` }))));
        const contexts = { contexts: docContexts, aliasContexts: [] as Doc[] };
        aliasContexts.forEach(result => contexts.aliasContexts.push(...result.docs));
        return contexts;
    }

    export async function GetContextIdsOfDocument(doc: Doc): Promise<{ contexts: string[], aliasContexts: string[] }> {
        const docContexts = (await Search("", false, { fq: `data_l:"${doc[Id]}"` })).ids;
        const aliases = await GetAliasesOfDocument(doc, false);
        const aliasContexts = (await Promise.all(aliases.map(doc => Search("", false, { fq: `data_l:"${doc}"` }))));
        const contexts = { contexts: docContexts, aliasContexts: [] as string[] };
        aliasContexts.forEach(result => contexts.aliasContexts.push(...result.ids));
        return contexts;
    }

    export async function GetAllDocs() {
        const query = "*";
        const response = await rp.get(Utils.prepend('/dashsearch'), {
            qs:
                { start: 0, rows: 10000, q: query },

        });
        const result: IdSearchResult = JSON.parse(response);
        const { ids, numFound, highlighting } = result;
        const docMap = await DocServer.GetRefFields(ids);
        const docs: Doc[] = [];
        for (const id of ids) {
            const field = docMap[id];
            if (field instanceof Doc) {
                docs.push(field);
            }
        }
        return docs;
        // const docs = ids.map((id: string) => docMap[id]).filter((doc: any) => doc instanceof Doc);
        // return docs as Doc[];
    }
}
