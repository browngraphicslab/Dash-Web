import { PIXIPoint } from '../../utils/MathUtil';
import { IEquatable } from '../../utils/IEquatable';
import { Document } from '../../../../fields/Document';

export interface IBaseBrushable<T> extends IEquatable {
    BrusherModels: Array<Document>;
    BrushColors: Array<number>;
    Position: PIXIPoint;
    Size: PIXIPoint;
}
export function instanceOfIBaseBrushable<T>(object: any): object is IBaseBrushable<T> {
    return 'BrusherModels' in object;
}