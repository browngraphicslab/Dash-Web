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
import { DragManager } from "../../util/DragManager";

const ScriptingSchema = createSchema({});
type ScriptingDocument = makeInterface<[typeof ScriptingSchema, typeof documentSchema]>;
const ScriptingDocument = makeInterface(ScriptingSchema, documentSchema);


@observer
export class ScriptingBox extends ViewBoxAnnotatableComponent<FieldViewProps, ScriptingDocument>(ScriptingDocument) {

    protected multiTouchDisposer?: InteractionUtils.MultiTouchEventDisposer | undefined;
    rowProps: any;
    public static LayoutString(fieldStr: string) { return FieldView.LayoutString(ScriptingBox, fieldStr); }

    _overlayDisposer?: () => void;

    @observable private _errorMessage: string = "";
    @observable private _paramNum: number = 0;
    @observable private _dropped: boolean = false;

    @computed get rawScript() { return StrCast(this.dataDoc[this.props.fieldKey + "-rawScript"], StrCast(this.layoutDoc[this.props.fieldKey + "-rawScript"])); }
    @computed get compileParams() { return Cast(this.dataDoc[this.props.fieldKey + "-params"], listSpec("string"), Cast(this.layoutDoc[this.props.fieldKey + "-params"], listSpec("string"), [])); }
    set rawScript(value) { this.dataDoc[this.props.fieldKey + "-rawScript"] = value; }

    set compileParams(value) { this.dataDoc[this.props.fieldKey + "-params"] = value; }

    @action
    componentDidMount() {
        this.rawScript = ScriptCast(this.dataDoc[this.props.fieldKey])?.script?.originalScript || this.rawScript;
    }

    componentWillUnmount() { this._overlayDisposer?.(); }

    @action
    onFinish = () => {
        const result = CompileScript(this.rawScript, {});
        this.rootDoc.layoutKey = "layout";
        this.rootDoc.height = 50;
        this.rootDoc.width = 100;
        this.props.Document.documentText = this.rawScript;
    }

    @action
    onError = (error: any) => {
        for (const entry of error) {
            this._errorMessage = this._errorMessage + "   " + entry.messageText;
        }
    }

    @action
    onCompile = () => {
        // const params = this.compileParams.reduce((o: ScriptParam, p: string) => { o[p] = "any"; return o; }, {} as ScriptParam);
        // const result = CompileScript(this.rawScript, {
        //     editable: true,
        //     transformer: DocumentIconContainer.getTransformer(),
        //     params,
        //     typecheck: false
        // });
        // this._errorMessage = isCompileError(result) ? result.errors.map(e => e.messageText).join("\n") : "";
        // return this.dataDoc[this.props.fieldKey] = result.compiled ? new ScriptField(result) : undefined;
        const params = this.compileParams.reduce((o: ScriptParam, p: string) => { o[p] = "any"; return o; }, {} as ScriptParam);
        const result = CompileScript(this.rawScript, {
            editable: false,
            transformer: undefined,
            params,
            typecheck: true
        });
        this._errorMessage = "";
        if (result.compiled) {
            this._errorMessage = "";
            this.props.Document.data = new ScriptField(result);
        }
        else {
            this.onError(result.errors);
        }
        this.props.Document.documentText = this.rawScript;
    }

    @action
    onRun = () => {
        const params = this.compileParams.reduce((o: ScriptParam, p: string) => { o[p] = "any"; return o; }, {} as ScriptParam);
        const result = CompileScript(this.rawScript, {
            editable: false,
            transformer: undefined,
            params,
            typecheck: true
        });
        this._errorMessage = "";
        if (result.compiled) {
            // this automatically saves
            result.run({}, (err: any) => {
                this._errorMessage = "";
                this.onError(err);
            });
            this.props.Document.data = new ScriptField(result);
        }
        else {
            this.onError(result.errors);
        }
        this.props.Document.documentText = this.rawScript;
        //this.onCompile()?.script.run({}, err => this._errorMessage = err.map((e: any) => e.messageText).join("\n"));
    }

