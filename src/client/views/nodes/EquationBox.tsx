import EquationEditor from 'equation-editor-react';
import { observer } from 'mobx-react';
import * as React from 'react';
import { documentSchema } from '../../../fields/documentSchemas';
import { createSchema, makeInterface } from '../../../fields/Schema';
import { StrCast, NumCast } from '../../../fields/Types';
import { ViewBoxBaseComponent } from '../DocComponent';
import { FieldView, FieldViewProps } from './FieldView';
import './LabelBox.scss';
import { Id } from '../../../fields/FieldSymbols';
import { simulateMouseClick } from '../../../Utils';
import { TraceMobx } from '../../../fields/util';
import { reaction, action } from 'mobx';
import { Docs } from '../../documents/Documents';
import { LightboxView } from '../LightboxView';

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
    @action
    keyPressed = (e: KeyboardEvent) => {
        const _height = Number(getComputedStyle(this._ref.current!.element.current).height.replace("px", ""));
        const _width = Number(getComputedStyle(this._ref.current!.element.current).width.replace("px", ""));
        if (e.key === "Enter" || e.key === "Tab") {
            const nextEq = Docs.Create.EquationDocument({
                title: "# math", text: StrCast(this.dataDoc.text), _width, _height: 25,
                x: NumCast(this.layoutDoc.x) + (e.key === "Tab" ? _width + 10 : 0), y: NumCast(this.layoutDoc.y) + (e.key === "Enter" ? _height + 10 : 0)
            });
            EquationBox.SelectOnLoad = nextEq[Id];
            this.props.addDocument?.(nextEq);
            e.stopPropagation();
        }
        if (e.key === "Backspace" && !this.dataDoc.text) this.props.removeDocument?.(this.rootDoc);
    }
    onChange = (str: string) => {
        this.dataDoc.text = str;
        const _height = Number(getComputedStyle(this._ref.current!.element.current).height.replace("px", ""));
        const _width = Number(getComputedStyle(this._ref.current!.element.current).width.replace("px", ""));
        this.layoutDoc._width = Math.max(35, _width);
        this.layoutDoc._height = Math.max(25, _height);
    }
    render() {
        TraceMobx();
        return (<div onPointerDown={e => !e.ctrlKey && e.stopPropagation()}
            style={{
                pointerEvents: !this.props.isSelected() ? "none" : undefined,
            }}
        >
            <EquationEditor ref={this._ref}
                value={this.dataDoc.text || "y"}
                spaceBehavesLikeTab={true}
                onChange={this.onChange}
                autoCommands="pi theta sqrt sum prod alpha beta gamma rho"
                autoOperatorNames="sin cos tan" /></div>
        );
    }
}