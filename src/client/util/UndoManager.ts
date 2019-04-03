import { observable, action } from "mobx";
import 'source-map-support/register'
import { Without } from "../../Utils";

function getBatchName(target: any, key: string | symbol): string {
    let keyName = key.toString();
    if (target && target.constructor && target.constructor.name) {
        return `${target.constructor.name}.${keyName}`;
    }
    return keyName;
}

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
                    let batch = UndoManager.StartBatch(getBatchName(target, key));
                    try {
                        return value.apply(this, args);
                    } finally {
                        batch.end();
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
        let batch = UndoManager.StartBatch(getBatchName(target, key));
        try {
            return oldFunction.apply(this, args)
        } finally {
            batch.end();
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

    let openBatches: Batch[] = [];
    export function GetOpenBatches(): Without<Batch, 'end'>[] {
        return openBatches;
    }
    export class Batch {
        private disposed: boolean = false;

        constructor(readonly batchName: string) {
            openBatches.push(this);
        }

        private dispose = (cancel: boolean) => {
            if (this.disposed) {
                throw new Error("Cannot dispose an already disposed batch");
            }
            this.disposed = true;
            openBatches.splice(openBatches.indexOf(this));
            EndBatch(cancel);
        }

        end = () => { this.dispose(false); }
        cancel = () => { this.dispose(true); }
    }

    export function StartBatch(batchName: string): Batch {
        batchCounter++;
        if (batchCounter > 0) {
            currentBatch = [];
        }
        return new Batch(batchName);
    }

    const EndBatch = action((cancel: boolean = false) => {
        batchCounter--;
        if (batchCounter === 0 && currentBatch && currentBatch.length) {
            if (!cancel) {
                undoStack.push(currentBatch);
            }
            redoStack.length = 0;
            currentBatch = undefined;
        }
    })

    export function RunInBatch(fn: () => void, batchName: string) {
        let batch = StartBatch(batchName);
        fn();
        batch.end();
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