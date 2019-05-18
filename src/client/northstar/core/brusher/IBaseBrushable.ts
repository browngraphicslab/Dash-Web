import { PIXIPoint } from '../../utils/MathUtil';
import { IEquatable } from '../../utils/IEquatable';
import { Doc } from '../../../../new_fields/Doc';

export interface IBaseBrushable<T> extends IEquatable {
    BrusherModels: Array<Doc>;
    BrushColors: Array<number>;
    Position: PIXIPoint;
    Size: PIXIPoint;
}
export function instanceOfIBaseBrushable<T>(object: any): object is IBaseBrushable<T> {
    return 'BrusherModels' in object;
}