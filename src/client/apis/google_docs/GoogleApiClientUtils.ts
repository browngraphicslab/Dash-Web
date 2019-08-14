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
                const fragments: string[] = [];
                if (document.body && document.body.content) {
                    for (const element of document.body.content) {
                        if (element.paragraph && element.paragraph.elements) {
                            for (const inner of element.paragraph.elements) {
                                if (inner && inner.textRun) {
                                    const fragment = inner.textRun.content;
                                    fragment && fragments.push(fragment);
                                }
                            }
                        }
                    }
                }
                const text = fragments.join("");
                return removeNewlines ? text.ReplaceAll("\n", "") : text;
            };

            export const EndOf = (schema: docs_v1.Schema$Document): Opt<number> => {
                if (schema.body && schema.body.content) {
                    const paragraphs = schema.body.content.filter(el => el.paragraph);
                    if (paragraphs.length) {
                        const target = paragraphs[paragraphs.length - 1];
                        if (target.paragraph && target.paragraph.elements) {
                            length = target.paragraph.elements.length;
                            if (length) {
                                const final = target.paragraph.elements[length - 1];
                                return final.endIndex ? final.endIndex - 1 : undefined;
                            }
                        }
                    }
                }
            };

        }

        export type IdHandler = (id: DocumentId) => any;
        export interface CreateOptions {
            handler: IdHandler;
            // if excluded, will use a default title annotated with the current date
            title?: string;
        }

        export interface ReadOptions {
            documentId: string;
            // if exluded, will preserve newlines
            removeNewlines?: boolean;
        }

        export type DocumentId = string;
        export interface WriteOptions {
            content: string | string[];
            reference: DocumentId | CreateOptions;
            // if excluded, will compute the last index of the document and append the content there
            index?: number;
        }

        /**
         * After following the authentication routine, which connects this API call to the current signed in account
         * and grants the appropriate permissions, this function programmatically creates an arbitrary Google Doc which
         * should appear in the user's Google Doc library instantaneously.
         * 
         * @param options the title to assign to the new document, and the information necessary
         * to store the new documentId returned from the creation process
         * @returns the documentId of the newly generated document, or undefined if the creation process fails.
         */
        const Create = async (options: CreateOptions): Promise<string | undefined> => {
            const path = RouteStore.googleDocs + Actions.Create;
            const parameters = {
                requestBody: {
                    title: options.title || `Dash Export (${new Date().toDateString()})`
                }
            };
            try {
                const schema: docs_v1.Schema$Document = await PostToServer(path, parameters);
                const generatedId = schema.documentId;
                if (generatedId) {
                    options.handler(generatedId);
                    return generatedId;
                }
            } catch {
                return undefined;
            }
        };

        const Retrieve = async (documentId: string): Promise<docs_v1.Schema$Document | undefined> => {
            const path = RouteStore.googleDocs + Actions.Retrieve;
            const parameters = {
                documentId
            };
            try {
                const schema: docs_v1.Schema$Document = await PostToServer(path, parameters);
                return schema;
            } catch {
                return undefined;
            }
        };

        const Update = async (documentId: string, requests: docs_v1.Schema$Request[]): Promise<docs_v1.Schema$BatchUpdateDocumentResponse | undefined> => {
            const path = RouteStore.googleDocs + Actions.Update;
            const parameters = {
                documentId,
                requestBody: {
                    requests
                }
            };
            try {
                const replies: docs_v1.Schema$BatchUpdateDocumentResponse = await PostToServer(path, parameters);
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
                const lines = Utils.extractText(schema).split("\n");
                return options.removeNewlines ? lines.filter(line => line.length) : lines;
            });
        };

        export const Write = async (options: WriteOptions): Promise<docs_v1.Schema$BatchUpdateDocumentResponse | undefined> => {
            let documentId: string | undefined;
            const ref = options.reference;
            if (!(documentId = typeof ref === "string" ? ref : await Create(ref))) {
                return undefined;
            }
            let index = options.index;
            if (!index) {
                let schema = await Retrieve(documentId);
                if (!schema || !(index = Utils.EndOf(schema))) {
                    return undefined;
                }
            }
            const text = options.content;
            const request = {
                insertText: {
                    text: isArray(text) ? text.join("\n") : text,
                    location: { index }
                }
            };
            return Update(documentId, [request]);
        };

    }

}