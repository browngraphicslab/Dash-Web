import { MathUtil, PIXIRectangle, PIXIPoint } from "./MathUtil";


export class GeometryUtil {

    public static ComputeBoundingBox(points: { x: number, y: number }[], scale = 1, padding: number = 0): PIXIRectangle {
        let minX: number = Number.MAX_VALUE;
        let minY: number = Number.MAX_VALUE;
        let maxX: number = Number.MIN_VALUE;
        let maxY: number = Number.MIN_VALUE;
        for (var i = 0; i < points.length; i++) {
            if (points[i].x < minX)
                minX = points[i].x;
            if (points[i].y < minY)
                minY = points[i].y;
            if (points[i].x > maxX)
                maxX = points[i].x;
            if (points[i].y > maxY)
                maxY = points[i].y;
        }
        return new PIXIRectangle(minX * scale - padding, minY * scale - padding, (maxX - minX) * scale + padding * 2, (maxY - minY) * scale + padding * 2);
    }

    public static RectangleOverlap(rect1: PIXIRectangle, rect2: PIXIRectangle) {
        let x_overlap = Math.max(0, Math.min(rect1.right, rect2.right) - Math.max(rect1.left, rect2.left));
        let y_overlap = Math.max(0, Math.min(rect1.bottom, rect2.bottom) - Math.max(rect1.top, rect2.top));
        return x_overlap * y_overlap;
    }

    public static RotatePoints(center: { x: number, y: number }, points: { x: number, y: number }[], angle: number): PIXIPoint[] {
        const rotate = (cx: number, cy: number, x: number, y: number, angle: number) => {
            const radians = angle,
                cos = Math.cos(radians),
                sin = Math.sin(radians),
                nx = (cos * (x - cx)) + (sin * (y - cy)) + cx,
                ny = (cos * (y - cy)) - (sin * (x - cx)) + cy;
            return new PIXIPoint(nx, ny);
        }
        return points.map(p => rotate(center.x, center.y, p.x, p.y, angle));
    }

    public static LineByLeastSquares(points: { x: number, y: number }[]): PIXIPoint[] {
        let sum_x: number = 0;
        let sum_y: number = 0;
        let sum_xy: number = 0;
        let sum_xx: number = 0;
        let count: number = 0;

        let x: number = 0;
        let y: number = 0;


        if (points.length === 0) {
            return [];
        }

        for (let v = 0; v < points.length; v++) {
            x = points[v].x;
            y = points[v].y;
            sum_x += x;
            sum_y += y;
            sum_xx += x * x;
            sum_xy += x * y;
            count++;
        }

        let m = (count * sum_xy - sum_x * sum_y) / (count * sum_xx - sum_x * sum_x);
        let b = (sum_y / count) - (m * sum_x) / count;
        let result: PIXIPoint[] = new Array<PIXIPoint>();

        for (let v = 0; v < points.length; v++) {
            x = points[v].x;
            y = x * m + b;
            result.push(new PIXIPoint(x, y));
        }
        return result;
    }

    // public static PointInsidePolygon(vs:Point[], x:number, y:number):boolean {
    //     // ray-casting algorithm based on
    //     // http://www.ecse.rpi.edu/Homepages/wrf/Research/Short_Notes/pnpoly.html

    //     var inside = false;
    //     for (var i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    //         var xi = vs[i].x, yi = vs[i].y;
    //         var xj = vs[j].x, yj = vs[j].y;

    //         var intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    //         if (intersect) 
    //            inside = !inside;
    //     }

    //     return inside;
    // };

    public static IntersectLines(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, x4: number, y4: number): boolean {
        let a1: number, a2: number, b1: number, b2: number, c1: number, c2: number;
        let r1: number, r2: number, r3: number, r4: number;
        let denom: number, offset: number, num: number;

        a1 = y2 - y1;
        b1 = x1 - x2;
        c1 = (x2 * y1) - (x1 * y2);
        r3 = ((a1 * x3) + (b1 * y3) + c1);
        r4 = ((a1 * x4) + (b1 * y4) + c1);

        if ((r3 !== 0) && (r4 !== 0) && (MathUtil.Sign(r3) === MathUtil.Sign(r4))) {
            return false;
        }

        a2 = y4 - y3;
        b2 = x3 - x4;
        c2 = (x4 * y3) - (x3 * y4);

        r1 = (a2 * x1) + (b2 * y1) + c2;
        r2 = (a2 * x2) + (b2 * y2) + c2;

        if ((r1 !== 0) && (r2 !== 0) && (MathUtil.Sign(r1) === MathUtil.Sign(r2))) {
            return false;
        }

        denom = (a1 * b2) - (a2 * b1);

        if (denom === 0) {
            return false;
        }
        return true;
    }
}