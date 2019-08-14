import { ObjectField } from "./ObjectField";
import { serializable } from "serializr";
import { Deserializable } from "../client/util/SerializationHelper";
import { Copy, ToScriptString } from "./FieldSymbols";
import { scriptingGlobal } from "../client/util/Scripting";

export const ToPlainText = Symbol("PlainText");
export const FromPlainText = Symbol("PlainText");

@scriptingGlobal
@Deserializable("RichTextField")
export class RichTextField extends ObjectField {
    @serializable(true)
    Data: string;

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

    [ToPlainText]() {
        let content = JSON.parse(this.Data).doc.content;
        let paragraphs = content.filter((item: any) => item.type === "paragraph");
        let output = "";
        for (let i = 0; i < paragraphs.length; i++) {
            let paragraph = paragraphs[i];
            if (paragraph.content) {
                output += paragraph.content.map((block: any) => block.text).join("");
            } else {
                output += i > 0 && paragraphs[i - 1].content ? "\n\n" : "\n";
            }
        }
        return output;
    }

    [FromPlainText](plainText: string) {
        let elements = plainText.split("\n");
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
            anchor: plainText.length,
            head: plainText.length
        };
        this.Data = JSON.stringify(parsed);
    }

}