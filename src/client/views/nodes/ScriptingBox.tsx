import { action, observable, computed, _allowStateChangesInsideComputed } from "mobx";
import { observer } from "mobx-react";
import * as React from "react";
import { documentSchema } from "../../../fields/documentSchemas";
import { createSchema, makeInterface, listSpec } from "../../../fields/Schema";
import { ScriptField } from "../../../fields/ScriptField";
import { StrCast, ScriptCast, Cast } from "../../../fields/Types";
import { InteractionUtils } from "../../util/InteractionUtils";
import { CompileScript, isCompileError, ScriptParam } from "../../util/Scripting";
import { ViewBoxAnnotatableComponent } from "../DocComponent";
import { EditableView } from "../EditableView";
import { FieldView, FieldViewProps } from "../nodes/FieldView";
import "./ScriptingBox.scss";
import { OverlayView } from "../OverlayView";
import { DocumentIconContainer, DocumentIcon } from "./DocumentIcon";
import { List } from "../../../fields/List";
import { DragManager } from "../../util/DragManager";
import { Doc } from "../../../fields/Doc";

const ScriptingSchema = createSchema({});
type ScriptingDocument = makeInterface<[typeof ScriptingSchema, typeof documentSchema]>;
const ScriptingDocument = makeInterface(ScriptingSchema, documentSchema);


@observer
export class ScriptingBox extends ViewBoxAnnotatableComponent<FieldViewProps, ScriptingDocument>(ScriptingDocument) {

    protected multiTouchDisposer?: InteractionUtils.MultiTouchEventDisposer | undefined;
    rowProps: any;
    _paramNum: number = 0;
    public static LayoutString(fieldStr: string) { return FieldView.LayoutString(ScriptingBox, fieldStr); }

    _overlayDisposer?: () => void;

    @observable private _errorMessage: string = "";
    @observable private _applied: boolean = false;
    @observable private _paramsNames: any;
    @observable private _paramsTypes: any;
    @observable private _paramsValues: any;


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
        //     editable: true
        //     transformer: DocumentIconContainer.getTransformer(),
        //     params,
        //     typecheck: false
        // });
        // this._errorMessage = isCompileError(result) ? result.errors.map(e => e.messageText).join("\n") : "";
        // return this.dataDoc[this.props.fieldKey] = result.compiled ? new ScriptField(result) : undefined;

        const params = this.compileParams.reduce((o: ScriptParam, p: string) => {
            const param = p.split(":");

            o[param[0].trim()] = param[1].trim();
            return o;
        },
            {} as ScriptParam);

        console.log(this.compileParams);

