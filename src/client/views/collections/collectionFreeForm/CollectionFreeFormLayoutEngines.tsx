import { Doc, Field, FieldResult } from "../../../../new_fields/Doc";
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
    width: number;
    height?: number;
    fontSize: number;
}

export interface ViewDefBounds {
    x: number;
    y: number;
    z?: number;
    width: number;
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
    childPairs: { layout: Doc, data?: Doc }[], panelDim: number[], viewDefsToJSX: (views: any) => ViewDefResult[]
) {
    const pivotAxisWidth = NumCast(pivotDoc.pivotWidth, 200);
    const pivotColumnGroups = new Map<FieldResult<Field>, Doc[]>();

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
    numCols = Math.min(panelDim[0] / pivotAxisWidth, numCols);

    const expander = 1.05;
    const gap = .15;
    let x = 0;
    pivotColumnGroups.forEach((val, key) => {
        let y = 0;
        let xCount = 0;
        groupNames.push({
            type: "text",
            text: toLabel(key),
            x,
            y: pivotAxisWidth,
            width: pivotAxisWidth * expander * numCols,
            fontSize: NumCast(pivotDoc.pivotFontSize, 20)
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

    const grpEles = groupNames.map(gn => { return { x: gn.x, y: gn.y, width: gn.width, height: undefined } as PivotData; });
    const docEles = childPairs.map(pair =>
        docMap.get(pair.layout) || { x: NumCast(pair.layout.x), y: NumCast(pair.layout.y), width: NumCast(pair.layout._width), height: NumCast(pair.layout._height) } // new pos is computed pos, or pos written to the document's fields
    );
    const minLabelHeight = 56;
    const aggBounds = aggregateBounds(docEles.concat(grpEles), 0, 0);
    const wscale = panelDim[0] / (aggBounds.r - aggBounds.x);
    const scale = wscale * (aggBounds.b - aggBounds.y) > panelDim[1] - (2 * minLabelHeight) ? (panelDim[1] - (2 * minLabelHeight)) / (aggBounds.b - aggBounds.y) : wscale;
    const centerY = ((panelDim[1] - 2 * minLabelHeight) - (aggBounds.b - aggBounds.y) * scale) / 2;
    const centerX = (panelDim[0] - (aggBounds.r - aggBounds.x) * scale) / 2;

    childPairs.map(pair => {
        const fallbackPos = {
            x: NumCast(pair.layout.x),
            y: NumCast(pair.layout.y),
            z: NumCast(pair.layout.z),
            width: NumCast(pair.layout._width),
            height: NumCast(pair.layout._height)
        };
        const newPosRaw = docMap.get(pair.layout) || fallbackPos; // new pos is computed pos, or pos written to the document's fields
        const newPos = { x: newPosRaw.x * scale + centerX, y: (newPosRaw.y - aggBounds.y) * scale + centerY, z: newPosRaw.z, width: newPosRaw.width * scale, height: newPosRaw.height! * scale };
        const lastPos = poolData.get(pair.layout[Id]); // last computed pos
        if (!lastPos || newPos.x !== lastPos.x || newPos.y !== lastPos.y || newPos.z !== lastPos.z || newPos.width !== lastPos.width || newPos.height !== lastPos.height) {
            runInAction(() => poolData.set(pair.layout[Id], { transition: "transform 1s", ...newPos }));
        }
    });
    return {
        elements: viewDefsToJSX([{ type: "text", text: "", x: 0, y: -aggBounds.y * scale - minLabelHeight, width: panelDim[0], height: panelDim[1], fontSize: 1 }].concat(groupNames.map(gname => {
            return { type: gname.type, text: gname.text, x: gname.x * scale + centerX, y: (gname.y - aggBounds.y) * scale + centerY, width: gname.width * scale, height: Math.max(minLabelHeight, centerY), fontSize: gname.fontSize };
        })))
    };
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
    const pivotAxisWidth = NumCast(pivotDoc.pivotWidth, 200);
    const pivotDateGroups = new Map<number, Doc[]>();

    const timelineFieldKey = Field.toString(pivotDoc.pivotField as Field);
    let minTime = Number.MAX_VALUE, maxTime = Number.MIN_VALUE;
    for (const doc of childDocs) {
        const num = NumCast(doc[timelineFieldKey], Number(StrCast(doc[timelineFieldKey])));
        if (Number.isNaN(num)) continue;
        if (num) {
            !pivotDateGroups.get(num) && pivotDateGroups.set(num, []);
            pivotDateGroups.get(num)!.push(doc);
        }
        minTime = Math.min(num, minTime);
        maxTime = Math.max(num, maxTime);
    }
    minTime = NumCast(pivotDoc[fieldKey + "-timelineMin"], minTime);
    maxTime = NumCast(pivotDoc[fieldKey + "-timelineMax"], maxTime);
    const curTime = Cast(pivotDoc[fieldKey + "-timelineCur"], "number", null);

    const docMap = new Map<Doc, ViewDefBounds>();
    const groupNames: PivotData[] = [];

    const scaling = panelDim[0] / (maxTime - minTime);
    const expander = 1.05;
    let x = 0;
    let prevKey = minTime;
    const sortedKeys = Array.from(pivotDateGroups.keys()).sort();
    let stacking: number[] = [];
    for (let i = 0; i < sortedKeys.length; i++) {
        const key = sortedKeys[i];
        const val = pivotDateGroups.get(key)!;
        val.forEach(d => d.isMinimized = key < minTime || key > maxTime);
        if (key < minTime || key > maxTime) {
            continue;
        }
        x += Math.max(25, scaling * (key - prevKey));
        let stack = 0;
        for (; stack < stacking.length; stack++) {
            if (stacking[stack] === undefined || stacking[stack] < x)
                break;
        }
        prevKey = key;
        groupNames.push({
            type: "text",
            text: toLabel(key),
            x: x,
            y: stack * 25,
            width: pivotAxisWidth * expander,
            height: 35,
            fontSize: NumCast(pivotDoc.pivotFontSize, 20)
        });
        val.forEach((doc, i) => {
            let stack = 0;
            for (; stack < stacking.length; stack++) {
                if (stacking[stack] === undefined || stacking[stack] < x)
                    break;
            }
            const layoutDoc = Doc.Layout(doc);
            let wid = pivotAxisWidth;
            let hgt = layoutDoc._nativeWidth ? (NumCast(layoutDoc._nativeHeight) / NumCast(layoutDoc._nativeWidth)) * pivotAxisWidth : pivotAxisWidth;
            if (hgt > pivotAxisWidth) {
                hgt = pivotAxisWidth;
                wid = layoutDoc._nativeHeight ? (NumCast(layoutDoc._nativeWidth) / NumCast(layoutDoc._nativeHeight)) * pivotAxisWidth : pivotAxisWidth;
            }
            docMap.set(doc, {
                x: x,
                y: - Math.sqrt(stack) * pivotAxisWidth - pivotAxisWidth,
                width: wid,
                height: hgt
            });
            stacking[stack] = x + pivotAxisWidth;
        });
    }

    const grpEles = groupNames.map(gn => { return { x: gn.x, y: gn.y, width: gn.width, height: gn.height } as PivotData; });
    const docEles = childPairs.filter(d => !d.layout.isMinimized).map(pair =>
        docMap.get(pair.layout) || { x: NumCast(pair.layout.x), y: NumCast(pair.layout.y), width: NumCast(pair.layout._width), height: NumCast(pair.layout._height) } // new pos is computed pos, or pos written to the document's fields
    );
    const aggBounds = aggregateBounds(docEles.concat(grpEles), 0, 0);
    const wscale = panelDim[0] / (aggBounds.r - aggBounds.x);
    let scale = wscale * (aggBounds.b - aggBounds.y) > panelDim[1] ? (panelDim[1]) / (aggBounds.b - aggBounds.y) : wscale;
    const centerY = (panelDim[1] - (aggBounds.b - aggBounds.y) * scale) / 2;
    const centerX = (panelDim[0] - (aggBounds.r - aggBounds.x) * scale) / 2;
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
        const newPos = { x: newPosRaw.x * scale, y: newPosRaw.y * scale, z: newPosRaw.z, width: newPosRaw.width * scale, height: newPosRaw.height! * scale };
        const lastPos = poolData.get(pair.layout[Id]); // last computed pos
        if (!lastPos || newPos.x !== lastPos.x || newPos.y !== lastPos.y || newPos.z !== lastPos.z || newPos.width !== lastPos.width || newPos.height !== lastPos.height) {
            runInAction(() => poolData.set(pair.layout[Id], { transition: "transform 1s", ...newPos }));
        }
    });
    return {
        elements: viewDefsToJSX([
            { type: "text", text: "", x: -centerX, y: aggBounds.y * scale - centerY, width: panelDim[0], height: panelDim[1], fontSize: 1 },
            { type: "div", color: "black", x: -centerX, y: 0, width: panelDim[0], height: 1 }
        ].concat(groupNames.map(gname => {
            return { type: gname.type, text: gname.text, x: gname.x * scale, y: gname.y * scale, width: gname.width * scale, height: gname.height! * scale, fontSize: gname.fontSize };
        })))
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
