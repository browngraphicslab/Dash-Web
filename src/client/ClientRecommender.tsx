import { Doc, FieldResult } from "../new_fields/Doc";
import { StrCast, Cast } from "../new_fields/Types";
import { List } from "../new_fields/List";
import { CognitiveServices, Confidence, Tag, Service } from "./cognitive_services/CognitiveServices";
import React = require("react");
import { observer } from "mobx-react";
import { observable, action, computed, reaction } from "mobx";
var assert = require('assert');
var sw = require('stopword');
var FeedParser = require('feedparser');
var https = require('https');
import "./ClientRecommender.scss";
import { JSXElement } from "babel-types";
import { RichTextField } from "../new_fields/RichTextField";
import { ToPlainText } from "../new_fields/FieldSymbols";
import { listSpec } from "../new_fields/Schema";
import { Identified } from "./Network";
import { ComputedField } from "../new_fields/ScriptField";
import { ImageField } from "../new_fields/URLField";

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

const fieldkey = "data";

@observer
export class ClientRecommender extends React.Component<RecommenderProps> {



    static Instance: ClientRecommender;
    private mainDoc?: RecommenderDocument;
    private docVectors: Set<RecommenderDocument> = new Set();

    @observable private corr_matrix = [[0, 0], [0, 0]]; // for testing

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

    public computeSimilarities(distance_metric: string) {
        const parameters: any = {};
        Identified.PostToServer("/IBMAnalysis", parameters).then(response => {
            console.log("ANALYSIS RESULTS! ", response);
        });
        ClientRecommender.Instance.docVectors.forEach((doc: RecommenderDocument) => {
            if (ClientRecommender.Instance.mainDoc) {
                const distance = ClientRecommender.Instance.distance(ClientRecommender.Instance.mainDoc.vectorDoc, doc.vectorDoc, distance_metric);
                doc.score = distance;
            }
        }
        );
        let doclist = Array.from(ClientRecommender.Instance.docVectors);
        if (distance_metric === "euclidian") {
            doclist.sort((a: RecommenderDocument, b: RecommenderDocument) => a.score - b.score);
        }
        else {
            doclist.sort((a: RecommenderDocument, b: RecommenderDocument) => b.score - a.score);
        }
        return doclist;
    }

    /***
     * Computes the mean of a set of vectors
     */

    public mean(paragraph: Set<number[]>) {
        const n = 512;
        const num_words = paragraph.size;
        let meanVector = new Array<number>(n).fill(0); // mean vector
        if (num_words > 0) { // check to see if paragraph actually was vectorized
            paragraph.forEach((wordvec: number[]) => {
                for (let i = 0; i < n; i++) {
                    meanVector[i] += wordvec[i];
                }
            });
            meanVector = meanVector.map(x => x / num_words);
        }
        return meanVector;
    }

    public processVector(vector: number[], dataDoc: Doc, isMainDoc: boolean) {
        if (vector.length > 0) {
            const internalDoc: RecommenderDocument = { actualDoc: dataDoc, vectorDoc: vector, score: 0 };
            ClientRecommender.Instance.addToDocSet(internalDoc, isMainDoc);
        }
    }

    private addToDocSet(internalDoc: RecommenderDocument, isMainDoc: boolean) {
        if (ClientRecommender.Instance.docVectors) {
            if (isMainDoc) ClientRecommender.Instance.mainDoc = internalDoc;
            ClientRecommender.Instance.docVectors.add(internalDoc);
        }
    }

    /***
     * Generates tags for an image using Cognitive Services
     */

    generateMetadata = async (dataDoc: Doc, extDoc: Doc, threshold: Confidence = Confidence.Excellent) => {
        let converter = (results: any) => {
            let tagDoc = new Doc;
            let tagsList = new List();
            results.tags.map((tag: Tag) => {
                tagsList.push(tag.name);
                let sanitized = tag.name.replace(" ", "_");
                tagDoc[sanitized] = ComputedField.MakeFunction(`(${tag.confidence} >= this.confidence) ? ${tag.confidence} : "${ComputedField.undefined}"`);
            });
            extDoc.generatedTags = tagsList;
            tagDoc.title = "Generated Tags Doc";
            tagDoc.confidence = threshold;
            return tagDoc;
        };
        const url = this.url(dataDoc);
        if (url) {
            return CognitiveServices.Image.Appliers.ProcessImage(extDoc, ["generatedTagsDoc"], url, Service.ComputerVision, converter);
        }
    }

    /***
     * Gets URL of image
     */

    private url(dataDoc: Doc) {
        let data = Cast(Doc.GetProto(dataDoc)[fieldkey], ImageField);
        return data ? data.url.href : undefined;
    }

    /***
     * Uses Cognitive Services to extract keywords from a document
     */

