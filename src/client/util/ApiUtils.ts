import * as rp from 'request-promise';
import { Opt, Doc, DocListCastAsync, Field } from '../../new_fields/Doc';
import { Docs } from '../documents/Documents';
import { SchemaHeaderField } from '../../new_fields/SchemaHeaderField';
import { Utils } from '../../Utils';
import { List } from '../../new_fields/List';
import { listSpec } from '../../new_fields/Schema';
import { Cast } from '../../new_fields/Types';
import { Scripting } from './Scripting';
import { PrefetchProxy } from '../../new_fields/Proxy';

// Either map:
//     a column name to itself,
//     a column name to another name,
//     a column index to a name,
export type NamedColumnSpec = { tableName: string, name?: string };
export type IndexColumnSpec = { index: number, name: string };
export type TableColumnSpec = NamedColumnSpec | IndexColumnSpec;

export namespace ApiUtils {

    export function getColumnIdentifier(columnSpec: TableColumnSpec): number | string {
        return "index" in columnSpec ? columnSpec.index : columnSpec.tableName;
    }

    export function getColumnName(columnSpec: TableColumnSpec): string {
        return columnSpec.name ?? (columnSpec as any).tableName;
    }

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
        let numUnnamed = 0;
        for (let i = 0; i < headerCells.length; i++) {
            const name = headerCells[i].textContent ?? `column_${numUnnamed++}`;
            headers.push(name);
        }
        return headers;
    }

    export interface ParseTableOptions {
        primaryKey: string;
        hasHeaderRow: boolean;
        columns?: TableColumnSpec[];
        //rowFunc?: (row: { [column: string]: string }) => boolean;
    }

    export function parseTable(table: HTMLTableElement, options: ParseTableOptions): Doc {
        const { primaryKey, columns, hasHeaderRow } = options;
        const includedColumns: { index: number, name: string }[] = [];
        const columnSet: { [key: string]: string } = {};
        columns && columns.forEach(col => {
            if ("tableName" in col) {
                columnSet[col.tableName] = getColumnName(col);
            } else {
                includedColumns.push(col);
            }
        })
        if (hasHeaderRow) {
            const headerRow = table.rows[0].cells;
            let numUnnamed = 0;
            for (let i = 0; i < headerRow.length; i++) {
                const name = headerRow[i].textContent ?? `column_${numUnnamed++}`;
                if (!columns || columnSet[name]) {
                    includedColumns.push({ name: columnSet[name] ?? name, index: i });
                }
            }
        }

        const docs: Doc[] = [];
        const startIndex = hasHeaderRow ? 1 : 0;
        for (let i = startIndex; i < table.rows.length; i++) {
            const row = table.rows[i];
            let rowObj: { [column: string]: string } = {};
            for (const column of includedColumns) {
                const cell = row.cells[column.index];
                rowObj[column.name] = cell.textContent ?? "";
            }
            const rowDoc = new Doc();
            Doc.assign(rowDoc, rowObj);
            docs.push(rowDoc);
        }
        const collection = Docs.Create.SchemaDocument([new SchemaHeaderField(primaryKey), ...includedColumns.filter(col => col.name !== primaryKey).map(col => new SchemaHeaderField(col.name))], docs, {});
        collection.primaryKey = primaryKey;
        collection.hasHeaderRow = hasHeaderRow;
        if (columns) {
            collection.activeColumns = new List(columns.map(col => {
                const doc = new Doc();
                Doc.assign(doc, col);
                return new PrefetchProxy(doc);
            }));
        }
        return collection;
    }

    export async function updateTable(table: HTMLTableElement, doc: Doc): Promise<boolean> {
        let docs = await DocListCastAsync(doc.data);
        if (!docs) {
            const list = new List<Doc>();
            docs = list as Doc[];
            doc.data = list;
        }
        const primaryKey = Cast(doc.primaryKey, "string");
        const columns = Cast(doc.activeColumns, listSpec(Doc));
        const hasHeaderRow = Cast(doc.hasHeaderRow, "boolean");
        if (!primaryKey) {
            return false;
        }
        if (hasHeaderRow === undefined) {
            return false;
        }
        const docMap: { [key: string]: Doc } = {};
        for (let i = 0; i < docs.length; i++) {
            const doc = docs[i];
            const key = Cast(doc[primaryKey], "string");
            if (key) {
                docMap[key] = doc;
            }
        }
        const includedColumns: { index: number, name: string }[] = [];
        const columnSet: { [key: string]: string } = {};
        columns && columns.forEach(colDoc => {
            if (!(colDoc instanceof Doc)) return;
            const name = Cast(colDoc.name, "string");
            const tableName = Cast(colDoc.tableName, "string");
            const index = Cast(colDoc.index, "number");
            if (tableName === undefined && (index === undefined || name === undefined)) {
                return;
            }
            const col: any = {};
            if (name !== undefined) {
                col.name = name;
            }
            if (tableName !== undefined) {
                col.tableName = tableName;
            }
            if (index !== undefined) {
                col.index = index;
            }
            if ("tableName" in col) {
                columnSet[col.tableName] = getColumnName(col);
            } else {
                includedColumns.push(col);
            }
        })
        if (hasHeaderRow) {
            let numUnnamed = 0;
            const headerRow = table.rows[0].cells;
            for (let i = 0; i < headerRow.length; i++) {
                const name = headerRow[i].textContent ?? `column_${numUnnamed++}`;
                if ((!columns || columnSet[name]) || name === primaryKey) {
                    includedColumns.push({ name: columnSet[name] ?? name, index: i });
                }
            }
        }

        const startIndex = hasHeaderRow ? 1 : 0;
        for (let i = startIndex; i < table.rows.length; i++) {
            const row = table.rows[i];
            let rowObj: { [column: string]: string } = {};
            for (const column of includedColumns) {
                const cell = row.cells[column.index];
                rowObj[column.name] = cell.textContent ?? "";
            }
            const key = rowObj[primaryKey];
            if (!key) continue;
            let rowDoc = docMap[key];
            if (!rowDoc) {
                rowDoc = new Doc;
                Doc.assign(rowDoc, rowObj);
                docs.push(rowDoc);
            } else {
                Doc.assign(rowDoc, rowObj);
            }
        }
        return true;
    }

    export interface ParseApiOptions {
        primaryKey: string;
        selector?: string;
        columns?: string[];
        //parsers?: { [key: string]: (value: string) => Field }
    }

    export function getJsonColumns(table: any[]): string[] {
        const columns = new Set<string>();

        for (const row of table) {
            for (const fieldName in row) {
                const field = row[fieldName];

                if (!Field.IsField(field)) {
                    continue;
                }
                columns.add(fieldName);
            }
        }

        return Array.from(columns);
    }

    export function queryListApi(table: any[], options: ParseApiOptions): Doc {
        const { primaryKey, columns } = options;

        const docs: Doc[] = [];
        const fields = new Set<string>();
        for (const record of table) {
            let rowObj: { [column: string]: Field } = {};
            for (const fieldName of columns ?? Object.keys(record)) {
                const field = record[fieldName];
                if (!Field.IsField(field)) {
                    continue;
                }
                fields.add(fieldName);
                rowObj[fieldName] = field;
            }
            const rowDoc = new Doc();
            Doc.assign(rowDoc, rowObj);
            docs.push(rowDoc);
        }
        fields.delete(primaryKey);
        const collection = Docs.Create.SchemaDocument([new SchemaHeaderField(primaryKey), ...Array.from(fields).map(col => new SchemaHeaderField(col))], docs, {});
        collection.primaryKey = primaryKey;
        if (columns) {
            collection.activeColumns = new List(columns);
        }
        return collection;
    }

    export async function updateApi(table: any[], doc: Doc): Promise<boolean> {
        let docs = await DocListCastAsync(doc.data);
        if (!docs) {
            const list = new List<Doc>();
            docs = list as Doc[];
            doc.data = list;
        }
        const primaryKey = Cast(doc.primaryKey, "string");
        const columns = Cast(doc.activeColumns, listSpec("string"));
        if (!primaryKey) {
            return false;
        }
        const docMap: { [key: string]: Doc } = {};
        for (let i = 0; i < docs.length; i++) {
            const doc = docs[i];
            const key = Cast(doc[primaryKey], "string");
            if (key) {
                docMap[key] = doc;
            }
        }

        for (const record of table) {
            let rowObj: { [column: string]: Field } = {};
            for (const fieldName of columns || Object.keys(record)) {
                const field = record[fieldName];
                if (!Field.IsField(field)) {
                    continue;
                }
                rowObj[fieldName] = field;
            }
            const key = rowObj[primaryKey];
            if (!(typeof key === "string")) continue;
            let rowDoc = docMap[key];
            if (!rowDoc) {
                rowDoc = new Doc;
                Doc.assign(rowDoc, rowObj);
                docs.push(rowDoc);
            } else {
                Doc.assign(rowDoc, rowObj);
            }
        }
        return true;
    }

}

Scripting.addGlobal("ApiUtils", ApiUtils);
Scripting.addGlobal("rp", rp);
Scripting.addGlobal("corsPrefix", Utils.CorsProxy);
