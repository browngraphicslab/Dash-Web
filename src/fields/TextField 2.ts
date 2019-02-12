import { BasicField } from "./BasicField"

export class TextField extends BasicField<string> {
    constructor(data: string = "") {
        super(data);
    }

    Copy() {
        return new TextField(this.Data);
    }


}
