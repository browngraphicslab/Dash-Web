export namespace Utilities {

    /**
         * At any arbitrary layer of nesting within the configuration objects, any single value that
         * is not specified by the configuration is given the default counterpart. If, within an object,
         * one peer is given by configuration and two are not, the one is preserved while the two are given
         * the default value.
         * @returns the composition of all of the assigned objects, much like Object.assign(), but with more
         * granularity in the overwriting of nested objects
         */
    export function preciseAssign(target: any, ...sources: any[]): any {
        for (const source of sources) {
            preciseAssignHelper(target, source);
        }
        return target;
    }

    export function preciseAssignHelper(target: any, source: any) {
        Array.from(new Set([...Object.keys(target), ...Object.keys(source)])).map(property => {
            let targetValue: any, sourceValue: any;
            if (sourceValue = source[property]) {
                if (typeof sourceValue === "object" && typeof (targetValue = target[property]) === "object") {
                    preciseAssignHelper(targetValue, sourceValue);
                } else {
                    target[property] = sourceValue;
                }
            }
        });
    }

}