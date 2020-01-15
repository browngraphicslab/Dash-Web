import v4 = require('uuid/v4');
import v5 = require("uuid/v5");
import { Socket } from 'socket.io';
import { Message } from './server/Message';

export namespace Utils {
    export const DRAG_THRESHOLD = 4;

    export function GenerateGuid(): string {
        return v4();
    }

    export function GenerateDeterministicGuid(seed: string): string {
        return v5(seed, v5.URL);
    }

    export function GetScreenTransform(ele?: HTMLElement): { scale: number, translateX: number, translateY: number } {
        if (!ele) {
            return { scale: 1, translateX: 1, translateY: 1 };
        }
        const rect = ele.getBoundingClientRect();
        const scale = ele.offsetWidth === 0 && rect.width === 0 ? 1 : rect.width / ele.offsetWidth;
        const translateX = rect.left;
        const translateY = rect.top;

        return { scale, translateX, translateY };
    }

    /**
     * A convenience method. Prepends the full path (i.e. http://localhost:1050) to the
     * requested extension
     * @param extension the specified sub-path to append to the window origin
     */
    export function prepend(extension: string): string {
        return window.location.origin + extension;
    }

    export function fileUrl(filename: string): string {
        return prepend(`/files/${filename}`);
    }

    export function shareUrl(documentId: string): string {
        return prepend(`/doc/${documentId}?sharing=true`);
    }

    export function CorsProxy(url: string): string {
        return prepend("/corsProxy/") + encodeURIComponent(url);
    }

    export async function getApiKey(target: string): Promise<string> {
        const response = await fetch(prepend(`environment/${target.toUpperCase()}`));
        return response.text();
    }

    export function CopyText(text: string) {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();

        try { document.execCommand('copy'); } catch (err) { }

        document.body.removeChild(textArea);
    }

