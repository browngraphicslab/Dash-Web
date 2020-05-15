import { ObjectField } from "./ObjectField";
import { observable } from "mobx";
import { Deserializable } from "../client/util/SerializationHelper";
import { serializable, createSimpleSchema, object, date } from "serializr";
import { OnUpdate, ToScriptString, ToString, Copy } from "./FieldSymbols";

export type CursorPosition = {
    x: number,
    y: number
};

export type CursorMetadata = {
    id: string,
    identifier: string,
    timestamp: number
};

export type CursorData = {
    metadata: CursorMetadata,
    position: CursorPosition
};

const PositionSchema = createSimpleSchema({
    x: true,
    y: true
});

const MetadataSchema = createSimpleSchema({
    id: true,
    identifier: true,
    timestamp: true
});

const CursorSchema = createSimpleSchema({
    metadata: object(MetadataSchema),
    position: object(PositionSchema)
});

@Deserializable("cursor")
export default class CursorField extends ObjectField {

    @serializable(object(CursorSchema))
    readonly data: CursorData;

    constructor(data: CursorData) {
        super();
        this.data = data;
    }

    setPosition(position: CursorPosition) {
        this.data.position = position;
        this.data.metadata.timestamp = Date.now();
        this[OnUpdate]();
    }

    [Copy]() {
        return new CursorField(this.data);
    }

    [ToScriptString]() {
        return "invalid";
    }
    [ToString]() {
        return "invalid";
    }
}