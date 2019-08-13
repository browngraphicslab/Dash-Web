import * as rp from 'request-promise';
import { DocServer } from '../DocServer';
import { Doc } from '../../new_fields/Doc';
import { Id } from '../../new_fields/FieldSymbols';
import { Utils } from '../../Utils';

export namespace SearchUtil {
    export type HighlightingResult = { [id: string]: { [key: string]: string[] } };

    export interface IdSearchResult {
        ids: string[];
        numFound: number;
        highlighting: HighlightingResult | undefined;
    }

    export interface DocSearchResult {
        docs: Doc[];
        numFound: number;
        highlighting: HighlightingResult | undefined;
    }

    export interface SearchParams {
        hl?: boolean;
        "hl.fl"?: string;
        start?: number;
        rows?: number;
        fq?: string;
    }
    export function Search(query: string, returnDocs: true, options?: SearchParams): Promise<DocSearchResult>;
    export function Search(query: string, returnDocs: false, options?: SearchParams): Promise<IdSearchResult>;
    export async function Search(query: string, returnDocs: boolean, options: SearchParams = {}) {
        query = query || "*"; //If we just have a filter query, search for * as the query
        const result: IdSearchResult = JSON.parse(await rp.get(Utils.prepend("/search"), {
            qs: { ...options, q: query },
        }));
        if (!returnDocs) {
            return result;
        }
        const { ids, numFound, highlighting } = result;
        const docMap = await DocServer.GetRefFields(ids);
        const docs = ids.map((id: string) => docMap[id]).filter((doc: any) => doc instanceof Doc);
        return { docs, numFound, highlighting };
    }

    export async function GetAliasesOfDocument(doc: Doc): Promise<Doc[]>;
    export async function GetAliasesOfDocument(doc: Doc, returnDocs: false): Promise<string[]>;
    export async function GetAliasesOfDocument(doc: Doc, returnDocs = true): Promise<Doc[] | string[]> {
        const proto = Doc.GetProto(doc);
        const protoId = proto[Id];
        if (returnDocs) {
            return (await Search("", returnDocs, { fq: `proto_i:"${protoId}"` })).docs;
        } else {
            return (await Search("", returnDocs, { fq: `proto_i:"${protoId}"` })).ids;
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
        let response = await rp.get(Utils.prepend('/search'), {
            qs:
                { start: 0, rows: 10000, q: query },

        });
        let result: IdSearchResult = JSON.parse(response);
        const { ids, numFound, highlighting } = result;
        console.log(ids.length);
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
