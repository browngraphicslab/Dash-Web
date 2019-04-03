import { FilterModel } from '../filter/FilterModel'

export interface IBaseFilterProvider {
    FilterModels: Array<FilterModel>;
}
export function instanceOfIBaseFilterProvider(object: any): object is IBaseFilterProvider {
    return 'FilterModels' in object;
}