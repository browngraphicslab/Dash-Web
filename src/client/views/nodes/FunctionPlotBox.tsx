import EquationEditor from 'equation-editor-react';
import functionPlot from "function-plot";
import { observer } from 'mobx-react';
import * as React from 'react';
import { documentSchema } from '../../../fields/documentSchemas';
import { createSchema, makeInterface } from '../../../fields/Schema';
import { StrCast } from '../../../fields/Types';
import { TraceMobx } from '../../../fields/util';
import { ViewBoxBaseComponent } from '../DocComponent';
import { FieldView, FieldViewProps } from './FieldView';
import './LabelBox.scss';
import { DocListCast } from '../../../fields/Doc';
import { computed } from 'mobx';


const EquationSchema = createSchema({});

type EquationDocument = makeInterface<[typeof EquationSchema, typeof documentSchema]>;
const EquationDocument = makeInterface(EquationSchema, documentSchema);

@observer
export class FunctionPlotBox extends ViewBoxBaseComponent<FieldViewProps, EquationDocument>(EquationDocument) {
    public static LayoutString(fieldKey: string) { return FieldView.LayoutString(FunctionPlotBox, fieldKey); }
    public static GraphCount = 0;
    _ref: React.RefObject<EquationEditor> = React.createRef();
    _plot: any;
    _plotId = "";
    constructor(props: any) {
        super(props);
        this._plotId = "graph" + FunctionPlotBox.GraphCount++;
    }
    createGraph = (ele: HTMLDivElement) => {
        let width = this.props.PanelWidth();
        let height = this.props.PanelHeight();
        const fn = StrCast(DocListCast(this.dataDoc.data).lastElement()?.text, "x^2").replace(/\\frac\{(.*)\}\{(.*)\}/, "($1/$2)");
        console.log("Graphing:" + fn);
        try {
            this._plot = functionPlot({
                target: "#" + ele.id,
                width,
                height,
                yAxis: { domain: [-1, 9] },
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
        const fn = StrCast(DocListCast(this.dataDoc.data).lastElement()?.text, "x^2");
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