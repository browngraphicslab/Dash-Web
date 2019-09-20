interface Array<T> {
    lastElement(): T;
}

// interface BatchContext {
//     completedBatches: number;
//     remainingBatches: number;
// }

// interface ExecutorResult<A> {
//     updated: A;
//     makeNextBatch: boolean;
// }

// interface PredicateBatcherCommon<A> {
//     initial: A;
//     persistAccumulator?: boolean;
// }

// interface Interval {
//     magnitude: number;
//     unit: typeof module.exports.TimeUnit;
// }

// type BatchConverterSync<I, O> = (batch: I[], context: BatchContext) => O[];
// type BatchConverterAsync<I, O> = (batch: I[], context: BatchContext) => Promise<O[]>;
// type BatchConverter<I, O> = BatchConverterSync<I, O> | BatchConverterAsync<I, O>;

// type BatchHandlerSync<I> = (batch: I[], context: BatchContext) => void;
// type BatchHandlerAsync<I> = (batch: I[], context: BatchContext) => Promise<void>;
// type BatchHandler<I> = BatchHandlerSync<I> | BatchHandlerAsync<I>;

// type BatcherSync<I, A> = FixedBatcher | PredicateBatcherSync<I, A>;
// type BatcherAsync<I, A> = PredicateBatcherAsync<I, A>;
// type Batcher<I, A> = BatcherSync<I, A> | BatcherAsync<I, A>;

// type FixedBatcher = { batchSize: number } | { batchCount: number, mode?: typeof module.exports.Mode };
// type PredicateBatcherSync<I, A> = PredicateBatcherCommon<A> & { executor: (element: I, accumulator: A) => ExecutorResult<A> };
// type PredicateBatcherAsync<I, A> = PredicateBatcherCommon<A> & { executorAsync: (element: I, accumulator: A) => Promise<ExecutorResult<A>> };


// module.exports.Mode = {
//     Balanced: 0,
//     Even: 1
// };

// module.exports.TimeUnit = {
//     Milliseconds: 0,
//     Seconds: 1,
//     Minutes: 2
// };

// module.exports.Assign = function () {

//     Array.prototype.fixedBatch = function <T>(batcher: FixedBatcher): T[][] {
//         const batches: T[][] = [];
//         const length = this.length;
//         let i = 0;
//         if ("batchSize" in batcher) {
//             const { batchSize } = batcher;
//             while (i < this.length) {
//                 const cap = Math.min(i + batchSize, length);
//                 batches.push(this.slice(i, i = cap));
//             }
//         } else if ("batchCount" in batcher) {
//             let { batchCount, mode } = batcher;
//             const resolved = mode || module.exports.Mode.Balanced;
//             if (batchCount < 1) {
//                 throw new Error("Batch count must be a positive integer!");
//             }
//             if (batchCount === 1) {
//                 return [this];
//             }
//             if (batchCount >= this.length) {
//                 return this.map((element: T) => [element]);
//             }

//             let length = this.length;
//             let size: number;

//             if (length % batchCount === 0) {
//                 size = Math.floor(length / batchCount);
//                 while (i < length) {
//                     batches.push(this.slice(i, i += size));
//                 }
//             } else if (resolved === module.exports.Mode.Balanced) {
//                 while (i < length) {
//                     size = Math.ceil((length - i) / batchCount--);
//                     batches.push(this.slice(i, i += size));
//                 }
//             } else {
//                 batchCount--;
//                 size = Math.floor(length / batchCount);
//                 if (length % size === 0) {
//                     size--;
//                 }
//                 while (i < size * batchCount) {
//                     batches.push(this.slice(i, i += size));
//                 }
//                 batches.push(this.slice(size * batchCount));
//             }
//         }
//         return batches;
//     };

//     Array.prototype.predicateBatch = function <T, A>(batcher: PredicateBatcherSync<T, A>): T[][] {
//         const batches: T[][] = [];
//         let batch: T[] = [];
//         const { executor, initial, persistAccumulator } = batcher;
//         let accumulator = initial;
//         for (let element of this) {
//             const { updated, makeNextBatch } = executor(element, accumulator);
//             accumulator = updated;
//             if (!makeNextBatch) {
//                 batch.push(element);
//             } else {
//                 batches.push(batch);
//                 batch = [element];
//                 if (!persistAccumulator) {
//                     accumulator = initial;
//                 }
//             }
//         }
//         batches.push(batch);
//         return batches;
//     };

//     Array.prototype.predicateBatchAsync = async function <T, A>(batcher: BatcherAsync<T, A>): Promise<T[][]> {
//         const batches: T[][] = [];
//         let batch: T[] = [];
//         const { executorAsync, initial, persistAccumulator } = batcher;
//         let accumulator: A = initial;
//         for (let element of this) {
//             const { updated, makeNextBatch } = await executorAsync(element, accumulator);
//             accumulator = updated;
//             if (!makeNextBatch) {
//                 batch.push(element);
//             } else {
//                 batches.push(batch);
//                 batch = [element];
//                 if (!persistAccumulator) {
//                     accumulator = initial;
//                 }
//             }
//         }
//         batches.push(batch);
//         return batches;
//     };

