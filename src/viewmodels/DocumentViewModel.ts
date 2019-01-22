import { Document } from "../fields/Document";

export class DocumentViewModel {
    constructor(private doc: Document) {

    }

    get Doc(): Document {
        return this.doc;
    }

    private _isMainDoc = false

    get IsMainDoc(): boolean {
        return this._isMainDoc;
    }

    set IsMainDoc(v: boolean) {
        this._isMainDoc = v;
    }
}