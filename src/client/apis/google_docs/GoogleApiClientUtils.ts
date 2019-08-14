import { docs_v1 } from "googleapis";
import { PostToServer } from "../../../Utils";
import { RouteStore } from "../../../server/RouteStore";
import { Opt, Doc } from "../../../new_fields/Doc";
import { isArray } from "util";

export namespace GoogleApiClientUtils {

    export namespace Docs {

        export enum Actions {
            Create = "create",
            Retrieve = "retrieve",
            Update = "update"
        }

        export namespace Utils {

            export const extractText = (document: docs_v1.Schema$Document, removeNewlines = false) => {
                let fragments: string[] = [];
                if (document.body && document.body.content) {
                    for (let element of document.body.content) {
                        if (element.paragraph && element.paragraph.elements) {
                            for (let inner of element.paragraph.elements) {
                                if (inner && inner.textRun) {
                                    let fragment = inner.textRun.content;
                                    fragment && fragments.push(fragment);
                                }
                            }
                        }
                    }
                }
                let text = fragments.join("");
                return removeNewlines ? text.ReplaceAll("\n", "") : text;
            };

            export const EndOf = (schema: docs_v1.Schema$Document): Opt<number> => {
                if (schema.body && schema.body.content) {
                    let paragraphs = schema.body.content.filter(el => el.paragraph);
                    if (paragraphs.length) {
                        let target = paragraphs[paragraphs.length - 1];
                        if (target.paragraph && target.paragraph.elements) {
                            length = target.paragraph.elements.length;
                            if (length) {
                                let final = target.paragraph.elements[length - 1];
                                return final.endIndex ? final.endIndex - 1 : undefined;
                            }
                        }
                    }
                }
            };

        }

        export interface ReadOptions {
            documentId: string;
            removeNewlines?: boolean;
        }

        export interface WriteOptions {
            documentId?: string;
            title?: string;
            content: string | string[];
            index?: number;
            store?: { receiver: Doc, key: string };
        }

        /**
         * After following the authentication routine, which connects this API call to the current signed in account
         * and grants the appropriate permissions, this function programmatically creates an arbitrary Google Doc which
         * should appear in the user's Google Doc library instantaneously.
         * 
         * @param schema whatever subset of a docs_v1.Schema$Document is required to properly initialize your
         * Google Doc. This schema defines all aspects of a Google Doc, from the title to headers / footers to the
         * actual document body and its styling!
         * @returns the documentId of the newly generated document, or undefined if the creation process fails.
         */
        const Create = async (title?: string): Promise<string | undefined> => {
            let path = RouteStore.googleDocs + Actions.Create;
            let parameters = {
                requestBody: {
                    title: title || `Dash Export (${new Date().toDateString()})`
                }
            };
            try {
                let schema: docs_v1.Schema$Document = await PostToServer(path, parameters);
                return schema.documentId;
            } catch {
                return undefined;
            }
        };

        const Retrieve = async (documentId: string): Promise<docs_v1.Schema$Document | undefined> => {
            let path = RouteStore.googleDocs + Actions.Retrieve;
            let parameters = {
                documentId
            };
            try {
                let schema: docs_v1.Schema$Document = await PostToServer(path, parameters);
                return schema;
            } catch {
                return undefined;
            }
        };

        const Update = async (documentId: string, requests: docs_v1.Schema$Request[]): Promise<docs_v1.Schema$BatchUpdateDocumentResponse | undefined> => {
            let path = RouteStore.googleDocs + Actions.Update;
            let parameters = {
                documentId,
                requestBody: {
                    requests
                }
            };
            try {
                let replies: docs_v1.Schema$BatchUpdateDocumentResponse = await PostToServer(path, parameters);
                console.log(replies);
                return replies;
            } catch {
                return undefined;
            }
        };

        export const Read = async (options: ReadOptions): Promise<string | undefined> => {
            return Retrieve(options.documentId).then(schema => {
                return schema ? Utils.extractText(schema, options.removeNewlines) : undefined;
            });
        };

        export const ReadLines = async (options: ReadOptions) => {
            return Retrieve(options.documentId).then(schema => {
                if (!schema) {
                    return undefined;
                }
                let lines = Utils.extractText(schema).split("\n");
                return options.removeNewlines ? lines.filter(line => line.length) : lines;
            });
        };

        export const Write = async (options: WriteOptions): Promise<docs_v1.Schema$BatchUpdateDocumentResponse | undefined> => {
            let target = options.documentId;
            if (!target) {
                if (!(target = await Create(options.title))) {
                    return undefined;
                }
            }
            let index = options.index;
            if (!index) {
                let schema = await Retrieve(target);
                if (!schema || !(index = Utils.EndOf(schema))) {
                    return undefined;
                }
            }
            let text = options.content;
            let request = {
                insertText: {
                    text: isArray(text) ? text.join("\n") : text,
                    location: { index }
                }
            };
            return Update(target, [request]).then(res => {
                if (res && options.store) {
                    options.store.receiver[options.store.key] = res.documentId;
                }
                return res;
            });
        };

    }

}