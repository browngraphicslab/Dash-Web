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

export class ServerUtils {
    public static FromJson(json: string): Field {
        let obj = JSON.parse(json)
        let data: any = obj.data
        let id: string = obj.id
        let type: Types = obj.type

        if (!(data && id && type != undefined)) {
            console.log("how did you manage to get an object that doesn't have a data or an id?")
            return new TextField("Something to fill the space", Utils.GenerateGuid());
        }

        switch (type) {
            case Types.Number:
                return new NumberField(data, id)
            case Types.Text:
                return new TextField(data, id)
            case Types.RichText:
                return new RichTextField(data, id)
            case Types.Key:
                return new Key(data, id)
            case Types.Image:
                return new ImageField(data, id)
            case Types.List:
                return new ListField(data, id)
            case Types.Document:
                let doc: Document = new Document(id)
                let fields: [string, string][] = data as [string, string][]
                fields.forEach(element => {
                    doc._proxies.set(element[0], element[1]);
                    let keyId: string = element[0]
                    let valueId: string = element[1]
                    Server.GetField(keyId, (key: Field) => {
                        if (key instanceof Key) {
                            Server.GetField(valueId, (field: Field) => {
                                doc.Set(key as Key, field)
                            })
                        }
                        else {
                            console.log("how did you get a key that isnt a key wtf")
                        }
                    })
                });
                return doc
        }
        return new TextField(data, id)
    }
}