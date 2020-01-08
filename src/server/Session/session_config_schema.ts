import { Schema } from "jsonschema";

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
            pattern: /\/[a-zA-Z]*/g
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
        },
        pollingFailureTolerance: {
            type: "number",
            minimum: 0,
        }
    }
};