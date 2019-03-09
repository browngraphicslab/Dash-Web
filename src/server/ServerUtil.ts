import {HtmlField} from '../fields/HtmlField';
import {InkField} from '../fields/InkField';
import {PDFField} from '../fields/PDFField';
import {WebField} from '../fields/WebField';
import {Utils} from '../Utils';
import {Document} from './../fields/Document';
import {Field} from './../fields/Field';
import {ImageField} from './../fields/ImageField';
import {Key} from './../fields/Key';
import {ListField} from './../fields/ListField';
import {NumberField} from './../fields/NumberField';
import {RichTextField} from './../fields/RichTextField';
import {TextField} from './../fields/TextField';
import {Types} from './Message';

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
            case Types.PDF:
                return new PDFField(new URL(data), id, false)
            case Types.List:
                return ListField.FromJson(id, data)
            case Types.Ink:
                return InkField.FromJson(id, data);
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