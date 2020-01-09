import { Schema } from "jsonschema";

const colorPattern = /black|red|green|yellow|blue|magenta|cyan|white|gray|grey/;

const identifierProperties: Schema = {
    type: "object",
    properties: {
        text: {
            type: "string",
            minLength: 1
        },
        color: {
            type: "string",
            pattern: colorPattern
        }
    }
};

const portProperties: Schema = {
    type: "number",
    minimum: 1024,
    maximum: 65535
};

export const configurationSchema: Schema = {
    id: "/configuration",
    type: "object",
    properties: {
        showServerOutput: { type: "boolean" },
        ports: {
            type: "object",
            properties: {
                server: portProperties,
                socket: portProperties
            },
            required: ["server"],
            additionalProperties: true
        },
        identifiers: {
            type: "object",
            properties: {
                master: identifierProperties,
                worker: identifierProperties,
                exec: identifierProperties
            }
        },
        polling: {
            type: "object",
            additionalProperties: false,
            properties: {
                intervalSeconds: {
                    type: "number",
                    minimum: 1,
                    maximum: 86400
                },
                route: {
                    type: "string",
                    pattern: /\/[a-zA-Z]*/g
                },
                failureTolerance: {
                    type: "number",
                    minimum: 0,
                }
            }
        },
    }
};