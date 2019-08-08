import { Doc } from "../new_fields/Doc";
import { StrCast } from "../new_fields/Types";
import { List } from "../new_fields/List";
import { CognitiveServices } from "./cognitive_services/CognitiveServices";
import React = require("react");
import { observer } from "mobx-react";
import { observable, action, computed, reaction } from "mobx";
var assert = require('assert');
import Table from 'react-bootstrap/Table';

export interface RecommenderProps {
    title: string;
}

@observer
export class ClientRecommender extends React.Component<RecommenderProps> {

    static Instance: ClientRecommender;
    private docVectors: Set<number[]>;
    private corr_matrix = observable([[0, 0], [0, 0]]);
    @observable private firstnum = 0;
    //@observable private corr_matrix: number[][] = [[0, 0], [0, 0]];

    constructor(props: RecommenderProps) {
        //console.log("creating client recommender...");
        super(props);
        ClientRecommender.Instance = this;
        this.docVectors = new Set<number[]>();
        //this.corr_matrix = [[0, 0], [0, 0]];
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

    @action
    public createDistanceMatrix(documents: Set<number[]> = this.docVectors) {
        //this.corr_matrix[0][0] = 500;
        this.firstnum = 500;
        const documents_list = Array.from(documents);
        const n = documents_list.length;
        var matrix = new Array<number>(n).fill(0).map(() => new Array<number>(n).fill(0));
        for (let i = 0; i < n; i++) {
            var doc1 = documents_list[i];
            for (let j = 0; j < n; j++) {
                var doc2 = documents_list[j];
                matrix[i][j] = this.distance(doc1, doc2);
            }
        }
        //this.corr_matrix = matrix;

        return matrix;
    }

    @computed get first_num() {
        return this.firstnum;
    }

    dumb_reaction = reaction(
        () => this.first_num,
        number => {
            console.log("number has changed", number);
            this.forceUpdate();
        }
    );

    render() {
        return (<div>
            <h3>{this.props.title ? this.props.title : "hello"}</h3>
            <table>
                <tbody>
                    <tr>
                        <td>{this.first_num}</td>
                        <td>{this.corr_matrix[0][1]}</td>
                    </tr>
                    <tr>
                        <td>{this.corr_matrix[1][0]}</td>
                        <td>{this.corr_matrix[1][1]}</td>
                    </tr>
                </tbody>
            </table>
        </div>);
    }

}