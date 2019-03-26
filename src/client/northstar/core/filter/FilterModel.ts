import { ValueComparison } from "./ValueComparision";
import { Utils } from "../../utils/Utils";
import { IBaseFilterProvider } from "./IBaseFilterProvider";
import { BaseOperation } from "../../operations/BaseOperation";
import { FilterOperand } from "./FilterOperand";

export class FilterModel {
    public ValueComparisons: ValueComparison[];
    constructor() {
        this.ValueComparisons = new Array<ValueComparison>();
    }

    public Equals(other: FilterModel): boolean {
        if (!Utils.EqualityHelper(this, other)) return false;
        if (!this.isSame(this.ValueComparisons, (other as FilterModel).ValueComparisons)) return false;
        return true;
    }

    private isSame(a: ValueComparison[], b: ValueComparison[]): boolean {
        if (a.length !== b.length) {
            return false;
        }
        for (let i = 0; i < a.length; i++) {
            let valueComp = a[i];
            if (!valueComp.Equals(b[i])) {
                return false;
            }
        }
        return true;
    }

    public ToPythonString(): string {
        let ret = "(" + this.ValueComparisons.map(vc => vc.ToPythonString()).join("&&") + ")";
        return ret;
    }

    public static And(filters: string[]): string {
        let ret = filters.filter(f => f !== "").join(" && ");
        return ret;
    }

    // public static GetFilterModelsRecursive(baseOperation: BaseOperation,
    //     visitedFilterProviders: Set<IBaseFilterProvider>, filterModels: FilterModel[], isFirst: boolean): string {
    //     let ret = "";
    //     if (Utils.isBaseFilterProvider(baseOperation)) {
    //         visitedFilterProviders.add(baseOperation);
    //         let filtered = baseOperation.FilterModels.filter(fm => fm && fm.ValueComparisons.length > 0);
    //         if (!isFirst && filtered.length > 0) {
    //             filterModels.push(...filtered);
    //             ret = "(" + baseOperation.FilterModels.filter(fm => fm != null).map(fm => fm.ToPythonString()).join(" || ") + ")";
    //         }
    //     }
    //     if (Utils.isBaseFilterConsumer(baseOperation) && baseOperation.Links) {
    //         let children = new Array<string>();
    //         let linkedGraphNodes = baseOperation.Links.get(LinkType.Filter);
    //         if (linkedGraphNodes != null) {
    //             for (let i = 0; i < linkedGraphNodes.length; i++) {
    //                 let linkVm = linkedGraphNodes[i].Data;
    //                 let linkedGraphNode = linkedGraphNodes[i].Target;
    //                 if (!visitedFilterProviders.has(linkedGraphNode)) {
    //                     let child = FilterModel.GetFilterModelsRecursive(linkedGraphNode, visitedFilterProviders, filterModels, false);
    //                     if (child !== "") {
    //                         if (linkVm.IsInverted) {
    //                             child = "! " + child;
    //                         }
    //                         children.push(child);
    //                     }
    //                 }
    //             }
    //         }

    //         let childrenJoined = children.join(baseOperation.FilterOperand === FilterOperand.AND ? " && " : " || ");
    //         if (children.length > 0) {
    //             if (ret !== "") {
    //                 ret = "(" + ret + " &&  (" + childrenJoined + "))";
    //             }
    //             else {
    //                 ret = "(" + childrenJoined + ")";
    //             }
    //         }
    //     }
    //     return ret;
    // }
}