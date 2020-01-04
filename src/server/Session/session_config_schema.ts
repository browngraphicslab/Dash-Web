import { Schema } from "jsonschema";

export const configurationSchema: Schema = {
    id: "/Configuration",
    type: "object",
    properties: {
        recipients: {
            type: "array",
            items: {
                type: "string",
                pattern: /[^\@]+\@[^\@]+/g
            },
            minLength: 1
        },
        heartbeat: {
            type: "string",
            pattern: /http\:\/\/localhost:\d+\/[a-zA-Z]+/g
        },
        signature: { type: "string" },
        masterIdentifier: { type: "string", minLength: 1 },
        workerIdentifier: { type: "string", minLength: 1 },
        silentChildren: { type: "boolean" }
    },
    required: ["heartbeat", "recipients", "signature", "masterIdentifier", "workerIdentifier", "silentChildren"]
};