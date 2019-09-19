interface String {
    removeTrailingNewlines(): string;
    hasNewline(): boolean;
}

module.exports.Assign = function () {

    String.prototype.removeTrailingNewlines = function () {
        let sliced = this;
        while (sliced.endsWith("\n")) {
            sliced = sliced.substring(0, this.length - 1);
        }
        return sliced as string;
    };

    String.prototype.hasNewline = function () {
        return this.endsWith("\n");
    };

};