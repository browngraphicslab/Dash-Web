module.exports.Batch = async function <T>(parameters: BatchParameters<T>) {
    const { size, action } = parameters;
    const batches: T[][] = [];
    let i = 0;
    while (i < this.length) {
        const cap = Math.min(i + size, this.length);
        batches.push(this.slice(i, cap));
        i = cap;
    }
    console.log(`Beginning action on ${this.length} elements, split into ${batches.length} groups => ${batches.map(batch => batch.length).join(", ")}`);
    if (action) {
        const { handler, interval } = action;
        if (!interval || batches.length === 1) {
            for (let batch of batches) {
                await handler(batch);
            }
        } else {
            return new Promise<T[][]>(resolve => {
                const iterator = batches[Symbol.iterator]();
                const quota = batches.length;
                let completed = 0;
                const tag = setInterval(async () => {
                    const next = iterator.next();
                    if (next.done) {
                        clearInterval(tag);
                        return;
                    }
                    const batch = next.value;
                    console.log(`Handling next batch with ${batch.length} elements`);
                    await handler(batch);
                    if (++completed === quota) {
                        resolve(batches);
                    }
                }, interval);
            });
        }
    }
    return batches;
};