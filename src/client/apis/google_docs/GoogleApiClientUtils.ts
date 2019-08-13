import { docs_v1 } from "googleapis";
import { PostToServer } from "../../../Utils";
import { RouteStore } from "../../../server/RouteStore";
import { Opt } from "../../../new_fields/Doc";

export namespace GoogleApiClientUtils {

    export namespace Docs {

        export enum Actions {
            Create = "create",
            Retrieve = "retrieve"
        }

        export namespace Utils {

            export const fromRgb = (red: number, green: number, blue: number) => {
                return { color: { rgbColor: { red, green, blue } } };
            };

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

        }

        export const ExampleDocumentSchema = {
            title: "This is a Google Doc Created From Dash Web",
            body: {
                content: [
                    {
                        endIndex: 1,
                        sectionBreak: {
                            sectionStyle: {
                                columnSeparatorStyle: "NONE",
                                contentDirection: "LEFT_TO_RIGHT"
                            }
                        }
                    },
                    {
                        paragraph: {
                            elements: [
                                {
                                    textRun: {
                                        content: "And this is its bold, blue text!!!\n",
                                        textStyle: {
                                            bold: true,
                                            backgroundColor: Utils.fromRgb(0, 0, 1)
                                        }
                                    }
                                }
                            ]
                        }
                    },
                    {
                        paragraph: {
                            elements: [
                                {
                                    textRun: {
                                        content: "And this is its bold, blue text!!!\n",
                                        textStyle: {
                                            bold: true,
                                            backgroundColor: Utils.fromRgb(0, 0, 1)
                                        }
                                    }
                                }
                            ]
                        }
                    },

                ] as docs_v1.Schema$StructuralElement[]
            }
        } as docs_v1.Schema$Document;

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
        export const Create = async (schema?: docs_v1.Schema$Document): Promise<string | undefined> => {
            let path = RouteStore.googleDocs + Actions.Create;
            let parameters = { requestBody: schema || ExampleDocumentSchema };
            let generatedId: string | undefined;
            try {
                generatedId = await PostToServer(path, parameters);
            } catch (e) {
                console.error(e);
                generatedId = undefined;
            } finally {
                return generatedId;
            }
        };

        export interface ReadOptions {
            documentId: string;
            removeNewlines?: boolean;
        }

        export const Read = async (options: ReadOptions): Promise<Opt<string>> => {
            return Retrieve(options.documentId).then(schema => {
                return schema ? Utils.extractText(schema, options.removeNewlines) : undefined;
            });
        };

        export const Retrieve = async (documentId: string): Promise<Opt<docs_v1.Schema$Document>> => {
            let path = RouteStore.googleDocs + Actions.Retrieve;
            let parameters = { documentId };
            let schema: Opt<docs_v1.Schema$Document>;
            try {
                schema = await PostToServer(path, parameters);
            } catch (e) {
                console.error(e);
                schema = undefined;
            } finally {
                return schema;
            }
        };


    }

}