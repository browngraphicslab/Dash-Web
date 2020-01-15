import { ObjectField } from "./ObjectField";
import { serializable } from "serializr";
import { Deserializable } from "../client/util/SerializationHelper";
import { Copy, ToScriptString } from "./FieldSymbols";
import { scriptingGlobal } from "../client/util/Scripting";

export const ToPlainText = Symbol("PlainText");
export const FromPlainText = Symbol("PlainText");

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

    public static Initialize = (initial: string) => {
        !initial.length && (initial = " ");
        const pos = initial.length + 1;
        return `{"doc":{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"${initial}"}]}]},"selection":{"type":"text","anchor":${pos},"head":${pos}}}`;
    }

    [ToPlainText]() {
        // Because we're working with plain text, just concatenate all paragraphs
        const content = JSON.parse(this.Data).doc.content;
        const paragraphs = content.filter((item: any) => item.type === "paragraph");

        // Functions to flatten ProseMirror paragraph objects (and their components) to plain text
        // While this function already exists in state.doc.textBeteen(), it doesn't account for newlines 
        const blockText = (block: any) => block.text;
        const concatenateParagraph = (p: any) => (p.content ? p.content.map(blockText).join(joiner) : "") + delimiter;

        // Concatentate paragraphs and string the result together
        const textParagraphs: string[] = paragraphs.map(concatenateParagraph);
        const plainText = textParagraphs.join(joiner);
        return plainText.substring(0, plainText.length - 1);
    }

    [FromPlainText](plainText: string) {
        // Remap the text, creating blocks split on newlines
        const elements = plainText.split(delimiter);

        // Google Docs adds in an extra carriage return automatically, so this counteracts it
        !elements[elements.length - 1].length && elements.pop();

        // Preserve the current state, but re-write the content to be the blocks
        const parsed = JSON.parse(this.Data);
        parsed.doc.content = elements.map(text => {
            const paragraph: any = { type: "paragraph" };
            text.length && (paragraph.content = [{ type: "text", marks: [], text }]); // An empty paragraph gets treated as a line break
            return paragraph;
        });

        // If the new content is shorter than the previous content and selection is unchanged, may throw an out of bounds exception, so we reset it
        parsed.selection = { type: "text", anchor: 1, head: 1 };

        // Export the ProseMirror-compatible state object we've jsut built
        return JSON.stringify(parsed);
    }

}