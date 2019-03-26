import React = require("react")
import { computed, observable, reaction, runInAction, trace } from "mobx";
import { observer } from "mobx-react";
import Measure from "react-measure";
import { Dictionary } from "typescript-collections";
import { Document } from "../../../fields/Document";
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
    @observable public MinValue: number = 0;
    @observable public MaxValue: number = 0;
    @observable public SizeConverter?: SizeConverter;
    @observable public ChartType: ChartType = ChartType.VerticalBar;
    public HitTargets: Dictionary<PIXIRectangle, FilterModel> = new Dictionary<PIXIRectangle, FilterModel>();

    @computed get xaxislines() { return this.renderGridLinesAndLabels(0); }
    @computed get yaxislines() { return this.renderGridLinesAndLabels(1); }
    @computed get createOperationParamsCache() { return this.HistoOp!.CreateOperationParameters(); }

    componentDidMount() {
        reaction(() => [CurrentUserUtils.ActiveSchemaName, this.props.doc.GetText(KeyStore.NorthstarSchema, "?")],
            () => CurrentUserUtils.ActiveSchemaName == this.props.doc.GetText(KeyStore.NorthstarSchema, "?") && this.activateHistogramOperation(),
            { fireImmediately: true });
        reaction(() => [this.VisualBinRanges && this.VisualBinRanges.slice(), this._panelHeight, this._panelWidth],
            () => this.SizeConverter = new SizeConverter({ x: this._panelWidth, y: this._panelHeight }, this.VisualBinRanges, Math.PI / 4));
        reaction(() => this.HistoOp && this.HistoOp.Result instanceof HistogramResult ? this.HistoOp.Result.binRanges : undefined,
            (binRanges: BinRange[] | undefined) => {
                if (!binRanges || !this.HistoOp || !(this.HistoOp!.Result instanceof HistogramResult))
                    return;

                this.ChartType = binRanges[0] instanceof AggregateBinRange ? (binRanges[1] instanceof AggregateBinRange ? ChartType.SinglePoint : ChartType.HorizontalBar) :
                    binRanges[1] instanceof AggregateBinRange ? ChartType.VerticalBar : ChartType.HeatMap;

                this.VisualBinRanges.length = 0;
                this.VisualBinRanges.push(VisualBinRangeHelper.GetVisualBinRange(binRanges[0], this.HistoOp!.Result!, this.HistoOp!.X, this.ChartType));
                this.VisualBinRanges.push(VisualBinRangeHelper.GetVisualBinRange(binRanges[1], this.HistoOp!.Result!, this.HistoOp!.Y, this.ChartType));

                if (!this.HistoOp.Result.isEmpty) {
                    this.MaxValue = Number.MIN_VALUE;
                    this.MinValue = Number.MAX_VALUE;
                    for (let key in this.HistoOp.Result.bins) {
                        if (this.HistoOp.Result.bins.hasOwnProperty(key)) {
                            let bin = this.HistoOp.Result.bins[key];
                            let valueAggregateKey = ModelHelpers.CreateAggregateKey(this.HistoOp.V, this.HistoOp.Result, ModelHelpers.AllBrushIndex(this.HistoOp.Result));
                            let value = ModelHelpers.GetAggregateResult(bin, valueAggregateKey) as DoubleValueAggregateResult;
                            if (value && value.hasResult) {
                                this.MaxValue = Math.max(this.MaxValue, value.result!);
                                this.MinValue = Math.min(this.MinValue, value.result!);
                            }
                        }
                    }
                }
            }
        );
    }

    activateHistogramOperation() {
        this.props.doc.GetTAsync(this.props.fieldKey, HistogramField).then((histoOp: Opt<HistogramField>) => {
            if (histoOp) {
                runInAction(() => this.HistoOp = histoOp.Data);
                this.HistoOp!.Update();
                reaction(
                    () => this.createOperationParamsCache,
                    () => this.HistoOp!.Update());
                reaction(() => this.props.doc.GetList(KeyStore.LinkedFromDocs, []),
                    (docs: Document[]) => {
                        this.HistoOp!.Links.length = 0;
                        this.HistoOp!.Links.push(...docs);
                    },
                    { fireImmediately: true }
                );
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
            let xFrom = sc.DataToScreenX(axis === 0 ? binLabel.minValue! : sc.DataMins[0]);
            let xTo = sc.DataToScreenX(axis === 0 ? binLabel.maxValue! : sc.DataMaxs[0]);
            let yFrom = sc.DataToScreenY(axis === 0 ? sc.DataMins[1] : binLabel.minValue!);
            let yTo = sc.DataToScreenY(axis === 0 ? sc.DataMaxs[1] : binLabel.maxValue!);

            prims.push(this.drawLine(xFrom, yFrom, axis == 0 ? 1 : xTo - xFrom, axis == 0 ? yTo - yFrom : 1));
            if (i == labels.length - 1)
                prims.push(this.drawLine(axis == 0 ? xTo : xFrom, axis == 0 ? yFrom : yTo, axis == 0 ? 1 : xTo - xFrom, axis == 0 ? yTo - yFrom : 1));

            if (i % Math.ceil(labels.length / dim) === 0 && binLabel.label) {
                let text = binLabel.label;
                if (text.length >= StyleConstants.MAX_CHAR_FOR_HISTOGRAM_LABELS) {
                    text = text.slice(0, StyleConstants.MAX_CHAR_FOR_HISTOGRAM_LABELS - 3) + "...";
                }
                const textHeight = 14; const textWidth = 30;
                let xStart = (axis === 0 ? xFrom + (xTo - xFrom) / 2.0 : xFrom - 10 - textWidth);
                let yStart = (axis === 1 ? yFrom - textHeight / 2 : yFrom);
                let rotation = 0;

                if (axis == 0 && this.VisualBinRanges[axis] instanceof NominalVisualBinRange) {
                    rotation = Math.min(90, Math.max(30, textWidth / (xTo - xFrom) * 90));
                    xStart += Math.max(textWidth / 2, (1 - textWidth / (xTo - xFrom)) * textWidth / 2) - textHeight / 2;
                }

                prims.push(
                    <div key={DashUtils.GenerateGuid()} className="histogrambox-gridlabel" style={{ transform: `translate(${xStart}px, ${yStart}px) rotate(${rotation}deg)` }}>
                        {text}
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