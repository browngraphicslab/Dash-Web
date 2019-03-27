import React = require("react")
import { computed, observable, reaction, runInAction } from "mobx";
import { observer } from "mobx-react";
import Measure from "react-measure";
import { Dictionary } from "typescript-collections";
import { Opt } from "../../../fields/Field";
import { HistogramField } from "../../../fields/HistogramField";
import { KeyStore } from "../../../fields/KeyStore";
import { CurrentUserUtils } from "../../../server/authentication/models/current_user_utils";
import { Utils as DashUtils } from '../../../Utils';
import { FilterModel } from '../../northstar/core/filter/FilterModel';
import { NominalVisualBinRange } from "../../northstar/model/binRanges/NominalVisualBinRange";
import { ChartType, VisualBinRange } from '../../northstar/model/binRanges/VisualBinRange';
import { VisualBinRangeHelper } from "../../northstar/model/binRanges/VisualBinRangeHelper";
import { AggregateBinRange, BinRange, DoubleValueAggregateResult, HistogramResult } from "../../northstar/model/idea/idea";
import { ModelHelpers } from "../../northstar/model/ModelHelpers";
import { HistogramOperation } from "../../northstar/operations/HistogramOperation";
import { PIXIRectangle } from "../../northstar/utils/MathUtil";
import { SizeConverter } from "../../northstar/utils/SizeConverter";
import { StyleConstants } from "../../northstar/utils/StyleContants";
import "./../../northstar/utils/Extensions";
import { FieldView, FieldViewProps } from './FieldView';
import "./HistogramBox.scss";
import { HistogramBoxPrimitives } from './HistogramBoxPrimitives';

@observer
export class HistogramBox extends React.Component<FieldViewProps> {
    public static LayoutString(fieldStr: string = "DataKey") { return FieldView.LayoutString(HistogramBox, fieldStr) }

    @observable private _panelWidth: number = 100;
    @observable private _panelHeight: number = 100;
    @observable public HistoOp?: HistogramOperation;
    @observable public VisualBinRanges: VisualBinRange[] = [];
    @observable public ValueRange: number[] = [];
    @observable public SizeConverter?: SizeConverter;
    public HitTargets: Dictionary<PIXIRectangle, FilterModel> = new Dictionary<PIXIRectangle, FilterModel>();

    @computed get xaxislines() { return this.renderGridLinesAndLabels(0); }
    @computed get yaxislines() { return this.renderGridLinesAndLabels(1); }
    @computed get createOperationParamsCache() { return this.HistoOp!.CreateOperationParameters(); }
    @computed get HistogramResult() { return this.HistoOp ? this.HistoOp.Result as HistogramResult : undefined; }
    @computed get BinRanges() { return this.HistogramResult ? this.HistogramResult.binRanges : undefined; }
    @computed get ChartType() {
        return !this.BinRanges ? ChartType.SinglePoint : this.BinRanges[0] instanceof AggregateBinRange ?
            (this.BinRanges[1] instanceof AggregateBinRange ? ChartType.SinglePoint : ChartType.HorizontalBar) :
            this.BinRanges[1] instanceof AggregateBinRange ? ChartType.VerticalBar : ChartType.HeatMap;
    }

    componentDidMount() {
        reaction(() => [CurrentUserUtils.ActiveSchemaName, this.props.doc.GetText(KeyStore.NorthstarSchema, "?")],
            (params: string[]) => params[0] == params[1] && this.activateHistogramOperation(), { fireImmediately: true });
        reaction(() => [this.VisualBinRanges && this.VisualBinRanges.slice(), this._panelHeight, this._panelWidth],
            () => this.SizeConverter = new SizeConverter({ x: this._panelWidth, y: this._panelHeight }, this.VisualBinRanges, Math.PI / 4));
        reaction(() => this.BinRanges, (binRanges: BinRange[] | undefined) => {
            if (binRanges && this.HistogramResult && !this.HistogramResult!.isEmpty && this.HistogramResult!.bins) {
                this.VisualBinRanges.splice(0, this.VisualBinRanges.length, ...binRanges.map(br =>
                    VisualBinRangeHelper.GetVisualBinRange(br, this.HistogramResult!, this.HistoOp!.X, this.ChartType)));

                let valueAggregateKey = ModelHelpers.CreateAggregateKey(this.HistoOp!.V, this.HistogramResult!, ModelHelpers.AllBrushIndex(this.HistogramResult!));
                this.ValueRange = Object.values(this.HistogramResult!.bins).reduce((prev, cur) => {
                    let value = ModelHelpers.GetAggregateResult(cur, valueAggregateKey) as DoubleValueAggregateResult;
                    return value && value.hasResult ? [Math.min(prev[0], value.result!), Math.max(prev[1], value.result!)] : prev;
                }, [Number.MIN_VALUE, Number.MAX_VALUE]);
            }
        });
    }

