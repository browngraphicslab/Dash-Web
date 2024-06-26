import v4 = require('uuid/v4');
import v5 = require("uuid/v5");
import { ColorState } from 'react-color';
import { Socket } from 'socket.io';
import { Message } from './server/Message';

export namespace Utils {
    export let DRAG_THRESHOLD = 4;

    export function readUploadedFileAsText(inputFile: File) {
        const temporaryFileReader = new FileReader();

        return new Promise((resolve, reject) => {
            temporaryFileReader.onerror = () => {
                temporaryFileReader.abort();
                reject(new DOMException("Problem parsing input file."));
            };

            temporaryFileReader.onload = () => {
                resolve(temporaryFileReader.result);
            };
            temporaryFileReader.readAsText(inputFile);
        });
    }

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

    export function TraceConsoleLog() {
        ['log', 'warn'].forEach(function (method) {
            const old = (console as any)[method];
            (console as any)[method] = function () {
                let stack = new Error("").stack?.split(/\n/);
                // Chrome includes a single "Error" line, FF doesn't.
                if (stack && stack[0].indexOf('Error') === 0) {
                    stack = stack.slice(1);
                }
                const message = (stack?.[1] || "Stack undefined!").trim();
                const args = ([] as any[]).slice.apply(arguments).concat([message]);
                return old.apply(console, args);
            };
        });
    }

