import { Doc } from '../../../new_fields/Doc';

export class KeyFrame {
    private _document: Doc;
    constructor() {
        this._document = new Doc();
        

    }

    get doc():Doc {
        return this._document;
    }
    

}