    onFocus = () => {
        this._overlayDisposer?.();
        this._overlayDisposer = OverlayView.Instance.addElement(<DocumentIconContainer />, { x: 0, y: 0 });
    }

    @action
    onDrop = (e: Event, de: DragManager.DropEvent, index: any) => {
        this._dropped = true;
        console.log("drop");
        const firstParam = this.compileParams[index].split("=");
        const dropped = de.complete.docDragData?.droppedDocuments;
        if (dropped?.length) {
            this.compileParams[index] = firstParam[0] + " = " + dropped[0].id;
        }
    }

    @action
    onDelete = (num: number) => {
        this.compileParams.splice(num, 1);
    }

    render() {

        const params = <EditableView
            contents={""}
            display={"block"}
            maxHeight={72}
            height={35}
            fontSize={22}
            GetValue={() => ""}
            SetValue={value => {
                if (value !== "" && value !== " ") {
                    this._paramNum++;
                    const par = this.compileParams;
                    this.compileParams = new List<string>(value.split(";").filter(s => s !== " "));
                    this.compileParams.push.apply(this.compileParams, par);
                    return true;
                }
                return false;
            }}
        />;

        const listParams = this.compileParams.map((parameter, i) =>
            <div className="scriptingBox-pborder"
                onFocus={this.onFocus}
                onBlur={e => this._overlayDisposer?.()}
                onKeyPress={e => {
                    if (e.key === "Enter") {
                        this._overlayDisposer?.();
                    }
                }
                }
                style={{ background: this._dropped ? "yellow" : "" }}>
                <EditableView
                    contents={parameter}
                    display={"block"}
                    maxHeight={72}
                    height={35}
                    fontSize={12}
                    GetValue={() => parameter}
                    onDrop={(e: Event, de: DragManager.DropEvent) => this.onDrop(e, de, i)}
                    SetValue={value => {
                        if (value !== "" && value !== " ") {
                            this.compileParams[i] = value;
                            parameter = value;
                            return true;
                        } else {
                            this.onDelete(i);
                            return true;
                        }
                    }}
                />
            </div>
        );

        return (
            <div className="scriptingBox-outerDiv"

                onWheel={e => this.props.isSelected(true) && e.stopPropagation()}>

                <div className="scriptingBox-inputDiv"
                    onPointerDown={e => this.props.isSelected(true) && e.stopPropagation()} >
                    <div className="scriptingBox-wrapper">

                        <textarea className="scriptingBox-textarea"
                            placeholder="write your script here"
                            onChange={e => this.rawScript = e.target.value}
                            value={this.rawScript}
                            onFocus={this.onFocus}
                            onBlur={e => this._overlayDisposer?.()}
                            style={{ width: this.compileParams.length > 0 ? "70%" : "100%" }} />

                        {this.compileParams.length > 0 ? <div className="scriptingBox-plist" style={{ width: "30%" }}>
                            {listParams}
                        </div> : null}
                    </div>
                    <div className="scriptingBox-params" >{params}</div>
                    <div className="scriptingBox-errorMessage" style={{ background: this._errorMessage ? "red" : "" }}>{this._errorMessage}</div>
                </div>
                {this.rootDoc.layout === "layout" ? <div></div> : (null)}
                <div className="scriptingBox-toolbar">
                    <button className="scriptingBox-button" style={{ width: this.rootDoc.layoutKey === "layout_onClick" ? "33%" : "50%" }}
                        onPointerDown={e => { this.onCompile(); e.stopPropagation(); }}>Compile</button>
                    <button className="scriptingBox-button" style={{ width: this.rootDoc.layoutKey === "layout_onClick" ? "33%" : "50%" }}
                        onPointerDown={e => { this.onRun(); e.stopPropagation(); }}>Run</button>
                    {this.rootDoc.layoutKey === "layout_onClick" ? <button className="scriptingBox-button"
                        style={{ width: this.rootDoc.layoutKey === "layout_onClick" ? "33%" : "50%" }}
                        onPointerDown={e => { this.onFinish(); e.stopPropagation(); }}>Finish</button> : null}
                </div>
            </div>
        );
    }

}
