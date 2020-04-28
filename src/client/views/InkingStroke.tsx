import { observer } from "mobx-react";
import { documentSchema } from "../../new_fields/documentSchemas";
import { InkData, InkField, InkTool } from "../../new_fields/InkField";
import { makeInterface } from "../../new_fields/Schema";
import { Cast, StrCast, NumCast } from "../../new_fields/Types";
import { ViewBoxBaseComponent } from "./DocComponent";
import { InkingControl } from "./InkingControl";
import "./InkingStroke.scss";
import { FieldView, FieldViewProps } from "./nodes/FieldView";
import React = require("react");
import { TraceMobx } from "../../new_fields/util";
import { InteractionUtils } from "../util/InteractionUtils";
import { ContextMenu } from "./ContextMenu";
import { CognitiveServices } from "../cognitive_services/CognitiveServices";
import { faPaintBrush } from "@fortawesome/free-solid-svg-icons";
import { library } from "@fortawesome/fontawesome-svg-core";

library.add(faPaintBrush);

type InkDocument = makeInterface<[typeof documentSchema]>;
const InkDocument = makeInterface(documentSchema);

@observer
export class InkingStroke extends ViewBoxBaseComponent<FieldViewProps, InkDocument>(InkDocument) {
    public static LayoutString(fieldStr: string) { return FieldView.LayoutString(InkingStroke, fieldStr); }

    private analyzeStrokes = () => {
        const data: InkData = Cast(this.dataDoc[this.fieldKey], InkField)?.inkData ?? [];
        CognitiveServices.Inking.Appliers.ConcatenateHandwriting(this.dataDoc, ["inkAnalysis", "handwriting"], [data]);
    }

    render() {
        TraceMobx();
        const data: InkData = Cast(this.dataDoc[this.fieldKey], InkField)?.inkData ?? [];
        const xs = data.map(p => p.X);
        const ys = data.map(p => p.Y);
        const left = Math.min(...xs);
        const top = Math.min(...ys);
        const right = Math.max(...xs);
        const bottom = Math.max(...ys);
        const points = InteractionUtils.CreatePolyline(data, left, top,
            StrCast(this.layoutDoc.color, InkingControl.Instance.selectedColor),
            NumCast(this.layoutDoc.strokeWidth, parseInt(InkingControl.Instance.selectedWidth)));
        const width = right - left;
        const height = bottom - top;
        const scaleX = this.props.PanelWidth() / width;
        const scaleY = this.props.PanelHeight() / height;
        return (
            <svg className="inkingStroke"
                width={width}
                height={height}
                style={{
                    transform: `scale(${scaleX}, ${scaleY})`,
                    mixBlendMode: this.layoutDoc.tool === InkTool.Highlighter ? "multiply" : "unset",
                }}
                onContextMenu={() => {
                    ContextMenu.Instance.addItem({
                        description: "Analyze Stroke",
                        event: this.analyzeStrokes,
                        icon: "paint-brush"
                    });
                }}
            >
                {points}
            </svg>
        );
    }
}