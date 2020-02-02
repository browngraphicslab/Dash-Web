import { Doc, Field, FieldResult, WidthSym, HeightSym } from "../../../../new_fields/Doc";
import { NumCast, StrCast, Cast, DateCast } from "../../../../new_fields/Types";
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
    width?: number;
    height?: number;
    fontSize: number;
}

export interface ViewDefBounds {
    x: number;
    y: number;
    z?: number;
    width?: number;
    height?: number;
    transition?: string;
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
    poolData: ObservableMap<string, any>,
    pivotDoc: Doc,
    childDocs: Doc[],
    childPairs: { layout: Doc, data?: Doc }[],
    panelDim: number[],
    viewDefsToJSX: (views: any) => ViewDefResult[]
) {
    const fieldKey = "data";
    const pivotAxisWidth = NumCast(pivotDoc.pivotWidth, 1000);
    const pivotColumnGroups = new Map<FieldResult<Field>, Doc[]>();
    const fontSize = NumCast(pivotDoc[fieldKey + "-timelineFontSize"], panelDim[1] > 58 ? 20 : Math.max(7, panelDim[1] / 3));

    const pivotFieldKey = toLabel(pivotDoc.pivotField);
    for (const doc of childDocs) {
        const val = Field.toString(doc[pivotFieldKey] as Field);
        if (val) {
            !pivotColumnGroups.get(val) && pivotColumnGroups.set(val, []);
            pivotColumnGroups.get(val)!.push(doc);
        }
    }

    const minSize = Array.from(pivotColumnGroups.entries()).reduce((min, pair) => Math.min(min, pair[1].length), Infinity);
    let numCols = NumCast(pivotDoc.pivotNumColumns, Math.ceil(Math.sqrt(minSize)));
    const docMap = new Map<Doc, ViewDefBounds>();
    const groupNames: PivotData[] = [];
    numCols = Math.min(Math.max(1, panelDim[0] / pivotAxisWidth), numCols);

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
                y: -y,
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
    poolData: ObservableMap<string, any>,
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
    const minTimeReq = Cast(pivotDoc[fieldKey + "-timelineMinReq"], "number", null);
    const maxTimeReq = Cast(pivotDoc[fieldKey + "-timelineMaxReq"], "number", null);
    const curTime = Cast(pivotDoc[fieldKey + "-timelineCur"], "number", null);
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

    const pivotAxisWidth = NumCast(pivotDoc.pivotTimeWidth, panelDim[1] / 2.5);
    let stacking: number[] = [];
    sortedKeys.forEach(key => {
        const keyDocs = pivotDateGroups.get(key)!;
        keyDocs.forEach(d => d.isMinimized = false);
        x += scaling * (key - prevKey);
        const stack = findStack(x, stacking);
        prevKey = key;
        !stack && groupNames.push({ type: "text", text: key.toString(), x: x, y: stack * 25, height: fontHeight, fontSize });
        keyDocs.forEach(doc => {
            const stack = findStack(x, stacking);
            const layoutDoc = Doc.Layout(doc);
            let wid = pivotAxisWidth;
            let hgt = layoutDoc._nativeWidth ? (NumCast(layoutDoc._nativeHeight) / NumCast(layoutDoc._nativeWidth)) * pivotAxisWidth : pivotAxisWidth;
            if (hgt > pivotAxisWidth) {
                hgt = pivotAxisWidth;
                wid = layoutDoc._nativeHeight ? (NumCast(layoutDoc._nativeWidth) / NumCast(layoutDoc._nativeHeight)) * pivotAxisWidth : pivotAxisWidth;
            }
            docMap.set(doc, { x: x, y: - Math.sqrt(stack) * pivotAxisWidth / 2 - pivotAxisWidth, width: wid, height: hgt });
            stacking[stack] = x + pivotAxisWidth;
        });
    });
    if (Math.ceil(maxTime - minTime) * scaling > x + 25) {
        groupNames.push({ type: "text", text: Math.ceil(maxTime).toString(), x: Math.ceil(maxTime - minTime) * scaling, y: 0, height: fontHeight, fontSize });
    }

    const divider = { type: "div", color: "black", x: 0, y: 0, width: panelDim[0], height: 1 } as any;
    return normalizeResults(panelDim, fontHeight, childPairs, docMap, poolData, viewDefsToJSX, groupNames, (maxTime - minTime) * scaling, [divider]);
}

function normalizeResults(panelDim: number[], fontHeight: number, childPairs: { data?: Doc, layout: Doc }[], docMap: any,
    poolData: any, viewDefsToJSX: any, groupNames: PivotData[], minWidth: number, extras: any[]) {

    const grpEles = groupNames.map(gn => ({ x: gn.x, y: gn.y, height: gn.height }) as PivotData);
    const docEles = childPairs.filter(d => !d.layout.isMinimized).map(pair =>
        docMap.get(pair.layout) || { x: NumCast(pair.layout.x), y: NumCast(pair.layout.y), width: pair.layout[WidthSym](), height: pair.layout[HeightSym]() } as PivotData // new pos is computed pos, or pos written to the document's fields
    );
    const aggBounds = aggregateBounds(docEles.concat(grpEles), 0, 0);
    aggBounds.r = Math.max(minWidth, aggBounds.r - aggBounds.x);
    const wscale = panelDim[0] / (aggBounds.r - aggBounds.x);
    let scale = wscale * (aggBounds.b - aggBounds.y) > panelDim[1] ? (panelDim[1]) / (aggBounds.b - aggBounds.y) : wscale;
    if (Number.isNaN(scale)) scale = 1;

    childPairs.map(pair => {
        const fallbackPos = {
            x: NumCast(pair.layout.x),
            y: NumCast(pair.layout.y),
            z: NumCast(pair.layout.z),
            width: NumCast(pair.layout._width),
            height: NumCast(pair.layout._height)
        };
        const newPosRaw = docMap.get(pair.layout) || fallbackPos; // new pos is computed pos, or pos written to the document's fields
        const newPos = { x: newPosRaw.x * scale, y: newPosRaw.y * scale, z: newPosRaw.z, width: (newPosRaw.width || 0) * scale, height: newPosRaw.height! * scale };
        const lastPos = poolData.get(pair.layout[Id]); // last computed pos
        if (!lastPos || newPos.x !== lastPos.x || newPos.y !== lastPos.y || newPos.z !== lastPos.z || newPos.width !== lastPos.width || newPos.height !== lastPos.height) {
            runInAction(() => poolData.set(pair.layout[Id], { transition: "transform 1s", ...newPos }));
        }
    });

    return {
        elements: viewDefsToJSX(extras.concat(groupNames.map(gname => ({
            type: gname.type,
            text: gname.text,
            x: gname.x * scale,
            y: gname.y * scale,
            width: gname.width === undefined ? undefined : gname.width * scale,
            height: Math.max(fontHeight, gname.height! * scale),
            // height: gname.height === undefined ? undefined : gname.height * scale,
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
