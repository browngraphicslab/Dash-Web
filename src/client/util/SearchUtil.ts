import * as rp from 'request-promise';
import { DocServer } from '../DocServer';
import { Doc } from '../../new_fields/Doc';
import { Id } from '../../new_fields/FieldSymbols';

export namespace SearchUtil {
    export interface IdSearchResult {
        ids: string[];
        numFound: number;
    }

    export interface DocSearchResult {
        docs: Doc[];
        numFound: number;
    }

    export function Search(query: string, returnDocs: true): Promise<DocSearchResult>;
    export function Search(query: string, returnDocs: false): Promise<IdSearchResult>;
    export async function Search(query: string, returnDocs: boolean) {
        const result: IdSearchResult = JSON.parse(await rp.get(DocServer.prepend("/search"), {
            qs: { query }
        }));
        if (!returnDocs) {
            return result;
        }
        const { ids, numFound } = result;
        const docMap = await DocServer.GetRefFields(ids);
        const docs = ids.map((id: string) => docMap[id]).filter((doc: any) => doc instanceof Doc);
        return { docs, numFound };
    }

    export async function GetAliasesOfDocument(doc: Doc): Promise<Doc[]>;
    export async function GetAliasesOfDocument(doc: Doc, returnDocs: false): Promise<string[]>;
    export async function GetAliasesOfDocument(doc: Doc, returnDocs = true): Promise<Doc[] | string[]> {
        const proto = Doc.GetProto(doc);
        const protoId = proto[Id];
        if (returnDocs) {
            return (await Search(`proto_i:"${protoId}"`, returnDocs)).docs;
        } else {
            return (await Search(`proto_i:"${protoId}"`, returnDocs)).ids;
        }
        // return Search(`{!join from=id to=proto_i}id:${protoId}`, true);
    }

    export async function GetViewsOfDocument(doc: Doc): Promise<Doc[]> {
        const results = await Search(`proto_i:"${doc[Id]}"`, true);
        return results.docs;
    }

    export async function GetContextsOfDocument(doc: Doc): Promise<{ contexts: Doc[], aliasContexts: Doc[] }> {
        const docContexts = (await Search(`data_l:"${doc[Id]}"`, true)).docs;
        const aliases = await GetAliasesOfDocument(doc, false);
        const aliasContexts = (await Promise.all(aliases.map(doc => Search(`data_l:"${doc}"`, true))));
        const contexts = { contexts: docContexts, aliasContexts: [] as Doc[] };
        aliasContexts.forEach(result => contexts.aliasContexts.push(...result.docs));
        return contexts;
    }

    export async function GetContextIdsOfDocument(doc: Doc): Promise<{ contexts: string[], aliasContexts: string[] }> {
        const docContexts = (await Search(`data_l:"${doc[Id]}"`, false)).ids;
        const aliases = await GetAliasesOfDocument(doc, false);
        const aliasContexts = (await Promise.all(aliases.map(doc => Search(`data_l:"${doc}"`, false))));
        const contexts = { contexts: docContexts, aliasContexts: [] as string[] };
        aliasContexts.forEach(result => contexts.aliasContexts.push(...result.ids));
        return contexts;
    }
}