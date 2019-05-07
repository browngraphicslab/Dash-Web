import { FilterOperand } from '../filter/FilterOperand';
import { IEquatable } from '../../utils/IEquatable';
import { Doc } from '../../../../new_fields/Doc';

export interface IBaseFilterConsumer extends IEquatable {
    FilterOperand: FilterOperand;
    Links: Doc[];
}

export function instanceOfIBaseFilterConsumer(object: any): object is IBaseFilterConsumer {
    return 'FilterOperand' in object;
}