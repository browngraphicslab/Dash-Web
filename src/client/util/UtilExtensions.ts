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

module.exports.BatchAction = async function <I, O>(batchSize: number, handler: BatchHandler<I, O>, interval?: number): Promise<O[]> {
    if (!this.length) {
        return [];
    }
    let collector: O[] = [];
    const batches = this.batch(batchSize);
    if (!interval || batches.length === 1) {
        for (let batch of batches) {
            collector.push(...(await handler(batch)));
        }
    } else {
        return new Promise<O[]>(resolve => {
            const iterator = batches[Symbol.iterator]();
            let completed = 0;
            const tag = setInterval(async () => {
                const next = iterator.next();
                if (next.done) {
                    clearInterval(tag);
                    return;
                }
                const batch = next.value;
                collector.push(...(await handler(batch)));
                if (++completed === batches.length) {
                    resolve(collector);
                }
            }, interval);
        });
    }
    return collector;
};