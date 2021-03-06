import EquationEditor from "equation-editor-react";
import { IReactionDisposer } from "mobx";
import { observer } from "mobx-react";
import * as ReactDOM from 'react-dom';
import { Doc } from "../../../../fields/Doc";
import { StrCast } from "../../../../fields/Types";
import "./DashFieldView.scss";
import { FormattedTextBox } from "./FormattedTextBox";
import React = require("react");

export class EquationView {
    _fieldWrapper: HTMLDivElement; // container for label and value

    constructor(node: any, view: any, getPos: any, tbox: FormattedTextBox) {
        this._fieldWrapper = document.createElement("div");
        this._fieldWrapper.style.width = node.attrs.width;
        this._fieldWrapper.style.height = node.attrs.height;
        this._fieldWrapper.style.position = "relative";
        this._fieldWrapper.style.display = "inline-block";
        this._fieldWrapper.onmousedown = function (e: any) { e.stopPropagation(); };

        ReactDOM.render(<EquationViewInternal
            fieldKey={node.attrs.fieldKey}
            width={node.attrs.width}
            height={node.attrs.height}
            setEditor={this.setEditor}
            tbox={tbox}
        />, this._fieldWrapper);
        (this as any).dom = this._fieldWrapper;
    }
    _editor: EquationEditor | undefined;
    setEditor = (editor?: EquationEditor) => this._editor = editor;
    destroy() { ReactDOM.unmountComponentAtNode(this._fieldWrapper); }
    selectNode() { this._editor?.mathField.focus(); }
    deselectNode() { }
}

interface IEquationViewInternal {
    fieldKey: string;
    tbox: FormattedTextBox;
    width: number;
    height: number;
    setEditor: (editor: EquationEditor | undefined) => void;
}

@observer
export class EquationViewInternal extends React.Component<IEquationViewInternal> {
    _reactionDisposer: IReactionDisposer | undefined;
    _textBoxDoc: Doc;
    _fieldKey: string;
    _ref: React.RefObject<EquationEditor> = React.createRef();

    constructor(props: IEquationViewInternal) {
        super(props);
        this._fieldKey = this.props.fieldKey;
        this._textBoxDoc = this.props.tbox.props.Document;
    }

    componentWillUnmount() { this._reactionDisposer?.(); }
    componentDidMount() { this.props.setEditor(this._ref.current ?? undefined); }

    render() {
        return <div className="equationView" style={{
            position: "relative",
            display: "inline-block",
            width: this.props.width,
            height: this.props.height,
            bottom: 3,
        }}>
            <EquationEditor ref={this._ref}
                value={StrCast(this._textBoxDoc[this._fieldKey], "y=")}
                onChange={str => this._textBoxDoc[this._fieldKey] = str}
                autoCommands="pi theta sqrt sum prod alpha beta gamma rho"
                autoOperatorNames="sin cos tan"
                spaceBehavesLikeTab={true}
            />
        </div >;
    }
}