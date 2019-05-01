import { Document } from '../../../fields/Document';

export class KeyFrame {
    private _document: any;
    constructor() {
        this._document = new Document();


    }

    get document() {
        console.log(this._document);
        return this._document;

    }

}