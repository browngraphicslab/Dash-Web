import { PropSchema, serialize, deserialize, custom } from "serializr";
import { Field } from "../../fields/NewDoc";

export class SerializationHelper {

    public static Serialize(obj: Field): any {
        if (!obj) {
            return null;
        }

        if (typeof obj !== 'object') {
            return obj;
        }

        if (!(obj.constructor.name in reverseMap)) {
            throw Error(`type '${obj.constructor.name}' not registered. Make sure you register it using a @Deserializable decorator`);
        }

        const json = serialize(obj);
        json.__type = reverseMap[obj.constructor.name];
        return json;
    }

    public static Deserialize(obj: any): any {
        if (!obj) {
            return null;
        }

        if (typeof obj !== 'object') {
            return obj;
        }

        if (!obj.__type) {
            throw Error("No property 'type' found in JSON.");
        }

        if (!(obj.__type in serializationTypes)) {
            throw Error(`type '${obj.__type}' not registered. Make sure you register it using a @Deserializable decorator`);
        }

        return deserialize(serializationTypes[obj.__type], obj);
    }
}

let serializationTypes: { [name: string]: any } = {};
let reverseMap: { [ctor: string]: string } = {};

export function Deserializable(name: string): Function;
export function Deserializable(constructor: Function): void;
export function Deserializable(constructor: Function | string): Function | void {
    function addToMap(name: string, ctor: Function) {
        if (!(name in serializationTypes)) {
            serializationTypes[name] = constructor;
            reverseMap[ctor.name] = name;
        } else {
            throw new Error(`Name ${name} has already been registered as deserializable`);
        }
    }
    if (typeof constructor === "string") {
        return (ctor: Function) => {
            addToMap(constructor, ctor);
        };
    }
    addToMap(constructor.name, constructor);
}

export function autoObject(): PropSchema {
    return custom(
        (s) => SerializationHelper.Serialize(s),
        (s) => SerializationHelper.Deserialize(s)
    );
}