import { library } from "@fortawesome/fontawesome-svg-core";
import { faPaintBrush } from "@fortawesome/free-solid-svg-icons";
import { observable, runInAction } from "mobx";
import { observer } from "mobx-react";
import { documentSchema } from "../../fields/documentSchemas";
import { InkData, InkField, InkTool } from "../../fields/InkField";
import { makeInterface } from "../../fields/Schema";
import { Cast, StrCast } from "../../fields/Types";
import { TraceMobx } from "../../fields/util";
import { CognitiveServices } from "../cognitive_services/CognitiveServices";
import { InteractionUtils } from "../util/InteractionUtils";
import { ContextMenu } from "./ContextMenu";
import { ViewBoxBaseComponent } from "./DocComponent";
import "./InkingStroke.scss";
import { FieldView, FieldViewProps } from "./nodes/FieldView";
import React = require("react");

library.add(faPaintBrush);

type InkDocument = makeInterface<[typeof documentSchema]>;
const InkDocument = makeInterface(documentSchema);

@observer
export class InkingStroke extends ViewBoxBaseComponent<FieldViewProps, InkDocument>(InkDocument) {
    public static LayoutString(fieldStr: string) { return FieldView.LayoutString(InkingStroke, fieldStr); }
    @observable public static InkColor: string;
    @observable public static InkWidth: string;
    @observable public static InkBezierApprox: string;
    @observable public static InkShape: string;

    constructor(props: any) {
        super(props);
        if (InkingStroke.InkBezierApprox === undefined) {
            runInAction(() => {
                InkingStroke.InkBezierApprox = "";
                InkingStroke.InkWidth = "1";
                InkingStroke.InkColor = "black";
                InkingStroke.InkShape = "";
            });
        }
    }

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
        const width = right - left;
        const height = bottom - top;
        const scaleX = this.props.PanelWidth() / width;
        const scaleY = this.props.PanelHeight() / height;
        const points = InteractionUtils.CreatePolyline(data, left, top,
            StrCast(this.layoutDoc.color, InkingStroke.InkColor || "black"),
            StrCast(this.layoutDoc.strokeWidth, InkingStroke.InkWidth || "1"),
            StrCast(this.layoutDoc.strokeBezier, InkingStroke.InkBezierApprox || ""), scaleX, scaleY, "");
        return (
            <svg className="inkingStroke"
                width={width}
                height={height}
                style={{ mixBlendMode: this.layoutDoc.tool === InkTool.Highlighter ? "multiply" : "unset" }}
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