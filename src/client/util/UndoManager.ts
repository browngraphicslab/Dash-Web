import { observable, action } from "mobx";
import { Opt } from "../../fields/Field";

function propertyDecorator(target: any, key: string | symbol) {
    Object.defineProperty(target, key, {
        configurable: true,
        enumerable: false,
        get: function () {
            return 5;
        },
        set: function (value: any) {
            Object.defineProperty(this, key, {
                enumerable: false,
                writable: true,
                configurable: true,
                value: function (...args: any[]) {
                    try {
                        UndoManager.StartBatch();
                        return value.apply(this, args);
                    } finally {
                        UndoManager.EndBatch();
                    }
                }
            })
        }
    })
}
export function undoBatch(target: any, key: string | symbol, descriptor?: TypedPropertyDescriptor<any>): any {
    if (!descriptor) {
        propertyDecorator(target, key);
        return;
    }
    const oldFunction = descriptor.value;

    descriptor.value = function (...args: any[]) {
        try {
            UndoManager.StartBatch()
            return oldFunction.apply(this, args)
        } finally {
            UndoManager.EndBatch()
        }
    }

    return descriptor;
}

export namespace UndoManager {
    export interface UndoEvent {
        undo: () => void;
        redo: () => void;
    }
    type UndoBatch = UndoEvent[];

    let undoStack: UndoBatch[] = observable([]);
    let redoStack: UndoBatch[] = observable([]);
    let currentBatch: UndoBatch | undefined;
    let batchCounter = 0;
    let undoing = false;

    export function AddEvent(event: UndoEvent): void {
        if (currentBatch && batchCounter && !undoing) {
            currentBatch.push(event);
        }
    }

    export function CanUndo(): boolean {
        return undoStack.length > 0;
    }

    export function CanRedo(): boolean {
        return redoStack.length > 0;
    }

    export function StartBatch(): void {
        batchCounter++;
        if (batchCounter > 0) {
            currentBatch = [];
        }
    }

    export const EndBatch = action(() => {
        batchCounter--;
        if (batchCounter === 0 && currentBatch && currentBatch.length) {
            undoStack.push(currentBatch);
            redoStack.length = 0;
            currentBatch = undefined;
        }
    })

    export function RunInBatch(fn: () => void) {
        StartBatch();
        fn();
        EndBatch();
    }

    export const Undo = action(() => {
        if (undoStack.length === 0) {
            return;
        }

        let commands = undoStack.pop();
        if (!commands) {
            return;
        }

        undoing = true;
        for (let i = commands.length - 1; i >= 0; i--) {
            commands[i].undo();
        }
        undoing = false;

        redoStack.push(commands);
    })

    export const Redo = action(() => {
        if (redoStack.length === 0) {
            return;
        }

        let commands = redoStack.pop();
        if (!commands) {
            return;
        }

        undoing = true;
        for (let i = 0; i < commands.length; i++) {
            commands[i].redo();
        }
        undoing = false;

        undoStack.push(commands);
    })

}