    public async extractText(dataDoc: Doc, extDoc: Doc, internal: boolean = true, api: string = "bing", isMainDoc: boolean = false, image: boolean = false) {
        let data: string = "";
        let taglist: FieldResult<List<string>> = undefined;
        if (image) {
            if (!extDoc.generatedTags) await this.generateMetadata(dataDoc, extDoc);  // TODO: Automatically generate tags. Need to ask Sam about this.
            if (extDoc.generatedTags) {
                taglist = Cast(extDoc.generatedTags, listSpec("string"));
                taglist!.forEach(tag => {
                    data += tag + ", ";
                });
            }
        }
        else {
            let fielddata = Cast(dataDoc.data, RichTextField);
            fielddata ? data = fielddata[ToPlainText]() : data = "";
        }
        let converter = async (results: any, data: string, isImage: boolean = false) => {
            let keyterms = new List<string>(); // raw keywords
            // let keyterms_counted = new List<string>(); // keywords, where each keyword is repeated. input to w2v
            let kp_string: string = ""; // keywords*frequency concatenated into a string. input into TF
            let highKP: string[] = [""]; // most frequent keyphrase
            let high = 0;

            if (isImage) {
                kp_string = data;
                if (taglist) {
                    keyterms = taglist;
                    highKP = [taglist[0]];
                }
            }
            else { // text processing
                results.documents.forEach((doc: any) => {
                    let keyPhrases = doc.keyPhrases;
                    keyPhrases.map((kp: string) => {
                        keyterms.push(kp);
                        const frequency = this.countFrequencies(kp, data); // frequency of keyphrase in paragraph
                        kp_string += kp + ", "; // ensures that if frequency is 0 for some reason kp is still added
                        for (let i = 0; i < frequency - 1; i++) {
                            kp_string += kp + ", "; // weights repeated keywords higher
                        }
                        // replaces highKP with new one
                        if (frequency > high) {
                            high = frequency;
                            highKP = [kp];
                        }
                        // appends to current highKP phrase
                        else if (frequency === high) {
                            highKP.push(kp);
                        }
                    });
                });
            }
            if (kp_string.length > 2) kp_string = kp_string.substring(0, kp_string.length - 2);
            console.log("kp string: ", kp_string);
            let values = "";
            if (!internal) {
                const parameters: any = {
                    'language': 'en',
                    'text': data,
                    'features': {
                        'keywords': {
                            'sentiment': true,
                            'emotion': true,
                            'limit': 3
                        }
                    }
                };
                await Identified.PostToServer("/IBMAnalysis", parameters).then(response => {
                    const sorted_keywords = response.result.keywords;
                    if (sorted_keywords.length > 0) {
                        console.log("IBM keyphrase", sorted_keywords[0]);
                        highKP = [sorted_keywords[0].text];
                    }
                });
                values = await this.sendRequest(highKP, api);
            }
            return { keyterms: keyterms, external_recommendations: values, kp_string: [kp_string] };
        };
        if (data !== "") {
            return CognitiveServices.Text.Appliers.analyzer(dataDoc, extDoc, ["key words"], data, converter, isMainDoc, internal);
        }
        return;
    }

    /**
     * 
     * Counts frequencies of keyphrase in paragraph. 
     */

    private countFrequencies(keyphrase: string, paragraph: string) {
        let data = paragraph.split(/ |\n/); // splits by new lines and spaces
        let kp_array = keyphrase.split(" ");
        let num_keywords = kp_array.length;
        let par_length = data.length;
        let frequency = 0;
        // slides keyphrase windows across paragraph and checks if it matches with corresponding paragraph slice
        for (let i = 0; i <= par_length - num_keywords; i++) {
            const window = data.slice(i, i + num_keywords);
            if (JSON.stringify(window).toLowerCase() === JSON.stringify(kp_array).toLowerCase() || kp_array.every(val => window.includes(val))) {
                frequency++;
            }
        }
        return frequency;
    }

    /**
     * 
     * Removes stopwords from list of strings representing a sentence
     */

    private removeStopWords(word_array: string[]) {
        //console.log(sw.removeStopwords(word_array));
        return sw.removeStopwords(word_array);
    }

    /**
     * 
     * API for sending arXiv request.
     */

    private async sendRequest(keywords: string[], api: string) {
        let query = "";
        keywords.forEach((kp: string) => query += " " + kp);
        if (api === "arxiv") {
            return new Promise<any>(resolve => {
                this.arxivrequest(query).then(resolve);
            });
        }
        else if (api === "bing") {
            return new Promise<any>(resolve => {
                this.bingWebSearch(query).then(resolve);
            });
        }
        else {
            console.log("no api specified :(");
        }

    }

    bingWebSearch = async (query: string) => {
        const converter = async (results: any) => {
            let title_vals: string[] = [];
            let url_vals: string[] = [];
            results.webPages.value.forEach((doc: any) => {
                title_vals.push(doc.name);
                url_vals.push(doc.url);
            });
            return { title_vals, url_vals };
        };
        return CognitiveServices.BingSearch.Appliers.analyzer(query, converter);
    }

    /**
     * Actual request to the arXiv server for ML articles.
     */

    arxivrequest = async (query: string) => {
        let xhttp = new XMLHttpRequest();
        let serveraddress = "http://export.arxiv.org/api";
        const maxresults = 5;
        let endpoint = serveraddress + "/query?search_query=all:" + query + "&start=0&max_results=" + maxresults.toString();
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
                                    while (counter <= maxresults) {
                                        const title = titles[counter].childNodes[0].nodeValue!;
                                        console.log(title)
                                        title_vals.push(title);
                                        counter++;
                                    }
                                }
                                let ids = xml.getElementsByTagName("id");
                                counter = 1;
                                if (ids && ids.length > 1) {
                                    while (counter <= maxresults) {
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

    render() {
        return (<div className="wrapper">
        </div>);
    }

}