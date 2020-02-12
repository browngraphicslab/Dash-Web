import { GestureUtils } from "./GestureUtils";

/**
 * The $N Multistroke Recognizer (JavaScript version)
 * Converted to TypeScript -syip2
 *
 *  Lisa Anthony, Ph.D.
 *  UMBC
 *  Information Systems Department
 *  1000 Hilltop Circle
 *  Baltimore, MD 21250
 *  lanthony@umbc.edu
 *
 *  Jacob O. Wobbrock, Ph.D.
 *  The Information School
 *  University of Washington
 *  Seattle, WA 98195-2840
 *  wobbrock@uw.edu
 *
 * The academic publications for the $N recognizer, and what should be
 * used to cite it, are:
 *
 *     Anthony, L. and Wobbrock, J.O. (2010). A lightweight multistroke
 *     recognizer for user interface prototypes. Proceedings of Graphics
 *     Interface (GI '10). Ottawa, Ontario (May 31-June 2, 2010). Toronto,
 *     Ontario: Canadian Information Processing Society, pp. 245-252.
 *     https://dl.acm.org/citation.cfm?id=1839258
 *
 *     Anthony, L. and Wobbrock, J.O. (2012). $N-Protractor: A fast and
 *     accurate multistroke recognizer. Proceedings of Graphics Interface
 *     (GI '12). Toronto, Ontario (May 28-30, 2012). Toronto, Ontario:
 *     Canadian Information Processing Society, pp. 117-120.
 *     https://dl.acm.org/citation.cfm?id=2305296
 *
 * The Protractor enhancement was separately published by Yang Li and programmed
 * here by Jacob O. Wobbrock and Lisa Anthony:
 *
 *     Li, Y. (2010). Protractor: A fast and accurate gesture
 *     recognizer. Proceedings of the ACM Conference on Human
 *     Factors in Computing Systems (CHI '10). Atlanta, Georgia
 *     (April 10-15, 2010). New York: ACM Press, pp. 2169-2172.
 *     https://dl.acm.org/citation.cfm?id=1753654
 *
 * This software is distributed under the "New BSD License" agreement:
 *
 * Copyright (C) 2007-2011, Jacob O. Wobbrock and Lisa Anthony.
 * All rights reserved. Last updated July 14, 2018.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *    * Redistributions of source code must retain the above copyright
 *      notice, this list of conditions and the following disclaimer.
 *    * Redistributions in binary form must reproduce the above copyright
 *      notice, this list of conditions and the following disclaimer in the
 *      documentation and/or other materials provided with the distribution.
 *    * Neither the names of UMBC nor the University of Washington,
 *      nor the names of its contributors may be used to endorse or promote
 *      products derived from this software without specific prior written
 *      permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS
 * IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO,
 * THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
 * PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL Lisa Anthony OR Jacob O. Wobbrock
 * BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
 * CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE
 * GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION)
 * HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT
 * LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY
 * OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF
 * SUCH DAMAGE.
**/

//
// Point class
//
export class Point {
    constructor(public X: number, public Y: number) { }
}

//
// Rectangle class
//
export class Rectangle {
    constructor(public X: number, public Y: number, public Width: number, public Height: number) { }
}

//
// Unistroke class: a unistroke template
//
export class Unistroke {
    public Points: Point[];
    public StartUnitVector: Point;
    public Vector: number[];

    constructor(public Name: string, useBoundedRotationInvariance: boolean, points: Point[]) {
        this.Points = Resample(points, NumPoints);
        const radians = IndicativeAngle(this.Points);
        this.Points = RotateBy(this.Points, -radians);
        this.Points = ScaleDimTo(this.Points, SquareSize, OneDThreshold);
        if (useBoundedRotationInvariance) {
            this.Points = RotateBy(this.Points, +radians); // restore
        }
        this.Points = TranslateTo(this.Points, Origin);
        this.StartUnitVector = CalcStartUnitVector(this.Points, StartAngleIndex);
        this.Vector = Vectorize(this.Points, useBoundedRotationInvariance); // for Protractor
    }
}
//
// Multistroke class: a container for unistrokes
//
export class Multistroke {
    public NumStrokes: number;
    public Unistrokes: Unistroke[];

