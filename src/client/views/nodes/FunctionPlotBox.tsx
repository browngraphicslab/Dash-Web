import EquationEditor from 'equation-editor-react';
import functionPlot from "function-plot";
import { observer } from 'mobx-react';
import * as React from 'react';
import { documentSchema } from '../../../fields/documentSchemas';
import { createSchema, makeInterface, listSpec } from '../../../fields/Schema';
import { StrCast, Cast } from '../../../fields/Types';
import { TraceMobx } from '../../../fields/util';
import { ViewBoxBaseComponent } from '../DocComponent';
import { FieldView, FieldViewProps } from './FieldView';
import './LabelBox.scss';
import { DocListCast, Doc } from '../../../fields/Doc';
import { computed, action, reaction } from 'mobx';
import { Docs } from '../../documents/Documents';
import { List } from '../../../fields/List';


const EquationSchema = createSchema({});

type EquationDocument = makeInterface<[typeof EquationSchema, typeof documentSchema]>;
const EquationDocument = makeInterface(EquationSchema, documentSchema);

@observer
export class FunctionPlotBox extends ViewBoxBaseComponent<FieldViewProps, EquationDocument>(EquationDocument) {
    public static LayoutString(fieldKey: string) { return FieldView.LayoutString(FunctionPlotBox, fieldKey); }
    public static GraphCount = 0;
    _plot: any;
    _plotId = "";
    _plotEle: any;
    constructor(props: any) {
        super(props);
        this._plotId = "graph" + FunctionPlotBox.GraphCount++;
    }
    componentDidMount() {
        this.props.setContentView?.(this);
        reaction(() => [this.dataDoc.data, this.dataDoc.xRange, this.dataDoc.yRange],
            () => this.createGraph());
    }
    getAnchor = () => {
        const anchor = Docs.Create.TextanchorDocument({
            useLinkSmallAnchor: true,
            hideLinkButton: true,
            annotationOn: this.rootDoc
        });
        anchor.xRange = new List<number>(Array.from(this._plot.options.xAxis.domain));
        anchor.yRange = new List<number>(Array.from(this._plot.options.yAxis.domain));
        return anchor;
    }
    @action
    scrollFocus = (doc: Doc, smooth: boolean) => {
        this.dataDoc.xRange = new List<number>(Array.from(Cast(doc.xRange, listSpec("number"), Cast(this.dataDoc.xRange, listSpec("number"), [-10, 10]))));
        this.dataDoc.yRange = new List<number>(Array.from(Cast(doc.yRange, listSpec("number"), Cast(this.dataDoc.xRange, listSpec("number"), [-1, 9]))));
        return 0;
    }
    createGraph = (ele?: HTMLDivElement) => {
        this._plotEle = ele || this._plotEle;
        let width = this.props.PanelWidth();
        let height = this.props.PanelHeight();
        const fn = StrCast(DocListCast(this.dataDoc.data).lastElement()?.text, "x^2").replace(/\\frac\{(.*)\}\{(.*)\}/, "($1/$2)");
        console.log("Graphing:" + fn);
        try {
            this._plot = functionPlot({
                target: "#" + this._plotEle.id,
                width,
                height,
                xAxis: { domain: Cast(this.dataDoc.xRange, listSpec("number"), [-10, 10]) },
                yAxis: { domain: Cast(this.dataDoc.xRange, listSpec("number"), [-1, 9]) },
                grid: true,
                data: [
                    {
                        fn,
                        // derivative: { fn: "2 * x", updateOnMouseMove: true }
                    }
                ]
            });
        } catch (e) {
            console.log(e);
        }
    }
    @computed get theGraph() {
        return <div id={`${this._plotId}`} ref={r => r && this.createGraph(r)} style={{ position: "absolute", width: "100%", height: "100%" }}
            onPointerDown={e => e.stopPropagation()} />;
    }
    render() {
        TraceMobx();
        return (<div
            style={{
                pointerEvents: !this.active() ? "all" : undefined,
                width: this.props.PanelWidth(),
                height: this.props.PanelHeight()
            }}
        >
            {this.theGraph}
            <div style={{
                display: this.props.isSelected() ? "none" : undefined, position: "absolute", width: "100%", height: "100%",
                pointerEvents: "all"
            }} />
        </div>);
    }
}