//     Array.prototype.batch = function <T, A>(batcher: BatcherSync<T, A>): T[][] {
//         if ("executor" in batcher) {
//             return this.predicateBatch(batcher);
//         } else {
//             return this.fixedBatch(batcher);
//         }
//     };

//     Array.prototype.batchAsync = async function <T, A>(batcher: Batcher<T, A>): Promise<T[][]> {
//         if ("executorAsync" in batcher) {
//             return this.predicateBatchAsync(batcher);
//         } else {
//             return this.batch(batcher);
//         }
//     };

//     Array.prototype.batchedForEach = function <I, A>(batcher: BatcherSync<I, A>, handler: BatchHandlerSync<I>): void {
//         if (this.length) {
//             let completed = 0;
//             const batches = this.batch(batcher);
//             const quota = batches.length;
//             for (let batch of batches) {
//                 const context: BatchContext = {
//                     completedBatches: completed,
//                     remainingBatches: quota - completed,
//                 };
//                 handler(batch, context);
//                 completed++;
//             }
//         }
//     };

//     Array.prototype.batchedMap = function <I, O, A>(batcher: BatcherSync<I, A>, handler: BatchConverterSync<I, O>): O[] {
//         if (!this.length) {
//             return [];
//         }
//         let collector: O[] = [];
//         let completed = 0;
//         const batches = this.batch(batcher);
//         const quota = batches.length;
//         for (let batch of batches) {
//             const context: BatchContext = {
//                 completedBatches: completed,
//                 remainingBatches: quota - completed,
//             };
//             collector.push(...handler(batch, context));
//             completed++;
//         }
//         return collector;
//     };

//     Array.prototype.batchedForEachAsync = async function <I, A>(batcher: Batcher<I, A>, handler: BatchHandler<I>): Promise<void> {
//         if (this.length) {
//             let completed = 0;
//             const batches = await this.batchAsync(batcher);
//             const quota = batches.length;
//             for (let batch of batches) {
//                 const context: BatchContext = {
//                     completedBatches: completed,
//                     remainingBatches: quota - completed,
//                 };
//                 await handler(batch, context);
//                 completed++;
//             }
//         }
//     };

//     Array.prototype.batchedMapAsync = async function <I, O, A>(batcher: Batcher<I, A>, handler: BatchConverter<I, O>): Promise<O[]> {
//         if (!this.length) {
//             return [];
//         }
//         let collector: O[] = [];
//         let completed = 0;
//         const batches = await this.batchAsync(batcher);
//         const quota = batches.length;
//         for (let batch of batches) {
//             const context: BatchContext = {
//                 completedBatches: completed,
//                 remainingBatches: quota - completed,
//             };
//             collector.push(...(await handler(batch, context)));
//             completed++;
//         }
//         return collector;
//     };

//     Array.prototype.batchedForEachInterval = async function <I, A>(batcher: Batcher<I, A>, handler: BatchHandler<I>, interval: Interval): Promise<void> {
//         if (!this.length) {
//             return;
//         }
//         const batches = await this.batchAsync(batcher);
//         const quota = batches.length;
//         return new Promise<void>(async resolve => {
//             const iterator = batches[Symbol.iterator]();
//             let completed = 0;
//             while (true) {
//                 const next = iterator.next();
//                 await new Promise<void>(resolve => {
//                     setTimeout(async () => {
//                         const batch = next.value;
//                         const context: BatchContext = {
//                             completedBatches: completed,
//                             remainingBatches: quota - completed,
//                         };
//                         await handler(batch, context);
//                         resolve();
//                     }, convert(interval));
//                 });
//                 if (++completed === quota) {
//                     break;
//                 }
//             }
//             resolve();
//         });
//     };

//     Array.prototype.batchedMapInterval = async function <I, O, A>(batcher: Batcher<I, A>, handler: BatchConverter<I, O>, interval: Interval): Promise<O[]> {
//         if (!this.length) {
//             return [];
//         }
//         let collector: O[] = [];
//         const batches = await this.batchAsync(batcher);
//         const quota = batches.length;
//         return new Promise<O[]>(async resolve => {
//             const iterator = batches[Symbol.iterator]();
//             let completed = 0;
//             while (true) {
//                 const next = iterator.next();
//                 await new Promise<void>(resolve => {
//                     setTimeout(async () => {
//                         const batch = next.value;
//                         const context: BatchContext = {
//                             completedBatches: completed,
//                             remainingBatches: quota - completed,
//                         };
//                         collector.push(...(await handler(batch, context)));
//                         resolve();
//                     }, convert(interval));
//                 });
//                 if (++completed === quota) {
//                     resolve(collector);
//                     break;
//                 }
//             }
//         });
//     };

Array.prototype.lastElement = function <T>() {
    if (!this.length) {
        return undefined;
    }
    const last: T = this[this.length - 1];
    return last;
};

// };

// const convert = (interval: Interval) => {
//     const { magnitude, unit } = interval;
//     switch (unit) {
//         default:
//         case module.exports.TimeUnit.Milliseconds:
//             return magnitude;
//         case module.exports.TimeUnit.Seconds:
//             return magnitude * 1000;
//         case module.exports.TimeUnit.Minutes:
//             return magnitude * 1000 * 60;
//     }
// };