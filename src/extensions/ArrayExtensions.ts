function Assign() {

    Array.prototype.lastElement = function <T>() {
        if (!this.length) {
            return undefined;
        }
        const last: T = this[this.length - 1];
        return last;
    };

}

export { Assign };