    constructor(public Name: string, useBoundedRotationInvariance: boolean, strokes: any[]) // constructor
    {
        this.NumStrokes = strokes.length; // number of individual strokes

        const order = new Array(strokes.length); // array of integer indices
        for (var i = 0; i < strokes.length; i++) {
            order[i] = i; // initialize
        }
        const orders = new Array(); // array of integer arrays
        HeapPermute(strokes.length, order, /*out*/ orders);

        const unistrokes = MakeUnistrokes(strokes, orders); // returns array of point arrays
        this.Unistrokes = new Array(unistrokes.length); // unistrokes for this multistroke
        for (var j = 0; j < unistrokes.length; j++) {
            this.Unistrokes[j] = new Unistroke(this.Name, useBoundedRotationInvariance, unistrokes[j]);
        }
    }
}

//
// Result class
//
export class Result {
    constructor(public Name: string, public Score: any, public Time: any) { }
}

//
// NDollarRecognizer constants
//
const NumMultistrokes = 4;
const NumPoints = 96;
const SquareSize = 250.0;
const OneDThreshold = 0.25; // customize to desired gesture set (usually 0.20 - 0.35)
const Origin = new Point(0, 0);
const Diagonal = Math.sqrt(SquareSize * SquareSize + SquareSize * SquareSize);
const HalfDiagonal = 0.5 * Diagonal;
const AngleRange = Deg2Rad(45.0);
const AnglePrecision = Deg2Rad(2.0);
const Phi = 0.5 * (-1.0 + Math.sqrt(5.0)); // Golden Ratio
const StartAngleIndex = (NumPoints / 8); // eighth of gesture length
const AngleSimilarityThreshold = Deg2Rad(30.0);

//
// NDollarRecognizer class
//
export class NDollarRecognizer {
    public Multistrokes: Multistroke[];

