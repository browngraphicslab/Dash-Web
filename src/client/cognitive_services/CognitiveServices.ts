import * as request from "request-promise";
import { Doc } from "../../new_fields/Doc";
import { Cast, FieldValue } from "../../new_fields/Types";
import { ImageField } from "../../new_fields/URLField";
import { emptyFunction } from "../../Utils";

export enum Services {
    ComputerVision,
    Face
}

export enum Confidence {
    Yikes = 0.0,
    Unlikely = 0.2,
    Poor = 0.4,
    Fair = 0.6,
    Good = 0.8,
    Excellent = 0.95
}

type Tag = { name: string, confidence: number };
type Face = { faceAttributes: any, faceId: string, faceRectangle: { top: number, left: number, width: number, height: number } };
type Converter = (results: any) => Doc;

export namespace CognitiveServices {

    export namespace Image {

        export const analyze = async (imageUrl: string, service: Services) => {
            let apiKey;
            let uriBase;
            let parameters;

            switch (service) {
                case Services.Face:
                    apiKey = 'a193d5c6e62343fcbd1efb777588106e';
                    uriBase = 'face/v1.0/detect';
                    parameters = {
                        'returnFaceId': 'true',
                        'returnFaceLandmarks': 'false',
                        'returnFaceAttributes': 'age,gender,headPose,smile,facialHair,glasses,' +
                            'emotion,hair,makeup,occlusion,accessories,blur,exposure,noise'
                    };
                    break;
                case Services.ComputerVision:
                    apiKey = '3697018a7e234627a1bbeac9eb172ecc';
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

            let results = await request.post(options).then(json => JSON.parse(json)).catch(err => console.log(err));
            return results;
        };

        const mutateDocument = async (target: Doc, service: Services, converter: Converter, storageKey: string) => {
            let data = Cast(target.data, ImageField);
            let dataDoc = Doc.GetProto(target);
            let existing = await Cast(dataDoc[storageKey], Doc);
            if (!data || existing) {
                return;
            }

            let results = await analyze(data.url.href, service);
            dataDoc[storageKey] = converter(results);
        };

        export const generateMetadata = async (target: Doc, threshold = Confidence.Excellent) => {
            let converter = (results: any) => {
                let tagDoc = new Doc;
                tagDoc.title = "Generated Tags";
                results.tags.map((tag: Tag) => {
                    if (tag.confidence >= +threshold) {
                        tagDoc[tag.name] = tag.confidence;
                    }
                });
                return tagDoc;
            };
            mutateDocument(target, Services.ComputerVision, converter, "generatedTags");
        };

        export const extractFaces = async (target: Doc) => {
            let converter = (results: any) => {
                let facesDoc = new Doc;
                facesDoc.title = "Found Faces";
                results.map((face: Face) => facesDoc[face.faceId] = JSON.stringify(face.faceAttributes));
                return facesDoc;
            };
            mutateDocument(target, Services.Face, converter, "faces");
        };

    }

}