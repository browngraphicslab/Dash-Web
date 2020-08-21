import { Doc, Field, FieldResult, WidthSym, HeightSym } from "../../../../fields/Doc";
import { NumCast, StrCast, Cast } from "../../../../fields/Types";
import { ScriptBox } from "../../ScriptBox";
import { CompileScript } from "../../../util/Scripting";
import { ScriptField } from "../../../../fields/ScriptField";
import { OverlayView, OverlayElementOptions } from "../../OverlayView";
import { emptyFunction, aggregateBounds } from "../../../../Utils";
import React = require("react");
import { Id, ToString } from "../../../../fields/FieldSymbols";
import { ObjectField } from "../../../../fields/ObjectField";
import { RefField } from "../../../../fields/RefField";
import { listSpec } from "../../../../fields/Schema";

export interface ViewDefBounds {
    type: string;
    payload: any;
    x: number;
    y: number;
    z?: number;
    text?: string;
    zIndex?: number;
    width?: number;
    height?: number;
    transition?: string;
    fontSize?: number;
    highlight?: boolean;
    color?: string;
    opacity?: number;
    replica?: string;
    pair?: { layout: Doc, data?: Doc };
}

export interface PoolData {
    x: number;
    y: number;
    z?: number;
    zIndex?: number;
    width?: number;
    height?: number;
    color?: string;
    opacity?: number;
    transition?: string;
    highlight?: boolean;
    replica: string;
    pair: { layout: Doc, data?: Doc };
}

export interface ViewDefResult {
    ele: JSX.Element;
    bounds?: ViewDefBounds;
}
function toLabel(target: FieldResult<Field>) {
    if (typeof target === "number" || Number(target)) {
        const truncated = Number(Number(target).toFixed(0));
        const precise = Number(Number(target).toFixed(2));
        return truncated === precise ? Number(target).toFixed(0) : Number(target).toFixed(2);
    }
    if (target instanceof ObjectField || target instanceof RefField) {
        return target[ToString]();
    }
    return String(target);
}
/**
 * Uses canvas.measureText to compute and return the width of the given text of given font in pixels.
 * 
 * @param {String} text The text to be rendered.
 * @param {String} font The css font descriptor that text is to be rendered with (e.g. "bold 14px verdana").
 * 
 * @see https://stackoverflow.com/questions/118241/calculate-text-width-with-javascript/21015393#21015393
 */
function getTextWidth(text: string, font: string): number {
    // re-use canvas object for better performance
    const canvas = (getTextWidth as any).canvas || ((getTextWidth as any).canvas = document.createElement("canvas"));
    const context = canvas.getContext("2d");
    context.font = font;
    const metrics = context.measureText(text);
    return metrics.width;
}

interface PivotColumn {
    docs: Doc[];
    replicas: string[];
    filters: string[];
}

export function computerPassLayout(
    poolData: Map<string, PoolData>,
    pivotDoc: Doc,
    childPairs: { layout: Doc, data?: Doc }[],
    panelDim: number[],
    viewDefsToJSX: (views: ViewDefBounds[]) => ViewDefResult[]
) {
    const docMap = new Map<string, PoolData>();
    childPairs.forEach(({ layout, data }, i) => {
        docMap.set(layout[Id], {
            x: NumCast(layout.x),
            y: NumCast(layout.y),
            width: layout[WidthSym](),
            height: layout[HeightSym](),
            pair: { layout, data },
            replica: ""
        });
    });
    return normalizeResults(panelDim, 12, docMap, poolData, viewDefsToJSX, [], 0, []);
}

export function computerStarburstLayout(
    poolData: Map<string, PoolData>,
    pivotDoc: Doc,
    childPairs: { layout: Doc, data?: Doc }[],
    panelDim: number[],
    viewDefsToJSX: (views: ViewDefBounds[]) => ViewDefResult[]
) {
    const docMap = new Map<string, PoolData>();
    const burstRadius = [NumCast(pivotDoc._starburstRadius, panelDim[0]), NumCast(pivotDoc._starburstRadius, panelDim[1])];
    const docScale = NumCast(pivotDoc._starburstDocScale);
    const docSize = docScale * 100; // assume a icon sized at 100
    const scaleDim = [burstRadius[0] + docSize, burstRadius[1] + docSize];
    childPairs.forEach(({ layout, data }, i) => {
        const deg = i / childPairs.length * Math.PI * 2;
        docMap.set(layout[Id], {
            x: Math.cos(deg) * (burstRadius[0] / 3) - docScale * layout[WidthSym]() / 2,
            y: Math.sin(deg) * (burstRadius[1] / 3) - docScale * layout[HeightSym]() / 2,
            width: docScale * layout[WidthSym](),
            height: docScale * layout[HeightSym](),
            pair: { layout, data },
            replica: ""
        });
    });
    return normalizeResults(scaleDim, 12, docMap, poolData, viewDefsToJSX, [], 0, []);
}


