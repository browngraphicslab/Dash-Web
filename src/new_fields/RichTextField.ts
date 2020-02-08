import { ObjectField } from "./ObjectField";
import { serializable } from "serializr";
import { Deserializable } from "../client/util/SerializationHelper";
import { Copy, ToScriptString, ToString } from "./FieldSymbols";
import { scriptingGlobal } from "../client/util/Scripting";

@scriptingGlobal
@Deserializable("RichTextField")
export class RichTextField extends ObjectField {
    @serializable(true)
    readonly Data: string;

    @serializable(true)
    readonly Text: string;

    constructor(data: string, text: string = "") {
        super();
        this.Data = data;
        this.Text = text;
    }

  
    [Copy]() {
        return new RichTextField(this.Data, this.Text);
    }

    [ToScriptString]() {
        return `new RichTextField("${this.Data}", "${this.Text}")`;
    }
    [ToString]() {
        return this.Text;
    }

}