    export function fromRGBAstr(rgba: string) {
        const rm = rgba.match(/rgb[a]?\(([ 0-9]+)/);
        const r = rm ? Number(rm[1]) : 0;
        const gm = rgba.match(/rgb[a]?\([ 0-9]+,([ 0-9]+)/);
        const g = gm ? Number(gm[1]) : 0;
        const bm = rgba.match(/rgb[a]?\([ 0-9]+,[ 0-9]+,([ 0-9]+)/);
        const b = bm ? Number(bm[1]) : 0;
        const am = rgba.match(/rgba?\([ 0-9]+,[ 0-9]+,[ 0-9]+,([ .0-9]+)/);
        const a = am ? Number(am[1]) : 1;
        return { r: r, g: g, b: b, a: a };
    }

    export function toRGBAstr(col: { r: number, g: number, b: number, a?: number }) {
        return "rgba(" + col.r + "," + col.g + "," + col.b + (col.a !== undefined ? "," + col.a : "") + ")";
    }

    export function HSLtoRGB(h: number, s: number, l: number) {
        // Must be fractions of 1
        // s /= 100;
        // l /= 100;

        const c = (1 - Math.abs(2 * l - 1)) * s,
            x = c * (1 - Math.abs((h / 60) % 2 - 1)),
            m = l - c / 2;
        let r = 0,
            g = 0,
            b = 0;
        if (0 <= h && h < 60) {
            r = c; g = x; b = 0;
        } else if (60 <= h && h < 120) {
            r = x; g = c; b = 0;
        } else if (120 <= h && h < 180) {
            r = 0; g = c; b = x;
        } else if (180 <= h && h < 240) {
            r = 0; g = x; b = c;
        } else if (240 <= h && h < 300) {
            r = x; g = 0; b = c;
        } else if (300 <= h && h < 360) {
            r = c; g = 0; b = x;
        }
        r = Math.round((r + m) * 255);
        g = Math.round((g + m) * 255);
        b = Math.round((b + m) * 255);
        return { r: r, g: g, b: b };
    }

    export function RGBToHSL(r: number, g: number, b: number) {
        // Make r, g, and b fractions of 1
        r /= 255;
        g /= 255;
        b /= 255;

        // Find greatest and smallest channel values
        const cmin = Math.min(r, g, b),
            cmax = Math.max(r, g, b),
            delta = cmax - cmin;
        let h = 0,
            s = 0,
            l = 0;
        // Calculate hue

        // No difference
        if (delta === 0) h = 0;
        // Red is max
        else if (cmax === r) h = ((g - b) / delta) % 6;
        // Green is max
        else if (cmax === g) h = (b - r) / delta + 2;
        // Blue is max
        else h = (r - g) / delta + 4;

        h = Math.round(h * 60);

        // Make negative hues positive behind 360°
        if (h < 0) h += 360; // Calculate lightness

        l = (cmax + cmin) / 2;

        // Calculate saturation
        s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));

        // Multiply l and s by 100
        // s = +(s * 100).toFixed(1);
        // l = +(l * 100).toFixed(1);

        return { h: h, s: s, l: l };
    }


    export function clamp(n: number, lower: number, upper: number) {
        return Math.max(lower, Math.min(upper, n));
    }

    export function distanceBetweenHorizontalLines(xs: number, xe: number, y: number, xs2: number, xe2: number, y2: number): [number, number[]] {
        if ((xs2 < xs && xe2 > xs) || (xs2 < xe && xe2 > xe) || (xs2 > xs && xe2 < xe)) return [Math.abs(y - y2), [Math.max(xs, xs2), y, Math.min(xe, xe2), y]];
        if (xe2 < xs) return [Math.sqrt((xe2 - xs) * (xe2 - xs) + (y2 - y) * (y2 - y)), [xs, y, xs, y]];
        //if (xs2 > xe) 
        return [Math.sqrt((xs2 - xe) * (xs2 - xe) + (y2 - y) * (y2 - y)), [xe, y, xe, y]];
    }
    export function distanceBetweenVerticalLines(x: number, ys: number, ye: number, x2: number, ys2: number, ye2: number): [number, number[]] {
        if ((ys2 < ys && ye2 > ys) || (ys2 < ye && ye2 > ye) || (ys2 > ys && ye2 < ye)) return [Math.abs(x - x2), [x, Math.max(ys, ys2), x, Math.min(ye, ye2)]];
        if (ye2 < ys) return [Math.sqrt((ye2 - ys) * (ye2 - ys) + (x2 - x) * (x2 - x)), [x, ys, x, ys]];
        //if (ys2 > ye) 
        return [Math.sqrt((ys2 - ye) * (ys2 - ye) + (x2 - x) * (x2 - x)), [x, ye, x, ye]];
    }

    function project(px: number, py: number, ax: number, ay: number, bx: number, by: number) {

        if (ax === bx && ay === by) return { point: { x: ax, y: ay }, left: false, dot: 0, t: 0 };
        const atob = { x: bx - ax, y: by - ay };
        const atop = { x: px - ax, y: py - ay };
        const len = atob.x * atob.x + atob.y * atob.y;
        var dot = atop.x * atob.x + atop.y * atob.y;
        const t = Math.min(1, Math.max(0, dot / len));

        dot = (bx - ax) * (py - ay) - (by - ay) * (px - ax);

        return {
            point: {
                x: ax + atob.x * t,
                y: ay + atob.y * t
            },
            left: dot < 1,
            dot: dot,
            t: t
        };
    }

    export function closestPtBetweenRectangles(l: number, t: number, w: number, h: number,
        l1: number, t1: number, w1: number, h1: number,
        x: number, y: number) {
        const r = l + w,
            b = t + h;
        const r1 = l1 + w1,
            b1 = t1 + h1;
        const hsegs = [[l, r, t, l1, r1, t1], [l, r, b, l1, r1, t1], [l, r, t, l1, r1, b1], [l, r, b, l1, r1, b1]];
        const vsegs = [[l, t, b, l1, t1, b1], [r, t, b, l1, t1, b1], [l, t, b, r1, t1, b1], [r, t, b, r1, t1, b1]];
        const res = hsegs.reduce((closest, seg) => {
            const res = distanceBetweenHorizontalLines(seg[0], seg[1], seg[2], seg[3], seg[4], seg[5]);
            return (res[0] < closest[0]) ? res : closest;
        }, [Number.MAX_VALUE, []] as [number, number[]]);
        const fres = vsegs.reduce((closest, seg) => {
            const res = distanceBetweenVerticalLines(seg[0], seg[1], seg[2], seg[3], seg[4], seg[5]);
            return (res[0] < closest[0]) ? res : closest;
        }, res);

        const near = project(x, y, fres[1][0], fres[1][1], fres[1][2], fres[1][3]);
        return project(near.point.x, near.point.y, fres[1][0], fres[1][1], fres[1][2], fres[1][3]);
    }

    export function getNearestPointInPerimeter(l: number, t: number, w: number, h: number, x: number, y: number) {
        const r = l + w,
            b = t + h;

        x = clamp(x, l, r),
            y = clamp(y, t, b);

        const dl = Math.abs(x - l),
            dr = Math.abs(x - r),
            dt = Math.abs(y - t),
            db = Math.abs(y - b);

        const m = Math.min(dl, dr, dt, db);

        return (m === dt) ? [x, t] :
            (m === db) ? [x, b] :
                (m === dl) ? [l, y] : [r, y];
    }

    export function GetClipboardText(): string {
        const textArea = document.createElement("textarea");
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();

        try { document.execCommand('paste'); } catch (err) { }

        const val = textArea.value;
        document.body.removeChild(textArea);
        return val;
    }

    export const loggingEnabled: Boolean = false;
    export const logFilter: number | undefined = undefined;

    function log(prefix: string, messageName: string, message: any, receiving: boolean) {
        if (!loggingEnabled) {
            return;
        }
        message = message || {};
        if (logFilter !== undefined && logFilter !== message.type) {
            return;
        }
        const idString = (message.id || "").padStart(36, ' ');
        prefix = prefix.padEnd(16, ' ');
        console.log(`${prefix}: ${idString}, ${receiving ? 'receiving' : 'sending'} ${messageName} with data ${JSON.stringify(message)} `);
    }

    function loggingCallback(prefix: string, func: (args: any) => any, messageName: string) {
        return (args: any) => {
            log(prefix, messageName, args, true);
            func(args);
        };
    }

    export function Emit<T>(socket: Socket | SocketIOClient.Socket, message: Message<T>, args: T) {
        log("Emit", message.Name, args, false);
        socket.emit(message.Message, args);
    }

    export function EmitCallback<T>(socket: Socket | SocketIOClient.Socket, message: Message<T>, args: T): Promise<any>;
    export function EmitCallback<T>(socket: Socket | SocketIOClient.Socket, message: Message<T>, args: T, fn: (args: any) => any): void;
    export function EmitCallback<T>(socket: Socket | SocketIOClient.Socket, message: Message<T>, args: T, fn?: (args: any) => any): void | Promise<any> {
        log("Emit", message.Name, args, false);
        if (fn) {
            socket.emit(message.Message, args, loggingCallback('Receiving', fn, message.Name));
        } else {
            return new Promise<any>(res => socket.emit(message.Message, args, loggingCallback('Receiving', res, message.Name)));
        }
    }

    export function AddServerHandler<T>(socket: Socket | SocketIOClient.Socket, message: Message<T>, handler: (args: T) => any) {
        socket.on(message.Message, loggingCallback('Incoming', handler, message.Name));
    }

    export function AddServerHandlerCallback<T>(socket: Socket, message: Message<T>, handler: (args: [T, (res: any) => any]) => any) {
        socket.on(message.Message, (arg: T, fn: (res: any) => any) => {
            log('S receiving', message.Name, arg, true);
            handler([arg, loggingCallback('S sending', fn, message.Name)]);
        });
    }
}

export function OmitKeys(obj: any, keys: string[], addKeyFunc?: (dup: any) => void): { omit: any, extract: any } {
    const omit: any = { ...obj };
    const extract: any = {};
    keys.forEach(key => {
        extract[key] = omit[key];
        delete omit[key];
    });
    addKeyFunc && addKeyFunc(omit);
    return { omit, extract };
}

export function WithKeys(obj: any, keys: string[], addKeyFunc?: (dup: any) => void) {
    const dup: any = {};
    keys.forEach(key => dup[key] = obj[key]);
    addKeyFunc && addKeyFunc(dup);
    return dup;
}

export function timenow() {
    const now = new Date();
    let ampm = 'am';
    let h = now.getHours();
    let m: any = now.getMinutes();
    const s: any = now.getSeconds();
    if (h >= 12) {
        if (h > 12) h -= 12;
        ampm = 'pm';
    }
    if (m < 10) m = '0' + m;
    return now.toLocaleDateString() + ' ' + h + ':' + m + ' ' + ampm;
}

export function aggregateBounds(boundsList: { x: number, y: number, width: number, height: number }[], xpad: number, ypad: number) {
    let bounds = boundsList.reduce((bounds, b) => {
        const [sptX, sptY] = [b.x, b.y];
        const [bptX, bptY] = [sptX + b.width, sptY + b.height];
        return {
            x: Math.min(sptX, bounds.x), y: Math.min(sptY, bounds.y),
            r: Math.max(bptX, bounds.r), b: Math.max(bptY, bounds.b)
        };
    }, { x: Number.MAX_VALUE, y: Number.MAX_VALUE, r: -Number.MAX_VALUE, b: -Number.MAX_VALUE });
    return { x: bounds.x !== Number.MAX_VALUE ? bounds.x - xpad : bounds.x, y: bounds.y !== Number.MAX_VALUE ? bounds.y - ypad : bounds.y, r: bounds.r !== -Number.MAX_VALUE ? bounds.r + 2 * xpad : bounds.r, b: bounds.b !== -Number.MAX_VALUE ? bounds.b + 2 * ypad : bounds.b }
}
export function intersectRect(r1: { left: number, top: number, width: number, height: number },
    r2: { left: number, top: number, width: number, height: number }) {
    return !(r2.left > r1.left + r1.width || r2.left + r2.width < r1.left || r2.top > r1.top + r1.height || r2.top + r2.height < r1.top);
}

export function percent2frac(percent: string) {
    return Number(percent.substr(0, percent.length - 1)) / 100;
}

export function numberRange(num: number) { return Array.from(Array(num)).map((v, i) => i); }

export function returnTransparent() { return "transparent"; }

export function returnTrue() { return true; }

export function returnFalse() { return false; }

export function returnOne() { return 1; }

export function returnZero() { return 0; }

export function returnEmptyString() { return ""; }

export let emptyPath = [];

export function emptyFunction() { }

export function unimplementedFunction() { throw new Error("This function is not implemented, but should be."); }

export type Without<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;

export type Predicate<K, V> = (entry: [K, V]) => boolean;

export function DeepCopy<K, V>(source: Map<K, V>, predicate?: Predicate<K, V>) {
    const deepCopy = new Map<K, V>();
    const entries = source.entries();
    let next = entries.next();
    while (!next.done) {
        const entry = next.value;
        if (!predicate || predicate(entry)) {
            deepCopy.set(entry[0], entry[1]);
        }
        next = entries.next();
    }
    return deepCopy;
}

export namespace JSONUtils {

    export function tryParse(source: string) {
        let results: any;
        try {
            results = JSON.parse(source);
        } catch (e) {
            results = source;
        }
        return results;
    }

}

const easeInOutQuad = (currentTime: number, start: number, change: number, duration: number) => {
    let newCurrentTime = currentTime / (duration / 2);

    if (newCurrentTime < 1) {
        return (change / 2) * newCurrentTime * newCurrentTime + start;
    }

    newCurrentTime -= 1;
    return (-change / 2) * (newCurrentTime * (newCurrentTime - 2) - 1) + start;
};

export function smoothScroll(duration: number, element: HTMLElement, to: number) {
    const start = element.scrollTop;
    const change = to - start;
    const startDate = new Date().getTime();

    const animateScroll = () => {
        const currentDate = new Date().getTime();
        const currentTime = currentDate - startDate;
        element.scrollTop = easeInOutQuad(currentTime, start, change, duration);

        if (currentTime < duration) {
            requestAnimationFrame(animateScroll);
        } else {
            element.scrollTop = to;
        }
    };
    animateScroll();
}
export function addStyleSheet(styleType: string = "text/css") {
    const style = document.createElement("style");
    style.type = styleType;
    const sheets = document.head.appendChild(style);
    return (sheets as any).sheet;
}
export function addStyleSheetRule(sheet: any, selector: any, css: any) {
    const propText = typeof css === "string" ? css : Object.keys(css).map(p => p + ":" + (p === "content" ? "'" + css[p] + "'" : css[p])).join(";");
    return sheet.insertRule("." + selector + "{" + propText + "}", sheet.cssRules.length);
}
export function removeStyleSheetRule(sheet: any, rule: number) {
    if (sheet.rules.length) {
        sheet.removeRule(rule);
        return true;
    }
    return false;
}
export function clearStyleSheetRules(sheet: any) {
    if (sheet.rules.length) {
        numberRange(sheet.rules.length).map(n => sheet.removeRule(0));
        return true;
    }
    return false;
}