export function computePivotLayout(
    poolData: Map<string, PoolData>,
    pivotDoc: Doc,
    childPairs: { layout: Doc, data?: Doc }[],
    panelDim: number[],
    viewDefsToJSX: (views: ViewDefBounds[]) => ViewDefResult[]
) {
    const docMap = new Map<string, PoolData>();
    const fieldKey = "data";
    const pivotColumnGroups = new Map<FieldResult<Field>, PivotColumn>();

    let nonNumbers = 0;
    const pivotFieldKey = toLabel(pivotDoc._pivotField);
    childPairs.map(pair => {
        const lval = pivotFieldKey === "#" ? Array.from(Object.keys(Doc.GetProto(pair.layout))).filter(k => k.startsWith("#")).map(k => k.substring(1)) :
            Cast(pair.layout[pivotFieldKey], listSpec("string"), null);

        const num = toNumber(pair.layout[pivotFieldKey]);
        if (num === undefined || Number.isNaN(num)) {
            nonNumbers++;
        }
        const val = Field.toString(pair.layout[pivotFieldKey] as Field);
        if (lval) {
            lval.forEach((val, i) => {
                !pivotColumnGroups.get(val) && pivotColumnGroups.set(val, { docs: [], filters: [val], replicas: [] });
                pivotColumnGroups.get(val)!.docs.push(pair.layout);
                pivotColumnGroups.get(val)!.replicas.push(i.toString());
            });
        } else if (val) {
            !pivotColumnGroups.get(val) && pivotColumnGroups.set(val, { docs: [], filters: [val], replicas: [] });
            pivotColumnGroups.get(val)!.docs.push(pair.layout);
            pivotColumnGroups.get(val)!.replicas.push("");
        } else {
            docMap.set(pair.layout[Id], {
                x: 0,
                y: 0,
                zIndex: -99,
                width: 0,
                height: 0,
                pair,
                replica: ""
            });
        }
    });
    const pivotNumbers = nonNumbers / childPairs.length < .1;
    if (pivotColumnGroups.size > 10) {
        const arrayofKeys = Array.from(pivotColumnGroups.keys());
        const sortedKeys = pivotNumbers ? arrayofKeys.sort((n1: FieldResult, n2: FieldResult) => toNumber(n1)! - toNumber(n2)!) : arrayofKeys.sort();
        const clusterSize = Math.ceil(pivotColumnGroups.size / 10);
        const numClusters = Math.ceil(sortedKeys.length / clusterSize);
        for (let i = 0; i < numClusters; i++) {
            for (let j = i * clusterSize + 1; j < Math.min(sortedKeys.length, (i + 1) * clusterSize); j++) {
                const curgrp = pivotColumnGroups.get(sortedKeys[i * clusterSize])!;
                const newgrp = pivotColumnGroups.get(sortedKeys[j])!;
                curgrp.docs.push(...newgrp.docs);
                curgrp.filters.push(...newgrp.filters);
                curgrp.replicas.push(...newgrp.replicas);
                pivotColumnGroups.delete(sortedKeys[j]);
            }
        }
    }
    const fontSize = NumCast(pivotDoc[fieldKey + "-timelineFontSize"], panelDim[1] > 58 ? 20 : Math.max(7, panelDim[1] / 3));
    const desc = `${fontSize}px ${getComputedStyle(document.body).fontFamily}`;
    const textlen = Array.from(pivotColumnGroups.keys()).map(c => getTextWidth(toLabel(c), desc)).reduce((p, c) => Math.max(p, c), 0 as number);
    const max_text = Math.min(Math.ceil(textlen / 120) * 28, panelDim[1] / 2);
    const maxInColumn = Array.from(pivotColumnGroups.values()).reduce((p, s) => Math.max(p, s.docs.length), 1);

    const colWidth = panelDim[0] / pivotColumnGroups.size;
    const colHeight = panelDim[1] - max_text;
    let numCols = 0;
    let bestArea = 0;
    let pivotAxisWidth = 0;
    for (let i = 1; i < 10; i++) {
        const numInCol = Math.ceil(maxInColumn / i);
        const hd = colHeight / numInCol;
        const wd = colWidth / i;
        const dim = Math.min(hd, wd);
        if (dim > bestArea) {
            bestArea = dim;
            numCols = i;
            pivotAxisWidth = dim;
        }
    }

    const groupNames: ViewDefBounds[] = [];

    const expander = 1.05;
    const gap = .15;
    const maxColHeight = pivotAxisWidth * expander * Math.ceil(maxInColumn / numCols);
    let x = 0;
    const sortedPivotKeys = pivotNumbers ? Array.from(pivotColumnGroups.keys()).sort((n1: FieldResult, n2: FieldResult) => toNumber(n1)! - toNumber(n2)!) : Array.from(pivotColumnGroups.keys()).sort();
    sortedPivotKeys.forEach(key => {
        const val = pivotColumnGroups.get(key)!;
        let y = 0;
        let xCount = 0;
        const text = toLabel(key);
        groupNames.push({
            type: "text",
            text,
            x,
            y: pivotAxisWidth,
            width: pivotAxisWidth * expander * numCols,
            height: max_text,
            fontSize,
            payload: val
        });
        val.docs.forEach((doc, i) => {
            const layoutDoc = Doc.Layout(doc);
            let wid = pivotAxisWidth;
            let hgt = layoutDoc._nativeWidth ? (NumCast(layoutDoc._nativeHeight) / NumCast(layoutDoc._nativeWidth)) * pivotAxisWidth : pivotAxisWidth;
            if (hgt > pivotAxisWidth) {
                hgt = pivotAxisWidth;
                wid = layoutDoc._nativeHeight ? (NumCast(layoutDoc._nativeWidth) / NumCast(layoutDoc._nativeHeight)) * pivotAxisWidth : pivotAxisWidth;
            }
            docMap.set(doc[Id] + (val.replicas || ""), {
                x: x + xCount * pivotAxisWidth * expander + (pivotAxisWidth - wid) / 2 + (val.docs.length < numCols ? (numCols - val.docs.length) * pivotAxisWidth / 2 : 0),
                y: -y + (pivotAxisWidth - hgt) / 2,
                width: wid,
                height: hgt,
                pair: { layout: doc },
                replica: val.replicas[i]
            });
            xCount++;
            if (xCount >= numCols) {
                xCount = 0;
                y += pivotAxisWidth * expander;
            }
        });
        x += pivotAxisWidth * (numCols * expander + gap);
    });

    const dividers = sortedPivotKeys.map((key, i) =>
        ({ type: "div", color: "lightGray", x: i * pivotAxisWidth * (numCols * expander + gap) - pivotAxisWidth * (expander - 1) / 2, y: -maxColHeight + pivotAxisWidth, width: pivotAxisWidth * numCols * expander, height: maxColHeight, payload: pivotColumnGroups.get(key)!.filters }));
    groupNames.push(...dividers);
    return normalizeResults(panelDim, max_text, docMap, poolData, viewDefsToJSX, groupNames, 0, []);
}

