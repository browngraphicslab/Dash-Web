import React = require("react")
import { computed, observable, reaction, runInAction, trace, action } from "mobx";
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
import { HistogramBoxPrimitives, HistogramBoxPrimitivesProps } from './HistogramBoxPrimitives';

@observer
export class HistogramBox extends React.Component<FieldViewProps> {
    public static LayoutString(fieldStr: string = "DataKey") { return FieldView.LayoutString(HistogramBox, fieldStr) }
    public HitTargets: Dictionary<PIXIRectangle, FilterModel> = new Dictionary<PIXIRectangle, FilterModel>();

    @observable public PanelWidth: number = 100;
    @observable public PanelHeight: number = 100;
    @observable public HistoOp?: HistogramOperation;
    @observable public VisualBinRanges: VisualBinRange[] = [];
    @observable public ValueRange: number[] = [];
    @observable public SizeConverter: SizeConverter = new SizeConverter();

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
            (params: string[]) => params[0] === params[1] && this.activateHistogramOperation(), { fireImmediately: true });
        reaction(() => [this.VisualBinRanges && this.VisualBinRanges.slice()], () => this.SizeConverter.SetVisualBinRanges(this.VisualBinRanges));
        reaction(() => [this.PanelHeight, this.PanelWidth], () => this.SizeConverter.SetIsSmall(this.PanelWidth < 40 && this.PanelHeight < 40))
        reaction(() => this.HistogramResult ? this.HistogramResult.binRanges : undefined,
            (binRanges: BinRange[] | undefined) => {
                if (binRanges) {
                    this.VisualBinRanges.splice(0, this.VisualBinRanges.length, ...binRanges.map((br, ind) =>
                        VisualBinRangeHelper.GetVisualBinRange(br, this.HistogramResult!, ind ? this.HistoOp!.Y : this.HistoOp!.X, this.ChartType)));

                    let valueAggregateKey = ModelHelpers.CreateAggregateKey(this.HistoOp!.V, this.HistogramResult!, ModelHelpers.AllBrushIndex(this.HistogramResult!));
                    this.ValueRange = Object.values(this.HistogramResult!.bins!).reduce((prev, cur) => {
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
                reaction(() => this.props.doc.GetList(KeyStore.LinkedFromDocs, []), docs => this.HistoOp!.Links.splice(0, this.HistoOp!.Links.length, ...docs), { fireImmediately: true });
                reaction(() => this.createOperationParamsCache, () => this.HistoOp!.Update(), { fireImmediately: true });
            }
        })
    }
    render() {
        let label = this.HistoOp && this.HistoOp.X ? this.HistoOp.X.AttributeModel.DisplayName : "<...>";
        var h = this.props.isTopMost ? this.PanelHeight : this.props.doc.GetNumber(KeyStore.Height, 0);
        var w = this.props.isTopMost ? this.PanelWidth : this.props.doc.GetNumber(KeyStore.Width, 0);
        let loff = this.SizeConverter.LeftOffset;
        let toff = this.SizeConverter.TopOffset;
        let roff = this.SizeConverter.RightOffset;
        let boff = this.SizeConverter.BottomOffset;
        return (
            <Measure onResize={(r: any) => runInAction(() => { this.PanelWidth = r.entry.width; this.PanelHeight = r.entry.height })}>
                {({ measureRef }) =>
                    <div className="histogrambox-container" ref={measureRef} style={{ transform: `translate(${-w / 2}px, ${-h / 2}px)` }}>
                        <div style={{
                            transform: `translate(${loff}px, ${toff}px)`,
                            width: `calc(100% - ${loff + roff}px)`,
                            height: `calc(100% - ${toff + boff}px)`,
                        }}>
                            <HistogramLabelPrimitives HistoBox={this} />
                            <HistogramBoxPrimitives HistoBox={this} />
                        </div>
                        <div className="histogrambox-xaxislabel">{label}</div>
                    </div>
                }
            </Measure>
        )
    }
}

@observer
export class HistogramLabelPrimitives extends React.Component<HistogramBoxPrimitivesProps> {
    componentDidMount() {
        reaction(() => [this.props.HistoBox.PanelWidth, this.props.HistoBox.SizeConverter.LeftOffset, this.props.HistoBox.VisualBinRanges.length],
            (fields) => HistogramLabelPrimitives.computeLabelAngle(fields[0] as number, fields[1] as number, this.props.HistoBox), { fireImmediately: true });
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
        if (!vb.length || !sc.Initialized)
            return (null);
        let dim = (axis == 0 ? this.props.HistoBox.PanelWidth : this.props.HistoBox.PanelHeight) / ((axis == 0 && vb[axis] instanceof NominalVisualBinRange) ?
            (12 + 5) : //  (<number>FontStyles.AxisLabel.fontSize + 5)));
            sc.MaxLabelSizes[axis].coords[axis] + 5);

        let prims: JSX.Element[] = [];
        let labels = vb[axis].GetLabels();
        labels.map((binLabel, i) => {
            let r = sc.DataToScreenRange(binLabel.minValue!, binLabel.maxValue!, axis);
            if (i % Math.ceil(labels.length / dim) === 0 && binLabel.label) {
                const label = binLabel.label.Truncate(StyleConstants.MAX_CHAR_FOR_HISTOGRAM_LABELS, "...");
                const textHeight = 14; const textWidth = 30;
                let xStart = (axis === 0 ? r.xFrom + (r.xTo - r.xFrom) / 2.0 : r.xFrom - 10 - textWidth);
                let yStart = (axis === 1 ? r.yFrom - textHeight / 2 : r.yFrom);

                if (axis == 0 && vb[axis] instanceof NominalVisualBinRange) {
                    let space = (r.xTo - r.xFrom) / sc.RenderDimension * this.props.HistoBox.PanelWidth;
                    xStart += Math.max(textWidth / 2, (1 - textWidth / space) * textWidth / 2) - textHeight / 2;
                }

                let xPercent = axis == 1 ? `${xStart}px` : `${xStart / sc.RenderDimension * 100}%`
                let yPercent = axis == 0 ? `${this.props.HistoBox.PanelHeight - sc.BottomOffset - textHeight}px` : `${yStart / sc.RenderDimension * 100}%`

                prims.push(
                    <div className="histogramLabelPrimitives-placer" key={DashUtils.GenerateGuid()} style={{ transform: `translate(${xPercent}, ${yPercent})` }}>
                        <div className="histogramLabelPrimitives-gridlabel" style={{ transform: `rotate(${axis == 0 ? sc.LabelAngle : 0}rad)` }}>
                            {label}
                        </div>
                    </div>
                )
            }
        });
        return prims;
    }

    render() {
        let xaxislines = this.xaxislines;
        let yaxislines = this.yaxislines;
        return <div className="histogramLabelPrimitives-container">
            {xaxislines}
            {yaxislines}
        </div>
    }

}