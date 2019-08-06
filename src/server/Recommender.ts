var w2v = require('word2vec');

export class Recommender {

    private _model: any;
    static Instance: Recommender;

    constructor() {
        console.log("creating recommender...");
        Recommender.Instance = this;
    }

    private loadModel(): Promise<any> {
        let self = this;
        return new Promise(res => {
            w2v.loadModel("./node_modules/word2vec/vectors.txt", function (err: any, model: any) {
                self._model = model;
                res(model);
            });
        });
    }

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

    public async testInstance(text: string) {
        if (!this._model) {
            await this.loadModel();
        }
        console.log(text);
    }

    public async vectorize(text: string[]) {
        if (!this._model) {
            await this.loadModel();
        }
        if (this._model) {
            let word_vecs = this._model.getVectors(text);
            console.log(word_vecs[0]);
            return word_vecs;
        }
    }
}
