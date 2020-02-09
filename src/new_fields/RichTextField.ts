import { ObjectField } from "./ObjectField";
import { serializable } from "serializr";
import { Deserializable } from "../client/util/SerializationHelper";
import { Copy, ToScriptString, ToPlainText, ToString } from "./FieldSymbols";
import { scriptingGlobal } from "../client/util/Scripting";

const delimiter = "\n";
const joiner = "";

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

    [ToPlainText]() {
        // Because we're working with plain text, just concatenate all paragraphs
        let content = JSON.parse(this.Data).doc.content;
        let paragraphs = content.filter((item: any) => item.type === "paragraph");

        // Functions to flatten ProseMirror paragraph objects (and their components) to plain text
        // While this function already exists in state.doc.textBeteen(), it doesn't account for newlines 
        let blockText = (block: any) => block.text;
        let concatenateParagraph = (p: any) => (p.content ? p.content.map(blockText).join(joiner) : "") + delimiter;

        // Concatentate paragraphs and string the result together
        let textParagraphs: string[] = paragraphs.map(concatenateParagraph);
        let plainText = textParagraphs.join(joiner);
        return plainText.substring(0, plainText.length - 1);
    }

}