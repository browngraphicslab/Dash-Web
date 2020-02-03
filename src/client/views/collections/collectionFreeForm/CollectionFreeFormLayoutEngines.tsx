import { Doc, Field, FieldResult, WidthSym, HeightSym } from "../../../../new_fields/Doc";
import { NumCast, StrCast, Cast, DateCast, BoolCast } from "../../../../new_fields/Types";
import { ScriptBox } from "../../ScriptBox";
import { CompileScript } from "../../../util/Scripting";
import { ScriptField } from "../../../../new_fields/ScriptField";
import { OverlayView, OverlayElementOptions } from "../../OverlayView";
import { emptyFunction, aggregateBounds } from "../../../../Utils";
import React = require("react");
import { ObservableMap, runInAction } from "mobx";
import { Id, ToString } from "../../../../new_fields/FieldSymbols";
import { ObjectField } from "../../../../new_fields/ObjectField";
import { RefField } from "../../../../new_fields/RefField";

interface PivotData {
    type: string;
    text: string;
    x: number;
    y: number;
    zIndex?: number;
    width?: number;
    height?: number;
    fontSize: number;
    color?: string;
}

export interface ViewDefBounds {
    x: number;
    y: number;
    z?: number;
    zIndex?: number;
    width?: number;
    height?: number;
    transition?: string;
    highlight?: boolean;
}

export interface PoolData {
    x?: number,
    y?: number,
    z?: number,
    zIndex?: number,
    width?: number,
    height?: number,
    color?: string,
    transition?: string,
    highlight?: boolean,
    state?: any
}

export interface ViewDefResult {
    ele: JSX.Element;
    bounds?: ViewDefBounds;
}

function toLabel(target: FieldResult<Field>) {
    if (target instanceof ObjectField || target instanceof RefField) {
        return target[ToString]();
    }
    return String(target);
}

export function computePivotLayout(
    poolData: ObservableMap<string, PoolData>,
    pivotDoc: Doc,
    childDocs: Doc[],
    childPairs: { layout: Doc, data?: Doc }[],
    panelDim: number[],
    viewDefsToJSX: (views: any) => ViewDefResult[]
) {
    const fieldKey = "data";
    const pivotColumnGroups = new Map<FieldResult<Field>, Doc[]>();
    const fontSize = NumCast(pivotDoc[fieldKey + "-timelineFontSize"], panelDim[1] > 58 ? 20 : Math.max(7, panelDim[1] / 3));

    let maxInColumn = 1;
    const pivotFieldKey = toLabel(pivotDoc.pivotField);
    for (const doc of childDocs) {
        const val = Field.toString(doc[pivotFieldKey] as Field);
        if (val) {
            !pivotColumnGroups.get(val) && pivotColumnGroups.set(val, []);
            pivotColumnGroups.get(val)!.push(doc);
            maxInColumn = Math.max(maxInColumn, pivotColumnGroups.get(val)?.length || 0);
        }
    }

    const colWidth = panelDim[0] / pivotColumnGroups.size;
    const colHeight = panelDim[1];
    const pivotAxisWidth = Math.sqrt(colWidth * colHeight / maxInColumn);
    const numCols = Math.max(Math.round(colWidth / pivotAxisWidth), 1);

    const docMap = new Map<Doc, ViewDefBounds>();
    const groupNames: PivotData[] = [];;

    const expander = 1.05;
    const gap = .15;
    let x = 0;
    let max_text = 60;
    pivotColumnGroups.forEach((val, key) => {
        let y = 0;
        let xCount = 0;
        const text = toLabel(key);
        max_text = Math.max(max_text, Math.min(500, text.length));
        groupNames.push({
            type: "text",
            text,
            x,
            y: pivotAxisWidth,
            width: pivotAxisWidth * expander * numCols,
            height: max_text,
            fontSize
        });
        for (const doc of val) {
            const layoutDoc = Doc.Layout(doc);
            let wid = pivotAxisWidth;
            let hgt = layoutDoc._nativeWidth ? (NumCast(layoutDoc._nativeHeight) / NumCast(layoutDoc._nativeWidth)) * pivotAxisWidth : pivotAxisWidth;
            if (hgt > pivotAxisWidth) {
                hgt = pivotAxisWidth;
                wid = layoutDoc._nativeHeight ? (NumCast(layoutDoc._nativeWidth) / NumCast(layoutDoc._nativeHeight)) * pivotAxisWidth : pivotAxisWidth;
            }
            docMap.set(doc, {
                x: x + xCount * pivotAxisWidth * expander + (pivotAxisWidth - wid) / 2 + (val.length < numCols ? (numCols - val.length) * pivotAxisWidth / 2 : 0),
                y: -y + (pivotAxisWidth - hgt) / 2,
                width: wid,
                height: hgt
            });
            xCount++;
            if (xCount >= numCols) {
                xCount = 0;
                y += pivotAxisWidth * expander;
            }
        }
        x += pivotAxisWidth * (numCols * expander + gap);
    });

    return normalizeResults(panelDim, max_text, childPairs, docMap, poolData, viewDefsToJSX, groupNames, 0, []);
}