    activateHistogramOperation() {
        this.props.doc.GetTAsync(this.props.fieldKey, HistogramField).then((histoOp: Opt<HistogramField>) => {
            if (histoOp) {
                runInAction(() => this.HistoOp = histoOp.Data);
                reaction(() => this.props.doc.GetList(KeyStore.LinkedFromDocs, []),
                    docs => this.HistoOp!.Links.splice(0, this.HistoOp!.Links.length, ...docs), { fireImmediately: true });
                reaction(() => this.createOperationParamsCache, () => this.HistoOp!.Update(), { fireImmediately: true });
            }
        })
    }

    drawLine(xFrom: number, yFrom: number, width: number, height: number) {
        return <div key={DashUtils.GenerateGuid()} style={{ position: "absolute", width: `${width}px`, height: `${height}px`, background: "lightgray", transform: `translate(${xFrom}px, ${yFrom}px)` }} />;
    }

    private renderGridLinesAndLabels(axis: number) {
        let sc = this.SizeConverter!;
        if (!sc || !this.VisualBinRanges.length)
            return (null);
        let dim = sc.RenderSize[axis] / ((axis == 0 && this.VisualBinRanges[axis] instanceof NominalVisualBinRange) ?
            (12 + 5) : //  (<number>FontStyles.AxisLabel.fontSize + 5)));
            sc.MaxLabelSizes[axis].coords[axis] + 5);

        let prims: JSX.Element[] = [];
        let labels = this.VisualBinRanges[axis].GetLabels();
        labels.map((binLabel, i) => {
            let r = sc.DataToScreenRange(binLabel.minValue!, binLabel.maxValue!, axis);

            prims.push(this.drawLine(r.xFrom, r.yFrom, axis == 0 ? 1 : r.xTo - r.xFrom, axis == 0 ? r.yTo - r.yFrom : 1));
            if (i == labels.length - 1)
                prims.push(this.drawLine(axis == 0 ? r.xTo : r.xFrom, axis == 0 ? r.yFrom : r.yTo, axis == 0 ? 1 : r.xTo - r.xFrom, axis == 0 ? r.yTo - r.yFrom : 1));

            if (i % Math.ceil(labels.length / dim) === 0 && binLabel.label) {
                const label = binLabel.label.Truncate(StyleConstants.MAX_CHAR_FOR_HISTOGRAM_LABELS, "...");
                const textHeight = 14; const textWidth = 30;
                let xStart = (axis === 0 ? r.xFrom + (r.xTo - r.xFrom) / 2.0 : r.xFrom - 10 - textWidth);
                let yStart = (axis === 1 ? r.yFrom - textHeight / 2 : r.yFrom);
                let rotation = 0;

                if (axis == 0 && this.VisualBinRanges[axis] instanceof NominalVisualBinRange) {
                    rotation = Math.min(90, Math.max(30, textWidth / (r.xTo - r.xFrom) * 90));
                    xStart += Math.max(textWidth / 2, (1 - textWidth / (r.xTo - r.xFrom)) * textWidth / 2) - textHeight / 2;
                }

                prims.push(
                    <div key={DashUtils.GenerateGuid()} className="histogrambox-gridlabel" style={{ transform: `translate(${xStart}px, ${yStart}px) rotate(${rotation}deg)` }}>
                        {label}
                    </div>)
            }
        });
        return prims;
    }

    render() {
        let label = this.HistoOp && this.HistoOp.X ? this.HistoOp.X.AttributeModel.DisplayName : "<...>";
        let xaxislines = this.xaxislines;
        let yaxislines = this.yaxislines;
        var h = this.props.isTopMost ? this._panelHeight : this.props.doc.GetNumber(KeyStore.Height, 0);
        var w = this.props.isTopMost ? this._panelWidth : this.props.doc.GetNumber(KeyStore.Width, 0);
        return (
            <Measure onResize={(r: any) => runInAction(() => { this._panelWidth = r.entry.width; this._panelHeight = r.entry.height })}>
                {({ measureRef }) =>
                    <div className="histogrambox-container" ref={measureRef} style={{ transform: `translate(${-w / 2}px, ${-h / 2}px)` }}>
                        {xaxislines}
                        {yaxislines}
                        <HistogramBoxPrimitives HistoBox={this} />
                        <div className="histogrambox-xaxislabel">{label}</div>
                    </div>
                }
            </Measure>
        )
    }
}