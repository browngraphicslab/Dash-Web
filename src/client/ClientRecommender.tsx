import { Doc } from "../new_fields/Doc";
import { StrCast, Cast } from "../new_fields/Types";
import { List } from "../new_fields/List";
import { CognitiveServices } from "./cognitive_services/CognitiveServices";
import React = require("react");
import { observer } from "mobx-react";
import { observable, action, computed, reaction } from "mobx";
var assert = require('assert');
var sw = require('stopword');
var FeedParser = require('feedparser');
import "./ClientRecommender.scss";
import { JSXElement } from "babel-types";
import { RichTextField } from "../new_fields/RichTextField";
import { ToPlainText } from "../new_fields/FieldSymbols";

export interface RecommenderProps {
    title: string;
}

/**
 * actualDoc: datadoc
 * vectorDoc: mean vector of text
 * score: similarity score to main doc
 */

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
    private highKP: string[] = [];

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

    /**
     * Returns list of {doc, similarity (to main doc)} in increasing score
     */

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

    public async extractText(dataDoc: Doc, extDoc: Doc, internal: boolean = true, mainDoc: boolean = false) {
        let fielddata = Cast(dataDoc.data, RichTextField);
        let data: string;
        fielddata ? data = fielddata[ToPlainText]() : data = "";
        let converter = async (results: any, data: string) => {
            let keyterms = new List<string>(); // raw keywords
            let keyterms_counted = new List<string>(); // keywords, where each keyword is repeated as 
            let highKP: string[] = [""]; // most frequent 
            let high = 0;
            results.documents.forEach((doc: any) => {
                let keyPhrases = doc.keyPhrases;
                keyPhrases.map((kp: string) => {
                    const frequency = this.countFrequencies(kp, data);
                    if (frequency > high) {
                        high = frequency;
                        highKP = [kp];
                    }
                    else if (frequency === high) {
                        highKP.push(kp);
                    }
                    let words = kp.split(" "); // separates phrase into words
                    words = this.removeStopWords(words); // removes stop words if they appear in phrases
                    words.forEach((word) => {
                        keyterms.push(word);
                        for (let i = 0; i < frequency; i++) {
                            keyterms_counted.push(word);
                        }
                    });
                });
            });
            this.highKP = highKP;
            //console.log(highKP);
            const kts_counted = new List<string>();
            keyterms_counted.forEach(kt => kts_counted.push(kt.toLowerCase()));
            const values = await this.sendRequest(highKP);
            return { keyterms: keyterms, keyterms_counted: kts_counted, values };
        };
        if (data != "") {
            return CognitiveServices.Text.Appliers.analyzer(dataDoc, extDoc, ["key words"], data, converter, mainDoc, internal);
        }
        return;
    }


    private countFrequencies(keyphrase: string, paragraph: string) {
        let data = paragraph.split(" ");
        let kp_array = keyphrase.split(" ");
        let num_keywords = kp_array.length;
        let par_length = data.length;
        let frequency = 0;
        // console.log("Paragraph: ", data);
        // console.log("Keyphrases:", kp_array);
        for (let i = 0; i <= par_length - num_keywords; i++) {
            const window = data.slice(i, i + num_keywords);
            if (JSON.stringify(window).toLowerCase() === JSON.stringify(kp_array).toLowerCase() || kp_array.every(val => window.includes(val))) {
                frequency++;
            }
        }
        return frequency;
    }

    private removeStopWords(word_array: string[]) {
        //console.log(sw.removeStopwords(word_array));
        return sw.removeStopwords(word_array);
    }

    private async sendRequest(keywords: string[]) {
        let query = "";
        keywords.forEach((kp: string) => query += " " + kp);
        return new Promise<any>(resolve => {
            this.arxivrequest(query).then(resolve);
        });
    }

    /**
     * Request to the arXiv server for ML articles.
     */

    arxivrequest = async (query: string) => {
        let xhttp = new XMLHttpRequest();
        let serveraddress = "http://export.arxiv.org/api";
        let endpoint = serveraddress + "/query?search_query=all:" + query + "&start=0&max_results=5";
        let promisified = (resolve: any, reject: any) => {
            xhttp.onreadystatechange = function () {
                if (this.readyState === 4) {
                    let result = xhttp.response;
                    let xml = xhttp.responseXML;
                    console.log(xml);
                    switch (this.status) {
                        case 200:
                            let title_vals: string[] = [];
                            let url_vals: string[] = [];
                            //console.log(result);
                            if (xml) {
                                let titles = xml.getElementsByTagName("title");
                                let counter = 1;
                                if (titles && titles.length > 1) {
                                    while (counter <= 5) {
                                        const title = titles[counter].childNodes[0].nodeValue!;
                                        console.log(title)
                                        title_vals.push(title);
                                        counter++;
                                    }
                                }
                                let ids = xml.getElementsByTagName("id");
                                counter = 1;
                                if (ids && ids.length > 1) {
                                    while (counter <= 5) {
                                        const url = ids[counter].childNodes[0].nodeValue!;
                                        console.log(url);
                                        url_vals.push(url);
                                        counter++;
                                    }
                                }
                            }
                            return resolve({ title_vals, url_vals });
                        case 400:
                        default:
                            return reject(result);
                    }
                }
            };
            xhttp.open("GET", endpoint, true);
            xhttp.send();
        };
        return new Promise<any>(promisified);
    }

    processArxivResult = (result: any) => {
        var xmlDoc = result as XMLDocument;
        let text = xmlDoc.getElementsByTagName("title")[0].childNodes[0].nodeValue;
        console.log(text);
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