function toNumber(val: FieldResult<Field>) {
    return val === undefined ? undefined : NumCast(val, Number(StrCast(val)));
}

export function computeTimelineLayout(
    poolData: Map<string, PoolData>,
    pivotDoc: Doc,
    childPairs: { layout: Doc, data?: Doc }[],
    panelDim: number[],
    viewDefsToJSX: (views: ViewDefBounds[]) => ViewDefResult[]
) {
    const fieldKey = "data";
    const pivotDateGroups = new Map<number, Doc[]>();
    const docMap = new Map<string, PoolData>();
    const groupNames: ViewDefBounds[] = [];
    const timelineFieldKey = Field.toString(pivotDoc._pivotField as Field);
    const curTime = toNumber(pivotDoc[fieldKey + "-timelineCur"]);
    const curTimeSpan = Cast(pivotDoc[fieldKey + "-timelineSpan"], "number", null);
    const minTimeReq = curTimeSpan === undefined ? Cast(pivotDoc[fieldKey + "-timelineMinReq"], "number", null) : curTime && (curTime - curTimeSpan);
    const maxTimeReq = curTimeSpan === undefined ? Cast(pivotDoc[fieldKey + "-timelineMaxReq"], "number", null) : curTime && (curTime + curTimeSpan);
    const fontSize = NumCast(pivotDoc[fieldKey + "-timelineFontSize"], panelDim[1] > 58 ? 20 : Math.max(7, panelDim[1] / 3));
    const fontHeight = panelDim[1] > 58 ? 30 : panelDim[1] / 2;
    const findStack = (time: number, stack: number[]) => {
        const index = stack.findIndex(val => val === undefined || val < x);
        return index === -1 ? stack.length : index;
    };

    let minTime = minTimeReq === undefined ? Number.MAX_VALUE : minTimeReq;
    let maxTime = maxTimeReq === undefined ? -Number.MAX_VALUE : maxTimeReq;
    childPairs.forEach(pair => {
        const num = NumCast(pair.layout[timelineFieldKey], Number(StrCast(pair.layout[timelineFieldKey])));
        if (!Number.isNaN(num) && (!minTimeReq || num >= minTimeReq) && (!maxTimeReq || num <= maxTimeReq)) {
            !pivotDateGroups.get(num) && pivotDateGroups.set(num, []);
            pivotDateGroups.get(num)!.push(pair.layout);
            minTime = Math.min(num, minTime);
            maxTime = Math.max(num, maxTime);
        }
    });
    if (curTime !== undefined) {
        if (curTime > maxTime || curTime - minTime > maxTime - curTime) {
            maxTime = curTime + (curTime - minTime);
        } else {
            minTime = curTime - (maxTime - curTime);
        }
    }
    setTimeout(() => {
        pivotDoc[fieldKey + "-timelineMin"] = minTime = minTimeReq ? Math.min(minTimeReq, minTime) : minTime;
        pivotDoc[fieldKey + "-timelineMax"] = maxTime = maxTimeReq ? Math.max(maxTimeReq, maxTime) : maxTime;
    }, 0);

    if (maxTime === minTime) {
        maxTime = minTime + 1;
    }

    const arrayofKeys = Array.from(pivotDateGroups.keys());
    const sortedKeys = arrayofKeys.sort((n1, n2) => n1 - n2);
    const scaling = panelDim[0] / (maxTime - minTime);
    let x = 0;
    let prevKey = Math.floor(minTime);

    if (sortedKeys.length && scaling * (sortedKeys[0] - prevKey) > 25) {
        groupNames.push({ type: "text", text: toLabel(prevKey), x: x, y: 0, height: fontHeight, fontSize, payload: undefined });
    }
    if (!sortedKeys.length && curTime !== undefined) {
        groupNames.push({ type: "text", text: toLabel(curTime), x: (curTime - minTime) * scaling, zIndex: 1000, color: "orange", y: 0, height: fontHeight, fontSize, payload: undefined });
    }

    const pivotAxisWidth = NumCast(pivotDoc.pivotTimeWidth, panelDim[1] / 2.5);
    const stacking: number[] = [];
    let zind = 0;
    sortedKeys.forEach(key => {
        if (curTime !== undefined && curTime > prevKey && curTime <= key) {
            groupNames.push({ type: "text", text: toLabel(curTime), x: (curTime - minTime) * scaling, y: 0, zIndex: 1000, color: "orange", height: fontHeight, fontSize, payload: key });
        }
        const keyDocs = pivotDateGroups.get(key)!;
        x += scaling * (key - prevKey);
        const stack = findStack(x, stacking);
        prevKey = key;
        if (!stack && (curTime === undefined || Math.abs(x - (curTime - minTime) * scaling) > pivotAxisWidth)) {
            groupNames.push({ type: "text", text: toLabel(key), x: x, y: stack * 25, height: fontHeight, fontSize, payload: undefined });
        }
        layoutDocsAtTime(keyDocs, key);
    });
    if (sortedKeys.length && curTime !== undefined && curTime > sortedKeys[sortedKeys.length - 1]) {
        x = (curTime - minTime) * scaling;
        groupNames.push({ type: "text", text: toLabel(curTime), x: x, y: 0, zIndex: 1000, color: "orange", height: fontHeight, fontSize, payload: undefined });
    }
    if (Math.ceil(maxTime - minTime) * scaling > x + 25) {
        groupNames.push({ type: "text", text: toLabel(Math.ceil(maxTime)), x: Math.ceil(maxTime - minTime) * scaling, y: 0, height: fontHeight, fontSize, payload: undefined });
    }

    const divider = { type: "div", color: Cast(Doc.UserDoc().activeScene, Doc, null)?.darkScheme ? "dimGray" : "black", x: 0, y: 0, width: panelDim[0], height: -1, payload: undefined };
    return normalizeResults(panelDim, fontHeight, docMap, poolData, viewDefsToJSX, groupNames, (maxTime - minTime) * scaling, [divider]);

    function layoutDocsAtTime(keyDocs: Doc[], key: number) {
        keyDocs.forEach(doc => {
            const stack = findStack(x, stacking);
            const layoutDoc = Doc.Layout(doc);
            let wid = pivotAxisWidth;
            let hgt = layoutDoc._nativeWidth ? (NumCast(layoutDoc._nativeHeight) / NumCast(layoutDoc._nativeWidth)) * pivotAxisWidth : pivotAxisWidth;
            if (hgt > pivotAxisWidth) {
                hgt = pivotAxisWidth;
                wid = layoutDoc._nativeHeight ? (NumCast(layoutDoc._nativeWidth) / NumCast(layoutDoc._nativeHeight)) * pivotAxisWidth : pivotAxisWidth;
            }
            docMap.set(doc[Id], {
                x: x, y: -Math.sqrt(stack) * pivotAxisWidth / 2 - pivotAxisWidth + (pivotAxisWidth - hgt) / 2,
                zIndex: (curTime === key ? 1000 : zind++),
                highlight: curTime === key,
                width: wid / (Math.max(stack, 1)),
                height: hgt / (Math.max(stack, 1)),
                pair: { layout: doc },
                replica: ""
            });
            stacking[stack] = x + pivotAxisWidth;
        });
    }
}