    /**
     * A convenience method. Prepends the full path (i.e. http://localhost:<port>) to the
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

    export function CopyText(text: string) {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();

        try { document.execCommand('copy'); } catch (err) { }

        document.body.removeChild(textArea);
    }

    export function decimalToHexString(number: number) {
        if (number < 0) {
            number = 0xFFFFFFFF + number + 1;
        }
        return (number < 16 ? "0" : "") + number.toString(16).toUpperCase();
    }

    export function colorString(color: ColorState) {
        return color.hex.startsWith("#") ?
            color.hex + (color.rgb.a ? decimalToHexString(Math.round(color.rgb.a * 255)) : "ff") : color.hex;
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

    export function scrollIntoView(targetY: number, targetHgt: number, scrollTop: number, contextHgt: number) {
        if (scrollTop + contextHgt < targetY + targetHgt * 1.1) {
            return Math.ceil(targetY + targetHgt * 1.1 - contextHgt);
        } else if (scrollTop > targetY - targetHgt * .1) {
            return Math.max(0, Math.floor(targetY - targetHgt * .1));
        }
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
    export type RoomHandler = (socket: Socket, room: string) => any;
    export type UsedSockets = Socket | SocketIOClient.Socket;
    export type RoomMessage = "create or join" | "created" | "joined";
    export function AddRoomHandler(socket: Socket, message: RoomMessage, handler: RoomHandler) {
        socket.on(message, room => handler(socket, room));
    }
}

export function OmitKeys(obj: any, keys: string[], pattern?: string, addKeyFunc?: (dup: any) => void): { omit: any, extract: any } {
    const omit: any = { ...obj };
    const extract: any = {};
    keys.forEach(key => {
        extract[key] = omit[key];
        delete omit[key];
    });
    pattern && Array.from(Object.keys(omit)).filter(key => key.match(pattern)).forEach(key => {
        extract[key] = omit[key];
        delete omit[key];
    });
    addKeyFunc?.(omit);
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

export function formatTime(time: number) {
    time = Math.round(time);
    const hours = Math.floor(time / 60 / 60);
    const minutes = Math.floor(time / 60) - (hours * 60);
    const seconds = time % 60;

    return hours.toString().padStart(2, '0') + ':' + minutes.toString().padStart(2, '0') + ':' + seconds.toString().padStart(2, '0');
}

export function aggregateBounds(boundsList: { x: number, y: number, width?: number, height?: number }[], xpad: number, ypad: number) {
    const bounds = boundsList.map(b => ({ x: b.x, y: b.y, r: b.x + (b.width || 0), b: b.y + (b.height || 0) })).reduce((bounds, b) => ({
        x: Math.min(b.x, bounds.x), y: Math.min(b.y, bounds.y),
        r: Math.max(b.r, bounds.r), b: Math.max(b.b, bounds.b)
    }), { x: Number.MAX_VALUE, y: Number.MAX_VALUE, r: -Number.MAX_VALUE, b: -Number.MAX_VALUE });
    return {
        x: bounds.x !== Number.MAX_VALUE ? bounds.x - xpad : bounds.x, y: bounds.y !== Number.MAX_VALUE ? bounds.y - ypad : bounds.y,
        r: bounds.r !== -Number.MAX_VALUE ? bounds.r + xpad : bounds.r, b: bounds.b !== -Number.MAX_VALUE ? bounds.b + ypad : bounds.b
    };
}
export function intersectRect(r1: { left: number, top: number, width: number, height: number },
    r2: { left: number, top: number, width: number, height: number }) {
    return !(r2.left > r1.left + r1.width || r2.left + r2.width < r1.left || r2.top > r1.top + r1.height || r2.top + r2.height < r1.top);
}

export function percent2frac(percent: string) {
    return Number(percent.substr(0, percent.length - 1)) / 100;
}

export function numberRange(num: number) { return num > 0 && num < 1000 ? Array.from(Array(num)).map((v, i) => i) : []; }

export function returnTransparent() { return "transparent"; }

export function returnTrue() { return true; }

export function returnFalse() { return false; }

export function returnVal(val1?: number, val2?: number) { return val1 !== undefined ? val1 : val2 !== undefined ? val2 : 0; }

export function returnOne() { return 1; }

export function returnZero() { return 0; }

export function returnEmptyString() { return ""; }

export function returnEmptyFilter() { return [] as string[]; }

export function returnEmptyDoclist() { return [] as any[]; }

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

export function smoothScroll(duration: number, element: HTMLElement | HTMLElement[], to: number) {
    const elements = (element instanceof HTMLElement ? [element] : element);
    const starts = elements.map(element => element.scrollTop);
    const startDate = new Date().getTime();

    const animateScroll = () => {
        const currentDate = new Date().getTime();
        const currentTime = currentDate - startDate;
        elements.map((element, i) => element.scrollTop = easeInOutQuad(currentTime, starts[i], to - starts[i], duration));

        if (currentTime < duration) {
            requestAnimationFrame(animateScroll);
        } else {
            elements.forEach(element => element.scrollTop = to);
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
export function addStyleSheetRule(sheet: any, selector: any, css: any, selectorPrefix = ".") {
    const propText = typeof css === "string" ? css : Object.keys(css).map(p => p + ":" + (p === "content" ? "'" + css[p] + "'" : css[p])).join(";");
    return sheet.insertRule(selectorPrefix + selector + "{" + propText + "}", sheet.cssRules.length);
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

export function simulateMouseClick(element: Element | null | undefined, x: number, y: number, sx: number, sy: number, rightClick = true) {
    if (!element) return;
    ["pointerdown", "pointerup"].map(event => element.dispatchEvent(
        new PointerEvent(event, {
            view: window,
            bubbles: true,
            cancelable: true,
            button: 2,
            pointerType: "mouse",
            clientX: x,
            clientY: y,
            screenX: sx,
            screenY: sy,
        })));

    rightClick && element.dispatchEvent(
        new MouseEvent("contextmenu", {
            view: window,
            bubbles: true,
            cancelable: true,
            button: 2,
            clientX: x,
            clientY: y,
            movementX: 0,
            movementY: 0,
            screenX: sx,
            screenY: sy,
        }));
}

export function lightOrDark(color: any) {

    // Variables for red, green, blue values
    var r, g, b, hsp;

    // Check the format of the color, HEX or RGB?
    if (color.match(/^rgb/)) {

        // If RGB --> store the red, green, blue values in separate variables
        color = color.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*(\d+(?:\.\d+)?))?\)$/);

        r = color[1];
        g = color[2];
        b = color[3];
    }
    else {

        // If hex --> Convert it to RGB: http://gist.github.com/983661
        color = +("0x" + color.slice(1).replace(
            color.length < 5 && /./g, '$&$&'));

        r = color >> 16;
        g = color >> 8 & 255;
        b = color & 255;
    }

    // HSP (Highly Sensitive Poo) equation from http://alienryderflex.com/hsp.html
    hsp = Math.sqrt(
        0.299 * (r * r) +
        0.587 * (g * g) +
        0.114 * (b * b)
    );

    // Using the HSP value, determine whether the color is light or dark
    if (hsp > 127.5) {
        return 'light';
    }
    else {

        return 'dark';
    }
}


export function getWordAtPoint(elem: any, x: number, y: number): string | undefined {
    if (elem.nodeType === elem.TEXT_NODE) {
        const range = elem.ownerDocument.createRange();
        range.selectNodeContents(elem);
        var currentPos = 0;
        const endPos = range.endOffset;
        while (currentPos + 1 < endPos) {
            range.setStart(elem, currentPos);
            range.setEnd(elem, currentPos + 1);
            const rangeRect = range.getBoundingClientRect();
            if (rangeRect.left <= x && rangeRect.right >= x &&
                rangeRect.top <= y && rangeRect.bottom >= y) {
                range.expand?.("word"); // doesn't exist in firefox
                const ret = range.toString();
                range.detach();
                return (ret);
            }
            currentPos += 1;
        }
    } else {
        for (const childNode of elem.childNodes) {
            const range = childNode.ownerDocument.createRange();
            range.selectNodeContents(childNode);
            const rangeRect = range.getBoundingClientRect();
            if (rangeRect.left <= x && rangeRect.right >= x &&
                rangeRect.top <= y && rangeRect.bottom >= y) {
                range.detach();
                const word = getWordAtPoint(childNode, x, y);
                if (word) return word;
            } else {
                range.detach();
            }
        }
    }
    return undefined;
}

export function hasDescendantTarget(x: number, y: number, target: HTMLDivElement | null) {
    let entered = false;
    for (let child = document.elementFromPoint(x, y); !entered && child; child = child.parentElement) {
        entered = entered || child === target;
    }
    return entered;
}

export function StopEvent(e: React.PointerEvent | React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
}

export function setupMoveUpEvents(
    target: object,
    e: React.PointerEvent,
    moveEvent: (e: PointerEvent, down: number[], delta: number[]) => boolean,
    upEvent: (e: PointerEvent, movement: number[], isClick: boolean) => any,
    clickEvent: (e: PointerEvent, doubleTap?: boolean) => any,
    stopPropagation: boolean = true,
    stopMovePropagation: boolean = true,
    noDoubleTapTimeout?: () => void
) {
    const doubleTapTimeout = 300;
    (target as any)._doubleTap = (Date.now() - (target as any)._lastTap < doubleTapTimeout);
    (target as any)._lastTap = Date.now();
    (target as any)._downX = (target as any)._lastX = e.clientX;
    (target as any)._downY = (target as any)._lastY = e.clientY;
    if (!(target as any)._doubleTime && noDoubleTapTimeout) {
        (target as any)._doubleTime = setTimeout(() => {
            noDoubleTapTimeout?.();
            (target as any)._doubleTime = undefined;
        }, doubleTapTimeout);
    }

    const _moveEvent = (e: PointerEvent): void => {
        if (Math.abs(e.clientX - (target as any)._downX) > Utils.DRAG_THRESHOLD || Math.abs(e.clientY - (target as any)._downY) > Utils.DRAG_THRESHOLD) {
            if ((target as any)._doubleTime) {
                clearTimeout((target as any)._doubleTime);
                (target as any)._doubleTime = undefined;
            }
            if (moveEvent(e, [(target as any)._downX, (target as any)._downY],
                [e.clientX - (target as any)._lastX, e.clientY - (target as any)._lastY])) {
                document.removeEventListener("pointermove", _moveEvent);
                document.removeEventListener("pointerup", _upEvent);
            }
        }
        (target as any)._lastX = e.clientX;
        (target as any)._lastY = e.clientY;
        stopMovePropagation && e.stopPropagation();
    };
    const _upEvent = (e: PointerEvent): void => {
        const isClick = Math.abs(e.clientX - (target as any)._downX) < 4 && Math.abs(e.clientY - (target as any)._downY) < 4;
        upEvent(e, [e.clientX - (target as any)._downX, e.clientY - (target as any)._downY], isClick);
        if (isClick) {
            if ((target as any)._doubleTime && (target as any)._doubleTap) {
                clearTimeout((target as any)._doubleTime);
                (target as any)._doubleTime = undefined;
            }
            clickEvent(e, (target as any)._doubleTap);
        }
        document.removeEventListener("pointermove", _moveEvent);
        document.removeEventListener("pointerup", _upEvent);
    };
    if (stopPropagation) {
        e.stopPropagation();
        e.preventDefault();
    }
    document.removeEventListener("pointermove", _moveEvent);
    document.removeEventListener("pointerup", _upEvent);
    document.addEventListener("pointermove", _moveEvent);
    document.addEventListener("pointerup", _upEvent);
}