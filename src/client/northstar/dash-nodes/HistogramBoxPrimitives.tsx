import React = require("react");
import { computed, observable, reaction, runInAction, trace, action } from "mobx";
import { observer } from "mobx-react";
import { Utils as DashUtils, emptyFunction } from '../../../Utils';
import { FilterModel } from "../../northstar/core/filter/FilterModel";
import { ModelHelpers } from "../../northstar/model/ModelHelpers";
import { ArrayUtil } from "../../northstar/utils/ArrayUtil";
import { LABColor } from '../../northstar/utils/LABColor';
import { PIXIRectangle } from "../../northstar/utils/MathUtil";
import { StyleConstants } from "../../northstar/utils/StyleContants";
import { HistogramBinPrimitiveCollection, HistogramBinPrimitive } from "./HistogramBinPrimitiveCollection";
import { HistogramBox } from "./HistogramBox";
import "./HistogramBoxPrimitives.scss";

export interface HistogramPrimitivesProps {
    HistoBox: HistogramBox;
}
@observer
export class HistogramBoxPrimitives extends React.Component<HistogramPrimitivesProps> {
    private get histoOp() { return this.props.HistoBox.HistoOp; }
    private get renderDimension() { return this.props.HistoBox.SizeConverter.RenderDimension; }
    @observable _selectedPrims: HistogramBinPrimitive[] = [];
    @computed get xaxislines() { return this.renderGridLinesAndLabels(0); }
    @computed get yaxislines() { return this.renderGridLinesAndLabels(1); }
    @computed get selectedPrimitives() { return this._selectedPrims.map(bp => this.drawRect(bp.Rect, bp.BarAxis, undefined, "border")); }
    @computed get barPrimitives() {
        let histoResult = this.props.HistoBox.HistogramResult;
        if (!histoResult || !histoResult.bins || !this.props.HistoBox.VisualBinRanges.length) {
            return (null);
        }
        let allBrushIndex = ModelHelpers.AllBrushIndex(histoResult);
        return Object.keys(histoResult.bins).reduce((prims: JSX.Element[], key: string) => {
            let drawPrims = new HistogramBinPrimitiveCollection(histoResult.bins![key], this.props.HistoBox);
            let toggle = this.getSelectionToggle(drawPrims.BinPrimitives, allBrushIndex,
                ModelHelpers.GetBinFilterModel(histoResult.bins![key], allBrushIndex, histoResult, this.histoOp.X, this.histoOp.Y));
            drawPrims.BinPrimitives.filter(bp => bp.DataValue && bp.BrushIndex !== allBrushIndex).map(bp =>
                prims.push(...[{ r: bp.Rect, c: bp.Color }, { r: bp.MarginRect, c: StyleConstants.MARGIN_BARS_COLOR }].map(pair => this.drawRect(pair.r, bp.BarAxis, pair.c, "bar", toggle))));
            return prims;
        }, [] as JSX.Element[]);
    }

    componentDidMount() {
        reaction(() => this.props.HistoBox.HistoOp.FilterString, () => this._selectedPrims.length = this.histoOp.FilterModels.length = 0);
    }

    private getSelectionToggle(binPrimitives: HistogramBinPrimitive[], allBrushIndex: number, filterModel: FilterModel) {
        let rawAllBrushPrim = ArrayUtil.FirstOrDefault(binPrimitives, bp => bp.BrushIndex === allBrushIndex);
        if (!rawAllBrushPrim) {
            return emptyFunction;
        }
        let allBrushPrim = rawAllBrushPrim;
        return () => runInAction(() => {
            if (ArrayUtil.Contains(this.histoOp.FilterModels, filterModel)) {
                this._selectedPrims.splice(this._selectedPrims.indexOf(allBrushPrim), 1);
                this.histoOp.RemoveFilterModels([filterModel]);
            }
            else {
                this._selectedPrims.push(allBrushPrim);
                this.histoOp.AddFilterModels([filterModel]);
            }
        });
    }

    private renderGridLinesAndLabels(axis: number) {
        if (!this.props.HistoBox.SizeConverter.Initialized) {
            return (null);
        }
        let labels = this.props.HistoBox.VisualBinRanges[axis].GetLabels();
        return <svg className="histogramboxprimitives-svgContainer">
            {labels.reduce((prims, binLabel, i) => {
                let r = this.props.HistoBox.SizeConverter.DataToScreenRange(binLabel.minValue!, binLabel.maxValue!, axis);
                prims.push(this.drawLine(r.xFrom, r.yFrom, axis === 0 ? 0 : r.xTo - r.xFrom, axis === 0 ? r.yTo - r.yFrom : 0));
                if (i === labels.length - 1) {
                    prims.push(this.drawLine(axis === 0 ? r.xTo : r.xFrom, axis === 0 ? r.yFrom : r.yTo, axis === 0 ? 0 : r.xTo - r.xFrom, axis === 0 ? r.yTo - r.yFrom : 0));
                }
                return prims;
            }, [] as JSX.Element[])}
        </svg>;
    }

    drawLine(xFrom: number, yFrom: number, width: number, height: number) {
        if (height < 0) {
            yFrom += height;
            height = -height;
        }
        if (width < 0) {
            xFrom += width;
            width = -width;
        }
        let trans2Xpercent = `${(xFrom + width) / this.renderDimension * 100}%`;
        let trans2Ypercent = `${(yFrom + height) / this.renderDimension * 100}%`;
        let trans1Xpercent = `${xFrom / this.renderDimension * 100}%`;
        let trans1Ypercent = `${yFrom / this.renderDimension * 100}%`;
        return <line className="histogramboxprimitives-line" key={DashUtils.GenerateGuid()} x1={trans1Xpercent} x2={`${trans2Xpercent}`} y1={trans1Ypercent} y2={`${trans2Ypercent}`} />;
    }
    drawRect(r: PIXIRectangle, barAxis: number, color: number | undefined, classExt: string, tapHandler: () => void = emptyFunction) {
        if (r.height < 0) {
            r.y += r.height;
            r.height = -r.height;
        }
        if (r.width < 0) {
            r.x += r.width;
            r.width = -r.width;
        }
        let transXpercent = `${r.x / this.renderDimension * 100}%`;
        let transYpercent = `${r.y / this.renderDimension * 100}%`;
        let widthXpercent = `${r.width / this.renderDimension * 100}%`;
        let heightYpercent = `${r.height / this.renderDimension * 100}%`;
        return (<rect className={`histogramboxprimitives-${classExt}`} key={DashUtils.GenerateGuid()} onPointerDown={(e: React.PointerEvent) => { if (e.button === 0) tapHandler(); }}
            x={transXpercent} width={`${widthXpercent}`} y={transYpercent} height={`${heightYpercent}`} fill={color ? `${LABColor.RGBtoHexString(color)}` : "transparent"} />);
    }
    render() {
        return <div className="histogramboxprimitives-container">
            {this.xaxislines}
            {this.yaxislines}
            <svg className="histogramboxprimitives-svgContainer">
                {this.barPrimitives}
                {this.selectedPrimitives}
            </svg>
        </div>;
    }
}
