import React = require("react");
import { action, computed, reaction } from "mobx";
import { observer } from "mobx-react";
import { Utils as DashUtils } from '../../../Utils';
import { NominalVisualBinRange } from "../model/binRanges/NominalVisualBinRange";
import "../utils/Extensions";
import { StyleConstants } from "../utils/StyleContants";
import { HistogramBox } from "./HistogramBox";
import "./HistogramLabelPrimitives.scss";
import { HistogramPrimitivesProps } from "./HistogramBoxPrimitives";

@observer
export class HistogramLabelPrimitives extends React.Component<HistogramPrimitivesProps> {
    componentDidMount() {
        reaction(() => [this.props.HistoBox.PanelWidth, this.props.HistoBox.SizeConverter.LeftOffset, this.props.HistoBox.VisualBinRanges.length],
            (fields) => HistogramLabelPrimitives.computeLabelAngle(fields[0], fields[1], this.props.HistoBox), { fireImmediately: true });
    }

    @action
    static computeLabelAngle(panelWidth: number, leftOffset: number, histoBox: HistogramBox) {
        const textWidth = 30;
        if (panelWidth > 0 && histoBox.VisualBinRanges.length && histoBox.VisualBinRanges[0] instanceof NominalVisualBinRange) {
            let space = (panelWidth - leftOffset * 2) / histoBox.VisualBinRanges[0].GetBins().length;
            histoBox.SizeConverter.SetLabelAngle(Math.min(Math.PI / 2, Math.max(Math.PI / 6, textWidth / space * Math.PI / 2)));
        } else if (histoBox.SizeConverter.LabelAngle) {
            histoBox.SizeConverter.SetLabelAngle(0);
        }
    }
    @computed get xaxislines() { return this.renderGridLinesAndLabels(0); }
    @computed get yaxislines() { return this.renderGridLinesAndLabels(1); }

    private renderGridLinesAndLabels(axis: number) {
        let sc = this.props.HistoBox.SizeConverter;
        let vb = this.props.HistoBox.VisualBinRanges;
        if (!vb.length || !sc.Initialized) {
            return (null);
        }
        let dim = (axis === 0 ? this.props.HistoBox.PanelWidth : this.props.HistoBox.PanelHeight) / ((axis === 0 && vb[axis] instanceof NominalVisualBinRange) ?
            (12 + 5) : //  (<number>FontStyles.AxisLabel.fontSize + 5)));
            sc.MaxLabelSizes[axis].coords[axis] + 5);

        let labels = vb[axis].GetLabels();
        return labels.reduce((prims, binLabel, i) => {
            let r = sc.DataToScreenRange(binLabel.minValue!, binLabel.maxValue!, axis);
            if (i % Math.ceil(labels.length / dim) === 0 && binLabel.label) {
                const label = binLabel.label.Truncate(StyleConstants.MAX_CHAR_FOR_HISTOGRAM_LABELS, "...");
                const textHeight = 14; const textWidth = 30;
                let xStart = (axis === 0 ? r.xFrom + (r.xTo - r.xFrom) / 2.0 : r.xFrom - 10 - textWidth);
                let yStart = (axis === 1 ? r.yFrom - textHeight / 2 : r.yFrom);

                if (axis === 0 && vb[axis] instanceof NominalVisualBinRange) {
                    let space = (r.xTo - r.xFrom) / sc.RenderDimension * this.props.HistoBox.PanelWidth;
                    xStart += Math.max(textWidth / 2, (1 - textWidth / space) * textWidth / 2) - textHeight / 2;
                }

                let xPercent = axis === 1 ? `${xStart}px` : `${xStart / sc.RenderDimension * 100}%`;
                let yPercent = axis === 0 ? `${this.props.HistoBox.PanelHeight - sc.BottomOffset - textHeight}px` : `${yStart / sc.RenderDimension * 100}%`;

                prims.push(
                    <div className="histogramLabelPrimitives-placer" key={DashUtils.GenerateGuid()} style={{ transform: `translate(${xPercent}, ${yPercent})` }}>
                        <div className="histogramLabelPrimitives-gridlabel" style={{ transform: `rotate(${axis === 0 ? sc.LabelAngle : 0}rad)` }}>
                            {label}
                        </div>
                    </div>
                );
            }
            return prims;
        }, [] as JSX.Element[]);
    }

    render() {
        let xaxislines = this.xaxislines;
        let yaxislines = this.yaxislines;
        return <div className="histogramLabelPrimitives-container">
            {xaxislines}
            {yaxislines}
        </div>;
    }

}