    constructor(useBoundedRotationInvariance: boolean) // constructor
    {
        //
        // one predefined multistroke for each multistroke type
        //
        this.Multistrokes = new Array(NumMultistrokes);
        this.Multistrokes[0] = new Multistroke(GestureUtils.Gestures.Box, useBoundedRotationInvariance, new Array(
            new Array(
                new Point(30, 146), //new Point(29, 160), new Point(30, 180), new Point(31, 200),
                new Point(30, 222), //new Point(50, 219), new Point(70, 225), new Point(90, 230),
                new Point(106, 225), //new Point(100, 200), new Point(106, 180), new Point(110, 160),
                new Point(106, 146), //new Point(80, 150), new Point(50, 146),
                new Point(30, 143))
        ));
        this.Multistrokes[1] = new Multistroke(GestureUtils.Gestures.Line, useBoundedRotationInvariance, new Array(
            new Array(new Point(12, 347), new Point(119, 347))
        ));
        this.Multistrokes[2] = new Multistroke(GestureUtils.Gestures.StartBracket, useBoundedRotationInvariance, new Array(
            // new Array(new Point(145, 20), new Point(30, 21), new Point(34, 150))
            new Array(new Point(31, 25), new Point(145, 20), new Point(31, 25), new Point(34, 150))
        ));
        this.Multistrokes[3] = new Multistroke(GestureUtils.Gestures.EndBracket, useBoundedRotationInvariance, new Array(
            // new Array(new Point(150, 21), new Point(149, 150), new Point(26, 152))
            // new Array(new Point(150, 150), new Point(150, 0), new Point(150, 150), new Point(0, 150))
            new Array(new Point(10, 100), new Point(100, 100), new Point(150, 12), new Point(200, 103), new Point(300, 100))
        ));

        //
        // PREDEFINED STROKES
        //

        // this.Multistrokes[0] = new Multistroke("T", useBoundedRotationInvariance, new Array(
        //     new Array(new Point(30, 7), new Point(103, 7)),
        //     new Array(new Point(66, 7), new Point(66, 87))
        // ));
        // this.Multistrokes[1] = new Multistroke("N", useBoundedRotationInvariance, new Array(
        //     new Array(new Point(177, 92), new Point(177, 2)),
        //     new Array(new Point(182, 1), new Point(246, 95)),
        //     new Array(new Point(247, 87), new Point(247, 1))
        // ));
        // this.Multistrokes[2] = new Multistroke("D", useBoundedRotationInvariance, new Array(
        //     new Array(new Point(345, 9), new Point(345, 87)),
        //     new Array(new Point(351, 8), new Point(363, 8), new Point(372, 9), new Point(380, 11), new Point(386, 14), new Point(391, 17), new Point(394, 22), new Point(397, 28), new Point(399, 34), new Point(400, 42), new Point(400, 50), new Point(400, 56), new Point(399, 61), new Point(397, 66), new Point(394, 70), new Point(391, 74), new Point(386, 78), new Point(382, 81), new Point(377, 83), new Point(372, 85), new Point(367, 87), new Point(360, 87), new Point(355, 88), new Point(349, 87))
        // ));
        // this.Multistrokes[3] = new Multistroke("P", useBoundedRotationInvariance, new Array(
        //     new Array(new Point(507, 8), new Point(507, 87)),
        //     new Array(new Point(513, 7), new Point(528, 7), new Point(537, 8), new Point(544, 10), new Point(550, 12), new Point(555, 15), new Point(558, 18), new Point(560, 22), new Point(561, 27), new Point(562, 33), new Point(561, 37), new Point(559, 42), new Point(556, 45), new Point(550, 48), new Point(544, 51), new Point(538, 53), new Point(532, 54), new Point(525, 55), new Point(519, 55), new Point(513, 55), new Point(510, 55))
        // ));
        // this.Multistrokes[4] = new Multistroke("X", useBoundedRotationInvariance, new Array(
        //     new Array(new Point(30, 146), new Point(106, 222)),
        //     new Array(new Point(30, 225), new Point(106, 146))
        // ));
        // this.Multistrokes[5] = new Multistroke("H", useBoundedRotationInvariance, new Array(
        //     new Array(new Point(188, 137), new Point(188, 225)),
        //     new Array(new Point(188, 180), new Point(241, 180)),
        //     new Array(new Point(241, 137), new Point(241, 225))
        // ));
        // this.Multistrokes[6] = new Multistroke("I", useBoundedRotationInvariance, new Array(
        //     new Array(new Point(371, 149), new Point(371, 221)),
        //     new Array(new Point(341, 149), new Point(401, 149)),
        //     new Array(new Point(341, 221), new Point(401, 221))
        // ));
        // this.Multistrokes[7] = new Multistroke("exclamation", useBoundedRotationInvariance, new Array(
        //     new Array(new Point(526, 142), new Point(526, 204)),
        //     new Array(new Point(526, 221))
        // ));
        // this.Multistrokes[9] = new Multistroke("five-point star", useBoundedRotationInvariance, new Array(
        //     new Array(new Point(177, 396), new Point(223, 299), new Point(262, 396), new Point(168, 332), new Point(278, 332), new Point(184, 397))
        // ));
        // this.Multistrokes[10] = new Multistroke("null", useBoundedRotationInvariance, new Array(
        //     new Array(new Point(382, 310), new Point(377, 308), new Point(373, 307), new Point(366, 307), new Point(360, 310), new Point(356, 313), new Point(353, 316), new Point(349, 321), new Point(347, 326), new Point(344, 331), new Point(342, 337), new Point(341, 343), new Point(341, 350), new Point(341, 358), new Point(342, 362), new Point(344, 366), new Point(347, 370), new Point(351, 374), new Point(356, 379), new Point(361, 382), new Point(368, 385), new Point(374, 387), new Point(381, 387), new Point(390, 387), new Point(397, 385), new Point(404, 382), new Point(408, 378), new Point(412, 373), new Point(416, 367), new Point(418, 361), new Point(419, 353), new Point(418, 346), new Point(417, 341), new Point(416, 336), new Point(413, 331), new Point(410, 326), new Point(404, 320), new Point(400, 317), new Point(393, 313), new Point(392, 312)),
        //     new Array(new Point(418, 309), new Point(337, 390))
        // ));
        // this.Multistrokes[11] = new Multistroke("arrowhead", useBoundedRotationInvariance, new Array(
        //     new Array(new Point(506, 349), new Point(574, 349)),
        //     new Array(new Point(525, 306), new Point(584, 349), new Point(525, 388))
        // ));
        // this.Multistrokes[12] = new Multistroke("pitchfork", useBoundedRotationInvariance, new Array(
        //     new Array(new Point(38, 470), new Point(36, 476), new Point(36, 482), new Point(37, 489), new Point(39, 496), new Point(42, 500), new Point(46, 503), new Point(50, 507), new Point(56, 509), new Point(63, 509), new Point(70, 508), new Point(75, 506), new Point(79, 503), new Point(82, 499), new Point(85, 493), new Point(87, 487), new Point(88, 480), new Point(88, 474), new Point(87, 468)),
        //     new Array(new Point(62, 464), new Point(62, 571))
        // ));
        // this.Multistrokes[13] = new Multistroke("six-point star", useBoundedRotationInvariance, new Array(
        //     new Array(new Point(177, 554), new Point(223, 476), new Point(268, 554), new Point(183, 554)),
        //     new Array(new Point(177, 490), new Point(223, 568), new Point(268, 490), new Point(183, 490))
        // ));
        // this.Multistrokes[14] = new Multistroke("asterisk", useBoundedRotationInvariance, new Array(
        //     new Array(new Point(325, 499), new Point(417, 557)),
        //     new Array(new Point(417, 499), new Point(325, 557)),
        //     new Array(new Point(371, 486), new Point(371, 571))
        // ));
        // this.Multistrokes[15] = new Multistroke("half-note", useBoundedRotationInvariance, new Array(
        //     new Array(new Point(546, 465), new Point(546, 531)),
        //     new Array(new Point(540, 530), new Point(536, 529), new Point(533, 528), new Point(529, 529), new Point(524, 530), new Point(520, 532), new Point(515, 535), new Point(511, 539), new Point(508, 545), new Point(506, 548), new Point(506, 554), new Point(509, 558), new Point(512, 561), new Point(517, 564), new Point(521, 564), new Point(527, 563), new Point(531, 560), new Point(535, 557), new Point(538, 553), new Point(542, 548), new Point(544, 544), new Point(546, 540), new Point(546, 536))
        // ));
        //
        // The $N Gesture Recognizer API begins here -- 3 methods: Recognize(), AddGesture(), and DeleteUserGestures()
        //
    }

