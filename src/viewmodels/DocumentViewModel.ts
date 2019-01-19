import { Document } from "../fields/Document";

export class DocumentViewModel {
    constructor(private doc: Document) {

    }

    get Doc(): Document {
        return this.doc;
    }

    private _selected = false;

    get Selected() : boolean {
        return this._selected;
    }

    set Selected(isSelected: boolean) {
        this._selected = isSelected;
    }
}