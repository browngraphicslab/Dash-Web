import * as request from "request-promise";
import { Doc, Field } from "../../new_fields/Doc";
import { Cast } from "../../new_fields/Types";
import { Docs } from "../documents/Documents";
import { Utils } from "../../Utils";
import { InkData } from "../../new_fields/InkField";
import { UndoManager } from "../util/UndoManager";

type APIManager<D> = { converter: BodyConverter<D>, requester: RequestExecutor };
type RequestExecutor = (apiKey: string, body: string, service: Service) => Promise<string>;
type AnalysisApplier<D> = (target: Doc, relevantKeys: string[], data: D, ...args: any) => any;
type BodyConverter<D> = (data: D) => string;
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

    const ExecuteQuery = async <D>(service: Service, manager: APIManager<D>, data: D): Promise<any> => {
        const apiKey = await Utils.getApiKey(service);
        if (!apiKey) {
            console.log(`No API key found for ${service}: ensure index.ts has access to a .env file in your root directory.`);
            return undefined;
        }

        let results: any;
        try {
            results = await manager.requester(apiKey, manager.converter(data), service).then(json => JSON.parse(json));
        } catch (e) {
            throw e;
            results = undefined;
        }
        return results;
    };

    export namespace Image {

        export const Manager: APIManager<string> = {

            converter: (imageUrl: string) => JSON.stringify({ url: imageUrl }),

            requester: async (apiKey: string, body: string, service: Service) => {
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
                    body: body,
                    headers: {
                        'Content-Type': 'application/json',
                        'Ocp-Apim-Subscription-Key': apiKey
                    }
                };

                return request.post(options);
            },

        };

        export namespace Appliers {

            export const ProcessImage: AnalysisApplier<string> = async (target: Doc, keys: string[], url: string, service: Service, converter: Converter) => {
                const batch = UndoManager.StartBatch("Image Analysis");

                const storageKey = keys[0];
                if (!url || await Cast(target[storageKey], Doc)) {
                    return;
                }
                let toStore: any;
                const results = await ExecuteQuery(service, Manager, url);
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

                batch.end();
            };

        }

        export type Face = { faceAttributes: any, faceId: string, faceRectangle: Rectangle };

    }

    export namespace Inking {

        export const Manager: APIManager<InkData[]> = {

            converter: (inkData: InkData[]): string => {
                let id = 0;
                const strokes: AzureStrokeData[] = inkData.map(points => ({
                    id: id++,
                    points: points.map(({ X: x, Y: y }) => `${x},${y}`).join(","),
                    language: "en-US"
                }));
                return JSON.stringify({
                    version: 1,
                    language: "en-US",
                    unit: "mm",
                    strokes
                });
            },

            requester: async (apiKey: string, body: string) => {
                const xhttp = new XMLHttpRequest();
                const serverAddress = "https://api.cognitive.microsoft.com";
                const endpoint = serverAddress + "/inkrecognizer/v1.0-preview/recognize";

                return new Promise<string>((resolve, reject) => {
                    xhttp.onreadystatechange = function () {
                        if (this.readyState === 4) {
                            const result = xhttp.responseText;
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
                    xhttp.send(body);
                });
            },
        };

        export namespace Appliers {

            export const ConcatenateHandwriting: AnalysisApplier<InkData[]> = async (target: Doc, keys: string[], inkData: InkData[]) => {
                const batch = UndoManager.StartBatch("Ink Analysis");

                let results = await ExecuteQuery(Service.Handwriting, Manager, inkData);
                if (results) {
                    results.recognitionUnits && (results = results.recognitionUnits);
                    target[keys[0]] = Docs.Get.DocumentHierarchyFromJson(results, "Ink Analysis");
                    const recognizedText = results.map((item: any) => item.recognizedText);
                    const recognizedObjects = results.map((item: any) => item.recognizedObject);
                    const individualWords = recognizedText.filter((text: string) => text && text.split(" ").length === 1);
                    target[keys[1]] = individualWords.length ? individualWords.join(" ") : recognizedObjects.join(", ");
                }

                batch.end();
            };

            export const InterpretStrokes = async (strokes: InkData[]) => {
                let results = await ExecuteQuery(Service.Handwriting, Manager, strokes);
                if (results) {
                    results.recognitionUnits && (results = results.recognitionUnits);
                }
                return results;
            }
        }

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

    }

}