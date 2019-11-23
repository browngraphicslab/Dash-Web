import { Doc, Field, FieldResult } from "../../../../new_fields/Doc";
import { NumCast, StrCast, Cast } from "../../../../new_fields/Types";
import { ScriptBox } from "../../ScriptBox";
import { CompileScript } from "../../../util/Scripting";
import { ScriptField } from "../../../../new_fields/ScriptField";
import { OverlayView, OverlayElementOptions } from "../../OverlayView";
import { emptyFunction } from "../../../../Utils";
import React = require("react");
import { ObservableMap, runInAction } from "mobx";
import { Id } from "../../../../new_fields/FieldSymbols";

interface PivotData {
    type: string;
    text: string;
    x: number;
    y: number;
    width: number;
    height: number;
    fontSize: number;
}

export interface ViewDefBounds {
    x: number;
    y: number;
    z?: number;
    width: number;
    height: number;
    transition?: string;
}

export interface ViewDefResult {
    ele: JSX.Element;
    bounds?: ViewDefBounds;
}

export function computePivotLayout(poolData: ObservableMap<string, any>, pivotDoc: Doc, childDocs: Doc[], childPairs: { layout: Doc, data?: Doc }[], viewDefsToJSX: (views: any) => ViewDefResult[]) {
    const pivotAxisWidth = NumCast(pivotDoc.pivotWidth, 200);
    const pivotColumnGroups = new Map<FieldResult<Field>, Doc[]>();

    for (const doc of childDocs) {
        const val = doc[StrCast(pivotDoc.pivotField, "title")];
        if (val) {
            !pivotColumnGroups.get(val) && pivotColumnGroups.set(val, []);
            pivotColumnGroups.get(val)!.push(doc);
        }
    }

    const minSize = Array.from(pivotColumnGroups.entries()).reduce((min, pair) => Math.min(min, pair[1].length), Infinity);
    const numCols = NumCast(pivotDoc.pivotNumColumns, Math.ceil(Math.sqrt(minSize)));
    const docMap = new Map<Doc, ViewDefBounds>();
    const groupNames: PivotData[] = [];

    const expander = 1.05;
    const gap = .15;
    let x = 0;
    pivotColumnGroups.forEach((val, key) => {
        let y = 0;
        let xCount = 0;
        groupNames.push({
            type: "text",
            text: String(key),
            x,
            y: pivotAxisWidth + 50,
            width: pivotAxisWidth * expander * numCols,
            height: 100,
            fontSize: NumCast(pivotDoc.pivotFontSize, 10)
        });
        for (const doc of val) {
            let layoutDoc = Doc.Layout(doc);
            let wid = pivotAxisWidth;
            let hgt = layoutDoc.nativeWidth ? (NumCast(layoutDoc.nativeHeight) / NumCast(layoutDoc.nativeWidth)) * pivotAxisWidth : pivotAxisWidth;
            if (hgt > pivotAxisWidth) {
                hgt = pivotAxisWidth;
                wid = layoutDoc.nativeHeight ? (NumCast(layoutDoc.nativeWidth) / NumCast(layoutDoc.nativeHeight)) * pivotAxisWidth : pivotAxisWidth;
            }
            docMap.set(doc, {
                x: x + xCount * pivotAxisWidth * expander + (pivotAxisWidth - wid) / 2,
                y: -y,
                width: wid,
                height: hgt
            });
            xCount++;
            if (xCount >= numCols) {
                xCount = (pivotAxisWidth - wid) / 2;
                y += pivotAxisWidth * expander;
            }
        }
        x += pivotAxisWidth * (numCols * expander + gap);
    });

    childPairs.map(pair => {
        let defaultPosition = {
            x: NumCast(pair.layout.x),
            y: NumCast(pair.layout.y),
            z: NumCast(pair.layout.z),
            width: NumCast(pair.layout.width),
            height: NumCast(pair.layout.height)
        };
        const pos = docMap.get(pair.layout) || defaultPosition;
        let data = poolData.get(pair.layout[Id]);
        if (!data || pos.x !== data.x || pos.y !== data.y || pos.z !== data.z || pos.width !== data.width || pos.height !== data.height) {
            runInAction(() => poolData.set(pair.layout[Id], { transition: "transform 1s", ...pos }));
        }
    });
    return { elements: viewDefsToJSX(groupNames) };
}

export function AddCustomFreeFormLayout(doc: Doc, dataKey: string): () => void {
    return () => {
        let addOverlay = (key: "arrangeScript" | "arrangeInit", options: OverlayElementOptions, params?: Record<string, string>, requiredType?: string) => {
            let overlayDisposer: () => void = emptyFunction; // filled in below after we have a reference to the scriptingBox
            const scriptField = Cast(doc[key], ScriptField);
            let scriptingBox = <ScriptBox initialText={scriptField && scriptField.script.originalScript}
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