    Recognize = (strokes: any[], useBoundedRotationInvariance: boolean = false, requireSameNoOfStrokes: boolean = false, useProtractor: boolean = true) => {
        const t0 = Date.now();
        const points = CombineStrokes(strokes); // make one connected unistroke from the given strokes
        const candidate = new Unistroke("", useBoundedRotationInvariance, points);

        var u = -1;
        var b = +Infinity;
        for (var i = 0; i < this.Multistrokes.length; i++) // for each multistroke template
        {
            if (!requireSameNoOfStrokes || strokes.length === this.Multistrokes[i].NumStrokes) // optional -- only attempt match when same # of component strokes
            {
                for (const unistroke of this.Multistrokes[i].Unistrokes) // for each unistroke within this multistroke
                {
                    if (AngleBetweenUnitVectors(candidate.StartUnitVector, unistroke.StartUnitVector) <= AngleSimilarityThreshold) // strokes start in the same direction
                    {
                        var d;
                        if (useProtractor) {
                            d = OptimalCosineDistance(unistroke.Vector, candidate.Vector); // Protractor
                        }
                        else {
                            d = DistanceAtBestAngle(candidate.Points, unistroke, -AngleRange, +AngleRange, AnglePrecision); // Golden Section Search (original $N)
                        }
                        if (d < b) {
                            b = d; // best (least) distance
                            u = i; // multistroke owner of unistroke
                        }
                    }
                }
            }
        }
        const t1 = Date.now();
        return (u === -1) ? null : new Result(this.Multistrokes[u].Name, useProtractor ? (1.0 - b) : (1.0 - b / HalfDiagonal), t1 - t0);
    }

    AddGesture = (name: string, useBoundedRotationInvariance: boolean, strokes: any[]) => {
        this.Multistrokes[this.Multistrokes.length] = new Multistroke(name, useBoundedRotationInvariance, strokes);
        var num = 0;
        for (const multistroke of this.Multistrokes) {
            if (multistroke.Name === name) {
                num++;
            }
        }
        return num;
    }

    DeleteUserGestures = () => {
        this.Multistrokes.length = NumMultistrokes; // clear any beyond the original set
        return NumMultistrokes;
    }
}


//
// Private helper functions from here on down
//
function HeapPermute(n: number, order: any[], /*out*/ orders: any[]) {
    if (n === 1) {
        orders[orders.length] = order.slice(); // append copy
    } else {
        for (var i = 0; i < n; i++) {
            HeapPermute(n - 1, order, orders);
            if (n % 2 === 1) { // swap 0, n-1
                const tmp = order[0];
                order[0] = order[n - 1];
                order[n - 1] = tmp;
            } else { // swap i, n-1
                const tmp = order[i];
                order[i] = order[n - 1];
                order[n - 1] = tmp;
            }
        }
    }
}

