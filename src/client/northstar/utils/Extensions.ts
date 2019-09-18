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

interface BatchContext {
    completedBatches: number;
    remainingBatches: number;
    isFullBatch: boolean;
}
type BatchConverterSync<I, O> = (batch: I[], context: BatchContext) => O[];
type BatchHandlerSync<I> = (batch: I[], context: BatchContext) => void;
type BatchConverterAsync<I, O> = (batch: I[], context: BatchContext) => Promise<O[]>;
type BatchHandlerAsync<I> = (batch: I[], context: BatchContext) => Promise<void>;
type BatchConverter<I, O> = BatchConverterSync<I, O> | BatchConverterAsync<I, O>;
type BatchHandler<I> = BatchHandlerSync<I> | BatchHandlerAsync<I>;
type Batcher<I, A> = number | ((element: I, accumulator: A) => boolean | Promise<boolean>);

interface Array<T> {
    batch(batchSize: undefined): T[][];
    batchedForEach<A = undefined>(batcher: Batcher<T, A>, handler: BatchHandlerSync<T>): void;
    batchedMap<O, A = undefined>(batcher: Batcher<T, A>, handler: BatchConverterSync<T, O>): O[];
    batchedForEachAsync<A = undefined>(batcher: Batcher<T, A>, handler: BatchHandler<T>): Promise<void>;
    batchedMapAsync<O, A = undefined>(batcher: Batcher<T, A>, handler: BatchConverter<T, O>): Promise<O[]>;
    batchedForEachInterval<A = undefined>(batcher: Batcher<T, A>, handler: BatchHandler<T>, interval: number): Promise<void>;
    batchedMapInterval<O, A = undefined>(batcher: Batcher<T, A>, handler: BatchConverter<T, O>, interval: number): Promise<O[]>;
    lastElement(): T;
}

Array.prototype.batch = extensions.Batch;
Array.prototype.batchedForEach = extensions.ExecuteInBatches;
Array.prototype.batchedMap = extensions.ConvertInBatches;
Array.prototype.batchedForEachAsync = extensions.ExecuteInBatchesAsync;
Array.prototype.batchedMapAsync = extensions.ConvertInBatchesAsync;
Array.prototype.batchedForEachInterval = extensions.ExecuteInBatchesAtInterval;
Array.prototype.batchedMapInterval = extensions.ConvertInBatchesAtInterval;

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
