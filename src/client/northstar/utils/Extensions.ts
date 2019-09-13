interface String {
    ReplaceAll(toReplace: string, replacement: string): string;
    Truncate(length: number, replacement: string): String;
    removeTrailingNewlines(): string;
    hasNewline(): boolean;
}

const extensions = require(".././/.//../util/UtilExtensions");

String.prototype.ReplaceAll = function (toReplace: string, replacement: string): string {
    var target = this;
    return target.split(toReplace).join(replacement);
};

String.prototype.Truncate = function (length: number, replacement: string): String {
    var target = this;
    if (target.length >= length) {
        target = target.slice(0, Math.max(0, length - replacement.length)) + replacement;
    }
    return target;
};

interface Action<T> {
    handler: (batch: T[]) => any;
    interval?: number;
}

interface BatchParameters<T> {
    size: number;
    action?: Action<T>;
}

interface Array<T> {
    batch(parameters: BatchParameters<T>): Promise<T[][]>;
    lastElement(): T;
}

Array.prototype.batch = extensions.Batch;

Array.prototype.lastElement = function <T>() {
    if (!this.length) {
        return undefined;
    }
    const last: T = this[this.length - 1];
    return last;
};

interface Math {
    log10(val: number): number;
}

Math.log10 = function (val: number): number {
    return Math.log(val) / Math.LN10;
};

declare interface ObjectConstructor {
    assign(...objects: Object[]): Object;
}
