import { observable, action } from "mobx";
import { Opt } from "../../fields/Field";

export function undoBatch(target: any, key: string | symbol, descriptor?: TypedPropertyDescriptor<any>): any {
    let fn: (...args: any[]) => any;
    let patchedFn: Opt<(...args: any[]) => any>;

    if (descriptor) {
        fn = descriptor.value;
    }

    return {
        configurable: true,
        enumerable: false,
        get() {
            if (!patchedFn) {
                patchedFn = (...args: any[]) => {
                    try {
                        UndoManager.StartBatch()
                        return fn.call(this, ...args)
                    } finally {
                        UndoManager.EndBatch()
                    }
                };
            }
            return patchedFn;
        },
        set(newFn: any) {
            patchedFn = undefined;
            fn = newFn;
        }
    }
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