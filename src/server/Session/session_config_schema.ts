import { Schema } from "jsonschema";

const emailPattern = /^(([a-zA-Z0-9_.-])+@([a-zA-Z0-9_.-])+\.([a-zA-Z])+([a-zA-Z])+)?$/g;
const localPortPattern = /\/[a-zA-Z]*/g;

const properties: { [name: string]: Schema } = {
    ports: {
        type: "object",
        properties: {
            server: { type: "number" },
            socket: { type: "number" }
        },
        required: ["server"],
        additionalProperties: true
    },
    heartbeatRoute: {
        type: "string",
        pattern: localPortPattern
    },
    email: {
        type: "object",
        properties: {
            recipients: {
                type: "array",
                items: {
                    type: "string",
                    pattern: emailPattern
                },
                minLength: 1
            },
            signature: {
                type: "string",
                minLength: 1
            }
        },
        required: ["recipients"]
    },
    masterIdentifier: {
        type: "string",
        minLength: 1
    },
    workerIdentifier: {
        type: "string",
        minLength: 1
    },
    showServerOutput: { type: "boolean" },
    pollingIntervalSeconds: {
        type: "number",
        minimum: 1,
        maximum: 86400
    }
};

export const configurationSchema: Schema = {
    id: "/configuration",
    type: "object",
    properties,
};