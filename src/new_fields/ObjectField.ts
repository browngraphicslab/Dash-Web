import { Doc } from "./Doc";

export const OnUpdate = Symbol("OnUpdate");
export const Parent = Symbol("Parent");
const Id = Symbol("Object Id");
export class ObjectField {
    protected [OnUpdate]?: (diff?: any) => void;
    private [Parent]?: Doc;
    readonly [Id] = "";
}

export namespace ObjectField {
    export function MakeCopy(field: ObjectField) {
        //TODO Types
        return field;
    }
}
