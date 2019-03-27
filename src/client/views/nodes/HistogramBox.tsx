import React = require("react")
import { computed, observable, reaction, runInAction } from "mobx";
import { observer } from "mobx-react";
import Measure from "react-measure";
import { Dictionary } from "typescript-collections";
import { Opt } from "../../../fields/Field";
import { HistogramField } from "../../../fields/HistogramField";
import { KeyStore } from "../../../fields/KeyStore";
import { CurrentUserUtils } from "../../../server/authentication/models/current_user_utils";
import { FilterModel } from '../../northstar/core/filter/FilterModel';
import { ChartType, VisualBinRange } from '../../northstar/model/binRanges/VisualBinRange';
import { VisualBinRangeHelper } from "../../northstar/model/binRanges/VisualBinRangeHelper";
import { AggregateBinRange, BinRange, DoubleValueAggregateResult, HistogramResult } from "../../northstar/model/idea/idea";
import { ModelHelpers } from "../../northstar/model/ModelHelpers";
import { HistogramOperation } from "../../northstar/operations/HistogramOperation";
import { PIXIRectangle } from "../../northstar/utils/MathUtil";
import { SizeConverter } from "../../northstar/utils/SizeConverter";
import "./../../northstar/utils/Extensions";
import { FieldView, FieldViewProps } from './FieldView';
import "./HistogramBox.scss";
import { HistogramBoxPrimitives } from './HistogramBoxPrimitives';
import { HistogramLabelPrimitives } from "./HistogramLabelPrimitives";

export interface HistogramPrimitivesProps {
    HistoBox: HistogramBox;
}

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

