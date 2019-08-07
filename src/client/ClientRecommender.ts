import { Doc } from "../new_fields/Doc";
import { StrCast } from "../new_fields/Types";
import { List } from "../new_fields/List";
import { CognitiveServices } from "./cognitive_services/CognitiveServices";


var assert = require('assert');

export class ClientRecommender {

    static Instance: ClientRecommender;
    private docVectors: Set<number[]>;

    constructor() {
        //console.log("creating client recommender...");
        ClientRecommender.Instance = this;
        this.docVectors = new Set<number[]>();
    }


    /***
     * Computes the cosine similarity between two vectors in Euclidean space. 
     */

    private distance(vector1: number[], vector2: number[]) {
        assert(vector1.length === vector2.length, "Vectors are not the same length");
        var dotproduct = 0;
        var mA = 0;
        var mB = 0;
        for (let i = 0; i < vector1.length; i++) { // here you missed the i++
            dotproduct += (vector1[i] * vector2[i]);
            mA += (vector1[i] * vector1[i]);
            mB += (vector2[i] * vector2[i]);
        }
        mA = Math.sqrt(mA);
        mB = Math.sqrt(mB);
        var similarity = (dotproduct) / ((mA) * (mB)); // here you needed extra brackets
        return similarity;
    }

    /***
     * Computes the mean of a set of vectors
     */

    public mean(paragraph: Set<number[]>) {
        const n = 200;
        const num_words = paragraph.size;
        let meanVector = new Array<number>(n).fill(0); // mean vector
        paragraph.forEach((wordvec: number[]) => {
            for (let i = 0; i < n; i++) {
                meanVector[i] += wordvec[i];
            }
        });
        meanVector = meanVector.map(x => x / num_words);
        this.addToDocSet(meanVector);
        return meanVector;
    }

    private addToDocSet(vector: number[]) {
        if (this.docVectors) {
            this.docVectors.add(vector);
        }
    }

    /***
     * Uses Cognitive Services to extract keywords from a document
     */

    public async extractText(dataDoc: Doc, extDoc: Doc) {
        let data = StrCast(dataDoc.title);
        //console.log(data);
        let converter = (results: any) => {
            let keyterms = new List<string>();
            results.documents.forEach((doc: any) => {
                let keyPhrases = doc.keyPhrases;
                keyPhrases.map((kp: string) => keyterms.push(kp));
            });
            return keyterms;
        };
        await CognitiveServices.Text.Manager.analyzer(extDoc, ["key words"], data, converter);
    }

    /***
     * Creates distance matrix for all Documents analyzed
     */

    public createDistanceMatrix(documents: Set<number[]> = this.docVectors) {
        const documents_list = Array.from(documents);
        const n = documents_list.length;
        var matrix = new Array(n).fill(0).map(() => new Array(n).fill(0));
        for (let i = 0; i < n; i++) {
            var doc1 = documents_list[i];
            for (let j = 0; j < n; j++) {
                var doc2 = documents_list[j];
                matrix[i][j] = this.distance(doc1, doc2);
            }
        }
        return matrix;
    }

}