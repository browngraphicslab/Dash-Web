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

type InkDocument = makeInterface<[typeof documentSchema]>;
const InkDocument = makeInterface(documentSchema);

export function CreatePolyline(points: { x: number, y: number }[], left: number, top: number, color?: string, width?: number) {
    let pts = points.reduce((acc: string, pt: { x: number, y: number }) => acc + `${pt.x - left},${pt.y - top} `, "");
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
        // let pathData = this.parseData(this.props.line);
        let data: InkData = Cast(this.Document.data, InkField)?.inkData ?? [];
        let xs = data.map(p => p.x);
        let ys = data.map(p => p.y);
        let left = Math.min(...xs);
        let top = Math.min(...ys);
        let right = Math.max(...xs);
        let bottom = Math.max(...ys);
        let points = CreatePolyline(data, 0, 0, this.Document.color, this.Document.strokeWidth);
        let width = right - left;
        let height = bottom - top;
        let scaleX = this.PanelWidth / width;
        let scaleY = this.PanelHeight / height;
        // let pathlength = this.props.count; // bcz: this is needed to force reactions to the line's data changes
        return (
            <svg width={width} height={height} style={{
                transformOrigin: "top left",
                transform: `translate(${left}px, ${top}px) scale(${scaleX}, ${scaleY})`,
                mixBlendMode: this.Document.tool === InkTool.Highlighter ? "multiply" : "unset",
                pointerEvents: "all"
            }} onTouchStart={this.onTouchStart}>
                {points}
            </svg>
        );
    }
}