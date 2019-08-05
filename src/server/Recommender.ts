var w2v = require('word2vec');

export class Recommender {

    private _model: any;

    constructor() {
        console.log("creating recommender...");
    }

    public loadModel(): Promise<any> {
        let self = this;
        return new Promise(res => {
            w2v.loadModel("./node_modules/word2vec/vectors.txt", function (err: any, model: any) {
                console.log(err);
                console.log(model);
                self._model = model;
                console.log(model.similarity('father', 'mother'));
                res(model);
            });
        });
    }

    public testModel() {
        if (this._model) {
            let similarity = this._model.similarity('father', 'mother');
            console.log(similarity);
        }
        else {
            console.log("model not found :(");
        }
    }
}
