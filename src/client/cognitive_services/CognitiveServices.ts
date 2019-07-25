import * as request from "request-promise";
import { Doc, Field, Opt } from "../../new_fields/Doc";
import { Cast } from "../../new_fields/Types";
import { ImageField } from "../../new_fields/URLField";
import { List } from "../../new_fields/List";
import { Docs } from "../documents/Documents";
import { RouteStore } from "../../server/RouteStore";
import { Utils } from "../../Utils";
import { CompileScript } from "../util/Scripting";
import { ComputedField } from "../../new_fields/ScriptField";
import { InkData } from "../../new_fields/InkField";

type APIManager<D> = { requester: RequestExecutor<D>, applier: AnalysisApplier };
type RequestExecutor<D> = (apiKey: string, data: D, service: Service) => Promise<string>;
type AnalysisApplier = (target: Doc, ...args: any) => any;
type Converter = (results: any) => Field;

export type Tag = { name: string, confidence: number };
export type Rectangle = { top: number, left: number, width: number, height: number };

export enum Service {
    ComputerVision = "vision",
    Face = "face",
    Handwriting = "handwriting"
}

export enum Confidence {
    Yikes = 0.0,
    Unlikely = 0.2,
    Poor = 0.4,
    Fair = 0.6,
    Good = 0.8,
    Excellent = 0.95
}

/**
 * A file that handles all interactions with Microsoft Azure's Cognitive
 * Services APIs. These machine learning endpoints allow basic data analytics for
 * various media types.
 */
export namespace CognitiveServices {

    const executeQuery = async <D, R>(service: Service, executor: RequestExecutor<D>, data: D): Promise<Opt<R>> => {
        return fetch(Utils.prepend(`${RouteStore.cognitiveServices}/${service}`)).then(async response => {
            let apiKey = await response.text();
            if (!apiKey) {
                return undefined;
            }

            let results: Opt<R>;
            try {
                results = await executor(apiKey, data, service).then(json => JSON.parse(json));
            } catch {
                results = undefined;
            }
            return results;
        });
    };

    export namespace Image {

        export const Manager: APIManager<string> = {

            requester: (async (apiKey: string, imageUrl: string, service: Service) => {
                let uriBase;
                let parameters;

                switch (service) {
                    case Service.Face:
                        uriBase = 'face/v1.0/detect';
                        parameters = {
                            'returnFaceId': 'true',
                            'returnFaceLandmarks': 'false',
                            'returnFaceAttributes': 'age,gender,headPose,smile,facialHair,glasses,' +
                                'emotion,hair,makeup,occlusion,accessories,blur,exposure,noise'
                        };
                        break;
                    case Service.ComputerVision:
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

                return request.post(options);
            }) as RequestExecutor<string>,

            applier: (async (target: Doc, service: Service, converter: Converter, storageKey: string) => {
                let imageData = Cast(target.data, ImageField);
                if (!imageData || await Cast(target[storageKey], Doc)) {
                    return;
                }
                let toStore: any;
                let results = await executeQuery<string, any>(service, Manager.requester, imageData.url.href);
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
            }) as AnalysisApplier

        };

        export type Face = { faceAttributes: any, faceId: string, faceRectangle: Rectangle };

        export const generateMetadata = async (target: Doc, threshold: Confidence = Confidence.Excellent) => {
            let converter = (results: any) => {
                let tagDoc = new Doc;
                results.tags.map((tag: Tag) => {
                    let sanitized = tag.name.replace(" ", "_");
                    let script = `return (${tag.confidence} >= this.confidence) ? ${tag.confidence} : "${ComputedField.undefined}"`;
                    let computed = CompileScript(script, { params: { this: "Doc" } });
                    computed.compiled && (tagDoc[sanitized] = new ComputedField(computed));
                });
                tagDoc.title = "Generated Tags";
                tagDoc.confidence = threshold;
                return tagDoc;
            };
            Manager.applier(target, Service.ComputerVision, converter, "generatedTags");
        };

        export const extractFaces = async (target: Doc) => {
            let converter = (results: any) => {
                let faceDocs = new List<Doc>();
                results.map((face: Face) => faceDocs.push(Docs.Get.DocumentHierarchyFromJson(face, `Face: ${face.faceId}`)!));
                return faceDocs;
            };
            Manager.applier(target, Service.Face, converter, "faces");
        };

    }

    export namespace Inking {

        export const Manager: APIManager<InkData> = {

            requester: (async (apiKey: string, inkData: InkData) => {
                let xhttp = new XMLHttpRequest();
                let serverAddress = "https://api.cognitive.microsoft.com";
                let endpoint = serverAddress + "/inkrecognizer/v1.0-preview/recognize";

                let promisified = (resolve: any, reject: any) => {
                    xhttp.onreadystatechange = function () {
                        if (this.readyState === 4) {
                            let result = xhttp.responseText;
                            switch (this.status) {
                                case 200:
                                    return resolve(result);
                                case 400:
                                default:
                                    return reject(result);
                            }
                        }
                    };

                    xhttp.open("PUT", endpoint, true);
                    xhttp.setRequestHeader('Ocp-Apim-Subscription-Key', apiKey);
                    xhttp.setRequestHeader('Content-Type', 'application/json');
                    xhttp.send(format(inkData));
                };

                return new Promise<any>(promisified);
            }) as RequestExecutor<InkData>,

            applier: (async (target: Doc, inkData: InkData) => {
                let results = await executeQuery<InkData, any>(Service.Handwriting, Manager.requester, inkData);
                if (results) {
                    results.recognitionUnits && (results = results.recognitionUnits);
                    target.inkAnalysis = Docs.Get.DocumentHierarchyFromJson(results, "Ink Analysis");
                    let recognizedText = results.map((item: any) => item.recognizedText);
                    let individualWords = recognizedText.filter((text: string) => text && text.split(" ").length === 1);
                    target.handwriting = individualWords.join(" ");
                }
            }) as AnalysisApplier

        };

        export interface AzureStrokeData {
            id: number;
            points: string;
            language?: string;
        }

        export interface HandwritingUnit {
            version: number;
            language: string;
            unit: string;
            strokes: AzureStrokeData[];
        }

        const format = (inkData: InkData): string => {
            let entries = inkData.entries(), next = entries.next();
            let strokes: AzureStrokeData[] = [], id = 0;
            while (!next.done) {
                strokes.push({
                    id: id++,
                    points: next.value[1].pathData.map(point => `${point.x},${point.y}`).join(","),
                    language: "en-US"
                });
                next = entries.next();
            }
            return JSON.stringify({
                version: 1,
                language: "en-US",
                unit: "mm",
                strokes: strokes
            });
        };

    }

}