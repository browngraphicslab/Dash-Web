import { docs_v1, slides_v1 } from "googleapis";
import { PostToServer } from "../../../Utils";
import { RouteStore } from "../../../server/RouteStore";
import { Opt } from "../../../new_fields/Doc";
import { isArray } from "util";

export const Pulls = "googleDocsPullCount";
export const Pushes = "googleDocsPushCount";

export namespace GoogleApiClientUtils {

    export enum Service {
        Documents = "Documents",
        Slides = "Slides"
    }

    export enum Actions {
        Create = "create",
        Retrieve = "retrieve",
        Update = "update"
    }

    export enum WriteMode {
        Insert,
        Replace
    }

    export type Identifier = string;
    export type Reference = Identifier | CreateOptions;
    export type TextContent = string | string[];
    export type IdHandler = (id: Identifier) => any;
    export type CreationResult = Opt<Identifier>;
    export type ReadLinesResult = Opt<{ title?: string, bodyLines?: string[] }>;
    export type ReadResult = { title?: string, body?: string };

    export interface CreateOptions {
        service: Service;
        title?: string; // if excluded, will use a default title annotated with the current date
    }

    export interface RetrieveOptions {
        service: Service;
        identifier: Identifier;
    }

    export interface ReadOptions {
        identifier: Identifier;
        removeNewlines?: boolean;
    }

    export interface WriteOptions {
        mode: WriteMode;
        content: TextContent;
        reference: Reference;
        index?: number; // if excluded, will compute the last index of the document and append the content there
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
        const path = `${RouteStore.googleDocs}/${options.service}/${Actions.Create}`;
        const parameters = {
            requestBody: {
                title: options.title || `Dash Export (${new Date().toDateString()})`
            }
        };
        try {
            const schema: any = await PostToServer(path, parameters);
            let key = ["document", "presentation"].find(prefix => `${prefix}Id` in schema) + "Id";
            return schema[key];
        } catch {
            return undefined;
        }
    };

    export namespace Docs {

        export type RetrievalResult = Opt<docs_v1.Schema$Document | slides_v1.Schema$Presentation>;
        export type UpdateResult = Opt<docs_v1.Schema$BatchUpdateDocumentResponse>;

        export interface UpdateOptions {
            documentId: Identifier;
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

        const KeyMapping = new Map<Service, string>([
            [Service.Documents, "documentId"],
            [Service.Slides, "presentationId"]
        ]);

        export const retrieve = async (options: RetrieveOptions): Promise<RetrievalResult> => {
            const path = `${RouteStore.googleDocs}/${options.service}/${Actions.Retrieve}`;
            try {
                let parameters: any = {}, key: string | undefined;
                if ((key = KeyMapping.get(options.service))) {
                    parameters[key] = options.identifier;
                    const schema: RetrievalResult = await PostToServer(path, parameters);
                    return schema;
                }
            } catch {
                return undefined;
            }
        };

        export const update = async (options: UpdateOptions): Promise<UpdateResult> => {
            const path = `${RouteStore.googleDocs}/${Service.Documents}/${Actions.Update}`;
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
            return retrieve({ ...options, service: Service.Documents }).then(document => {
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
            return retrieve({ ...options, service: Service.Documents }).then(document => {
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
            const identifier = await Utils.initialize(options.reference);
            if (!identifier) {
                return undefined;
            }
            let index = options.index;
            const mode = options.mode;
            if (!(index && mode === WriteMode.Insert)) {
                let schema = await retrieve({ identifier, service: Service.Documents });
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
            let replies: any = await update({ documentId: identifier, requests });
            let errors = "errors";
            if (errors in replies) {
                console.log("Write operation failed:");
                console.log(replies[errors].map((error: any) => error.message));
            }
            return replies;
        };

    }

    export namespace Slides {

        export namespace Utils {

            export const extractTextBoxes = (slides: slides_v1.Schema$Page[]) => {
                slides.map(slide => {
                    let elements = slide.pageElements;
                    if (elements) {
                        let textboxes: slides_v1.Schema$TextContent[] = [];
                        for (let element of elements) {
                            if (element && element.shape && element.shape.shapeType === "TEXT_BOX" && element.shape.text) {
                                textboxes.push(element.shape.text);
                            }
                        }
                        textboxes.map(text => {
                            if (text.textElements) {
                                text.textElements.map(element => {

                                });
                            }
                            if (text.lists) {

                            }
                        });
                    }
                });
            };

        }

    }

}