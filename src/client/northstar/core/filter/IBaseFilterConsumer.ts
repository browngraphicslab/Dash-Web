import { FilterOperand } from '../filter/FilterOperand'
import { IEquatable } from '../../utils/IEquatable'
import { IBaseFilterProvider } from './IBaseFilterProvider';

export interface IBaseFilterConsumer extends IEquatable {
    FilterOperand: FilterOperand;
    Links: IBaseFilterProvider[];
}

export function instanceOfIBaseFilterConsumer(object: any): object is IBaseFilterConsumer {
    return 'FilterOperand' in object;
}