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

type BatchConverterSync<I, O> = (batch: I[], isFullBatch: boolean) => O[];
type BatchHandlerSync<I> = (batch: I[], isFullBatch: boolean) => void;
type BatchConverterAsync<I, O> = (batch: I[], isFullBatch: boolean) => Promise<O[]>;
type BatchHandlerAsync<I> = (batch: I[], isFullBatch: boolean) => Promise<void>;
type BatchConverter<I, O> = BatchConverterSync<I, O> | BatchConverterAsync<I, O>;
type BatchHandler<I> = BatchHandlerSync<I> | BatchHandlerAsync<I>;

interface Array<T> {
    batch(batchSize: number): T[][];
    executeInBatches(batchSize: number, handler: BatchHandlerSync<T>): void;
    convertInBatches<O>(batchSize: number, handler: BatchConverterSync<T, O>): O[];
    executeInBatchesAsync(batchSize: number, handler: BatchHandler<T>): Promise<void>;
    convertInBatchesAsync<O>(batchSize: number, handler: BatchConverter<T, O>): Promise<O[]>;
    executeInBatchesAtInterval(batchSize: number, handler: BatchHandler<T>, interval: number): Promise<void>;
    convertInBatchesAtInterval<O>(batchSize: number, handler: BatchConverter<T, O>, interval: number): Promise<O[]>;
    lastElement(): T;
}

Array.prototype.batch = extensions.Batch;
Array.prototype.executeInBatches = extensions.ExecuteInBatches;
Array.prototype.convertInBatches = extensions.ConvertInBatches;
Array.prototype.executeInBatchesAsync = extensions.ExecuteInBatchesAsync;
Array.prototype.convertInBatchesAsync = extensions.ConvertInBatchesAsync;
Array.prototype.executeInBatchesAtInterval = extensions.ExecuteInBatchesAtInterval;
Array.prototype.convertInBatchesAtInterval = extensions.ConvertInBatchesAtInterval;

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
