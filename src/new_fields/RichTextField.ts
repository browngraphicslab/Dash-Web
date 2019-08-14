import { ObjectField } from "./ObjectField";
import { serializable } from "serializr";
import { Deserializable } from "../client/util/SerializationHelper";
import { Copy, ToScriptString } from "./FieldSymbols";
import { scriptingGlobal } from "../client/util/Scripting";

export const ToGoogleDocText = Symbol("PlainText");
export const FromGoogleDocText = Symbol("PlainText");

@scriptingGlobal
@Deserializable("RichTextField")
export class RichTextField extends ObjectField {
    @serializable(true)
    readonly Data: string;

    constructor(data: string) {
        super();
        this.Data = data;
    }

    [Copy]() {
        return new RichTextField(this.Data);
    }

    [ToScriptString]() {
        return `new RichTextField("${this.Data}")`;
    }

    [ToGoogleDocText]() {
        let content = JSON.parse(this.Data).doc.content;
        let paragraphs = content.filter((item: any) => item.type === "paragraph");
        let output = "";
        for (let i = 0; i < paragraphs.length; i++) {
            let paragraph = paragraphs[i];
            let addNewLine = i > 0 ? paragraphs[i - 1].content : false;
            if (paragraph.content) {
                output += paragraph.content.map((block: any) => block.text).join("");
            } else {
                output += i === 0 ? "" : "\n";
            }
            addNewLine && (output += "\n");
        }
        return output;
    }

    [FromGoogleDocText](plainText: string) {
        let elements = plainText.split("\n");
        !elements[elements.length - 1].length && elements.pop();
        let parsed = JSON.parse(this.Data);
        parsed.doc.content = elements.map(text => {
            let paragraph: any = { type: "paragraph" };
            if (text.length) {
                paragraph.content = [{
                    type: "text",
                    marks: [],
                    text
                }];
            }
            return paragraph;
        });
        parsed.selection = {
            type: "text",
            anchor: 1,
            head: 1
        };
        return JSON.stringify(parsed);
    }

}