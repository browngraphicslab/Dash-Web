import * as rp from 'request-promise';
import { DocServer } from '../DocServer';
import { Doc } from '../../new_fields/Doc';
import { Id } from '../../new_fields/FieldSymbols';

export namespace SearchUtil {
    export function Search(query: string, returnDocs: true): Promise<Doc[]>;
    export function Search(query: string, returnDocs: false): Promise<string[]>;
    export async function Search(query: string, returnDocs: boolean) {
        const ids = JSON.parse(await rp.get(DocServer.prepend("/search"), {
            qs: { query }
        }));
        if (!returnDocs) {
            return ids;
        }
        const docMap = await DocServer.GetRefFields(ids);
        return ids.map((id: string) => docMap[id]).filter((doc: any) => doc instanceof Doc);
    }

    export async function GetAliasesOfDocument(doc: Doc): Promise<Doc[]> {
        const proto = await Doc.GetT(doc, "proto", Doc, true);
        const protoId = (proto || doc)[Id];
        return Search(`{!join from=id to=proto_i}id:${protoId}`, true);
    }
}