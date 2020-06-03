import { PropSchema, serialize, deserialize, custom, setDefaultModelSchema, getDefaultModelSchema } from "serializr";
import { Field } from "../../fields/Doc";
import { ClientUtils } from "./ClientUtils";

let serializing = 0;
export function afterDocDeserialize(cb: (err: any, val: any) => void, err: any, newValue: any) {
    serializing++;
    cb(err, newValue);
    serializing--;
}
export namespace SerializationHelper {
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

        serializing++;
        if (!(obj.constructor.name in reverseMap)) {
            throw Error(`type '${obj.constructor.name}' not registered. Make sure you register it using a @Deserializable decorator`);
        }

        const json = serialize(obj);
        json.__type = reverseMap[obj.constructor.name];
        serializing--;
        return json;
    }

    export async function Deserialize(obj: any): Promise<any> {
        if (obj === undefined || obj === null) {
            return undefined;
        }

        if (typeof obj !== 'object') {
            return obj;
        }

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
        const value = await new Promise(res => deserialize(type.ctor, obj, (err, result) => res(result)));
        if (type.afterDeserialize) {
            await type.afterDeserialize(value);
        }
        return value;
    }
}

const serializationTypes: { [name: string]: { ctor: { new(): any }, afterDeserialize?: (obj: any) => void | Promise<any> } } = {};
const reverseMap: { [ctor: string]: string } = {};

export interface DeserializableOpts {
    (constructor: { new(...args: any[]): any }): void;
    withFields(fields: string[]): Function;
}

export function Deserializable(name: string, afterDeserialize?: (obj: any) => void | Promise<any>): DeserializableOpts;
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
        }, { withFields: (fields: string[]) => Deserializable.withFields(fields, constructor, afterDeserialize) });
    }
    addToMap(constructor.name, constructor);
}

export namespace Deserializable {
    export function withFields(fields: string[], name?: string, afterDeserialize?: (obj: any) => void | Promise<any>) {
        return function (constructor: { new(...fields: any[]): any }) {
            Deserializable(name || constructor.name, afterDeserialize)(constructor);
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
        (json: any, context: any, oldValue: any, cb: (err: any, result: any) => void) => SerializationHelper.Deserialize(json).then(res => cb(null, res))
    );
}