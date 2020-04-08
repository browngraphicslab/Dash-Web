import { action, observable, computed } from "mobx";
import { observer } from "mobx-react";
import * as React from "react";
import { Opt } from "../../../new_fields/Doc";
import { documentSchema } from "../../../new_fields/documentSchemas";
import { createSchema, makeInterface } from "../../../new_fields/Schema";
import { ScriptField } from "../../../new_fields/ScriptField";
import { StrCast, ScriptCast } from "../../../new_fields/Types";
import { returnTrue } from "../../../Utils";
import { InteractionUtils } from "../../util/InteractionUtils";
import { CompileScript } from "../../util/Scripting";
import { DocAnnotatableComponent } from "../DocComponent";
import { EditableView } from "../EditableView";
import { FieldView, FieldViewProps } from "../nodes/FieldView";
import "./ScriptingBox.scss";

const ScriptingSchema = createSchema({
});

type ScriptingDocument = makeInterface<[typeof ScriptingSchema, typeof documentSchema]>;
const ScriptingDocument = makeInterface(ScriptingSchema, documentSchema);

@observer
export class ScriptingBox extends DocAnnotatableComponent<FieldViewProps, ScriptingDocument>(ScriptingDocument) {
    protected multiTouchDisposer?: InteractionUtils.MultiTouchEventDisposer | undefined;
    public static LayoutString(fieldStr: string) { return FieldView.LayoutString(ScriptingBox, fieldStr); }

    @observable private _errorMessage: string = "";
    @computed get rawScript() { return StrCast(this.dataDoc[this.props.fieldKey + "-raw"]); }
    set rawScript(value) { this.dataDoc[this.props.fieldKey + "-raw"] = value; }

    @action
    componentDidMount() {
        this.rawScript = ScriptCast(this.dataDoc[this.props.fieldKey])?.script?.originalScript || this.rawScript;
    }

    @action
    onChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        this.rawScript = e.target.value;
    }

    @action
    onError = (error: any) => {
        this._errorMessage = (error as any).map((e: any) => e.messageText).join(" ");
    }

    @action
    onCompile = () => {
        const result = CompileScript(this.rawScript, {});
        this._errorMessage = "";
        if (result.compiled) {
            this._errorMessage = "";
            this.dataDoc[this.props.fieldKey] = new ScriptField(result);
        }
        else {
            this.dataDoc[this.props.fieldKey] = undefined;
            this.onError(result.errors);
        }
    }

    @action
    onRun = () => {
        this.onCompile();
        ScriptCast(this.dataDoc[this.props.fieldKey])?.script.run({},
            (err: any) => {
                this._errorMessage = "";
                this.onError(err);
            });
    }

    render() {
        let onFocus: Opt<() => void> = undefined, onBlur: Opt<() => void> = undefined;
        const params = <EditableView
            contents={""}
            display={"block"}
            maxHeight={72}
            height={35}
            fontSize={28}
            GetValue={() => ""}
            SetValue={returnTrue}
        />;
        return (
            <div className="scriptingBox-outerDiv" onPointerDown={(e) => this.props.isSelected() && e.stopPropagation()} onWheel={(e) => this.props.isSelected() && e.stopPropagation()}>
                <div className="scriptingBox-inputDiv" >
                    <textarea className="scriptingBox-textarea" placeholder="write your script here" onChange={this.onChange} value={this.rawScript} onFocus={onFocus} onBlur={onBlur} />
                    <div className="scriptingBox-errorMessage">{this._errorMessage}</div>
                    <div style={{ background: "beige" }} >{params}</div>
                </div>
                <div className="scriptingBox-toolbar">
                    <button className="scriptingBox-button" onPointerDown={e => { this.onCompile(); e.stopPropagation(); }}>Compile</button>
                    <button className="scriptingBox-button" onPointerDown={e => { this.onRun(); e.stopPropagation(); }}>Run</button>
                </div>
            </div>
        );
    }
}
