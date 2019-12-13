import React = require("react");
import { action, computed, observable, reaction, runInAction, trace } from "mobx";
import { observer } from "mobx-react";
import { CurrentUserUtils } from "../../../server/authentication/models/current_user_utils";
import { ChartType, VisualBinRange } from '../../northstar/model/binRanges/VisualBinRange';
import { VisualBinRangeHelper } from "../../northstar/model/binRanges/VisualBinRangeHelper";
import { AggregateBinRange, AggregateFunction, BinRange, Catalog, DoubleValueAggregateResult, HistogramResult } from "../../northstar/model/idea/idea";
import { ModelHelpers } from "../../northstar/model/ModelHelpers";
import { HistogramOperation } from "../../northstar/operations/HistogramOperation";
import { SizeConverter } from "../../northstar/utils/SizeConverter";
import { DragManager } from "../../util/DragManager";
import { FieldView, FieldViewProps } from "../../views/nodes/FieldView";
import { AttributeTransformationModel } from "../core/attribute/AttributeTransformationModel";
import { HistogramField } from "../dash-fields/HistogramField";
import "../utils/Extensions";
import "./HistogramBox.scss";
import { HistogramBoxPrimitives } from './HistogramBoxPrimitives';
import { HistogramLabelPrimitives } from "./HistogramLabelPrimitives";
import { StyleConstants } from "../utils/StyleContants";
import { Cast } from "../../../new_fields/Types";
import { Doc, DocListCast, DocListCastAsync } from "../../../new_fields/Doc";
import { Id } from "../../../new_fields/FieldSymbols";


@observer
export class HistogramBox extends React.Component<FieldViewProps> {
    public static LayoutString(fieldStr: string) { return FieldView.LayoutString(HistogramBox, fieldStr); }
    private _dropXRef = React.createRef<HTMLDivElement>();
    private _dropYRef = React.createRef<HTMLDivElement>();
    private _dropXDisposer?: DragManager.DragDropDisposer;
    private _dropYDisposer?: DragManager.DragDropDisposer;

    @observable public HistoOp: HistogramOperation = HistogramOperation.Empty;
    @observable public VisualBinRanges: VisualBinRange[] = [];
    @observable public ValueRange: number[] = [];
    @computed public get HistogramResult(): HistogramResult { return this.HistoOp.Result as HistogramResult; }
    @observable public SizeConverter: SizeConverter = new SizeConverter();

    @computed get createOperationParamsCache() { return this.HistoOp.CreateOperationParameters(); }
    @computed get BinRanges() { return this.HistogramResult ? this.HistogramResult.binRanges : undefined; }
    @computed get ChartType() {
        return !this.BinRanges ? ChartType.SinglePoint : this.BinRanges[0] instanceof AggregateBinRange ?
            (this.BinRanges[1] instanceof AggregateBinRange ? ChartType.SinglePoint : ChartType.HorizontalBar) :
            this.BinRanges[1] instanceof AggregateBinRange ? ChartType.VerticalBar : ChartType.HeatMap;
    }

    @action
    dropX = (e: Event, de: DragManager.DropEvent) => {
        if (de.complete.docDragData) {
            let h = Cast(de.complete.docDragData.draggedDocuments[0].data, HistogramField);
            if (h) {
                this.HistoOp.X = h.HistoOp.X;
            }
            e.stopPropagation();
            e.preventDefault();
        }
    }
    @action
    dropY = (e: Event, de: DragManager.DropEvent) => {
        if (de.complete.docDragData) {
            let h = Cast(de.complete.docDragData.draggedDocuments[0].data, HistogramField);
            if (h) {
                this.HistoOp.Y = h.HistoOp.X;
            }
            e.stopPropagation();
            e.preventDefault();
        }
    }

    @action
    xLabelPointerDown = (e: React.PointerEvent) => {
        this.HistoOp.X = new AttributeTransformationModel(this.HistoOp.X.AttributeModel, this.HistoOp.X.AggregateFunction === AggregateFunction.None ? AggregateFunction.Count : AggregateFunction.None);
    }
    @action
    yLabelPointerDown = (e: React.PointerEvent) => {
        this.HistoOp.Y = new AttributeTransformationModel(this.HistoOp.Y.AttributeModel, this.HistoOp.Y.AggregateFunction === AggregateFunction.None ? AggregateFunction.Count : AggregateFunction.None);
    }

