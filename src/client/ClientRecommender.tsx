import { Doc } from "../new_fields/Doc";
import { StrCast, Cast } from "../new_fields/Types";
import { List } from "../new_fields/List";
import { CognitiveServices } from "./cognitive_services/CognitiveServices";
import React = require("react");
import { observer } from "mobx-react";
import { observable, action, computed, reaction } from "mobx";
var assert = require('assert');
import "./ClientRecommender.scss";
import { JSXElement } from "babel-types";
import { ToPlainText, RichTextField } from "../new_fields/RichTextField";

export interface RecommenderProps {
    title: string;
}

export interface RecommenderDocument {
    actualDoc: Doc;
    vectorDoc: number[];
    score: number;
}

@observer
export class ClientRecommender extends React.Component<RecommenderProps> {

    static Instance: ClientRecommender;
    private mainDoc?: RecommenderDocument;
    private docVectors: Set<RecommenderDocument> = new Set();
    @observable private corr_matrix = [[0, 0], [0, 0]];

    constructor(props: RecommenderProps) {
        //console.log("creating client recommender...");
        super(props);
        if (!ClientRecommender.Instance) ClientRecommender.Instance = this;
        ClientRecommender.Instance.docVectors = new Set();
        //ClientRecommender.Instance.corr_matrix = [[0, 0], [0, 0]];
    }

    @action
    public reset_docs() {
        ClientRecommender.Instance.docVectors = new Set();
        ClientRecommender.Instance.mainDoc = undefined;
        ClientRecommender.Instance.corr_matrix = [[0, 0], [0, 0]];
    }

    public deleteDocs() {
        console.log("deleting previews...");
    }

    /***
     * Computes the cosine similarity between two vectors in Euclidean space. 
     */

    private distance(vector1: number[], vector2: number[], metric: string = "cosine") {
        assert(vector1.length === vector2.length, "Vectors are not the same length");
        let similarity: number;
        switch (metric) {
            case "cosine":
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
                similarity = (dotproduct) / ((mA) * (mB)); // here you needed extra brackets
                return similarity;
            case "euclidian":
                var sum = 0;
                for (let i = 0; i < vector1.length; i++) {
                    sum += Math.pow(vector1[i] - vector2[i], 2);
                }
                similarity = Math.sqrt(sum);
                return similarity;
            default:
                return 0;
        }
    }

    public computeSimilarities() {
        ClientRecommender.Instance.docVectors.forEach((doc: RecommenderDocument) => {
            if (ClientRecommender.Instance.mainDoc) {
                const distance = ClientRecommender.Instance.distance(ClientRecommender.Instance.mainDoc.vectorDoc, doc.vectorDoc, "euclidian");
                doc.score = distance;
            }
        }
        );
        let doclist = Array.from(ClientRecommender.Instance.docVectors);
        doclist.sort((a: RecommenderDocument, b: RecommenderDocument) => a.score - b.score);
        return doclist;
    }

    /***
     * Computes the mean of a set of vectors
     */

    public mean(paragraph: Set<number[]>, dataDoc: Doc, mainDoc: boolean) {
        const n = 200;
        const num_words = paragraph.size;
        let meanVector = new Array<number>(n).fill(0); // mean vector
        if (num_words > 0) { // check to see if paragraph actually was vectorized
            paragraph.forEach((wordvec: number[]) => {
                for (let i = 0; i < n; i++) {
                    meanVector[i] += wordvec[i];
                }
            });
            meanVector = meanVector.map(x => x / num_words);
            const internalDoc: RecommenderDocument = { actualDoc: dataDoc, vectorDoc: meanVector, score: 0 };
            if (mainDoc) ClientRecommender.Instance.mainDoc = internalDoc;
            ClientRecommender.Instance.addToDocSet(internalDoc);
        }
        return meanVector;
    }

    private addToDocSet(internalDoc: RecommenderDocument) {
        if (ClientRecommender.Instance.docVectors) {
            ClientRecommender.Instance.docVectors.add(internalDoc);
        }
    }

    /***
     * Uses Cognitive Services to extract keywords from a document
     */

    public async extractText(dataDoc: Doc, extDoc: Doc, mainDoc: boolean = false) {
        let fielddata = Cast(dataDoc.data, RichTextField);
        let data: string;
        fielddata ? data = fielddata[ToPlainText]() : data = "";
        console.log(data);
        let converter = (results: any) => {
            let keyterms = new List<string>();
            results.documents.forEach((doc: any) => {
                let keyPhrases = doc.keyPhrases;
                keyPhrases.map((kp: string) => {
                    const words = kp.split(" ");
                    words.forEach((word) => keyterms.push(word));
                });
            });
            return keyterms;
        };
        await CognitiveServices.Text.Appliers.analyzer(dataDoc, extDoc, ["key words"], data, converter, mainDoc);
    }

    /***
     * Creates distance matrix for all Documents analyzed
     */

    @action
    public createDistanceMatrix(documents: Set<RecommenderDocument> = ClientRecommender.Instance.docVectors) {
        const documents_list = Array.from(documents);
        const n = documents_list.length;
        var matrix = new Array<number>(n).fill(0).map(() => new Array<number>(n).fill(0));
        for (let i = 0; i < n; i++) {
            var doc1 = documents_list[i];
            for (let j = 0; j < n; j++) {
                var doc2 = documents_list[j];
                matrix[i][j] = ClientRecommender.Instance.distance(doc1.vectorDoc, doc2.vectorDoc, "euclidian");
            }
        }
        ClientRecommender.Instance.corr_matrix = matrix;
        return matrix;
    }

    @computed
    private get generateRows() {
        const n = ClientRecommender.Instance.corr_matrix.length;
        let rows: JSX.Element[] = [];
        for (let i = 0; i < n; i++) {
            let children: JSX.Element[] = [];
            for (let j = 0; j < n; j++) {
                //let cell = React.createElement("td", ClientRecommender.Instance.corr_matrix[i][j]);
                let cell = <td>{ClientRecommender.Instance.corr_matrix[i][j].toFixed(4)}</td>;
                children.push(cell);
            }
            //let row = React.createElement("tr", { children: children, key: i });
            let row = <tr>{children}</tr>;
            rows.push(row);
        }
        return rows;
    }

    render() {
        return (<div className="wrapper">
            <h3 >{ClientRecommender.Instance.props.title ? ClientRecommender.Instance.props.title : "hello"}</h3>
            {/* <table className="space" >
                <tbody>
                    <tr key="1">
                        <td key="1">{ClientRecommender.Instance.corr_matrix[0][0].toFixed(4)}</td>
                        <td key="2">{ClientRecommender.Instance.corr_matrix[0][1].toFixed(4)}</td>
                    </tr>
                    <tr key="2">
                        <td key="1">{ClientRecommender.Instance.corr_matrix[1][0].toFixed(4)}</td>
                        <td key="2">{ClientRecommender.Instance.corr_matrix[1][1].toFixed(4)}</td>
                    </tr>
                </tbody>
            </table> */}
            <table className="space">
                <tbody>
                    {ClientRecommender.Instance.generateRows}
                </tbody>
            </table>
        </div>);
    }

}