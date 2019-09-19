interface BatchContext {
    completedBatches: number;
    remainingBatches: number;
}
type BatchConverterSync<I, O> = (batch: I[], context: BatchContext) => O[];
type BatchHandlerSync<I> = (batch: I[], context: BatchContext) => void;
type BatchConverterAsync<I, O> = (batch: I[], context: BatchContext) => Promise<O[]>;
type BatchHandlerAsync<I> = (batch: I[], context: BatchContext) => Promise<void>;
type BatchConverter<I, O> = BatchConverterSync<I, O> | BatchConverterAsync<I, O>;
type BatchHandler<I> = BatchHandlerSync<I> | BatchHandlerAsync<I>;
type FixedBatcher = { batchSize: number } | { batchCount: number, mode?: Mode };
interface ExecutorResult<A> {
    updated: A;
    makeNextBatch: boolean;
}
interface PredicateBatcher<I, A> {
    executor: (element: I, accumulator: A) => ExecutorResult<A>;
    initial: A;
    persistAccumulator?: boolean;
}
interface PredicateBatcherAsyncInterface<I, A> {
    executor: (element: I, accumulator: A) => Promise<ExecutorResult<A>>;
    initial: A;
    persistAccumulator?: boolean;
}
type PredicateBatcherAsync<I, A> = PredicateBatcher<I, A> | PredicateBatcherAsyncInterface<I, A>;
type Batcher<I, A> = FixedBatcher | PredicateBatcher<I, A>;
type BatcherAsync<I, A> = Batcher<I, A> | PredicateBatcherAsync<I, A>;

enum TimeUnit {
    Milliseconds,
    Seconds,
    Minutes
}

interface Interval {
    magnitude: number;
    unit: TimeUnit;
}

enum Mode {
    Balanced,
    Even
}

const convert = (interval: Interval) => {
    const { magnitude, unit } = interval;
    switch (unit) {
        default:
        case TimeUnit.Milliseconds:
            return magnitude;
        case TimeUnit.Seconds:
            return magnitude * 1000;
        case TimeUnit.Minutes:
            return magnitude * 1000 * 60;
    }
};

interface Array<T> {
    fixedBatch<T>(batcher: FixedBatcher): T[][];
    predicateBatch<T, A = undefined>(batcher: PredicateBatcher<T, A>): T[][];
    predicateBatchAsync<T, A = undefined>(batcher: PredicateBatcherAsync<T, A>): Promise<T[][]>;
    batch<A = undefined>(batcher: Batcher<T, A>): T[][];
    batchAsync<A = undefined>(batcher: BatcherAsync<T, A>): Promise<T[][]>;

    batchedForEach<A = undefined>(batcher: Batcher<T, A>, handler: BatchHandlerSync<T>): void;
    batchedMap<O, A = undefined>(batcher: Batcher<T, A>, handler: BatchConverterSync<T, O>): O[];

    batchedForEachAsync<A = undefined>(batcher: Batcher<T, A>, handler: BatchHandler<T>): Promise<void>;
    batchedMapAsync<O, A = undefined>(batcher: Batcher<T, A>, handler: BatchConverter<T, O>): Promise<O[]>;

    batchedForEachInterval<A = undefined>(batcher: Batcher<T, A>, handler: BatchHandler<T>, interval: Interval): Promise<void>;
    batchedMapInterval<O, A = undefined>(batcher: Batcher<T, A>, handler: BatchConverter<T, O>, interval: Interval): Promise<O[]>;

    lastElement(): T;
}

module.exports.AssignArrayExtensions = function () {
    Array.prototype.fixedBatch = module.exports.fixedBatch;
    Array.prototype.predicateBatch = module.exports.predicateBatch;
    Array.prototype.predicateBatchAsync = module.exports.predicateBatchAsync;
    Array.prototype.batch = module.exports.batch;
    Array.prototype.batchAsync = module.exports.batchAsync;
    Array.prototype.batchedForEach = module.exports.batchedForEach;
    Array.prototype.batchedMap = module.exports.batchedMap;
    Array.prototype.batchedForEachAsync = module.exports.batchedForEachAsync;
    Array.prototype.batchedMapAsync = module.exports.batchedMapAsync;
    Array.prototype.batchedForEachInterval = module.exports.batchedForEachInterval;
    Array.prototype.batchedMapInterval = module.exports.batchedMapInterval;
    Array.prototype.lastElement = module.exports.lastElement;
};

module.exports.fixedBatch = function <T>(batcher: FixedBatcher): T[][] {
    const batches: T[][] = [];
    const length = this.length;
    let i = 0;
    if ("batchSize" in batcher) {
        const { batchSize } = batcher;
        while (i < this.length) {
            const cap = Math.min(i + batchSize, length);
            batches.push(this.slice(i, i = cap));
        }
    } else if ("batchCount" in batcher) {
        let { batchCount, mode } = batcher;
        const resolved = mode || Mode.Balanced;
        if (batchCount < 1) {
            throw new Error("Batch count must be a positive integer!");
        }
        if (batchCount === 1) {
            return [this];
        }
        if (batchCount >= this.length) {
            return this.map((element: T) => [element]);
        }

        let length = this.length;
        let size: number;

        if (length % batchCount === 0) {
            size = Math.floor(length / batchCount);
            while (i < length) {
                batches.push(this.slice(i, i += size));
            }
        } else if (resolved === Mode.Balanced) {
            while (i < length) {
                size = Math.ceil((length - i) / batchCount--);
                batches.push(this.slice(i, i += size));
            }
        } else {
            batchCount--;
            size = Math.floor(length / batchCount);
            if (length % size === 0) {
                size--;
            }
            while (i < size * batchCount) {
                batches.push(this.slice(i, i += size));
            }
            batches.push(this.slice(size * batchCount));
        }
    }
    return batches;
};

