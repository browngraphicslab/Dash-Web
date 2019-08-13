import { docs_v1 } from "googleapis";
import { PostToServer } from "../../../Utils";
import { RouteStore } from "../../../server/RouteStore";

export namespace GoogleApiClientUtils {

    export namespace Docs {

        export enum Actions {
            Create = "create",
            Retrieve = "retrieve"
        }

        export namespace Helpers {

            export const fromRgb = (red: number, green: number, blue: number) => {
                return { color: { rgbColor: { red, green, blue } } };
            };

        }

        export const ExampleDocumentSchema = {
            title: "This is a Google Doc Created From Dash Web",
            body: {
                content: [
                    {
                        paragraph: {
                            elements: [
                                {
                                    textRun: {
                                        content: "And this is its bold, blue text!!!",
                                        textStyle: {
                                            bold: true,
                                            backgroundColor: Helpers.fromRgb(0, 0, 1)
                                        }
                                    }
                                }
                            ]
                        }
                    }
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

        let path = RouteStore.googleDocs + Actions.Retrieve;
        export const Retrieve = async (documentId: string): Promise<any> => {
            let parameters = { documentId };
            let documentContents: any;
            try {
                documentContents = await PostToServer(path, parameters);
            } catch (e) {
                console.error(e);
                documentContents = undefined;
            } finally {
                return documentContents;
            }
        };

    }

}