function MakeUnistrokes(strokes: any, orders: any) {
    const unistrokes = new Array(); // array of point arrays
    for (const order of orders) {
        for (var b = 0; b < Math.pow(2, order.length); b++) // use b's bits for directions
        {
            const unistroke = new Array(); // array of points
            for (var i = 0; i < order.length; i++) {
                var pts;
                if (((b >> i) & 1) === 1) {// is b's bit at index i on?
                    pts = strokes[order[i]].slice().reverse(); // copy and reverse
                }
                else {
                    pts = strokes[order[i]].slice(); // copy
                }
                for (const point of pts) {
                    unistroke[unistroke.length] = point; // append points
                }
            }
            unistrokes[unistrokes.length] = unistroke; // add one unistroke to set
        }
    }
    return unistrokes;
}

function CombineStrokes(strokes: any) {
    const points = new Array();
    for (const stroke of strokes) {
        for (const { X, Y } of stroke) {
            points[points.length] = new Point(X, Y);
        }
    }
    return points;
}
function Resample(points: any, n: any) {
    const I = PathLength(points) / (n - 1); // interval length
    var D = 0.0;
    const newpoints = new Array(points[0]);
    for (var i = 1; i < points.length; i++) {
        const d = Distance(points[i - 1], points[i]);
        if ((D + d) >= I) {
            const qx = points[i - 1].X + ((I - D) / d) * (points[i].X - points[i - 1].X);
            const qy = points[i - 1].Y + ((I - D) / d) * (points[i].Y - points[i - 1].Y);
            const q = new Point(qx, qy);
            newpoints[newpoints.length] = q; // append new point 'q'
            points.splice(i, 0, q); // insert 'q' at position i in points s.t. 'q' will be the next i
            D = 0.0;
        }
        else D += d;
    }
    if (newpoints.length === n - 1) {// sometimes we fall a rounding-error short of adding the last point, so add it if so
        newpoints[newpoints.length] = new Point(points[points.length - 1].X, points[points.length - 1].Y);
    }
    return newpoints;
}
function IndicativeAngle(points: any) {
    const c = Centroid(points);
    return Math.atan2(c.Y - points[0].Y, c.X - points[0].X);
}
function RotateBy(points: any, radians: any) // rotates points around centroid
{
    const c = Centroid(points);
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const newpoints = new Array();
    for (const point of points) {
        const qx = (point.X - c.X) * cos - (point.Y - c.Y) * sin + c.X;
        const qy = (point.X - c.X) * sin + (point.Y - c.Y) * cos + c.Y;
        newpoints[newpoints.length] = new Point(qx, qy);
    }
    return newpoints;
}
function ScaleDimTo(points: any, size: any, ratio1D: any) // scales bbox uniformly for 1D, non-uniformly for 2D
{
    const B = BoundingBox(points);
    const uniformly = Math.min(B.Width / B.Height, B.Height / B.Width) <= ratio1D; // 1D or 2D gesture test
    const newpoints = new Array();
    for (const { X, Y } of points) {
        const qx = uniformly ? X * (size / Math.max(B.Width, B.Height)) : X * (size / B.Width);
        const qy = uniformly ? Y * (size / Math.max(B.Width, B.Height)) : Y * (size / B.Height);
        newpoints[newpoints.length] = new Point(qx, qy);
    }
    return newpoints;
}
function TranslateTo(points: any, pt: any) // translates points' centroid
{
    const c = Centroid(points);
    const newpoints = new Array();
    for (const { X, Y } of points) {
        const qx = X + pt.X - c.X;
        const qy = Y + pt.Y - c.Y;
        newpoints[newpoints.length] = new Point(qx, qy);
    }
    return newpoints;
}
function Vectorize(points: any, useBoundedRotationInvariance: any) // for Protractor
{
    var cos = 1.0;
    var sin = 0.0;
    if (useBoundedRotationInvariance) {
        const iAngle = Math.atan2(points[0].Y, points[0].X);
        const baseOrientation = (Math.PI / 4.0) * Math.floor((iAngle + Math.PI / 8.0) / (Math.PI / 4.0));
        cos = Math.cos(baseOrientation - iAngle);
        sin = Math.sin(baseOrientation - iAngle);
    }
    var sum = 0.0;
    const vector = new Array<number>();
    for (var i = 0; i < points.length; i++) {
        const newX = points[i].X * cos - points[i].Y * sin;
        const newY = points[i].Y * cos + points[i].X * sin;
        vector[vector.length] = newX;
        vector[vector.length] = newY;
        sum += newX * newX + newY * newY;
    }
    const magnitude = Math.sqrt(sum);
    for (var i = 0; i < vector.length; i++) {
        vector[i] /= magnitude;
    }
    return vector;
}
function OptimalCosineDistance(v1: any, v2: any) // for Protractor
{
    var a = 0.0;
    var b = 0.0;
    for (var i = 0; i < v1.length; i += 2) {
        a += v1[i] * v2[i] + v1[i + 1] * v2[i + 1];
        b += v1[i] * v2[i + 1] - v1[i + 1] * v2[i];
    }
    const angle = Math.atan(b / a);
    return Math.acos(a * Math.cos(angle) + b * Math.sin(angle));
}
function DistanceAtBestAngle(points: any, T: any, a: any, b: any, threshold: any) {
    var x1 = Phi * a + (1.0 - Phi) * b;
    var f1 = DistanceAtAngle(points, T, x1);
    var x2 = (1.0 - Phi) * a + Phi * b;
    var f2 = DistanceAtAngle(points, T, x2);
    while (Math.abs(b - a) > threshold) {
        if (f1 < f2) {
            b = x2;
            x2 = x1;
            f2 = f1;
            x1 = Phi * a + (1.0 - Phi) * b;
            f1 = DistanceAtAngle(points, T, x1);
        } else {
            a = x1;
            x1 = x2;
            f1 = f2;
            x2 = (1.0 - Phi) * a + Phi * b;
            f2 = DistanceAtAngle(points, T, x2);
        }
    }
    return Math.min(f1, f2);
}
function DistanceAtAngle(points: any, T: any, radians: any) {
    const newpoints = RotateBy(points, radians);
    return PathDistance(newpoints, T.Points);
}
function Centroid(points: any) {
    var x = 0.0, y = 0.0;
    for (const point of points) {
        x += point.X;
        y += point.Y;
    }
    x /= points.length;
    y /= points.length;
    return new Point(x, y);
}
function BoundingBox(points: any) {
    var minX = +Infinity, maxX = -Infinity, minY = +Infinity, maxY = -Infinity;
    for (const { X, Y } of points) {
        minX = Math.min(minX, X);
        minY = Math.min(minY, Y);
        maxX = Math.max(maxX, X);
        maxY = Math.max(maxY, Y);
    }
    return new Rectangle(minX, minY, maxX - minX, maxY - minY);
}
function PathDistance(pts1: any, pts2: any) // average distance between corresponding points in two paths
{
    var d = 0.0;
    for (var i = 0; i < pts1.length; i++) {// assumes pts1.length == pts2.length
        d += Distance(pts1[i], pts2[i]);
    }
    return d / pts1.length;
}
function PathLength(points: any) // length traversed by a point path
{
    var d = 0.0;
    for (var i = 1; i < points.length; i++) {
        d += Distance(points[i - 1], points[i]);
    }
    return d;
}
function Distance(p1: any, p2: any) // distance between two points
{
    const dx = p2.X - p1.X;
    const dy = p2.Y - p1.Y;
    return Math.sqrt(dx * dx + dy * dy);
}
function CalcStartUnitVector(points: any, index: any) // start angle from points[0] to points[index] normalized as a unit vector
{
    const v = new Point(points[index].X - points[0].X, points[index].Y - points[0].Y);
    const len = Math.sqrt(v.X * v.X + v.Y * v.Y);
    return new Point(v.X / len, v.Y / len);
}
function AngleBetweenUnitVectors(v1: any, v2: any) // gives acute angle between unit vectors from (0,0) to v1, and (0,0) to v2
{
    const n = (v1.X * v2.X + v1.Y * v2.Y);
    const c = Math.max(-1.0, Math.min(1.0, n)); // ensure [-1,+1]
    return Math.acos(c); // arc cosine of the vector dot product
}
function Deg2Rad(d: any) { return (d * Math.PI / 180.0); }