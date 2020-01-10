import { Schema } from "jsonschema";
import { yellow, red, cyan, green, blue, magenta, Color, grey, gray, white, black } from "colors";

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

type ColorLabel = "yellow" | "red" | "cyan" | "green" | "blue" | "magenta" | "grey" | "gray" | "white" | "black";

export const colorMapping: Map<ColorLabel, Color> = new Map([
    ["yellow", yellow],
    ["red", red],
    ["cyan", cyan],
    ["green", green],
    ["blue", blue],
    ["magenta", magenta],
    ["grey", grey],
    ["gray", gray],
    ["white", white],
    ["black", black]
]);

interface Identifier {
    text: string;
    color: ColorLabel;
}

export interface Identifiers {
    master: Identifier;
    worker: Identifier;
    exec: Identifier;
}

export interface Configuration {
    showServerOutput: boolean;
    identifiers: Identifiers;
    ports: { [description: string]: number };
    polling: {
        route: string;
        intervalSeconds: number;
        failureTolerance: number;
    };
}

export const defaultConfig: Configuration = {
    showServerOutput: false,
    identifiers: {
        master: {
            text: "__monitor__",
            color: "yellow"
        },
        worker: {
            text: "__server__",
            color: "magenta"
        },
        exec: {
            text: "__exec__",
            color: "green"
        }
    },
    ports: { server: 3000 },
    polling: {
        route: "/",
        intervalSeconds: 30,
        failureTolerance: 0
    }
};