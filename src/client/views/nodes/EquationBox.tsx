import EquationEditor from 'equation-editor-react';
import { action, reaction } from 'mobx';
import { observer } from 'mobx-react';
import * as React from 'react';
import { documentSchema } from '../../../fields/documentSchemas';
import { Id } from '../../../fields/FieldSymbols';
import { createSchema, makeInterface } from '../../../fields/Schema';
import { NumCast, StrCast } from '../../../fields/Types';
import { TraceMobx } from '../../../fields/util';
import { Docs } from '../../documents/Documents';
import { ViewBoxBaseComponent } from '../DocComponent';
import { LightboxView } from '../LightboxView';
import { FieldView, FieldViewProps } from './FieldView';
import './LabelBox.scss';
import functionPlot from "function-plot";
import { DocumentManager } from '../../util/DocumentManager';
import { Utils } from '../../../Utils';
import { HeightSym, WidthSym } from '../../../fields/Doc';


const EquationSchema = createSchema({});

type EquationDocument = makeInterface<[typeof EquationSchema, typeof documentSchema]>;
const EquationDocument = makeInterface(EquationSchema, documentSchema);

@observer
export class EquationBox extends ViewBoxBaseComponent<FieldViewProps, EquationDocument>(EquationDocument) {
    public static LayoutString(fieldKey: string) { return FieldView.LayoutString(EquationBox, fieldKey); }
    public static SelectOnLoad: string = "";
    _ref: React.RefObject<EquationEditor> = React.createRef();
    componentDidMount() {
        if (EquationBox.SelectOnLoad === this.rootDoc[Id] && (!LightboxView.LightboxDoc || LightboxView.IsLightboxDocView(this.props.docViewPath()))) {
            this.props.select(false);

            this._ref.current!.mathField.focus();
            this._ref.current!.mathField.select();
        }
        reaction(() => this.props.isSelected(),
            selected => {
                if (this._ref.current) {
                    if (selected) this._ref.current.element.current.children[0].addEventListener("keydown", this.keyPressed, true);
                    else this._ref.current.element.current.children[0].removeEventListener("keydown", this.keyPressed);
                }
            }, { fireImmediately: true });
    }
    plot: any;
    @action
    keyPressed = (e: KeyboardEvent) => {
        const _height = Number(getComputedStyle(this._ref.current!.element.current).height.replace("px", ""));
        const _width = Number(getComputedStyle(this._ref.current!.element.current).width.replace("px", ""));
        if (e.key === "Enter") {
            const nextEq = Docs.Create.EquationDocument({
                title: "# math", text: StrCast(this.dataDoc.text), _width, _height: 25,
                x: NumCast(this.layoutDoc.x), y: NumCast(this.layoutDoc.y) + _height + 10
            });
            EquationBox.SelectOnLoad = nextEq[Id];
            this.props.addDocument?.(nextEq);
            e.stopPropagation();

        }
        if (e.key === "Tab") {
            const graph = Docs.Create.FunctionPlotDocument([this.rootDoc], {
                x: NumCast(this.layoutDoc.x) + this.layoutDoc[WidthSym](),
                y: NumCast(this.layoutDoc.y),
                _width: 400, _height: 300, _backgroundColor: "white"
            });
            this.props.addDocument?.(graph);
            e.stopPropagation();
        }
        if (e.key === "Backspace" && !this.dataDoc.text) this.props.removeDocument?.(this.rootDoc);
    }
    onChange = (str: string) => {
        this.dataDoc.text = str;
        const style = this._ref.current && getComputedStyle(this._ref.current.element.current);
        if (style) {
            const _height = Number(style.height.replace("px", ""));
            const _width = Number(style.width.replace("px", ""));
            this.layoutDoc._width = Math.max(35, _width);
            this.layoutDoc._height = Math.max(25, _height);
        }
    }
    render() {
        TraceMobx();
        return (<div onPointerDown={e => !e.ctrlKey && e.stopPropagation()}
            style={{
                pointerEvents: !this.props.isSelected() ? "none" : undefined,
            }}
        >
            <EquationEditor ref={this._ref}
                value={this.dataDoc.text || "x"}
                spaceBehavesLikeTab={true}
                onChange={this.onChange}
                autoCommands="pi theta sqrt sum prod alpha beta gamma rho"
                autoOperatorNames="sin cos tan" />
        </div>);
    }
}