        const result = CompileScript(this.rawScript, {
            editable: true,
            transformer: DocumentIconContainer.getTransformer(),
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
        const params = this.compileParams.reduce((o: ScriptParam, p: string) => {
            const param = p.split(":");
            o[param[0].trim()] = param[1].trim();
            return o;
        },
            {} as ScriptParam);

        const result = CompileScript(this.rawScript, {
            editable: true,
            transformer: DocumentIconContainer.getTransformer(),
            params,
            typecheck: true
        });
        this._errorMessage = "";
        if (result.compiled) {
            // this automatically saves
            result.run({ self: this.rootDoc, this: this.layoutDoc }, (err: any) => {
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

    @action
    onApply = () => {
        const params = this.compileParams.reduce((o: ScriptParam, p: string) => {
            const param = p.split(":");

            o[param[0].trim()] = param[1].trim();
            return o;
        },
            {} as ScriptParam);

        console.log(this.compileParams);

        const result = CompileScript(this.rawScript, {
            editable: true,
            transformer: DocumentIconContainer.getTransformer(),
            params,
            typecheck: true
        });
        this._errorMessage = "";
        if (result.compiled) {
            this._errorMessage = "";
            this.props.Document.data = new ScriptField(result);

            this._applied = true;
        }
        else {
            this.onError(result.errors);
        }
        this.props.Document.documentText = this.rawScript;

        this._paramsNames = [];
        this._paramsTypes = [];

        this.compileParams.forEach(element => {
            const param = element.split(":");
            this._paramsNames.push(param[0].trim());
            this._paramsTypes.push(param[1].trim());
        }
        );
    }

    @action
    onEdit = () => {
        this._applied = false;
    }

    onFocus = () => {
        this._overlayDisposer?.();
        this._overlayDisposer = OverlayView.Instance.addElement(<DocumentIconContainer />, { x: 0, y: 0 });
    }

    @action
    onDrop = (e: Event, de: DragManager.DropEvent, index: any) => {
        console.log("drop");
        const firstParam = this.compileParams[index].split(":");
        const droppedDocs = de.complete.docDragData?.droppedDocuments;
        if (droppedDocs?.length) {
            const dropped = droppedDocs[0];
            this._paramsValues[index] = dropped;
            // you can't just bind a variable to a specific Doc.  The Doc would have to be added to 'capturedVariables' field of the compile options, but I think it makes more sense to just be declaring this variable to be a Doc
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
                    const parameter = value.split(":");
                    if (parameter[1] !== undefined) {
                        if (parameter[1].trim() === "Doc" || parameter[1].trim() === "string") {
                            //if (!!!this._paramsNames.includes(parameter[0].trim())) {
                            this._errorMessage = "";
                            this._paramNum++;
                            const par = this.compileParams;
                            this.compileParams = new List<string>(value.split(";").filter(s => s !== " "));
                            this.compileParams.push.apply(this.compileParams, par);
                            return true;
                            // } else {
                            //     this._errorMessage = "this name has already been used";
                            //     return false;
                            // }
                        } else {
                            this._errorMessage = "this type is not supported";
                            return false;
                        }
                    } else {
                        this._errorMessage = "must set type of parameter";
                        return false;
                    }
                }
                return false;
            }}
        />;

        const listParams = this.compileParams.map((parameter, i) =>
            <div className="scriptingBox-pborder"
                background-color="white"

                onKeyPress={e => {
                    if (e.key === "Enter") {
                        this._overlayDisposer?.();
                    }
                }
                }
            >
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

        // const settingParams = this._paramsNames.map((parameter: string, i: number) =>
        //     <div className="scriptingBox-pborder"
        //         background-color="white"

        //         onKeyPress={e => {
        //             if (e.key === "Enter") {
        //                 this._overlayDisposer?.();
        //             }
        //         }
        //         }
        //     >

        //         {this._paramsTypes[i] === "Doc" ? <div>
        //             <div className="scriptingBox-wrapper">

        //                 <div className="scriptingBox-paramNames">
        //                     {parameter + ":" + this._paramsValues[i] + " = "}
        //                 </div>

        //                 <div className="scriptingBox-paramInputs"
        //                     onFocus={this.onFocus}>
        //                     <EditableView
        //                         contents={this._paramsValues[i]}
        //                         display={"block"}
        //                         maxHeight={72}
        //                         height={35}
        //                         fontSize={12}
        //                         GetValue={() => this._paramsValues[i]}
        //                         onDrop={(e: Event, de: DragManager.DropEvent) => this.onDrop(e, de, i)}
        //                         SetValue={value => {
        //                             this._paramsValues[i] = value;
        //                             return true;
        //                         }}
        //                     />
        //                 </div>
        //             </div>
        //         </div> : null}

        //         {this._paramsTypes[i] === "string" ? <div>
        //             <div className="scriptingBox-wrapper">

        //                 <div className="scriptingBox-paramNames">
        //                     {parameter + ":" + this._paramsValues[i] + " = "}
        //                 </div>

        //                 <div className="scriptingBox-paramInputs"
        //                     onFocus={this.onFocus}>
        //                     <EditableView
        //                         contents={this._paramsValues[i]}
        //                         display={"block"}
        //                         maxHeight={72}
        //                         height={35}
        //                         fontSize={12}
        //                         GetValue={() => this._paramsValues[i]}
        //                         SetValue={value => {
        //                             this._paramsValues[i] = value;
        //                             return true;
        //                         }}
        //                     />
        //                 </div>
        //             </div>
        //         </div> : null}



        //     </div>
        // );

        const scriptingInputs = <div className="scriptingBox-inputDiv" style={{ height: "100%" }}
            onPointerDown={e => this.props.isSelected(true) && e.stopPropagation()} >
            <div className="scriptingBox-wrapper">

                <textarea
                    placeholder="write your script here"
                    onChange={e => this.rawScript = e.target.value}
                    value={this.rawScript}
                    onFocus={this.onFocus}
                    onBlur={e => this._overlayDisposer?.()}
                    style={{ width: this.compileParams.length > 0 ? "70%" : "100%", resize: "none", height: "100%" }}
                />


                {this.compileParams.length > 0 ? <div className="scriptingBox-plist" style={{ width: "30%" }}>
                    {listParams}
                </div> : null}
            </div>
            <div className="scriptingBox-params">{params}</div>

            {this._errorMessage ? <div className="scriptingBox-errorMessage">
                {this._errorMessage}
            </div> : null}
        </div>;


        const scriptingTools = <div className="scriptingBox-toolbar">
            <button className="scriptingBox-button" style={{ width: this.rootDoc.layoutKey === "layout_onClick" ? "33%" : "50%" }}
                onPointerDown={e => { this.onCompile(); e.stopPropagation(); }}>Compile</button>
            <button className="scriptingBox-button" style={{ width: this.rootDoc.layoutKey === "layout_onClick" ? "33%" : "50%" }}
                onPointerDown={e => { this.onApply(); e.stopPropagation(); }}>Apply</button>
            {this.rootDoc.layoutKey === "layout_onClick" ? <button className="scriptingBox-button"
                style={{ width: this.rootDoc.layoutKey === "layout_onClick" ? "33%" : "50%" }}
                onPointerDown={e => { this.onFinish(); e.stopPropagation(); }}>Finish</button> : null}
        </div>;


        const paramsInputs = <div className="scriptingBox-inputDiv" style={{ height: "100%" }}
            onPointerDown={e => this.props.isSelected(true) && e.stopPropagation()} >

            {this.compileParams.length > 0 ? <div className="scriptingBox-plist">
                {this.compileParams}
            </div> : null}

        </div>;

        const paramsTools = <div className="scriptingBox-toolbar">
            <button className="scriptingBox-button" style={{ width: this.rootDoc.layoutKey === "layout_onClick" ? "33%" : "50%" }}
                onPointerDown={e => { this.onEdit(); e.stopPropagation(); }}>Edit</button>
            <button className="scriptingBox-button" style={{ width: this.rootDoc.layoutKey === "layout_onClick" ? "33%" : "50%" }}
                onPointerDown={e => { this.onRun(); e.stopPropagation(); }}>Run</button>
            {this.rootDoc.layoutKey === "layout_onClick" ? <button className="scriptingBox-button"
                style={{ width: this.rootDoc.layoutKey === "layout_onClick" ? "33%" : "50%" }}
                onPointerDown={e => { this.onFinish(); e.stopPropagation(); }}>Finish</button> : null}
        </div>;



        return (
            <div className="scriptingBox-outerDiv"

                onWheel={e => this.props.isSelected(true) && e.stopPropagation()}>

                {!!!this._applied ? <div style={{ height: "100%" }}>
                    {scriptingInputs}
                </div> : null}

                {this._applied ? <div style={{ height: "100%" }}>
                    {paramsInputs}
                </div> : null}

                {this.rootDoc.layout === "layout" ? <div></div> : (null)}

                {!!!this._applied ? <div>
                    {scriptingTools}
                </div> : null}

                {this._applied ? <div>
                    {paramsTools}
                </div> : null}

            </div>
        );
    }

}
