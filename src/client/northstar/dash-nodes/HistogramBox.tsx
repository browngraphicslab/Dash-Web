import React = require("react");
import { action, computed, observable, reaction, runInAction, trace } from "mobx";
import { observer } from "mobx-react";
import Measure from "react-measure";
import { FieldWaiting, Opt } from "../../../fields/Field";
import { Document } from "../../../fields/Document";
import { KeyStore } from "../../../fields/KeyStore";
import { CurrentUserUtils } from "../../../server/authentication/models/current_user_utils";
import { ChartType, VisualBinRange } from '../../northstar/model/binRanges/VisualBinRange';
import { VisualBinRangeHelper } from "../../northstar/model/binRanges/VisualBinRangeHelper";
import { AggregateBinRange, AggregateFunction, BinRange, Catalog, DoubleValueAggregateResult, HistogramResult, Result } from "../../northstar/model/idea/idea";
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


@observer
export class HistogramBox extends React.Component<FieldViewProps> {
    public static LayoutString(fieldStr: string = "DataKey") { return FieldView.LayoutString(HistogramBox, fieldStr); }
    private _dropXRef = React.createRef<HTMLDivElement>();
    private _dropYRef = React.createRef<HTMLDivElement>();
    private _dropXDisposer?: DragManager.DragDropDisposer;
    private _dropYDisposer?: DragManager.DragDropDisposer;

    @observable public PanelWidth: number = 100;
    @observable public PanelHeight: number = 100;
    @observable public HistoOp: HistogramOperation = HistogramOperation.Empty;
    @observable public VisualBinRanges: VisualBinRange[] = [];
    @observable public ValueRange: number[] = [];
    @computed public get HistogramResult(): HistogramResult { return this.HistoOp.Result as HistogramResult; }
    @observable public SizeConverter: SizeConverter = new SizeConverter();

    @computed get createOperationParamsCache() { trace(); return this.HistoOp.CreateOperationParameters(); }
    @computed get BinRanges() { return this.HistogramResult ? this.HistogramResult.binRanges : undefined; }
    @computed get ChartType() {
        return !this.BinRanges ? ChartType.SinglePoint : this.BinRanges[0] instanceof AggregateBinRange ?
            (this.BinRanges[1] instanceof AggregateBinRange ? ChartType.SinglePoint : ChartType.HorizontalBar) :
            this.BinRanges[1] instanceof AggregateBinRange ? ChartType.VerticalBar : ChartType.HeatMap;
    }

    constructor(props: FieldViewProps) {
        super(props);
    }

    @action
    dropX = (e: Event, de: DragManager.DropEvent) => {
        if (de.data instanceof DragManager.DocumentDragData) {
            let h = de.data.draggedDocuments[0].GetT(KeyStore.Data, HistogramField);
            if (h && h !== FieldWaiting) {
                this.HistoOp.X = h.Data.X;
            }
            e.stopPropagation();
            e.preventDefault();
        }
    }
    @action
    dropY = (e: Event, de: DragManager.DropEvent) => {
        if (de.data instanceof DragManager.DocumentDragData) {
            let h = de.data.draggedDocuments[0].GetT(KeyStore.Data, HistogramField);
            if (h && h !== FieldWaiting) {
                this.HistoOp.Y = h.Data.X;
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
            this._dropXDisposer = DragManager.MakeDropTarget(this._dropXRef.current, { handlers: { drop: this.dropX.bind(this) } });
        }
        if (this._dropYRef.current) {
            this._dropYDisposer = DragManager.MakeDropTarget(this._dropYRef.current, { handlers: { drop: this.dropY.bind(this) } });
        }
        reaction(() => CurrentUserUtils.NorthstarDBCatalog, (catalog?: Catalog) => this.activateHistogramOperation(catalog), { fireImmediately: true });
        reaction(() => [this.VisualBinRanges && this.VisualBinRanges.slice()], () => this.SizeConverter.SetVisualBinRanges(this.VisualBinRanges));
        reaction(() => [this.PanelHeight, this.PanelWidth], () => this.SizeConverter.SetIsSmall(this.PanelWidth < 40 && this.PanelHeight < 40));
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

    activateHistogramOperation(catalog?: Catalog) {
        if (catalog) {
            this.props.Document.GetTAsync(this.props.fieldKey, HistogramField).then((histoOp: Opt<HistogramField>) => runInAction(() => {
                this.HistoOp = histoOp ? histoOp.Data : HistogramOperation.Empty;
                if (this.HistoOp !== HistogramOperation.Empty) {
                    reaction(() => this.props.Document.GetList(KeyStore.LinkedFromDocs, []), (docs: Document[]) => this.HistoOp.Links.splice(0, this.HistoOp.Links.length, ...docs), { fireImmediately: true });
                    reaction(() => this.props.Document.GetList(KeyStore.BrushingDocs, []).length,
                        () => {
                            let brushingDocs = this.props.Document.GetList(KeyStore.BrushingDocs, [] as Document[]);
                            let proto = this.props.Document.GetPrototype() as Document;
                            this.HistoOp.BrushLinks.splice(0, this.HistoOp.BrushLinks.length, ...brushingDocs.map((brush, i) => {
                                brush.SetNumber(KeyStore.BackgroundColor, StyleConstants.BRUSH_COLORS[i % StyleConstants.BRUSH_COLORS.length]);
                                let brushed = brush.GetList(KeyStore.BrushingDocs, [] as Document[]);
                                return { l: brush, b: brushed[0].Id === proto.Id ? brushed[1] : brushed[0] };
                            }));
                        }, { fireImmediately: true });
                    reaction(() => this.createOperationParamsCache, () => this.HistoOp.Update(), { fireImmediately: true });
                }
            }));
        }
    }
    render() {
        let labelY = this.HistoOp && this.HistoOp.Y ? this.HistoOp.Y.PresentedName : "<...>";
        let labelX = this.HistoOp && this.HistoOp.X ? this.HistoOp.X.PresentedName : "<...>";
        var h = this.props.isTopMost ? this.PanelHeight : this.props.Document.GetNumber(KeyStore.Height, 0);
        var w = this.props.isTopMost ? this.PanelWidth : this.props.Document.GetNumber(KeyStore.Width, 0);
        let loff = this.SizeConverter.LeftOffset;
        let toff = this.SizeConverter.TopOffset;
        let roff = this.SizeConverter.RightOffset;
        let boff = this.SizeConverter.BottomOffset;
        return (
            <Measure onResize={(r: any) => runInAction(() => { this.PanelWidth = r.entry.width; this.PanelHeight = r.entry.height; })}>
                {({ measureRef }) =>
                    <div className="histogrambox-container" ref={measureRef} style={{ transform: `translate(-50%, -50%)` }}>
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
                }
            </Measure>
        );
    }
}

