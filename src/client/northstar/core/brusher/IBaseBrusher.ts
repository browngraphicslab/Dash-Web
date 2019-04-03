import { PIXIPoint } from '../../utils/MathUtil'
import { IEquatable } from '../../utils/IEquatable';


export interface IBaseBrusher<T> extends IEquatable {
    Position: PIXIPoint;
    Size: PIXIPoint;
}
export function instanceOfIBaseBrusher<T>(object: any): object is IBaseBrusher<T> {
    return 'BrushableModels' in object;
}