import { ObjectField } from "./ObjectField";
import { serializable } from "serializr";
import { Deserializable } from "../client/util/SerializationHelper";
import { Copy, ToScriptString } from "./FieldSymbols";
import { scriptingGlobal } from "../client/util/Scripting";

@scriptingGlobal
@Deserializable("RichTextField")
export class RichTextField extends ObjectField {
    @serializable(true)
    readonly Data: string;
    private Extractor = /,\"text\":\"([^\}]*)\"\}/g;

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

    plainText = () => {
        let contents = "";
        let matches: RegExpExecArray | null;
        let considering = this.Data;
        while ((matches = this.Extractor.exec(considering)) !== null) {
            contents += matches[1];
            considering = considering.substring(matches.index + matches[0].length);
            this.Extractor.lastIndex = 0;
        }
        return contents.ReplaceAll("\\", "");
    }
}