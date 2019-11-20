import * as request from "request-promise";
import { Doc, Field, Opt } from "../../new_fields/Doc";
import { Cast } from "../../new_fields/Types";
import { Docs } from "../documents/Documents";
import { RouteStore } from "../../server/RouteStore";
import { Utils } from "../../Utils";
import { InkData } from "../../new_fields/InkField";
import { UndoManager } from "../util/UndoManager";
import requestPromise = require("request-promise");
import { List } from "../../new_fields/List";
import { ClientRecommender } from "../ClientRecommender";
import { ImageBox } from "../views/nodes/ImageBox";

type APIManager<D> = { converter: BodyConverter<D>, requester: RequestExecutor };
type RequestExecutor = (apiKey: string, body: string, service: Service) => Promise<string>;
type AnalysisApplier<D> = (target: Doc, relevantKeys: string[], data: D, ...args: any) => any;
type BodyConverter<D> = (data: D) => string;
type Converter = (results: any) => Field;
type TextConverter = (results: any, data: string) => Promise<{ keyterms: Field, external_recommendations: any, kp_string: string[] }>;
type BingConverter = (results: any) => Promise<{ title_vals: string[], url_vals: string[] }>;

export type Tag = { name: string, confidence: number };
export type Rectangle = { top: number, left: number, width: number, height: number };

export enum Service {
    ComputerVision = "vision",
    Face = "face",
    Handwriting = "handwriting",
    Text = "text",
    Bing = "bing"
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
        return fetch(Utils.prepend(`${RouteStore.cognitiveServices}/${service}`)).then(async response => {
            let apiKey = await response.text();
            if (!apiKey) {
                console.log(`No API key found for ${service}: ensure index.ts has access to a .env file in your root directory`);
                return undefined;
            }

            let results: any;
            try {
                results = await manager.requester(apiKey, manager.converter(data), service).then(json => JSON.parse(json));
            } catch {
                results = undefined;
            }
            return results;
        });
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
                let batch = UndoManager.StartBatch("Image Analysis");

                let storageKey = keys[0];
                if (!url || await Cast(target[storageKey], Doc)) {
                    return;
                }
                let toStore: any;
                let results = await ExecuteQuery(service, Manager, url);
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

        export const Manager: APIManager<InkData> = {

            converter: (inkData: InkData): string => {
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
            },

            requester: async (apiKey: string, body: string) => {
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
                    xhttp.send(body);
                };

                return new Promise<any>(promisified);
            },

        };

        export namespace Appliers {

            export const ConcatenateHandwriting: AnalysisApplier<InkData> = async (target: Doc, keys: string[], inkData: InkData) => {
                let batch = UndoManager.StartBatch("Ink Analysis");

                let results = await ExecuteQuery(Service.Handwriting, Manager, inkData);
                if (results) {
                    results.recognitionUnits && (results = results.recognitionUnits);
                    target[keys[0]] = Docs.Get.DocumentHierarchyFromJson(results, "Ink Analysis");
                    let recognizedText = results.map((item: any) => item.recognizedText);
                    let individualWords = recognizedText.filter((text: string) => text && text.split(" ").length === 1);
                    target[keys[1]] = individualWords.join(" ");
                }

                batch.end();
            };

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

    export namespace BingSearch {
        export const Manager: APIManager<string> = {
            converter: (data: string) => {
                return data;
            },
            requester: async (apiKey: string, query: string) => {
                let xhttp = new XMLHttpRequest();
                let serverAddress = "https://api.cognitive.microsoft.com";
                let endpoint = serverAddress + '/bing/v5.0/search?q=' + encodeURIComponent(query);
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

                    if (apiKey) {
                        xhttp.open("GET", endpoint, true);
                        xhttp.setRequestHeader('Ocp-Apim-Subscription-Key', apiKey);
                        xhttp.setRequestHeader('Content-Type', 'application/json');
                        xhttp.send();
                    }
                    else {
                        console.log("API key for BING unavailable");
                    }
                };
                return new Promise<any>(promisified);
            }

        };

        export namespace Appliers {
            export const analyzer = async (query: string, converter: BingConverter) => {
                let results = await ExecuteQuery(Service.Bing, Manager, query);
                console.log("Bing results: ", results);
                const { title_vals, url_vals } = await converter(results);
                return { title_vals, url_vals };
            };
        }

    }


    export namespace Text {
        export const Manager: APIManager<string> = {
            converter: (data: string) => {
                return JSON.stringify({
                    documents: [{
                        id: 1,
                        language: "en",
                        text: data
                    }]
                });
            },
            requester: async (apiKey: string, body: string, service: Service) => {
                let serverAddress = "https://eastus.api.cognitive.microsoft.com";
                let endpoint = serverAddress + "/text/analytics/v2.1/keyPhrases";
                let sampleBody = {
                    "documents": [
                        {
                            "language": "en",
                            "id": 1,
                            "text": "Hello world. This is some input text that I love."
                        }
                    ]
                };
                let actualBody = body;
                const options = {
                    uri: endpoint,
                    body: actualBody,
                    headers: {
                        'Content-Type': 'application/json',
                        'Ocp-Apim-Subscription-Key': apiKey
                    }

                };
                return request.post(options);
            }
        };

        export namespace Appliers {

            export async function vectorize(keyterms: any, dataDoc: Doc, mainDoc: boolean = false) {
                console.log("vectorizing...");
                //keyterms = ["father", "king"];

                let args = { method: 'POST', uri: Utils.prepend("/recommender"), body: { keyphrases: keyterms }, json: true };
                await requestPromise.post(args).then(async (wordvecs) => {
                    if (wordvecs) {
                        let indices = Object.keys(wordvecs);
                        console.log("successful vectorization!");
                        var vectorValues = new List<number>();
                        indices.forEach((ind: any) => {
                            //console.log(wordvec.word);
                            vectorValues.push(wordvecs[ind]);
                        });
                        ClientRecommender.Instance.processVector(vectorValues, dataDoc, mainDoc);
                    } // adds document to internal doc set
                    else {
                        console.log("unsuccessful :( word(s) not in vocabulary");
                    }
                    //console.log(vectorValues.size);
                }
                );
            }

            export const analyzer = async (dataDoc: Doc, target: Doc, keys: string[], data: string, converter: TextConverter, isMainDoc: boolean = false, isInternal: boolean = true) => {
                let results = await ExecuteQuery(Service.Text, Manager, data);
                console.log("Cognitive Services keyphrases: ", results);
                let { keyterms, external_recommendations, kp_string } = await converter(results, data);
                target[keys[0]] = keyterms;
                if (isInternal) {
                    //await vectorize([data], dataDoc, isMainDoc);
                    await vectorize(kp_string, dataDoc, isMainDoc);
                } else {
                    return external_recommendations;
                }
            };

            // export async function countFrequencies() 
        }

    }


}