module.exports.Batch = function <T>(batchSize: number): T[][] {
    const batches: T[][] = [];
    let i = 0;
    while (i < this.length) {
        const cap = Math.min(i + batchSize, this.length);
        batches.push(this.slice(i, cap));
        i = cap;
    }
    return batches;
};

module.exports.ExecuteBatches = function <I, O>(batchSize: number, handler: BatchHandlerSync<I>): void {
    if (this.length) {
        for (let batch of this.batch(batchSize)) {
            handler(batch);
        }
    }
};

module.exports.ConvertInBatches = function <I, O>(batchSize: number, handler: BatchConverterSync<I, O>): O[] {
    if (!this.length) {
        return [];
    }
    let collector: O[] = [];
    for (let batch of this.batch(batchSize)) {
        collector.push(...handler(batch));
    }
    return collector;
};

module.exports.ExecuteInBatchesAsync = async function <I>(batchSize: number, handler: BatchHandler<I>): Promise<void> {
    if (this.length) {
        for (let batch of this.batch(batchSize)) {
            await handler(batch);
        }
    }
};

module.exports.ConvertInBatchesAsync = async function <I, O>(batchSize: number, handler: BatchConverter<I, O>): Promise<O[]> {
    if (!this.length) {
        return [];
    }
    let collector: O[] = [];
    for (let batch of this.batch(batchSize)) {
        collector.push(...(await handler(batch)));
    }
    return collector;
};

module.exports.ExecuteInBatchesAtInterval = async function <I>(batchSize: number, handler: BatchHandler<I>, interval: number): Promise<void> {
    if (!this.length) {
        return;
    }
    const batches = this.batch(batchSize);
    return new Promise<void>(async resolve => {
        const iterator = batches[Symbol.iterator]();
        let completed = 0;
        while (true) {
            const next = iterator.next();
            await new Promise<void>(resolve => {
                setTimeout(async () => {
                    await handler(next.value);
                    resolve();
                }, interval * 1000);
            });
            if (++completed === batches.length) {
                break;
            }
        }
        resolve();
    });
};

module.exports.ConvertInBatchesAtInterval = async function <I, O>(batchSize: number, handler: BatchConverter<I, O>, interval: number): Promise<O[]> {
    if (!this.length) {
        return [];
    }
    let collector: O[] = [];
    const batches = this.batch(batchSize);
    return new Promise<O[]>(async resolve => {
        const iterator = batches[Symbol.iterator]();
        let completed = 0;
        while (true) {
            const next = iterator.next();
            await new Promise<void>(resolve => {
                setTimeout(async () => {
                    collector.push(...(await handler(next.value)));
                    resolve();
                }, interval * 1000);
            });
            if (++completed === batches.length) {
                resolve(collector);
                break;
            }
        }
    });
};