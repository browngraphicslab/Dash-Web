import { Schema } from "jsonschema";

const emailPattern = /^(([a-zA-Z0-9_.-])+@([a-zA-Z0-9_.-])+\.([a-zA-Z])+([a-zA-Z])+)?$/g;
const localPortPattern = /http\:\/\/localhost:\d+\/[a-zA-Z]+/g;

const properties = {
    recipients: {
        type: "array",
        items: {
            type: "string",
            pattern: emailPattern
        },
        minLength: 1
    },
    heartbeat: {
        type: "string",
        pattern: localPortPattern
    },
    signature: { type: "string" },
    masterIdentifier: { type: "string", minLength: 1 },
    workerIdentifier: { type: "string", minLength: 1 },
    showServerOutput: { type: "boolean" },
    pollingIntervalSeconds: { type: "number", minimum: 1, maximum: 86400 }
};

export const configurationSchema: Schema = {
    id: "/configuration",
    type: "object",
    properties,
    required: Object.keys(properties)
};