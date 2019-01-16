import { Document } from "../fields/Document";

export class DocumentViewModel {
    constructor(private doc: Document) {

    }

    get Doc(): Document {
        return this.doc;
    }
}