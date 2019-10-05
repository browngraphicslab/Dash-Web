import { Doc, Field, FieldResult } from "../../../../new_fields/Doc";
import { NumCast, StrCast, Cast } from "../../../../new_fields/Types";
import { ScriptBox } from "../../ScriptBox";
import { CompileScript } from "../../../util/Scripting";
import { ScriptField } from "../../../../new_fields/ScriptField";
import { OverlayView, OverlayElementOptions } from "../../OverlayView";
import { emptyFunction } from "../../../../Utils";
import React = require("react");

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

export function computePivotLayout(pivotDoc: Doc, childDocs: Doc[], childPairs: { layout: Doc, data?: Doc }[], viewDefsToJSX: (views: any) => ViewDefResult[]) {
    let layoutPoolData: Map<{ layout: Doc, data?: Doc }, any> = new Map();
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

    let x = 0;
    pivotColumnGroups.forEach((val, key) => {
        let y = 0;
        let xCount = 0;
        groupNames.push({
            type: "text",
            text: String(key),
            x,
            y: pivotAxisWidth + 50,
            width: pivotAxisWidth * 1.25 * numCols,
            height: 100,
            fontSize: NumCast(pivotDoc.pivotFontSize, 10)
        });
        for (const doc of val) {
            docMap.set(doc, {
                x: x + xCount * pivotAxisWidth * 1.25,
                y: -y,
                width: pivotAxisWidth,
                height: doc.nativeWidth ? (NumCast(doc.nativeHeight) / NumCast(doc.nativeWidth)) * pivotAxisWidth : pivotAxisWidth
            });
            xCount++;
            if (xCount >= numCols) {
                xCount = 0;
                y += pivotAxisWidth * 1.25;
            }
        }
        x += pivotAxisWidth * 1.25 * (numCols + 1);
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
        layoutPoolData.set(pair, { transition: "transform 1s", ...pos });
    });
    return { map: layoutPoolData, elements: viewDefsToJSX(groupNames) };
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
