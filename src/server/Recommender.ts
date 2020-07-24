// //import { Doc } from "../fields/Doc";
// //import { StrCast } from "../fields/Types";
// //import { List } from "../fields/List";
// //import { CognitiveServices } from "../client/cognitive_services/CognitiveServices";

// // var w2v = require('word2vec');
// var assert = require('assert');
// var arxivapi = require('arxiv-api-node');
// import requestPromise = require("request-promise");
// import * as use from '@tensorflow-models/universal-sentence-encoder';
// import { Tensor } from "@tensorflow/tfjs-core/dist/tensor";
// require('@tensorflow/tfjs-node');

// //http://gnuwin32.sourceforge.net/packages/make.htm

// export class Recommender {

//     private _model: any;
//     static Instance: Recommender;
//     private dimension: number = 0;
//     private choice: string = ""; // Tensorflow or Word2Vec

//     constructor() {
//         Recommender.Instance = this;
//     }

//     /***
//      * Loads pre-trained model from TF
//      */

//     public async loadTFModel() {
//         let self = this;
//         return new Promise(res => {
//             use.load().then(model => {
//                 self.choice = "TF";
//                 self._model = model;
//                 self.dimension = 512;
//                 res(model);
//             });
//         }

//         );
//     }

//     /***
//      * Loads pre-trained model from word2vec
//      */

//     // private loadModel(): Promise<any> {
//     //     let self = this;
//     //     return new Promise(res => {
//     //         w2v.loadModel("./node_modules/word2vec/examples/fixtures/vectors.txt", function (err: any, model: any) {
//     //             self.choice = "WV";
//     //             self._model = model;
//     //             self.dimension = model.size;
//     //             res(model);
//     //         });
//     //     });
//     // }

//     /***
//      * Testing
//      */

//     public async testModel() {
//         if (!this._model) {
//             await this.loadTFModel();
//         }
//         if (this._model) {
//             if (this.choice === "WV") {
//                 let similarity = this._model.similarity('father', 'mother');
//             }
//             else if (this.choice === "TF") {
//                 const model = this._model as use.UniversalSentenceEncoder;
//                 // Embed an array of sentences.
//                 const sentences = [
//                     'Hello.',
//                     'How are you?'
//                 ];
//                 const embeddings = await this.vectorize(sentences);
//                 if (embeddings) embeddings.print(true /*verbose*/);
//                 // model.embed(sentences).then(embeddings => {
//                 //     // `embeddings` is a 2D tensor consisting of the 512-dimensional embeddings for each sentence.
//                 //     // So in this example `embeddings` has the shape [2, 512].
//                 //     embeddings.print(true /* verbose */);
//                 // });
//             }
//         }
//         else {
//             console.log("model not found :(");
//         }
//     }

//     /***
//      * Uses model to convert words to vectors
//      */

//     public async vectorize(text: string[]): Promise<Tensor | undefined> {
//         if (!this._model) {
//             await this.loadTFModel();
//         }
//         if (this._model) {
//             if (this.choice === "WV") {
//                 let word_vecs = this._model.getVectors(text);
//                 return word_vecs;
//             }
//             else if (this.choice === "TF") {
//                 const model = this._model as use.UniversalSentenceEncoder;
//                 return new Promise<Tensor>(res => {
//                     model.embed(text).then(embeddings => {
//                         res(embeddings);
//                     });
//                 });

//             }
//         }
//     }

//     // public async trainModel() {
//     //     w2v.word2vec("./node_modules/word2vec/examples/eng_news-typical_2016_1M-sentences.txt", './node_modules/word2vec/examples/my_phrases.txt', {
//     //         cbow: 1,
//     //         size: 200,
//     //         window: 8,
//     //         negative: 25,
//     //         hs: 0,
//     //         sample: 1e-4,
//     //         threads: 20,
//     //         iter: 200,
//     //         minCount: 2
//     //     });
//     // }

// }
