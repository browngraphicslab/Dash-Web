import { ObjectField } from "./ObjectField";
import { serializable } from "serializr";
import { Deserializable } from "../client/util/SerializationHelper";
import { Copy, ToScriptString, ToPlainText, ToString } from "./FieldSymbols";
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

    Empty() {
        return !(this.Text || this.Data.toString().includes("dashField") || this.Data.toString().includes("align"));
    }

    [Copy]() {
        return new RichTextField(this.Data, this.Text);
    }

    [ToScriptString]() {
        return `new RichTextField("${this.Data.replace(/"/g, "'")}", "${this.Text}")`;
    }
    [ToString]() {
        return this.Text;
    }

    public static DashField(fieldKey: string) {
        return new RichTextField(`{"doc":{"type":"doc","content":[{"type":"paragraph","attrs":{"align":null,"color":null,"id":null,"indent":null,"inset":null,"lineSpacing":null,"paddingBottom":null,"paddingTop":null},"content":[{"type":"dashField","attrs":{"fieldKey":"${fieldKey}","docid":""}}]}]},"selection":{"type":"text","anchor":2,"head":2},"storedMarks":[]}`, "");
    }

}