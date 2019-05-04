import { Doc } from "./Doc";

export const OnUpdate = Symbol("OnUpdate");
export const Parent = Symbol("Parent");
export const Copy = Symbol("Copy");

export abstract class ObjectField {
    protected [OnUpdate](diff?: any) { };
    private [Parent]?: Doc;
    abstract [Copy](): ObjectField;
}

export namespace ObjectField {
    export function MakeCopy<T extends ObjectField>(field: T) {
        return field[Copy]();
    }
}
