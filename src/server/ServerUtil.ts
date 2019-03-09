import { Field } from './../fields/Field';
import { TextField } from './../fields/TextField';
import { NumberField } from './../fields/NumberField';
import { RichTextField } from './../fields/RichTextField';
import { Key } from './../fields/Key';
import { ImageField } from './../fields/ImageField';
import { ListField } from './../fields/ListField';
import { Document } from './../fields/Document';
import { Server } from './../client/Server';
import { Types } from './Message';
import { Utils } from '../Utils';
import { HtmlField } from '../fields/HtmlField';
import { WebField } from '../fields/WebField';
import { AudioField } from '../fields/AudioField';
import { VideoField } from '../fields/VideoField';

export class ServerUtils {
    public static FromJson(json: any): Field {
        let obj = json
        let data: any = obj.data
        let id: string = obj._id
        let type: Types = obj.type

        if (!(data !== undefined && id && type !== undefined)) {
            console.log("how did you manage to get an object that doesn't have a data or an id?")
            return new TextField("Something to fill the space", Utils.GenerateGuid());
        }

        switch (type) {
            case Types.Number:
                return new NumberField(data, id, false)
            case Types.Text:
                return new TextField(data, id, false)
            case Types.Html:
                return new HtmlField(data, id, false)
            case Types.Web:
                return new WebField(new URL(data), id, false)
            case Types.RichText:
                return new RichTextField(data, id, false)
            case Types.Key:
                return new Key(data, id, false)
            case Types.Image:
                return new ImageField(new URL(data), id, false)
            case Types.List:
                return ListField.FromJson(id, data)
            case Types.Audio:
                return new AudioField(new URL(data), id, false)
            case Types.Video:
                return new VideoField(new URL(data), id, false)
            case Types.Document:
                let doc: Document = new Document(id, false)
                let fields: [string, string][] = data as [string, string][]
                fields.forEach(element => {
                    doc._proxies.set(element[0], element[1]);
                });
                return doc
            default:
                throw Error("Error, unrecognized field type received from server. If you just created a new field type, be sure to add it here");
        }
    }
}