export function computeTimelineLayout(
    poolData: ObservableMap<string, PoolData>,
    pivotDoc: Doc,
    childDocs: Doc[],
    childPairs: { layout: Doc, data?: Doc }[],
    panelDim: number[],
    viewDefsToJSX: (views: any) => ViewDefResult[]
) {
    const fieldKey = "data";
    const pivotDateGroups = new Map<number, Doc[]>();
    const docMap = new Map<Doc, ViewDefBounds>();
    const groupNames: PivotData[] = [];
    const timelineFieldKey = Field.toString(pivotDoc.pivotField as Field);
    const curTime = Cast(pivotDoc[fieldKey + "-timelineCur"], "number", null);
    const curTimeSpan = Cast(pivotDoc[fieldKey + "-timelineSpan"], "number", null);
    const minTimeReq = curTime === undefined ? Cast(pivotDoc[fieldKey + "-timelineMinReq"], "number", null) : curTimeSpan && (curTime - curTimeSpan);
    const maxTimeReq = curTime === undefined ? Cast(pivotDoc[fieldKey + "-timelineMaxReq"], "number", null) : curTimeSpan && (curTime + curTimeSpan);
    const fontSize = NumCast(pivotDoc[fieldKey + "-timelineFontSize"], panelDim[1] > 58 ? 20 : Math.max(7, panelDim[1] / 3));
    const fontHeight = panelDim[1] > 58 ? 30 : panelDim[1] / 2;
    const findStack = (time: number, stack: number[]) => {
        const index = stack.findIndex(val => val === undefined || val < x);
        return index === -1 ? stack.length : index;
    }

    let minTime = Number.MAX_VALUE;
    let maxTime = Number.MIN_VALUE;
    childDocs.map(doc => {
        const num = NumCast(doc[timelineFieldKey], Number(StrCast(doc[timelineFieldKey])));
        if (Number.isNaN(num) || (minTimeReq && num < minTimeReq) || (maxTimeReq && num > maxTimeReq)) {
            doc.isMinimized = true;
        } else {
            !pivotDateGroups.get(num) && pivotDateGroups.set(num, []);
            pivotDateGroups.get(num)!.push(doc);
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
    pivotDoc[fieldKey + "-timelineMin"] = minTime = minTimeReq ? Math.min(minTimeReq, minTime) : minTime;
    pivotDoc[fieldKey + "-timelineMax"] = maxTime = maxTimeReq ? Math.max(maxTimeReq, maxTime) : maxTime;

    const arrayofKeys = Array.from(pivotDateGroups.keys());
    const sortedKeys = arrayofKeys.sort((n1, n2) => n1 - n2);
    const scaling = panelDim[0] / (maxTime - minTime);
    let x = 0;
    let prevKey = Math.floor(minTime);

    if (sortedKeys.length && scaling * (sortedKeys[0] - prevKey) > 25) {
        groupNames.push({ type: "text", text: prevKey.toString(), x: x, y: 0, height: fontHeight, fontSize });
    }
    if (!sortedKeys.length && curTime !== undefined) {
        groupNames.push({ type: "text", text: curTime.toString(), x: (curTime - minTime) * scaling, zIndex: 1000, color: "orange", y: 0, height: fontHeight, fontSize });
    }

    const pivotAxisWidth = NumCast(pivotDoc.pivotTimeWidth, panelDim[1] / 2.5);
    let stacking: number[] = [];
    let zind = 0;
    sortedKeys.forEach(key => {
        if (curTime !== undefined && curTime > prevKey && curTime <= key) {
            groupNames.push({ type: "text", text: curTime.toString(), x: (curTime - minTime) * scaling, y: 0, zIndex: 1000, color: "orange", height: fontHeight, fontSize });
        }
        const keyDocs = pivotDateGroups.get(key)!;
        keyDocs.forEach(d => d.isMinimized = false);
        x += scaling * (key - prevKey);
        const stack = findStack(x, stacking);
        prevKey = key;
        !stack && (curTime === undefined || Math.abs(x - (curTime - minTime) * scaling) > pivotAxisWidth) && groupNames.push({ type: "text", text: key.toString(), x: x, y: stack * 25, height: fontHeight, fontSize });
        layoutDocsAtTime(keyDocs, key);
    });
    if (sortedKeys.length && curTime > sortedKeys[sortedKeys.length - 1]) {
        x = (curTime - minTime) * scaling;
        groupNames.push({ type: "text", text: curTime.toString(), x: x, y: 0, zIndex: 1000, color: "orange", height: fontHeight, fontSize });
    }
    if (Math.ceil(maxTime - minTime) * scaling > x + 25) {
        groupNames.push({ type: "text", text: Math.ceil(maxTime).toString(), x: Math.ceil(maxTime - minTime) * scaling, y: 0, height: fontHeight, fontSize });
    }

    const divider = { type: "div", color: "black", x: 0, y: 0, width: panelDim[0], height: 1 } as any;
    return normalizeResults(panelDim, fontHeight, childPairs, docMap, poolData, viewDefsToJSX, groupNames, (maxTime - minTime) * scaling, [divider]);

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
            docMap.set(doc, {
                x: x, y: -Math.sqrt(stack) * pivotAxisWidth / 2 - pivotAxisWidth + (pivotAxisWidth - hgt) / 2,
                zIndex: (curTime === key ? 1000 : zind++), highlight: curTime === key, width: wid / (Math.max(stack, 1)), height: hgt
            });
            stacking[stack] = x + pivotAxisWidth;
        });
    }
}

