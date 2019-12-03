import { docs_v1 } from "googleapis";
import { Opt } from "../../../new_fields/Doc";
import { isArray } from "util";
import { EditorState } from "prosemirror-state";
import { Networking } from "../../Network";

export const Pulls = "googleDocsPullCount";
export const Pushes = "googleDocsPushCount";

export namespace GoogleApiClientUtils {

    export enum Actions {
        Create = "create",
        Retrieve = "retrieve",
        Update = "update"
    }

    export namespace Docs {

        export type RetrievalResult = Opt<docs_v1.Schema$Document>;
        export type UpdateResult = Opt<docs_v1.Schema$BatchUpdateDocumentResponse>;

        export interface UpdateOptions {
            documentId: DocumentId;
            requests: docs_v1.Schema$Request[];
        }

        export enum WriteMode {
            Insert,
            Replace
        }

        export type DocumentId = string;
        export type Reference = DocumentId | CreateOptions;
        export interface Content {
            text: string | string[];
            requests: docs_v1.Schema$Request[];
        }
        export type IdHandler = (id: DocumentId) => any;
        export type CreationResult = Opt<DocumentId>;
        export type ReadLinesResult = Opt<{ title?: string, bodyLines?: string[] }>;
        export type ReadResult = { title: string, body: string };
        export interface ImportResult {
            title: string;
            text: string;
            state: EditorState;
        }

        export interface CreateOptions {
            title?: string; // if excluded, will use a default title annotated with the current date
        }

        export interface RetrieveOptions {
            documentId: DocumentId;
        }

        export interface ReadOptions {
            documentId: DocumentId;
            removeNewlines?: boolean;
        }

        export interface WriteOptions {
            mode: WriteMode;
            content: Content;
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
            const path = `/googleDocs/Documents/${Actions.Create}`;
            const parameters = {
                requestBody: {
                    title: options.title || `Dash Export (${new Date().toDateString()})`
                }
            };
            try {
                const schema: docs_v1.Schema$Document = await Networking.PostToServer(path, parameters);
                return schema.documentId;
            } catch {
                return undefined;
            }
        };

        export namespace Utils {

            export type ExtractResult = { text: string, paragraphs: DeconstructedParagraph[] };
            export const extractText = (document: docs_v1.Schema$Document, removeNewlines = false): ExtractResult => {
                const paragraphs = extractParagraphs(document);
                let text = paragraphs.map(paragraph => paragraph.contents.filter(content => !("inlineObjectId" in content)).map(run => run as docs_v1.Schema$TextRun).join("")).join("");
                text = text.substring(0, text.length - 1);
                removeNewlines && text.ReplaceAll("\n", "");
                return { text, paragraphs };
            };

            export type ContentArray = (docs_v1.Schema$TextRun | docs_v1.Schema$InlineObjectElement)[];
            export type DeconstructedParagraph = { contents: ContentArray, bullet: Opt<number> };
            const extractParagraphs = (document: docs_v1.Schema$Document, filterEmpty = true): DeconstructedParagraph[] => {
                const fragments: DeconstructedParagraph[] = [];
                if (document.body && document.body.content) {
                    for (const element of document.body.content) {
                        const runs: ContentArray = [];
                        let bullet: Opt<number>;
                        if (element.paragraph) {
                            if (element.paragraph.elements) {
                                for (const inner of element.paragraph.elements) {
                                    if (inner) {
                                        if (inner.textRun) {
                                            const run = inner.textRun;
                                            (run.content || !filterEmpty) && runs.push(inner.textRun);
                                        } else if (inner.inlineObjectElement) {
                                            runs.push(inner.inlineObjectElement);
                                        }
                                    }
                                }
                            }
                            if (element.paragraph.bullet) {
                                bullet = element.paragraph.bullet.nestingLevel || 0;
                            }
                        }
                        (runs.length || !filterEmpty) && fragments.push({ contents: runs, bullet });
                    }
                }
                return fragments;
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

        export const retrieve = async (options: RetrieveOptions): Promise<RetrievalResult> => {
            const path = `/googleDocs/Documents/${Actions.Retrieve}`;
            try {
                const parameters = { documentId: options.documentId };
                const schema: RetrievalResult = await Networking.PostToServer(path, parameters);
                return schema;
            } catch {
                return undefined;
            }
        };

        export const update = async (options: UpdateOptions): Promise<UpdateResult> => {
            const path = `/googleDocs/Documents/${Actions.Update}`;
            const parameters = {
                documentId: options.documentId,
                requestBody: {
                    requests: options.requests
                }
            };
            try {
                const replies: UpdateResult = await Networking.PostToServer(path, parameters);
                return replies;
            } catch {
                return undefined;
            }
        };

        export const read = async (options: ReadOptions): Promise<Opt<ReadResult>> => {
            return retrieve({ documentId: options.documentId }).then(document => {
                if (document) {
                    const title = document.title!;
                    const body = Utils.extractText(document, options.removeNewlines).text;
                    return { title, body };
                }
            });
        };

        export const readLines = async (options: ReadOptions): Promise<Opt<ReadLinesResult>> => {
            return retrieve({ documentId: options.documentId }).then(document => {
                if (document) {
                    const title = document.title;
                    let bodyLines = Utils.extractText(document).text.split("\n");
                    options.removeNewlines && (bodyLines = bodyLines.filter(line => line.length));
                    return { title, bodyLines };
                }
            });
        };

        export const setStyle = async (options: UpdateOptions) => {
            const replies: any = await update({
                documentId: options.documentId,
                requests: options.requests
            });
            if ("errors" in replies) {
                console.log("Write operation failed:");
                console.log(replies.errors.map((error: any) => error.message));
            }
            return replies;
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
                const schema = await retrieve({ documentId });
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
            const text = options.content.text;
            text.length && requests.push({
                insertText: {
                    text: isArray(text) ? text.join("\n") : text,
                    location: { index }
                }
            });
            if (!requests.length) {
                return undefined;
            }
            requests.push(...options.content.requests);
            const replies: any = await update({ documentId: documentId, requests });
            if ("errors" in replies) {
                console.log("Write operation failed:");
                console.log(replies.errors.map((error: any) => error.message));
            }
            return replies;
        };

    }

}