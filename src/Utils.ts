import v4 = require('uuid/v4');
import v5 = require("uuid/v5");
import { Socket } from 'socket.io';
import { Message } from './server/Message';
import { RouteStore } from './server/RouteStore';

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
        return prepend(RouteStore.corsProxy + "/") + encodeURIComponent(url);
    }

    export function CopyText(text: string) {
        var textArea = document.createElement("textarea");
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();

        try { document.execCommand('copy'); } catch (err) { }

        document.body.removeChild(textArea);
    }

    export function fromRGBAstr(rgba: string) {
        let rm = rgba.match(/rgb[a]?\(([0-9]+)/);
        let r = rm ? Number(rm[1]) : 0;
        let gm = rgba.match(/rgb[a]?\([0-9]+,([0-9]+)/);
        let g = gm ? Number(gm[1]) : 0;
        let bm = rgba.match(/rgb[a]?\([0-9]+,[0-9]+,([0-9]+)/);
        let b = bm ? Number(bm[1]) : 0;
        let am = rgba.match(/rgba?\([0-9]+,[0-9]+,[0-9]+,([0-9]+)/);
        let a = am ? Number(am[1]) : 0;
        return { r: r, g: g, b: b, a: a };
    }

    export function toRGBAstr(col: { r: number, g: number, b: number, a?: number }) {
        return "rgba(" + col.r + "," + col.g + "," + col.b + (col.a !== undefined ? "," + col.a : "") + ")";
    }

    export function HSLtoRGB(h: number, s: number, l: number) {
        // Must be fractions of 1
        // s /= 100;
        // l /= 100;

        let c = (1 - Math.abs(2 * l - 1)) * s,
            x = c * (1 - Math.abs((h / 60) % 2 - 1)),
            m = l - c / 2,
            r = 0,
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
        let cmin = Math.min(r, g, b),
            cmax = Math.max(r, g, b),
            delta = cmax - cmin,
            h = 0,
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


    export function GetClipboardText(): string {
        var textArea = document.createElement("textarea");
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
        let idString = (message.id || "").padStart(36, ' ');
        prefix = prefix.padEnd(16, ' ');
        console.log(`${prefix}: ${idString}, ${receiving ? 'receiving' : 'sending'} ${messageName} with data ${JSON.stringify(message)}`);
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
    var dup: any = {};
    keys.forEach(key => dup[key] = obj[key]);
    addKeyFunc && addKeyFunc(dup);
    return dup;
}

export function timenow() {
    var now = new Date();
    let ampm = 'am';
    let h = now.getHours();
    let m: any = now.getMinutes();
    let s: any = now.getSeconds();
    if (h >= 12) {
        if (h > 12) h -= 12;
        ampm = 'pm';
    }
    if (m < 10) m = '0' + m;
    return now.toLocaleDateString() + ' ' + h + ':' + m + ' ' + ampm;
}

export function aggregateBounds(boundsList: { x: number, y: number, width: number, height: number }[]) {
    return boundsList.reduce((bounds, b) => {
        var [sptX, sptY] = [b.x, b.y];
        let [bptX, bptY] = [sptX + b.width, sptY + b.height];
        return {
            x: Math.min(sptX, bounds.x), y: Math.min(sptY, bounds.y),
            r: Math.max(bptX, bounds.r), b: Math.max(bptY, bounds.b)
        };
    }, { x: Number.MAX_VALUE, y: Number.MAX_VALUE, r: -Number.MAX_VALUE, b: -Number.MAX_VALUE });
}
export function intersectRect(r1: { left: number, top: number, width: number, height: number },
    r2: { left: number, top: number, width: number, height: number }) {
    return !(r2.left > r1.left + r1.width || r2.left + r2.width < r1.left || r2.top > r1.top + r1.height || r2.top + r2.height < r1.top);
}

export function percent2frac(percent: string) {
    return Number(percent.substr(0, percent.length - 1)) / 100;
}

export function numberRange(num: number) { return Array.from(Array(num)).map((v, i) => i); }

export function returnTrue() { return true; }

export function returnFalse() { return false; }

export function returnOne() { return 1; }

export function returnZero() { return 0; }

export function returnEmptyString() { return ""; }

export function emptyFunction() { }

export type Without<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;

export type Predicate<K, V> = (entry: [K, V]) => boolean;

export function DeepCopy<K, V>(source: Map<K, V>, predicate?: Predicate<K, V>) {
    let deepCopy = new Map<K, V>();
    let entries = source.entries(), next = entries.next();
    while (!next.done) {
        let entry = next.value;
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