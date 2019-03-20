import { BrushLinkModel } from '../brusher/BrushLinkModel'
import { PIXIPoint } from '../../utils/MathUtil'
import { IEquatable } from '../../utils/IEquatable';

export interface IBaseBrushable<T> extends IEquatable {
    BrusherModels: Array<BrushLinkModel<T>>;
    BrushColors: Array<number>;
    Position: PIXIPoint;
    Size: PIXIPoint;
}
export function instanceOfIBaseBrushable<T>(object: any): object is IBaseBrushable<T> {
    return 'BrusherModels' in object;
}