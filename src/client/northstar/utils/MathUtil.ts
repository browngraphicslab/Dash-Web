

export class PIXIPoint {
    public x: number;
    public y: number;
    constructor(x: number, y: number) {
        this.x = x;
        this.y = y;
    }
}
export class PIXIRectangle {
    public x: number;
    public y: number;
    public width: number;
    public height: number
    public get left() { return this.x }
    public get right() { return this.x + this.width; }
    public get top() { return this.y }
    public get bottom() { return this.top + this.height }
    constructor(x: number, y: number, width: number, height: number) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
    }
}

export class MathUtil {

    public static EPSILON: number = 0.001;

    public static Sign(value: number): number {
        return value >= 0 ? 1 : -1;
    }

    public static AddPoint(p1: PIXIPoint, p2: PIXIPoint, inline: boolean = false): PIXIPoint {
        if (inline) {
            p1.x += p2.x;
            p1.y += p2.y;
            return p1;
        }
        else {
            return new PIXIPoint(p1.x + p2.x, p1.y + p2.y);
        }
    }

    public static Perp(p1: PIXIPoint): PIXIPoint {
        return new PIXIPoint(-p1.y, p1.x);
    }

    public static DividePoint(p1: PIXIPoint, by: number, inline: boolean = false): PIXIPoint {
        if (inline) {
            p1.x /= by;
            p1.y /= by;
            return p1;
        }
        else {
            return new PIXIPoint(p1.x / by, p1.y / by);
        }
    }

    public static MultiplyConstant(p1: PIXIPoint, by: number, inline: boolean = false) {
        if (inline) {
            p1.x *= by;
            p1.y *= by;
            return p1;
        }
        else {
            return new PIXIPoint(p1.x * by, p1.y * by);
        }
    }

    public static SubtractPoint(p1: PIXIPoint, p2: PIXIPoint, inline: boolean = false): PIXIPoint {
        if (inline) {
            p1.x -= p2.x;
            p1.y -= p2.y;
            return p1;
        }
        else {
            return new PIXIPoint(p1.x - p2.x, p1.y - p2.y);
        }
    }

    public static Area(rect: PIXIRectangle): number {
        return rect.width * rect.height;
    }

    public static DistToLineSegment(v: PIXIPoint, w: PIXIPoint, p: PIXIPoint) {
        // Return minimum distance between line segment vw and point p
        var l2 = MathUtil.DistSquared(v, w);  // i.e. |w-v|^2 -  avoid a sqrt
        if (l2 == 0.0) return MathUtil.Dist(p, v);   // v == w case
        // Consider the line extending the segment, parameterized as v + t (w - v).
        // We find projection of point p onto the line. 
        // It falls where t = [(p-v) . (w-v)] / |w-v|^2
        // We clamp t from [0,1] to handle points outside the segment vw.
        var dot = MathUtil.Dot(
            MathUtil.SubtractPoint(p, v),
            MathUtil.SubtractPoint(w, v)) / l2;
        var t = Math.max(0, Math.min(1, dot));
        // Projection falls on the segment
        var projection = MathUtil.AddPoint(v,
            MathUtil.MultiplyConstant(
                MathUtil.SubtractPoint(w, v), t));
        return MathUtil.Dist(p, projection);
    }

    public static LineSegmentIntersection(ps1: PIXIPoint, pe1: PIXIPoint, ps2: PIXIPoint, pe2: PIXIPoint): PIXIPoint | undefined {
        var a1 = pe1.y - ps1.y;
        var b1 = ps1.x - pe1.x;

        var a2 = pe2.y - ps2.y;
        var b2 = ps2.x - pe2.x;

        var delta = a1 * b2 - a2 * b1;
        if (delta == 0) {
            return undefined;
        }
        var c2 = a2 * ps2.x + b2 * ps2.y;
        var c1 = a1 * ps1.x + b1 * ps1.y;
        var invdelta = 1 / delta;
        return new PIXIPoint((b2 * c1 - b1 * c2) * invdelta, (a1 * c2 - a2 * c1) * invdelta);
    }

    public static PointInPIXIRectangle(p: PIXIPoint, rect: PIXIRectangle): boolean {
        if (p.x < rect.left - this.EPSILON)
            return false;
        if (p.x > rect.right + this.EPSILON)
            return false;
        if (p.y < rect.top - this.EPSILON)
            return false;
        if (p.y > rect.bottom + this.EPSILON)
            return false;

        return true;
    }

