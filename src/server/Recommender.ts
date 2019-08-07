//import { Doc } from "../new_fields/Doc";
//import { StrCast } from "../new_fields/Types";
//import { List } from "../new_fields/List";
//import { CognitiveServices } from "../client/cognitive_services/CognitiveServices";

var w2v = require('word2vec');
var assert = require('assert');

export class Recommender {

    private _model: any;
    static Instance: Recommender;

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
            w2v.loadModel("./node_modules/word2vec/vectors.txt", function (err: any, model: any) {
                self._model = model;
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




}