function normalizeResults(panelDim: number[], fontHeight: number, childPairs: { data?: Doc, layout: Doc }[], docMap: Map<Doc, ViewDefBounds>,
    poolData: ObservableMap<string, PoolData>, viewDefsToJSX: (views: any) => ViewDefResult[], groupNames: PivotData[], minWidth: number, extras: PivotData[]) {

    const grpEles = groupNames.map(gn => ({ x: gn.x, y: gn.y, height: gn.height }) as PivotData);
    const docEles = childPairs.filter(d => !d.layout.isMinimized).map(pair => docMap.get(pair.layout) as PivotData);
    const aggBounds = aggregateBounds(docEles.concat(grpEles), 0, 0);
    aggBounds.r = Math.max(minWidth, aggBounds.r - aggBounds.x);
    const wscale = panelDim[0] / (aggBounds.r - aggBounds.x);
    let scale = wscale * (aggBounds.b - aggBounds.y) > panelDim[1] ? (panelDim[1]) / (aggBounds.b - aggBounds.y) : wscale;
    if (Number.isNaN(scale)) scale = 1;

    childPairs.filter(d => !d.layout.isMinimized).map(pair => {
        const newPosRaw = docMap.get(pair.layout);
        if (newPosRaw) {
            const newPos = {
                x: newPosRaw.x * scale,
                y: newPosRaw.y * scale,
                z: newPosRaw.z,
                highlight: newPosRaw.highlight,
                zIndex: newPosRaw.zIndex,
                width: (newPosRaw.width || 0) * scale,
                height: newPosRaw.height! * scale
            };
            const lastPos = poolData.get(pair.layout[Id]); // last computed pos
            if (!lastPos || newPos.x !== lastPos.x || newPos.y !== lastPos.y || newPos.z !== lastPos.z || newPos.zIndex !== lastPos.zIndex || newPos.width !== lastPos.width || newPos.height !== lastPos.height) {
                runInAction(() => poolData.set(pair.layout[Id], { transition: "transform 1s", ...newPos }));
            }
        }
    });

    return {
        elements: viewDefsToJSX(extras.concat(groupNames.map(gname => ({
            type: gname.type,
            text: gname.text,
            x: gname.x * scale,
            y: gname.y * scale,
            color: gname.color,
            width: gname.width === undefined ? undefined : gname.width * scale,
            height: Math.max(fontHeight, (gname.height || 0) * scale),
            fontSize: gname.fontSize
        }))))
    };
}

export function AddCustomFreeFormLayout(doc: Doc, dataKey: string): () => void {
    return () => {
        const addOverlay = (key: "arrangeScript" | "arrangeInit", options: OverlayElementOptions, params?: Record<string, string>, requiredType?: string) => {
            let overlayDisposer: () => void = emptyFunction; // filled in below after we have a reference to the scriptingBox
            const scriptField = Cast(doc[key], ScriptField);
            const scriptingBox = <ScriptBox initialText={scriptField && scriptField.script.originalScript}
                // tslint:disable-next-line: no-unnecessary-callback-wrapper
                onCancel={() => overlayDisposer()}  // don't get rid of the function wrapper-- we don't want to use the current value of overlayDiposer, but the one set below
                onSave={(text, onError) => {
                    const script = CompileScript(text, { params, requiredType, typecheck: false });
                    if (!script.compiled) {
                        onError(script.errors.map(error => error.messageText).join("\n"));
                    } else {
                        doc[key] = new ScriptField(script);
                        overlayDisposer();
                    }
                }} />;
            overlayDisposer = OverlayView.Instance.addWindow(scriptingBox, options);
        };
        addOverlay("arrangeInit", { x: 400, y: 100, width: 400, height: 300, title: "Layout Initialization" }, { collection: "Doc", docs: "Doc[]" }, undefined);
        addOverlay("arrangeScript", { x: 400, y: 500, width: 400, height: 300, title: "Layout Script" }, { doc: "Doc", index: "number", collection: "Doc", state: "any", docs: "Doc[]" }, "{x: number, y: number, width?: number, height?: number}");
    };
}
