import * as rp from 'request-promise';
import { Opt, Doc } from '../../new_fields/Doc';
import { Docs } from '../documents/Documents';
import { SchemaHeaderField } from '../../new_fields/SchemaHeaderField';
import { Utils } from '../../Utils';

export namespace ApiUtils {
    export async function fetchHtml(url: string): Promise<Opt<Document>> {
        const res = await rp.get(Utils.CorsProxy(url));
        if (typeof res !== "string") {
            return undefined;
        }

        const domParser = new DOMParser;
        const doc = domParser.parseFromString(res, "text/html");

        return doc;
    }

    export function getTableHeaders(table: HTMLTableElement): string[] {
        const headerCells = table.rows[0].cells;
        const headers: string[] = [];
        for (let i = 0; i < headerCells.length; i++) {
            const text = headerCells[i].textContent;
            if (text) {
                headers.push(text);
            }
        }
        return headers;
    }

    export function parseTable(table: HTMLTableElement, columns?: string[], rowFunc?: (row: { [column: string]: string }) => boolean): Doc {
        const headerRow = table.rows[0].cells;
        const includedColumns: { index: number, name: string }[] = [];
        const columnSet = new Set(columns);
        let numUnnamed = 0;
        for (let i = 0; i < headerRow.length; i++) {
            const name = headerRow[i].textContent ?? `column_${numUnnamed++}`;
            if (columns && columnSet.has(name)) {
                includedColumns.push({ name, index: i });
            }
        }

        const docs: Doc[] = [];
        for (let i = 1; i < table.rows.length; i++) {
            const row = table.rows[i];
            let rowObj: { [column: string]: string } = {};
            for (const column of includedColumns) {
                const cell = row.cells[column.index];
                rowObj[column.name] = cell.textContent ?? "";
            }
            if (rowFunc?.(rowObj) ?? true) {
                const row = new Doc();
                Doc.assign(row, rowObj);
                docs.push(row);
            }
        }
        return Docs.Create.SchemaDocument(includedColumns.map(col => new SchemaHeaderField(col.name)), docs, {});
    }

}