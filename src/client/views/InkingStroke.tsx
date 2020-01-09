import { computed } from "mobx";
import { observer } from "mobx-react";
import { documentSchema } from "../../new_fields/documentSchemas";
import { InkData, InkField, InkTool } from "../../new_fields/InkField";
import { makeInterface } from "../../new_fields/Schema";
import { Cast } from "../../new_fields/Types";
import { DocExtendableComponent } from "./DocComponent";
import { InkingControl } from "./InkingControl";
import "./InkingStroke.scss";
import { FieldView, FieldViewProps } from "./nodes/FieldView";
import React = require("react");
import { TraceMobx } from "../../new_fields/util";

type InkDocument = makeInterface<[typeof documentSchema]>;
const InkDocument = makeInterface(documentSchema);

export function CreatePolyline(points: { X: number, Y: number }[], left: number, top: number, color?: string, width?: number) {
    const pts = points.reduce((acc: string, pt: { X: number, Y: number }) => acc + `${pt.X - left},${pt.Y - top} `, "");
    return (
        <polyline
            points={pts}
            style={{
                fill: "none",
                stroke: color ?? InkingControl.Instance.selectedColor,
                strokeWidth: width ?? InkingControl.Instance.selectedWidth
            }}
        />
    );
}

@observer
export class InkingStroke extends DocExtendableComponent<FieldViewProps, InkDocument>(InkDocument) {
    public static LayoutString(fieldStr: string) { return FieldView.LayoutString(InkingStroke, fieldStr); }

    @computed get PanelWidth() { return this.props.PanelWidth(); }
    @computed get PanelHeight() { return this.props.PanelHeight(); }

    render() {
        TraceMobx();
        const data: InkData = Cast(this.Document.data, InkField)?.inkData ?? [];
        const xs = data.map(p => p.X);
        const ys = data.map(p => p.Y);
        const left = Math.min(...xs);
        const top = Math.min(...ys);
        const right = Math.max(...xs);
        const bottom = Math.max(...ys);
        const points = CreatePolyline(data, left, top, this.Document.color, this.Document.strokeWidth);
        const width = right - left;
        const height = bottom - top;
        const scaleX = this.PanelWidth / width;
        const scaleY = this.PanelHeight / height;
        return (
            <svg width={width} height={height} style={{
                transformOrigin: "top left",
                transform: `scale(${scaleX}, ${scaleY})`,
                mixBlendMode: this.Document.tool === InkTool.Highlighter ? "multiply" : "unset",
                pointerEvents: "all"
            }}>
                {points}
            </svg>
        );
    }
}