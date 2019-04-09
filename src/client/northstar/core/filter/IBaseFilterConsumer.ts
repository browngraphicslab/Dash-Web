import { FilterOperand } from '../filter/FilterOperand';
import { IEquatable } from '../../utils/IEquatable';
import { Document } from "../../../../fields/Document";

export interface IBaseFilterConsumer extends IEquatable {
    FilterOperand: FilterOperand;
    Links: Document[];
}

export function instanceOfIBaseFilterConsumer(object: any): object is IBaseFilterConsumer {
    return 'FilterOperand' in object;
}