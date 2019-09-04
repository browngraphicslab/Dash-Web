//import { Doc } from "../new_fields/Doc";
//import { StrCast } from "../new_fields/Types";
//import { List } from "../new_fields/List";
//import { CognitiveServices } from "../client/cognitive_services/CognitiveServices";

var w2v = require('word2vec');
var assert = require('assert');
var arxivapi = require('arxiv-api-node');
import requestPromise = require("request-promise");


export class Recommender {

    private _model: any;
    static Instance: Recommender;
    private dimension: number = 0;

    constructor() {
        console.log("creating recommender...");
        Recommender.Instance = this;
    }

    /***
     * Loads pre-trained model from word2vec
     */

    private loadModel(): Promise<any> {
        let self = this;
        return new Promise(res => {
            w2v.loadModel("./node_modules/word2vec/examples/fixtures/vectors.txt", function (err: any, model: any) {
                self._model = model;
                self.dimension = model.size;
                res(model);
            });
        });
    }

    /***
     * Testing
     */

    public async testModel() {
        if (!this._model) {
            await this.loadModel();
        }
        if (this._model) {
            let similarity = this._model.similarity('father', 'mother');
            console.log(similarity);
        }
        else {
            console.log("model not found :(");
        }
    }

    /***
     * Tests if instance exists
     */

    public async testInstance(text: string) {
        if (!this._model) {
            await this.loadModel();
        }
        console.log(text);
    }

    /***
     * Uses model to convert words to vectors
     */

    public async vectorize(text: string[]) {
        if (!this._model) {
            await this.loadModel();
        }
        if (this._model) {
            let word_vecs = this._model.getVectors(text);

            return word_vecs;
        }
    }

    public async arxivRequest(query: string) {
        // let xhttp = new XMLHttpRequest();
        // let serveraddress = "http://export.arxiv.org/api/query?search_query=all:electron&start=0&max_results=1";
        // let promisified = (resolve: any, reject: any) => {
        //     xhttp.onreadystatechange = function () {
        //         if (this.readyState === 4) {
        //             let result = xhttp.response;
        //             switch (this.status) {
        //                 case 200:
        //                     console.log(result);
        //                     return resolve(result);
        //                 case 400:
        //                 default:
        //                     return reject(result);
        //             }
        //         }
        //     };
        //     xhttp.open("GET", serveraddress, true);
        //     xhttp.send();
        // };
        // return new Promise<any>(promisified);

        let res = await arxivapi.query("all:electrons");
        console.log(res);
    }




}
