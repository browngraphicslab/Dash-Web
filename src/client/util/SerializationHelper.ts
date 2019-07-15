import { PropSchema, serialize, deserialize, custom, setDefaultModelSchema, getDefaultModelSchema, primitive, SKIP } from "serializr";
import { Field } from "../../new_fields/Doc";
import { ClientUtils } from "./ClientUtils";

export namespace SerializationHelper {
    let serializing: number = 0;
    export function IsSerializing() {
        return serializing > 0;
    }

    export function Serialize(obj: Field): any {
        if (obj === undefined || obj === null) {
            return null;
        }

        if (typeof obj !== 'object') {
            return obj;
        }

        serializing += 1;
        if (!(obj.constructor.name in reverseMap)) {
            throw Error(`type '${obj.constructor.name}' not registered. Make sure you register it using a @Deserializable decorator`);
        }

        const json = serialize(obj);
        json.__type = reverseMap[obj.constructor.name];
        serializing -= 1;
        return json;
    }

    export function Deserialize(obj: any): any {
        if (obj === undefined || obj === null) {
            return undefined;
        }

        if (typeof obj !== 'object') {
            return obj;
        }

        serializing += 1;
        if (!obj.__type) {
            if (ClientUtils.RELEASE) {
                console.warn("No property 'type' found in JSON.");
                return undefined;
            } else {
                throw Error("No property 'type' found in JSON.");
            }
        }

        if (!(obj.__type in serializationTypes)) {
            throw Error(`type '${obj.__type}' not registered. Make sure you register it using a @Deserializable decorator`);
        }

        const type = serializationTypes[obj.__type];
        const value = deserialize(type.ctor, obj);
        if (type.afterDeserialize) {
            type.afterDeserialize(value);
        }
        serializing -= 1;
        return value;
    }
}

let serializationTypes: { [name: string]: { ctor: { new(): any }, afterDeserialize?: (obj: any) => void } } = {};
let reverseMap: { [ctor: string]: string } = {};

export interface DeserializableOpts {
    (constructor: { new(...args: any[]): any }): void;
    withFields(fields: string[]): Function;
}

export function Deserializable(name: string, afterDeserialize?: (obj: any) => void): DeserializableOpts;
export function Deserializable(constructor: { new(...args: any[]): any }): void;
export function Deserializable(constructor: { new(...args: any[]): any } | string, afterDeserialize?: (obj: any) => void): DeserializableOpts | void {
    function addToMap(name: string, ctor: { new(...args: any[]): any }) {
        const schema = getDefaultModelSchema(ctor) as any;
        if (schema.targetClass !== ctor) {
            const newSchema = { ...schema, factory: () => new ctor() };
            setDefaultModelSchema(ctor, newSchema);
        }
        if (!(name in serializationTypes)) {
            serializationTypes[name] = { ctor, afterDeserialize };
            reverseMap[ctor.name] = name;
        } else {
            throw new Error(`Name ${name} has already been registered as deserializable`);
        }
    }
    if (typeof constructor === "string") {
        return Object.assign((ctor: { new(...args: any[]): any }) => {
            addToMap(constructor, ctor);
        }, { withFields: Deserializable.withFields });
    }
    addToMap(constructor.name, constructor);
}

export namespace Deserializable {
    export function withFields(fields: string[]) {
        return function (constructor: { new(...fields: any[]): any }) {
            Deserializable(constructor);
            let schema = getDefaultModelSchema(constructor);
            if (schema) {
                schema.factory = context => {
                    const args = fields.map(key => context.json[key]);
                    return new constructor(...args);
                };
                // TODO A modified version of this would let us not reassign fields that we're passing into the constructor later on in deserializing
                // fields.forEach(field => {
                //     if (field in schema.props) {
                //         let propSchema = schema.props[field];
                //         if (propSchema === false) {
                //             return;
                //         } else if (propSchema === true) {
                //             propSchema = primitive();
                //         }
                //         schema.props[field] = custom(propSchema.serializer,
                //             () => {
                //                 return SKIP;
                //             });
                //     }
                // });
            } else {
                schema = {
                    props: {},
                    factory: context => {
                        const args = fields.map(key => context.json[key]);
                        return new constructor(...args);
                    }
                };
                setDefaultModelSchema(constructor, schema);
            }
        };
    }
}

export function autoObject(): PropSchema {
    return custom(
        (s) => SerializationHelper.Serialize(s),
        (s) => SerializationHelper.Deserialize(s)
    );
}