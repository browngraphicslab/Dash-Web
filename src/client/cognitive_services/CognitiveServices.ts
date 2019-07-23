import * as request from "request-promise";
import { Doc, Field } from "../../new_fields/Doc";
import { Cast } from "../../new_fields/Types";
import { ImageField } from "../../new_fields/URLField";
import { List } from "../../new_fields/List";
import { Docs } from "../documents/Documents";
import { RouteStore } from "../../server/RouteStore";
import { Utils } from "../../Utils";
import { CompileScript } from "../util/Scripting";
import { ComputedField } from "../../new_fields/ScriptField";

export enum Services {
    ComputerVision = "vision",
    Face = "face"
}

export enum Confidence {
    Yikes = 0.0,
    Unlikely = 0.2,
    Poor = 0.4,
    Fair = 0.6,
    Good = 0.8,
    Excellent = 0.95
}

export type Tag = { name: string, confidence: number };
export type Rectangle = { top: number, left: number, width: number, height: number };
export type Face = { faceAttributes: any, faceId: string, faceRectangle: Rectangle };
export type Converter = (results: any) => Field;

/**
 * A file that handles all interactions with Microsoft Azure's Cognitive
 * Services APIs. These machine learning endpoints allow basic data analytics for
 * various media types.
 */
export namespace CognitiveServices {

    export namespace Image {

        export const analyze = async (imageUrl: string, service: Services) => {
            return fetch(Utils.prepend(`${RouteStore.cognitiveServices}/${service}`)).then(async response => {
                let apiKey = await response.text();
                if (!apiKey) {
                    return undefined;
                }
                let uriBase;
                let parameters;

                switch (service) {
                    case Services.Face:
                        uriBase = 'face/v1.0/detect';
                        parameters = {
                            'returnFaceId': 'true',
                            'returnFaceLandmarks': 'false',
                            'returnFaceAttributes': 'age,gender,headPose,smile,facialHair,glasses,' +
                                'emotion,hair,makeup,occlusion,accessories,blur,exposure,noise'
                        };
                        break;
                    case Services.ComputerVision:
                        uriBase = 'vision/v2.0/analyze';
                        parameters = {
                            'visualFeatures': 'Categories,Description,Color,Objects,Tags,Adult',
                            'details': 'Celebrities,Landmarks',
                            'language': 'en',
                        };
                        break;
                }

                const options = {
                    uri: 'https://eastus.api.cognitive.microsoft.com/' + uriBase,
                    qs: parameters,
                    body: `{"url": "${imageUrl}"}`,
                    headers: {
                        'Content-Type': 'application/json',
                        'Ocp-Apim-Subscription-Key': apiKey
                    }
                };

                let results: any;
                try {
                    results = await request.post(options).then(response => JSON.parse(response));
                } catch (e) {
                    results = undefined;
                }
                return results;
            });
        };

        const analyzeDocument = async (target: Doc, service: Services, converter: Converter, storageKey: string) => {
            let imageData = Cast(target.data, ImageField);
            if (!imageData || await Cast(target[storageKey], Doc)) {
                return;
            }
            let toStore: any;
            let results = await analyze(imageData.url.href, service);
            if (!results) {
                toStore = "Cognitive Services could not process the given image URL.";
            } else {
                if (!results.length) {
                    toStore = converter(results);
                } else {
                    toStore = results.length > 0 ? converter(results) : "Empty list returned.";
                }
            }
            target[storageKey] = toStore;
        };

        export const generateMetadata = async (target: Doc, threshold: Confidence = Confidence.Excellent) => {
            let converter = (results: any) => {
                let tagDoc = new Doc;
                results.tags.map((tag: Tag) => {
                    let sanitized = tag.name.replace(" ", "_");
                    let script = `return (${tag.confidence} >= this.confidence) ? ${tag.confidence} : ${ComputedField.undefined}`;
                    let computed = CompileScript(script, { params: { this: "Doc" } });
                    computed.compiled && (tagDoc[sanitized] = new ComputedField(computed));
                });
                tagDoc.title = "Generated Tags";
                tagDoc.confidence = threshold;
                return tagDoc;
            };
            analyzeDocument(target, Services.ComputerVision, converter, "generatedTags");
        };

        export const extractFaces = async (target: Doc) => {
            let converter = (results: any) => {
                let faceDocs = new List<Doc>();
                results.map((face: Face) => faceDocs.push(Docs.Get.DocumentHierarchyFromJson(face, `Face: ${face.faceId}`)!));
                return faceDocs;
            };
            analyzeDocument(target, Services.Face, converter, "faces");
        };

    }

}