function normalizeResults(
    panelDim: number[],
    fontHeight: number,
    docMap: Map<string, PoolData>,
    poolData: Map<string, PoolData>,
    viewDefsToJSX: (views: ViewDefBounds[]) => ViewDefResult[],
    groupNames: ViewDefBounds[],
    minWidth: number,
    extras: ViewDefBounds[]
): ViewDefResult[] {
    const grpEles = groupNames.map(gn => ({ x: gn.x, y: gn.y, width: gn.width, height: gn.height }) as ViewDefBounds);
    const docEles = Array.from(docMap.entries()).map(ele => ele[1]);
    const aggBounds = aggregateBounds(grpEles.concat(docEles.map(de => ({ ...de, type: "doc", payload: "" }))).filter(e => e.zIndex !== -99), 0, 0);
    aggBounds.r = Math.max(minWidth, aggBounds.r - aggBounds.x);
    const wscale = panelDim[0] / (aggBounds.r - aggBounds.x);
    let scale = wscale * (aggBounds.b - aggBounds.y) > panelDim[1] ? (panelDim[1]) / (aggBounds.b - aggBounds.y) : wscale;
    if (Number.isNaN(scale)) scale = 1;

    Array.from(docMap.entries()).filter(ele => ele[1].pair).map(ele => {
        const newPosRaw = ele[1];
        if (newPosRaw) {
            const newPos = {
                x: newPosRaw.x * scale,
                y: newPosRaw.y * scale,
                z: newPosRaw.z,
                replica: newPosRaw.replica,
                highlight: newPosRaw.highlight,
                zIndex: newPosRaw.zIndex,
                width: (newPosRaw.width || 0) * scale,
                height: newPosRaw.height! * scale,
                pair: ele[1].pair
            };
            poolData.set(newPos.pair.layout[Id] + (newPos.replica || ""), { transition: "all 1s", ...newPos });
        }
    });

    return viewDefsToJSX(extras.concat(groupNames).map(gname => ({
        type: gname.type,
        text: gname.text,
        x: gname.x * scale,
        y: gname.y * scale,
        color: gname.color,
        width: gname.width === undefined ? undefined : gname.width * scale,
        height: gname.height === -1 ? 1 : gname.type === "text" ? Math.max(fontHeight * scale, (gname.height || 0) * scale) : (gname.height || 0) * scale,
        fontSize: gname.fontSize,
        payload: gname.payload
    })));
}