    public static LinePIXIRectangleIntersection(lineFrom: PIXIPoint, lineTo: PIXIPoint, rect: PIXIRectangle): Array<PIXIPoint> {
        var r1 = new PIXIPoint(rect.left, rect.top);
        var r2 = new PIXIPoint(rect.right, rect.top);
        var r3 = new PIXIPoint(rect.right, rect.bottom);
        var r4 = new PIXIPoint(rect.left, rect.bottom);
        var ret = new Array<PIXIPoint>();
        var dist = this.Dist(lineFrom, lineTo)
        var inter = this.LineSegmentIntersection(lineFrom, lineTo, r1, r2);
        if (inter != null && this.PointInPIXIRectangle(inter, rect) &&
            this.Dist(inter, lineFrom) < dist && this.Dist(inter, lineTo) < dist)
            ret.push(inter);
        inter = this.LineSegmentIntersection(lineFrom, lineTo, r2, r3);
        if (inter != null && this.PointInPIXIRectangle(inter, rect) &&
            this.Dist(inter, lineFrom) < dist && this.Dist(inter, lineTo) < dist)
            ret.push(inter);
        inter = this.LineSegmentIntersection(lineFrom, lineTo, r3, r4);
        if (inter != null && this.PointInPIXIRectangle(inter, rect) &&
            this.Dist(inter, lineFrom) < dist && this.Dist(inter, lineTo) < dist)
            ret.push(inter);
        inter = this.LineSegmentIntersection(lineFrom, lineTo, r4, r1);
        if (inter != null && this.PointInPIXIRectangle(inter, rect) &&
            this.Dist(inter, lineFrom) < dist && this.Dist(inter, lineTo) < dist)
            ret.push(inter);
        return ret;
    }

    public static Intersection(rect1: PIXIRectangle, rect2: PIXIRectangle): PIXIRectangle {
        const left = Math.max(rect1.x, rect2.x);
        const right = Math.min(rect1.x + rect1.width, rect2.x + rect2.width);
        const top = Math.max(rect1.y, rect2.y);
        const bottom = Math.min(rect1.y + rect1.height, rect2.y + rect2.height);
        return new PIXIRectangle(left, top, right - left, bottom - top);
    }

    public static Dist(p1: PIXIPoint, p2: PIXIPoint): number {
        return Math.sqrt(MathUtil.DistSquared(p1, p2));
    }

    public static Dot(p1: PIXIPoint, p2: PIXIPoint): number {
        return p1.x * p2.x + p1.y * p2.y
    }

    public static Normalize(p1: PIXIPoint) {
        var d = this.Length(p1);
        return new PIXIPoint(p1.x / d, p1.y / d);
    }

    public static Length(p1: PIXIPoint): number {
        return Math.sqrt(p1.x * p1.x + p1.y * p1.y);
    }

    public static DistSquared(p1: PIXIPoint, p2: PIXIPoint): number {
        const a = p1.x - p2.x;
        const b = p1.y - p2.y;
        return (a * a + b * b)
    }

    public static RectIntersectsRect(r1: PIXIRectangle, r2: PIXIRectangle): boolean {
        return !(r2.x > r1.x + r1.width ||
            r2.x + r2.width < r1.x ||
            r2.y > r1.y + r1.height ||
            r2.y + r2.height < r1.y);
    }

    public static ArgMin(temp: number[]): number {
        let index = 0;
        let value = temp[0];
        for (let i = 1; i < temp.length; i++) {
            if (temp[i] < value) {
                value = temp[i];
                index = i;
            }
        }
        return index;
    }

    public static ArgMax(temp: number[]): number {
        let index = 0;
        let value = temp[0];
        for (let i = 1; i < temp.length; i++) {
            if (temp[i] > value) {
                value = temp[i];
                index = i;
            }
        }
        return index;
    }

    public static Combinations<T>(chars: T[]) {
        let result = new Array<T>();
        let f = (prefix: any, chars: any) => {
            for (let i = 0; i < chars.length; i++) {
                result.push(prefix.concat(chars[i]));
                f(prefix.concat(chars[i]), chars.slice(i + 1));
            }
        };
        f([], chars);
        return result;
    }
}