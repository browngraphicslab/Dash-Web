import { Schema } from "jsonschema";

const emailPattern = /^(([a-zA-Z0-9_.-])+@([a-zA-Z0-9_.-])+\.([a-zA-Z])+([a-zA-Z])+)?$/g;
const routePattern = /\/[a-zA-Z]*/g;

export const configurationSchema: Schema = {
    id: "/configuration",
    type: "object",
    properties: {
        ports: {
            type: "object",
            properties: {
                server: { type: "number", minimum: 1024, maximum: 65535 },
                socket: { type: "number", minimum: 1024, maximum: 65535 }
            },
            required: ["server"],
            additionalProperties: true
        },
        pollingRoute: {
            type: "string",
            pattern: routePattern
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
    }
};