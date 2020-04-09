import { computed } from "mobx";
import { observer } from "mobx-react";
import { documentSchema } from "../../new_fields/documentSchemas";
import { InkData, InkField, InkTool } from "../../new_fields/InkField";
import { makeInterface } from "../../new_fields/Schema";
import { Cast, StrCast } from "../../new_fields/Types";
import { DocExtendableComponent } from "./DocComponent";
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
export class InkingStroke extends DocExtendableComponent<FieldViewProps, InkDocument>(InkDocument) {
    public static LayoutString(fieldStr: string) { return FieldView.LayoutString(InkingStroke, fieldStr); }

    @computed get PanelWidth() { return this.props.PanelWidth(); }
    @computed get PanelHeight() { return this.props.PanelHeight(); }

    private analyzeStrokes = () => {
        const data: InkData = Cast(this.dataDoc[this.fieldKey], InkField) ?.inkData ?? [];
        CognitiveServices.Inking.Appliers.ConcatenateHandwriting(this.dataDoc, ["inkAnalysis", "handwriting"], [data]);
    }

    render() {
        TraceMobx();
        const data: InkData = Cast(this.dataDoc[this.fieldKey], InkField) ?.inkData ?? [];
        const xs = data.map(p => p.X);
        const ys = data.map(p => p.Y);
        const left = Math.min(...xs);
        const top = Math.min(...ys);
        const right = Math.max(...xs);
        const bottom = Math.max(...ys);
        const points = InteractionUtils.CreatePolyline(data, left, top, StrCast(this.layoutDoc.color, InkingControl.Instance.selectedColor), this.Document.strokeWidth ?? parseInt(InkingControl.Instance.selectedWidth));
        const width = right - left;
        const height = bottom - top;
        const scaleX = this.PanelWidth / width;
        const scaleY = this.PanelHeight / height;
        return (
            <svg
                width={width}
                height={height}
                style={{
                    transformOrigin: "top left",
                    transform: `scale(${scaleX}, ${scaleY})`,
                    mixBlendMode: this.layoutDoc.tool === InkTool.Highlighter ? "multiply" : "unset",
                    pointerEvents: "all"
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