interface String {
    ReplaceAll(toReplace: string, replacement: string): string;
}

String.prototype.ReplaceAll = function (toReplace: string, replacement: string): string {
    var target = this;
    return target.split(toReplace).join(replacement);
}

interface Math {
    log10(val: number): number;
}

Math.log10 = function (val: number): number {
    return Math.log(val) / Math.LN10;
}

declare interface ObjectConstructor {
    assign(...objects: Object[]): Object;
}