module.exports.predicateBatch = function <T, A>(batcher: PredicateBatcher<T, A>): T[][] {
    const batches: T[][] = [];
    let batch: T[] = [];
    const { executor, initial, persistAccumulator } = batcher;
    let accumulator = initial;
    for (let element of this) {
        const { updated, makeNextBatch } = executor(element, accumulator);
        accumulator = updated;
        if (!makeNextBatch) {
            batch.push(element);
        } else {
            batches.push(batch);
            batch = [element];
            if (!persistAccumulator) {
                accumulator = initial;
            }
        }
    }
    batches.push(batch);
    return batches;
};

module.exports.predicateBatchAsync = async function <T, A>(batcher: PredicateBatcherAsync<T, A>): Promise<T[][]> {
    const batches: T[][] = [];
    let batch: T[] = [];
    const { executor, initial, persistAccumulator } = batcher;
    let accumulator: A = initial;
    for (let element of this) {
        const { updated, makeNextBatch } = await executor(element, accumulator);
        accumulator = updated;
        if (!makeNextBatch) {
            batch.push(element);
        } else {
            batches.push(batch);
            batch = [element];
            if (!persistAccumulator) {
                accumulator = initial;
            }
        }
    }
    batches.push(batch);
    return batches;
};

module.exports.batch = function <T, A>(batcher: Batcher<T, A>): T[][] {
    if ("executor" in batcher) {
        return this.predicateBatch(batcher);
    } else {
        return this.fixedBatch(batcher);
    }
};

module.exports.batchAsync = async function <T, A>(batcher: BatcherAsync<T, A>): Promise<T[][]> {
    if ("executor" in batcher) {
        return this.predicateBatchAsync(batcher);
    } else {
        return this.fixedBatch(batcher);
    }
};

module.exports.batchedForEach = function <I, A>(batcher: Batcher<I, A>, handler: BatchHandlerSync<I>): void {
    if (this.length) {
        let completed = 0;
        const batches = this.batch(batcher);
        const quota = batches.length;
        for (let batch of batches) {
            const context: BatchContext = {
                completedBatches: completed,
                remainingBatches: quota - completed,
            };
            handler(batch, context);
            completed++;
        }
    }
};

module.exports.batchedMap = function <I, O, A>(batcher: Batcher<I, A>, handler: BatchConverterSync<I, O>): O[] {
    if (!this.length) {
        return [];
    }
    let collector: O[] = [];
    let completed = 0;
    const batches = this.batch(batcher);
    const quota = batches.length;
    for (let batch of batches) {
        const context: BatchContext = {
            completedBatches: completed,
            remainingBatches: quota - completed,
        };
        collector.push(...handler(batch, context));
        completed++;
    }
    return collector;
};

module.exports.batchedForEachAsync = async function <I, A>(batcher: BatcherAsync<I, A>, handler: BatchHandler<I>): Promise<void> {
    if (this.length) {
        let completed = 0;
        const batches = await this.batchAsync(batcher);
        const quota = batches.length;
        for (let batch of batches) {
            const context: BatchContext = {
                completedBatches: completed,
                remainingBatches: quota - completed,
            };
            await handler(batch, context);
            completed++;
        }
    }
};

module.exports.batchedMapAsync = async function <I, O, A>(batcher: BatcherAsync<I, A>, handler: BatchConverter<I, O>): Promise<O[]> {
    if (!this.length) {
        return [];
    }
    let collector: O[] = [];
    let completed = 0;
    const batches = await this.batchAsync(batcher);
    const quota = batches.length;
    for (let batch of batches) {
        const context: BatchContext = {
            completedBatches: completed,
            remainingBatches: quota - completed,
        };
        collector.push(...(await handler(batch, context)));
        completed++;
    }
    return collector;
};

module.exports.batchedForEachInterval = async function <I, A>(batcher: BatcherAsync<I, A>, handler: BatchHandler<I>, interval: Interval): Promise<void> {
    if (!this.length) {
        return;
    }
    const batches = await this.batchAsync(batcher);
    const quota = batches.length;
    return new Promise<void>(async resolve => {
        const iterator = batches[Symbol.iterator]();
        let completed = 0;
        while (true) {
            const next = iterator.next();
            await new Promise<void>(resolve => {
                setTimeout(async () => {
                    const batch = next.value;
                    const context: BatchContext = {
                        completedBatches: completed,
                        remainingBatches: quota - completed,
                    };
                    await handler(batch, context);
                    resolve();
                }, convert(interval));
            });
            if (++completed === quota) {
                break;
            }
        }
        resolve();
    });
};

module.exports.batchedMapInterval = async function <I, O, A>(batcher: BatcherAsync<I, A>, handler: BatchConverter<I, O>, interval: Interval): Promise<O[]> {
    if (!this.length) {
        return [];
    }
    let collector: O[] = [];
    const batches = await this.batchAsync(batcher);
    const quota = batches.length;
    return new Promise<O[]>(async resolve => {
        const iterator = batches[Symbol.iterator]();
        let completed = 0;
        while (true) {
            const next = iterator.next();
            await new Promise<void>(resolve => {
                setTimeout(async () => {
                    const batch = next.value;
                    const context: BatchContext = {
                        completedBatches: completed,
                        remainingBatches: quota - completed,
                    };
                    collector.push(...(await handler(batch, context)));
                    resolve();
                }, convert(interval));
            });
            if (++completed === quota) {
                resolve(collector);
                break;
            }
        }
    });
};

module.exports.lastElement = function <T>() {
    if (!this.length) {
        return undefined;
    }
    const last: T = this[this.length - 1];
    return last;
};
