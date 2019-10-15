
export default class ArrayExtension {
    private readonly property: string;
    private readonly body: <T>(this: Array<T>) => any;

    constructor(property: string, body: <T>(this: Array<T>) => any) {
        this.property = property;
        this.body = body;
    }

    assign() {
        Object.defineProperty(Array.prototype, this.property, {
            value: this.body,
            enumerable: false
        });
    }

}

/**
 * IMPORTANT: Any extension you add here *must* have a corresponding type definition
 * in the Array<T> interface in ./General/ExtensionsTypings.ts. Otherwise,
 * Typescript will not recognize your new function.
 */
const extensions = [
    new ArrayExtension("lastElement", function () {
        if (!this.length) {
            return undefined;
        }
        return this[this.length - 1];
    })
];

function Assign() {
    extensions.forEach(extension => extension.assign());
}

export { Assign };