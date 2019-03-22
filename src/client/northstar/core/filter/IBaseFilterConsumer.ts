import { FilterOperand } from '../filter/FilterOperand'
import { IEquatable } from '../../utils/IEquatable'

export interface IBaseFilterConsumer extends IEquatable {
    FilterOperand: FilterOperand;
}

export function instanceOfIBaseFilterConsumer(object: any): object is IBaseFilterConsumer {
    return 'FilterOperand' in object;
}