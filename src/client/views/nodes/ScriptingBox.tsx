import { action, observable, computed } from "mobx";
import { observer } from "mobx-react";
import * as React from "react";
import { documentSchema } from "../../../new_fields/documentSchemas";
import { createSchema, makeInterface, listSpec } from "../../../new_fields/Schema";
import { ScriptField } from "../../../new_fields/ScriptField";
import { StrCast, ScriptCast, Cast } from "../../../new_fields/Types";
import { InteractionUtils } from "../../util/InteractionUtils";
import { CompileScript, isCompileError, ScriptParam } from "../../util/Scripting";
import { ViewBoxAnnotatableComponent } from "../DocComponent";
import { EditableView } from "../EditableView";
import { FieldView, FieldViewProps } from "../nodes/FieldView";
import "./ScriptingBox.scss";
import { OverlayView } from "../OverlayView";
import { DocumentIconContainer } from "./DocumentIcon";
import { List } from "../../../new_fields/List";

const ScriptingSchema = createSchema({});
type ScriptingDocument = makeInterface<[typeof ScriptingSchema, typeof documentSchema]>;
const ScriptingDocument = makeInterface(ScriptingSchema, documentSchema);

@observer
export class ScriptingBox extends ViewBoxAnnotatableComponent<FieldViewProps, ScriptingDocument>(ScriptingDocument) {
    protected multiTouchDisposer?: InteractionUtils.MultiTouchEventDisposer | undefined;
    public static LayoutString(fieldStr: string) { return FieldView.LayoutString(ScriptingBox, fieldStr); }

    _overlayDisposer?: () => void;

    @observable private _errorMessage: string = "";

    @computed get rawScript() { return StrCast(this.dataDoc[this.props.fieldKey + "-rawScript"]); }
    @computed get compileParams() { return Cast(this.dataDoc[this.props.fieldKey + "-params"], listSpec("string"), []); }
    set rawScript(value) { this.dataDoc[this.props.fieldKey + "-rawScript"] = value; }
    set compileParams(value) { this.dataDoc[this.props.fieldKey + "-params"] = value; }

    @action
    componentDidMount() {
        this.rawScript = ScriptCast(this.dataDoc[this.props.fieldKey])?.script?.originalScript || this.rawScript;
    }

    componentWillUnmount() { this._overlayDisposer?.(); }

    @action
    onSave = () => {
        const result = CompileScript(this.rawScript, {});
        this._errorMessage = "";
        if (result.compiled) {
            this._errorMessage = "";
            this.props.Document.data = new ScriptField(result);

            //button
        }
        else {
            //
        }
        this.props.Document.documentText = this.rawScript;
    }

    @action
    onCompile = () => {
        const params = this.compileParams.reduce((o: ScriptParam, p: string) => { o[p] = "any"; return o; }, {} as ScriptParam);
        const result = CompileScript(this.rawScript, {
            editable: true,
            transformer: DocumentIconContainer.getTransformer(),
            params,
            typecheck: false
        });
        this._errorMessage = isCompileError(result) ? result.errors.map(e => e.messageText).join("\n") : "";
        return this.dataDoc[this.props.fieldKey] = result.compiled ? new ScriptField(result) : undefined;
    }

    @action
    onRun = () => {
        this.onCompile()?.script.run({}, err => this._errorMessage = err.map((e: any) => e.messageText).join("\n"));
    }

    onFocus = () => {
        this._overlayDisposer?.();
        this._overlayDisposer = OverlayView.Instance.addElement(<DocumentIconContainer />, { x: 0, y: 0 });
    }

    render() {
        const params = <EditableView
            contents={this.compileParams.join(" ")}
            display={"block"}
            maxHeight={72}
            height={35}
            fontSize={28}
            GetValue={() => ""}
            SetValue={value => { this.compileParams = new List<string>(value.split(" ").filter(s => s !== " ")); return true; }}
        />;
        return (
            <div className="scriptingBox-outerDiv"
                onPointerDown={e => this.props.isSelected(true) && e.stopPropagation()}
                onWheel={e => this.props.isSelected(true) && e.stopPropagation()}>
                <div className="scriptingBox-inputDiv" >
                    <textarea className="scriptingBox-textarea"
                        placeholder="write your script here"
                        onChange={e => this.rawScript = e.target.value}
                        value={this.rawScript}
                        onFocus={this.onFocus}
                        onBlur={e => this._overlayDisposer?.()} />
                    <div className="scriptingBox-errorMessage" style={{ background: this._errorMessage ? "red" : "" }}>{this._errorMessage}</div>
                    <div className="scriptingBox-params" >{params}</div>
                </div>
                <div className="scriptingBox-toolbar">
                    <button className="scriptingBox-button" onPointerDown={e => { this.onCompile(); e.stopPropagation(); }}>Compile</button>
                    <button className="scriptingBox-button" onPointerDown={e => { this.onRun(); e.stopPropagation(); }}>Run</button>
                </div>
            </div>
        );
    }
}
