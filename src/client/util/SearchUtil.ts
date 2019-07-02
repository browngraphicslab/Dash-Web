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

    export async function GetAliasesOfDocument(doc: Doc): Promise<Doc[]> {
        const proto = await Doc.GetT(doc, "proto", Doc, true);
        const protoId = (proto || doc)[Id];
        const result = await Search(`proto_i:"${protoId}"`, true);
        return result.docs;
        // return Search(`{!join from=id to=proto_i}id:${protoId}`, true);
    }

    export async function GetViewsOfDocument(doc: Doc): Promise<Doc[]> {
        const results = await Search(`proto_i:"${doc[Id]}"`, true);
        return results.docs;
    }
}