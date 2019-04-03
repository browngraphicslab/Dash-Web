import { Exception } from "../model/idea/idea";

export class ArrayUtil {

    public static Contains(arr1: any[], arr2: any): boolean {
        if (arr1.length === 0) {
            return false;
        }
        let isComplex = typeof arr1[0] === "object";
        for (let i = 0; i < arr1.length; i++) {
            if (isComplex && "Equals" in arr1[i]) {
                if (arr1[i].Equals(arr2)) {
                    return true;
                }
            }
            else {
                if (arr1[i] === arr2) {
                    return true;
                }
            }
        }
        return false;
    }


    public static RemoveMany(arr: any[], elements: Object[]) {
        elements.forEach(e => ArrayUtil.Remove(arr, e));
    }

    public static AddMany(arr: any[], others: Object[]) {
        arr.push(...others);
    }

    public static Clear(arr: any[]) {
        arr.splice(0, arr.length);
    }


    public static Remove(arr: any[], other: Object) {
        const index = ArrayUtil.IndexOfWithEqual(arr, other);
        if (index === -1) {
            return;
        }
        arr.splice(index, 1);
    }


    public static First<T>(arr: T[], predicate: (x: any) => boolean): T {
        let filtered = arr.filter(predicate);
        if (filtered.length > 0) {
            return filtered[0];
        }
        throw new Exception()
    }

    public static FirstOrDefault<T>(arr: T[], predicate: (x: any) => boolean): T | undefined {
        let filtered = arr.filter(predicate);
        if (filtered.length > 0) {
            return filtered[0];
        }
        return undefined;
    }

    public static Distinct(arr: any[]): any[] {
        let ret = [];
        for (let i = 0; i < arr.length; i++) {
            if (!ArrayUtil.Contains(ret, arr[i])) {
                ret.push(arr[i]);
            }
        }
        return ret;
    }

    public static IndexOfWithEqual(arr: any[], other: any): number {
        for (let i = 0; i < arr.length; i++) {
            let isComplex = typeof arr[0] === "object";
            if (isComplex && "Equals" in arr[i]) {
                if (arr[i].Equals(other)) {
                    return i;
                }
            }
            else {
                if (arr[i] === other) {
                    return i;
                }
            }
        }
        return -1;
    }
}