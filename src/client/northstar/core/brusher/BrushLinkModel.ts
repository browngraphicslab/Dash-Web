import { IBaseBrushable } from '../brusher/IBaseBrushable'
import { IBaseBrusher } from '../brusher/IBaseBrusher'
import { Utils } from '../../utils/Utils'
import { IEquatable } from '../../utils/IEquatable';

export class BrushLinkModel<T> implements IEquatable {

    public From: IBaseBrusher<T>;

    public To: IBaseBrushable<T>;

    public Color: number = 0;

    constructor(from: IBaseBrusher<T>, to: IBaseBrushable<T>) {
        this.From = from;
        this.To = to;
    }

    public static overlaps(start: number, end: number, otherstart: number, otherend: number): boolean {
        if (start > otherend || otherstart > end)
            return false;
        return true;
    }
    public static Connected<T>(from: IBaseBrusher<T>, to: IBaseBrushable<T>): boolean {
        var connected = (Math.abs(from.Position.x + from.Size.x - to.Position.x) <= 60 &&
            this.overlaps(from.Position.y, from.Position.y + from.Size.y, to.Position.y, to.Position.y + to.Size.y)
        ) ||
            (Math.abs(to.Position.x + to.Size.x - from.Position.x) <= 60 &&
                this.overlaps(to.Position.y, to.Position.y + to.Size.y, from.Position.y, from.Position.y + from.Size.y)
            );
        return connected;
    }

    public Equals(other: Object): boolean {
        if (!Utils.EqualityHelper(this, other)) return false;
        if (!this.From.Equals((other as BrushLinkModel<T>).From)) return false;
        if (!this.To.Equals((other as BrushLinkModel<T>).To)) return false;
        return true;
    }
}