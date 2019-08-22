import { docs_v1, slides_v1 } from "googleapis";
import { PostToServer } from "../../../Utils";
import { RouteStore } from "../../../server/RouteStore";
import { Opt } from "../../../new_fields/Doc";
import { isArray } from "util";

export const Pulls = "googleDocsPullCount";
export const Pushes = "googleDocsPushCount";

export namespace GoogleApiClientUtils {

    export enum Actions {
        Create = "create",
        Retrieve = "retrieve",
        Update = "update"
    }

    export enum WriteMode {
        Insert,
        Replace
    }

    export type DocumentId = string;
    export type Reference = DocumentId | CreateOptions;
    export type TextContent = string | string[];
    export type IdHandler = (id: DocumentId) => any;
    export type CreationResult = Opt<DocumentId>;
    export type ReadLinesResult = Opt<{ title?: string, bodyLines?: string[] }>;
    export type ReadResult = { title?: string, body?: string };

    export interface CreateOptions {
        title?: string; // if excluded, will use a default title annotated with the current date
    }

    export interface RetrieveOptions {
        documentId: DocumentId;
    }

    export type ReadOptions = RetrieveOptions & { removeNewlines?: boolean };

    export interface WriteOptions {
        mode: WriteMode;
        content: TextContent;
        reference: Reference;
        index?: number; // if excluded, will compute the last index of the document and append the content there
    }


    export namespace Docs {

        export type RetrievalResult = Opt<docs_v1.Schema$Document>;
        export type UpdateResult = Opt<docs_v1.Schema$BatchUpdateDocumentResponse>;

        export interface UpdateOptions {
            documentId: DocumentId;
            requests: docs_v1.Schema$Request[];
        }

        export namespace Utils {

            export const extractText = (document: docs_v1.Schema$Document, removeNewlines = false): string => {
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

            export const endOf = (schema: docs_v1.Schema$Document): number | undefined => {
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

            export const initialize = async (reference: Reference) => typeof reference === "string" ? reference : create(reference);

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
        export const create = async (options: CreateOptions): Promise<CreationResult> => {
            const path = RouteStore.googleDocs + "Documents/" + Actions.Create;
            const parameters = {
                requestBody: {
                    title: options.title || `Dash Export (${new Date().toDateString()})`
                }
            };
            try {
                const schema: docs_v1.Schema$Document = await PostToServer(path, parameters);
                const generatedId = schema.documentId;
                return generatedId;
            } catch {
                return undefined;
            }
        };

        export const retrieve = async (options: RetrieveOptions): Promise<RetrievalResult> => {
            const path = RouteStore.googleDocs + "Documents/" + Actions.Retrieve;
            try {
                const schema: RetrievalResult = await PostToServer(path, options);
                return schema;
            } catch {
                return undefined;
            }
        };

        export const update = async (options: UpdateOptions): Promise<UpdateResult> => {
            const path = RouteStore.googleDocs + "Documents/" + Actions.Update;
            const parameters = {
                documentId: options.documentId,
                requestBody: {
                    requests: options.requests
                }
            };
            try {
                const replies: UpdateResult = await PostToServer(path, parameters);
                return replies;
            } catch {
                return undefined;
            }
        };

        export const read = async (options: ReadOptions): Promise<ReadResult> => {
            return retrieve(options).then(document => {
                let result: ReadResult = {};
                if (document) {
                    let title = document.title;
                    let body = Utils.extractText(document, options.removeNewlines);
                    result = { title, body };
                }
                return result;
            });
        };

        export const readLines = async (options: ReadOptions): Promise<ReadLinesResult> => {
            return retrieve(options).then(document => {
                let result: ReadLinesResult = {};
                if (document) {
                    let title = document.title;
                    let bodyLines = Utils.extractText(document).split("\n");
                    options.removeNewlines && (bodyLines = bodyLines.filter(line => line.length));
                    result = { title, bodyLines };
                }
                return result;
            });
        };

        export const write = async (options: WriteOptions): Promise<UpdateResult> => {
            const requests: docs_v1.Schema$Request[] = [];
            const documentId = await Utils.initialize(options.reference);
            if (!documentId) {
                return undefined;
            }
            let index = options.index;
            const mode = options.mode;
            if (!(index && mode === WriteMode.Insert)) {
                let schema = await retrieve({ documentId });
                if (!schema || !(index = Utils.endOf(schema))) {
                    return undefined;
                }
            }
            if (mode === WriteMode.Replace) {
                index > 1 && requests.push({
                    deleteContentRange: {
                        range: {
                            startIndex: 1,
                            endIndex: index
                        }
                    }
                });
                index = 1;
            }
            const text = options.content;
            text.length && requests.push({
                insertText: {
                    text: isArray(text) ? text.join("\n") : text,
                    location: { index }
                }
            });
            if (!requests.length) {
                return undefined;
            }
            let replies: any = await update({ documentId, requests });
            let errors = "errors";
            if (errors in replies) {
                console.log("Write operation failed:");
                console.log(replies[errors].map((error: any) => error.message));
            }
            return replies;
        };

    }

    export namespace Slides {

        export const create = async (options: CreateOptions): Promise<CreationResult> => {
            const path = RouteStore.googleDocs + "Slides/" + Actions.Create;
            const parameters = {
                requestBody: {
                    title: options.title || `Dash Export (${new Date().toDateString()})`
                }
            };
            try {
                const schema: slides_v1.Schema$Presentation = await PostToServer(path, parameters);
                const generatedId = schema.presentationId;
                return generatedId;
            } catch {
                return undefined;
            }
        };

    }

}