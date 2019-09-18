module.exports.Batch = function <T, A>(batcher: Batcher<T, A>): T[][] {
    if ("executor" in batcher) {
        return this.predicateBatch(batcher);
    } else {
        return this.fixedBatch(batcher);
    }
};

module.exports.BatchAsync = async function <T, A>(batcher: BatcherAsync<T, A>): Promise<T[][]> {
    if ("executor" in batcher) {
        return this.predicateBatchAsync(batcher);
    } else {
        return this.fixedBatch(batcher);
    }
};

module.exports.PredicateBatch = function <T, A>(batcher: PredicateBatcher<T, A>): T[][] {
    const batches: T[][] = [];
    let batch: T[] = [];
    const { executor, initial } = batcher;
    let accumulator: A | undefined = initial;
    for (let element of this) {
        if ((accumulator = executor(element, accumulator)) !== undefined) {
            batch.push(element);
        } else {
            batches.push(batch);
            batch = [element];
        }
    }
    batches.push(batch);
    return batches;
};

module.exports.PredicateBatchAsync = async function <T, A>(batcher: PredicateBatcherAsync<T, A>): Promise<T[][]> {
    const batches: T[][] = [];
    let batch: T[] = [];
    const { executor, initial } = batcher;
    let accumulator: A | undefined = initial;
    for (let element of this) {
        if ((accumulator = await executor(element, accumulator)) !== undefined) {
            batch.push(element);
        } else {
            batches.push(batch);
            batch = [element];
        }
    }
    batches.push(batch);
    return batches;
};

enum Mode {
    Balanced,
    Even
}

module.exports.FixedBatch = function <T>(batcher: FixedBatcher): T[][] {
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

module.exports.ExecuteBatches = function <I, A>(batcher: Batcher<I, A>, handler: BatchHandlerSync<I>): void {
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

module.exports.ConvertInBatches = function <I, O, A>(batcher: Batcher<I, A>, handler: BatchConverterSync<I, O>): O[] {
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

module.exports.ExecuteInBatchesAsync = async function <I, A>(batcher: BatcherAsync<I, A>, handler: BatchHandler<I>): Promise<void> {
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

module.exports.ConvertInBatchesAsync = async function <I, O, A>(batcher: BatcherAsync<I, A>, handler: BatchConverter<I, O>): Promise<O[]> {
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

module.exports.ExecuteInBatchesAtInterval = async function <I, A>(batcher: BatcherAsync<I, A>, handler: BatchHandler<I>, interval: number): Promise<void> {
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
                }, interval * 1000);
            });
            if (++completed === quota) {
                break;
            }
        }
        resolve();
    });
};

module.exports.ConvertInBatchesAtInterval = async function <I, O, A>(batcher: BatcherAsync<I, A>, handler: BatchConverter<I, O>, interval: number): Promise<O[]> {
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
                }, interval * 1000);
            });
            if (++completed === quota) {
                resolve(collector);
                break;
            }
        }
    });
};