    componentDidMount() {
        if (this._dropXRef.current) {
            this._dropXDisposer = DragManager.MakeDropTarget(this._dropXRef.current, this.dropX.bind(this));
        }
        if (this._dropYRef.current) {
            this._dropYDisposer = DragManager.MakeDropTarget(this._dropYRef.current, this.dropY.bind(this));
        }
        reaction(() => CurrentUserUtils.NorthstarDBCatalog, (catalog?: Catalog) => this.activateHistogramOperation(catalog), { fireImmediately: true });
        reaction(() => [this.VisualBinRanges && this.VisualBinRanges.slice()], () => this.SizeConverter.SetVisualBinRanges(this.VisualBinRanges));
        reaction(() => [this.props.PanelWidth(), this.props.PanelHeight()], (size: number[]) => this.SizeConverter.SetIsSmall(size[0] < 40 && size[1] < 40));
        reaction(() => this.HistogramResult ? this.HistogramResult.binRanges : undefined,
            (binRanges: BinRange[] | undefined) => {
                if (binRanges) {
                    this.VisualBinRanges.splice(0, this.VisualBinRanges.length, ...binRanges.map((br, ind) =>
                        VisualBinRangeHelper.GetVisualBinRange(this.HistoOp.Schema!.distinctAttributeParameters, br, this.HistogramResult, ind ? this.HistoOp.Y : this.HistoOp.X, this.ChartType)));

                    let valueAggregateKey = ModelHelpers.CreateAggregateKey(this.HistoOp.Schema!.distinctAttributeParameters, this.HistoOp.V, this.HistogramResult, ModelHelpers.AllBrushIndex(this.HistogramResult));
                    this.ValueRange = Object.values(this.HistogramResult.bins!).reduce((prev, cur) => {
                        let value = ModelHelpers.GetAggregateResult(cur, valueAggregateKey) as DoubleValueAggregateResult;
                        return value && value.hasResult ? [Math.min(prev[0], value.result!), Math.max(prev[1], value.result!)] : prev;
                    }, [Number.MAX_VALUE, Number.MIN_VALUE]);
                }
            });
    }

    componentWillUnmount() {
        if (this._dropXDisposer) {
            this._dropXDisposer();
        }
        if (this._dropYDisposer) {
            this._dropYDisposer();
        }
    }

    async activateHistogramOperation(catalog?: Catalog) {
        if (catalog) {
            let histoOp = await Cast(this.props.Document[this.props.fieldKey], HistogramField);
            runInAction(() => {
                this.HistoOp = histoOp ? histoOp.HistoOp : HistogramOperation.Empty;
                if (this.HistoOp !== HistogramOperation.Empty) {
                    reaction(() => DocListCast(this.props.Document.linkedFromDocs), (docs) => this.HistoOp.Links.splice(0, this.HistoOp.Links.length, ...docs), { fireImmediately: true });
                    reaction(() => DocListCast(this.props.Document.brushingDocs).length,
                        async () => {
                            let brushingDocs = await DocListCastAsync(this.props.Document.brushingDocs);
                            const proto = this.props.Document.proto;
                            if (proto && brushingDocs) {
                                let mapped = brushingDocs.map((brush, i) => {
                                    brush.backgroundColor = StyleConstants.BRUSH_COLORS[i % StyleConstants.BRUSH_COLORS.length];
                                    let brushed = DocListCast(brush.brushingDocs);
                                    if (!brushed.length) return null;
                                    return { l: brush, b: brushed[0][Id] === proto[Id] ? brushed[1] : brushed[0] };
                                });
                                runInAction(() => this.HistoOp.BrushLinks.splice(0, this.HistoOp.BrushLinks.length, ...mapped.filter(m => m) as { l: Doc, b: Doc }[]));
                            }
                        }, { fireImmediately: true });
                    reaction(() => this.createOperationParamsCache, () => this.HistoOp.Update(), { fireImmediately: true });
                }
            });
        }
    }

    @action
    private onScrollWheel = (e: React.WheelEvent) => {
        this.HistoOp.DrillDown(e.deltaY > 0);
        e.stopPropagation();
    }

    render() {
        let labelY = this.HistoOp && this.HistoOp.Y ? this.HistoOp.Y.PresentedName : "<...>";
        let labelX = this.HistoOp && this.HistoOp.X ? this.HistoOp.X.PresentedName : "<...>";
        let loff = this.SizeConverter.LeftOffset;
        let toff = this.SizeConverter.TopOffset;
        let roff = this.SizeConverter.RightOffset;
        let boff = this.SizeConverter.BottomOffset;
        return (
            <div className="histogrambox-container" onWheel={this.onScrollWheel}>
                <div className="histogrambox-yaxislabel" onPointerDown={this.yLabelPointerDown} ref={this._dropYRef} >
                    <span className="histogrambox-yaxislabel-text">
                        {labelY}
                    </span>
                </div>
                <div className="histogrambox-primitives" style={{
                    transform: `translate(${loff + 25}px, ${toff}px)`,
                    width: `calc(100% - ${loff + roff + 25}px)`,
                    height: `calc(100% - ${toff + boff}px)`,
                }}>
                    <HistogramLabelPrimitives HistoBox={this} />
                    <HistogramBoxPrimitives HistoBox={this} />
                </div>
                <div className="histogrambox-xaxislabel" onPointerDown={this.xLabelPointerDown} ref={this._dropXRef} >
                    {labelX}
                </div>
            </div>
        );
    }
}

