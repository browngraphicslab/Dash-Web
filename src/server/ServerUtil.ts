import { HistogramField } from "../client/northstar/dash-fields/HistogramField";
import { AudioField } from "../fields/AudioField";
import { BooleanField } from "../fields/BooleanField";
import { HtmlField } from "../fields/HtmlField";
import { InkField } from "../fields/InkField";
import { PDFField } from "../fields/PDFField";
import { ScriptField } from "../fields/ScriptField";
import { TupleField } from "../fields/TupleField";
import { VideoField } from "../fields/VideoField";
import { WebField } from "../fields/WebField";
import { Utils } from "../Utils";
import { Document } from "./../fields/Document";
import { Field } from "./../fields/Field";
import { ImageField } from "./../fields/ImageField";
import { Key } from "./../fields/Key";
import { ListField } from "./../fields/ListField";
import { NumberField } from "./../fields/NumberField";
import { RichTextField } from "./../fields/RichTextField";
import { TextField } from "./../fields/TextField";
import { Transferable, Types } from "./Message";
import { Template } from "../client/views/Templates";
import { TemplateField } from "../fields/TemplateField";

export class ServerUtils {
    public static prepend(extension: string): string {
        return window.location.origin + extension;
    }

    public static FromJson(json: Transferable): Field {

        if (!(json.data !== undefined && json.id && json.type !== undefined)) {
            console.log(
                "how did you manage to get an object that doesn't have a data or an id?"
            );
            return new TextField("Something to fill the space", Utils.GenerateGuid());
        }

        switch (json.type) {
            case Types.Boolean: return new BooleanField(json.data, json.id, false);
            case Types.Number: return new NumberField(json.data, json.id, false);
            case Types.Text: return new TextField(json.data, json.id, false);
            case Types.Html: return new HtmlField(json.data, json.id, false);
            case Types.Web: return new WebField(new URL(json.data), json.id, false);
            case Types.RichText: return new RichTextField(json.data, json.id, false);
            case Types.Key: return new Key(json.data, json.id, false);
            case Types.Image: return new ImageField(new URL(json.data), json.id, false);
            case Types.HistogramOp: return HistogramField.FromJson(json.id, json.data);
            case Types.PDF: return new PDFField(new URL(json.data), json.id, false);
            case Types.List: return ListField.FromJson(json.id, json.data);
            case Types.Script: return ScriptField.FromJson(json.id, json.data);
            case Types.Audio: return new AudioField(new URL(json.data), json.id, false);
            case Types.Video: return new VideoField(new URL(json.data), json.id, false);
            case Types.Tuple: return new TupleField(json.data, json.id, false);
            case Types.Ink: return InkField.FromJson(json.id, json.data);
            case Types.Template: return TemplateField.FromJson(json.id, json.data);
            case Types.Document: return Document.FromJson(json.data, json.id, false);
            default:
                throw Error(
                    "Error, unrecognized field type received from server. If you just created a new field type, be sure to add it here"
                );
        }
    }
}
