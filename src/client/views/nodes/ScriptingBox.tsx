import ReactTextareaAutocomplete from "@webscopeio/react-textarea-autocomplete";
import "@webscopeio/react-textarea-autocomplete/style.css";
import { action, computed, observable, runInAction, trace } from "mobx";
import { observer } from "mobx-react";
import * as React from "react";
import { Doc } from "../../../fields/Doc";
import { documentSchema } from "../../../fields/documentSchemas";
import { List } from "../../../fields/List";
import { createSchema, listSpec, makeInterface } from "../../../fields/Schema";
import { ScriptField } from "../../../fields/ScriptField";
import { Cast, NumCast, ScriptCast, StrCast, BoolCast } from "../../../fields/Types";
import { returnEmptyString } from "../../../Utils";
import { DragManager } from "../../util/DragManager";
import { InteractionUtils } from "../../util/InteractionUtils";
import { CompileScript, Scripting, ScriptParam } from "../../util/Scripting";
import { ScriptManager } from "../../util/ScriptManager";
import { ContextMenu } from "../ContextMenu";
import { ViewBoxAnnotatableComponent } from "../DocComponent";
import { EditableView } from "../EditableView";
import { FieldView, FieldViewProps } from "../nodes/FieldView";
import { OverlayView } from "../OverlayView";
import { DocumentIconContainer } from "./DocumentIcon";
import "./ScriptingBox.scss";
import { TraceMobx } from "../../../fields/util";
const _global = (window /* browser */ || global /* node */) as any;

const ScriptingSchema = createSchema({});
type ScriptingDocument = makeInterface<[typeof ScriptingSchema, typeof documentSchema]>;
const ScriptingDocument = makeInterface(ScriptingSchema, documentSchema);

@observer
export class ScriptingBox extends ViewBoxAnnotatableComponent<FieldViewProps, ScriptingDocument>(ScriptingDocument) {

    private dropDisposer?: DragManager.DragDropDisposer;
    protected multiTouchDisposer?: InteractionUtils.MultiTouchEventDisposer | undefined;
    public static LayoutString(fieldStr: string) { return FieldView.LayoutString(ScriptingBox, fieldStr); }
    private _overlayDisposer?: () => void;
    private _caretPos = 0;

    @observable private _errorMessage: string = "";
    @observable private _applied: boolean = false;
    @observable private _function: boolean = false;
    @observable private _spaced: boolean = false;

    @observable private _scriptKeys: any = Scripting.getGlobals();
    @observable private _scriptingDescriptions: any = Scripting.getDescriptions();
    @observable private _scriptingParams: any = Scripting.getParameters();

    @observable private _currWord: string = "";
    @observable private _suggestions: string[] = [];

    @observable private _suggestionBoxX: number = 0;
    @observable private _suggestionBoxY: number = 0;
    @observable private _lastChar: string = "";

    @observable private _suggestionRef: any = React.createRef();
    @observable private _scriptTextRef: any = React.createRef();

    @observable private _selection: any = 0;

    @observable private _paramSuggestion: boolean = false;
    @observable private _scriptSuggestedParams: any = "";
    @observable private _scriptParamsText: any = "";

    constructor(props: any) {
        super(props);
    }

    // vars included in fields that store parameters types and names and the script itself
    @computed({ keepAlive: true }) get paramsNames() { return this.compileParams.map(p => p.split(":")[0].trim()); }
    @computed({ keepAlive: true }) get paramsTypes() { return this.compileParams.map(p => p.split(":")[1].trim()); }
    @computed({ keepAlive: true }) get rawScript() { return StrCast(this.dataDoc[this.props.fieldKey + "-rawScript"], ""); }
    @computed({ keepAlive: true }) get functionName() { return StrCast(this.dataDoc[this.props.fieldKey + "-functionName"], ""); }
    @computed({ keepAlive: true }) get functionDescription() { return StrCast(this.dataDoc[this.props.fieldKey + "-functionDescription"], ""); }
    @computed({ keepAlive: true }) get compileParams() { return Cast(this.dataDoc[this.props.fieldKey + "-params"], listSpec("string"), []); }

    set rawScript(value) { this.dataDoc[this.props.fieldKey + "-rawScript"] = value; }
    set functionName(value) { this.dataDoc[this.props.fieldKey + "-functionName"] = value; }
    set functionDescription(value) { this.dataDoc[this.props.fieldKey + "-functionDescription"] = value; }

    set compileParams(value) { this.dataDoc[this.props.fieldKey + "-params"] = new List<string>(value); }

    getValue(result: any, descrip: boolean) {
        if (typeof result === "object") {
            const text = descrip ? result[1] : result[2];
            return text !== undefined ? text : "";
        } else {
            return "";
        }
    }

    @action
    componentDidMount() {
        this.rawScript = ScriptCast(this.dataDoc[this.props.fieldKey])?.script?.originalScript ?? this.rawScript;

        const observer = new _global.ResizeObserver(action((entries: any) => {
            const area = document.querySelector('textarea');
            if (area) {
                for (const { } of entries) {
                    const getCaretCoordinates = require('textarea-caret');
                    const caret = getCaretCoordinates(area, this._selection);
                    this.resetSuggestionPos(caret);
                }
            }
        }));
        observer.observe(document.getElementsByClassName("scriptingBox")[0]);
    }

    @action
    resetSuggestionPos(caret: any) {
        if (!this._suggestionRef.current || !this._scriptTextRef.current) return;
        const suggestionWidth = this._suggestionRef.current.offsetWidth;
        const scriptWidth = this._scriptTextRef.current.offsetWidth;
        const top = caret.top;
        const x = this.dataDoc.x;
        let left = caret.left;
        if ((left + suggestionWidth) > (x + scriptWidth)) {
            const diff = (left + suggestionWidth) - (x + scriptWidth);
            left = left - diff;
        }

        this._suggestionBoxX = left;
        this._suggestionBoxY = top;
    }

    componentWillUnmount() {
        this._overlayDisposer?.();
    }

    protected createDashEventsTarget = (ele: HTMLDivElement, dropFunc: (e: Event, de: DragManager.DropEvent) => void) => { //used for stacking and masonry view
        if (ele) {
            this.dropDisposer?.();
            this.dropDisposer = DragManager.MakeDropTarget(ele, dropFunc, this.layoutDoc);
        }
    }

    // only included in buttons, transforms scripting UI to a button
    @action
    onFinish = () => {
        this.rootDoc.layoutKey = "layout";
    }

    // displays error message
    @action
    onError = (error: any) => {
        this._errorMessage = error?.message ? error.message : error?.map((entry: any) => entry.messageText).join("  ") || "";
    }

    // checks if the script compiles using CompileScript method and inputting params
    @action
    onCompile = () => {
        const params: ScriptParam = {};
        this.compileParams.forEach(p => params[p.split(":")[0].trim()] = p.split(":")[1].trim());

        const result = CompileScript(this.rawScript, {
            editable: true,
            transformer: DocumentIconContainer.getTransformer(),
            params,
            typecheck: false
        });
        this.dataDoc[this.fieldKey] = result.compiled ? new ScriptField(result) : undefined;
        this.onError(result.compiled ? undefined : result.errors);
        return result.compiled;
    }

    // checks if the script compiles and then runs the script
    @action
    onRun = () => {
        if (this.onCompile()) {
            const bindings: { [name: string]: any } = {};
            this.paramsNames.forEach(key => bindings[key] = this.dataDoc[key]);
            // binds vars so user doesnt have to refer to everything as self.<var>
            ScriptCast(this.dataDoc[this.fieldKey], null)?.script.run({ self: this.rootDoc, this: this.layoutDoc, ...bindings }, this.onError);
        }
    }

    // checks if the script compiles and switches to applied UI
    @action
    onApply = () => {
        if (this.onCompile()) {
            this._applied = true;
        }
    }

    @action
    onEdit = () => {
        this._errorMessage = "";
        this._applied = false;
        this._function = false;
    }

    @action
    onSave = () => {
        if (this.onCompile()) {
            this._function = true;
        } else {
            this._errorMessage = "Can not save script, does not compile";
        }
    }

    @action
    onCreate = () => {
        this._errorMessage = "";

        if (this.functionName.length === 0) {
            this._errorMessage = "Must enter a function name";
            return false;
        }

        if (this.functionName.indexOf(" ") > 0) {
            this._errorMessage = "Name can not include spaces";
            return false;
        }

        if (this.functionName.indexOf(".") > 0) {
            this._errorMessage = "Name can not include '.'";
            return false;
        }

        this.dataDoc.name = this.functionName;
        this.dataDoc.description = this.functionDescription;
        //this.dataDoc.parameters = this.compileParams;
        this.dataDoc.script = this.rawScript;

        ScriptManager.Instance.addScript(this.dataDoc);

        this._scriptKeys = Scripting.getGlobals();
        this._scriptingDescriptions = Scripting.getDescriptions();
        this._scriptingParams = Scripting.getParameters();
    }

    // overlays document numbers (ex. d32) over all documents when clicked on
    onFocus = () => {
        this._overlayDisposer?.();
        this._overlayDisposer = OverlayView.Instance.addElement(<DocumentIconContainer />, { x: 0, y: 0 });
    }

    // sets field of the corresponding field key (param name) to be dropped document
    @action
    onDrop = (e: Event, de: DragManager.DropEvent, fieldKey: string) => {
        this.dataDoc[fieldKey] = de.complete.docDragData?.droppedDocuments[0];
        e.stopPropagation();
    }

    // deletes a param from all areas in which it is stored 
    @action
    onDelete = (num: number) => {
        this.dataDoc[this.paramsNames[num]] = undefined;
        this.compileParams.splice(num, 1);
        return true;
    }

    // sets field of the param name to the selected value in drop down box
    @action
    viewChanged = (e: React.ChangeEvent, name: string) => {
        //@ts-ignore
        const val = e.target.selectedOptions[0].value;
        this.dataDoc[name] = val[0] === "S" ? val.substring(1) : val[0] === "N" ? parseInt(val.substring(1)) : val.substring(1) === "true";
    }

    // creates a copy of the script document
    onCopy = () => {
        const copy = Doc.MakeCopy(this.rootDoc, true);
        copy.x = NumCast(this.dataDoc.x) + NumCast(this.dataDoc._width);
        this.props.addDocument?.(copy);
    }

    // adds option to create a copy to the context menu
    specificContextMenu = (): void => {
        const existingOptions = ContextMenu.Instance.findByDescription("Options...");
        const options = existingOptions && "subitems" in existingOptions ? existingOptions.subitems : [];
        options.push({ description: "Create a Copy", event: this.onCopy, icon: "copy" });
        !existingOptions && ContextMenu.Instance.addItem({ description: "Options...", subitems: options, icon: "hand-point-right" });
    }

    renderFunctionInputs() {
        const descriptionInput =
            <textarea
                className="scriptingBox-textarea-inputs"
                onChange={e => this.functionDescription = e.target.value}
                placeholder="enter description here"
                value={this.functionDescription}
            />;
        const nameInput =
            <textarea
                className="scriptingBox-textarea-inputs"
                onChange={e => this.functionName = e.target.value}
                placeholder="enter name here"
                value={this.functionName}
            />;

        return <div className="scriptingBox-inputDiv" onPointerDown={e => this.props.isSelected() && e.stopPropagation()} >
            <div className="scriptingBox-wrapper" style={{ maxWidth: "100%" }}>
                <div className="container" style={{ maxWidth: "100%" }}>
                    <div className="descriptor" style={{ textAlign: "center", display: "inline-block", maxWidth: "100%" }}> Enter a function name: </div>
                    <div style={{ maxWidth: "100%" }}> {nameInput}</div>
                    <div className="descriptor" style={{ textAlign: "center", display: "inline-block", maxWidth: "100%" }}> Enter a function description: </div>
                    <div style={{ maxWidth: "100%" }}>{descriptionInput}</div>
                </div>
            </div>
            {this.renderErrorMessage()}
        </div>;
    }

    renderErrorMessage() {
        return !this._errorMessage ? (null) : <div className="scriptingBox-errorMessage"> {this._errorMessage} </div>;
    }

    // rendering when a doc's value can be set in applied UI
    renderDoc(parameter: string) {
        return <div className="scriptingBox-paramInputs" onFocus={this.onFocus} onBlur={() => this._overlayDisposer?.()}
            ref={ele => ele && this.createDashEventsTarget(ele, (e, de) => this.onDrop(e, de, parameter))} >
            <EditableView display={"block"} maxHeight={72} height={35} fontSize={14}
                contents={this.dataDoc[parameter]?.title ?? "undefined"}
                GetValue={() => this.dataDoc[parameter]?.title ?? "undefined"}
                SetValue={action((value: string) => {
                    const script = CompileScript(value, {
                        addReturn: true,
                        typecheck: false,
                        transformer: DocumentIconContainer.getTransformer()
                    });
                    const results = script.compiled && script.run();
                    if (results && results.success) {
                        this._errorMessage = "";
                        this.dataDoc[parameter] = results.result;
                        return true;
                    }
                    this._errorMessage = "invalid document";
                    return false;
                })}
            />
        </div>;
    }

    // rendering when a string's value can be set in applied UI
    renderBasicType(parameter: string, isNum: boolean) {
        const strVal = (isNum ? NumCast(this.dataDoc[parameter]).toString() : StrCast(this.dataDoc[parameter]));
        return <div className="scriptingBox-paramInputs" style={{ overflowY: "hidden" }}>
            <EditableView display={"block"} maxHeight={72} height={35} fontSize={14}
                contents={strVal ?? "undefined"}
                GetValue={() => strVal ?? "undefined"}
                SetValue={action((value: string) => {
                    const setValue = isNum ? parseInt(value) : value;
                    if (setValue !== undefined && setValue !== " ") {
                        this._errorMessage = "";
                        this.dataDoc[parameter] = setValue;
                        return true;
                    }
                    this._errorMessage = "invalid input";
                    return false;
                })}
            />
        </div>;
    }

    // rendering when an enum's value can be set in applied UI (drop down box)
    renderEnum(parameter: string, types: (string | boolean | number)[]) {
        return <div className="scriptingBox-paramInputs">
            <div className="scriptingBox-viewBase">
                <div className="commandEntry-outerDiv">
                    <select className="scriptingBox-viewPicker"
                        onPointerDown={e => e.stopPropagation()}
                        onChange={e => this.viewChanged(e, parameter)}
                        value={typeof (this.dataDoc[parameter]) === "string" ? "S" + StrCast(this.dataDoc[parameter]) :
                            typeof (this.dataDoc[parameter]) === "number" ? "N" + NumCast(this.dataDoc[parameter]) :
                                "B" + BoolCast(this.dataDoc[parameter])}>
                        {types.map(type =>
                            <option className="scriptingBox-viewOption" value={(typeof (type) === "string" ? "S" : typeof (type) === "number" ? "N" : "B") + type}> {type.toString()} </option>
                        )}
                    </select>
                </div>
            </div>
        </div>;
    }

    // setting a parameter (checking type and name before it is added)
    compileParam(value: string, whichParam?: number) {
        if (value.includes(":")) {
            const ptype = value.split(":")[1].trim();
            const pname = value.split(":")[0].trim();
            if (ptype === "Doc" || ptype === "string" || ptype === "number" || ptype === "boolean" || ptype.split("|")[1]) {
                if ((whichParam !== undefined && pname === this.paramsNames[whichParam]) || !this.paramsNames.includes(pname)) {
                    this._errorMessage = "";
                    if (whichParam !== undefined) {
                        this.compileParams[whichParam] = value;
                    } else {
                        this.compileParams = [...value.split(";").filter(s => s), ...this.compileParams];
                    }
                    return true;
                }
                this._errorMessage = "this name has already been used";
            } else {
                this._errorMessage = "this type is not supported";
            }
        } else {
            this._errorMessage = "must set type of parameter";
        }
        return false;
    }

    @action
    handleToken(str: string) {
        this._currWord = str;
        this._suggestions = [];
        this._scriptKeys.forEach((element: string) => {
            if (element.toLowerCase().indexOf(this._currWord.toLowerCase()) >= 0) {
                this._suggestions.push(StrCast(element));
            }
        });
        return (this._suggestions);
    }

    @action
    handleFunc(pos: number) {
        const scriptString = this.rawScript.slice(0, pos - 2);
        this._currWord = scriptString.split(" ")[scriptString.split(" ").length - 1];
        this._suggestions = [StrCast(this._scriptingParams[this._currWord])];
        return (this._suggestions);
    }


    getDescription(value: string) {
        const descrip = this._scriptingDescriptions[value];
        return descrip?.length > 0 ? descrip : "";
    }

    getParams(value: string) {
        const params = this._scriptingParams[value];
        return params?.length > 0 ? params : "";
    }

    returnParam(item: string) {
        const params = item.split(",");
        let value = "";
        let first = true;
        params.forEach((element) => {
            if (first) {
                value = element.split(":")[0].trim();
                first = false;
            } else {
                value = value + ", " + element.split(":")[0].trim();
            }
        });
        return value;
    }

    getSuggestedParams(pos: number) {
        const firstScript = this.rawScript.slice(0, pos);
        const indexP = firstScript.lastIndexOf(".");
        const indexS = firstScript.lastIndexOf(" ");
        const func = firstScript.slice((indexP > indexS ? indexP : indexS) + 1, firstScript.length + 1);
        return this._scriptingParams[func];
    }

    @action
    suggestionPos = () => {
        const getCaretCoordinates = require('textarea-caret');
        const This = this;
        document.querySelector('textarea')?.addEventListener("input", function () {
            const caret = getCaretCoordinates(this, this.selectionEnd);
            This._selection = this;
            This.resetSuggestionPos(caret);
        });
    }

    @action
    keyHandler(e: any, pos: number) {
        if (this._lastChar === "Enter") {
            this.rawScript = this.rawScript + " ";
        }
        if (e.key === "(") {
            this.suggestionPos();

            this._scriptParamsText = this.getSuggestedParams(pos);
            this._scriptSuggestedParams = this.getSuggestedParams(pos);

            if (this._scriptParamsText !== undefined && this._scriptParamsText.length > 0) {
                if (this.rawScript[pos - 2] !== "(") {
                    this._paramSuggestion = true;
                }
            }
        } else if (e.key === ")") {
            this._paramSuggestion = false;
        } else {
            if (e.key === "Backspace") {
                if (this._lastChar === "(") {
                    this._paramSuggestion = false;
                } else if (this._lastChar === ")") {
                    if (this.rawScript.slice(0, this.rawScript.length - 1).split("(").length - 1 > this.rawScript.slice(0, this.rawScript.length - 1).split(")").length - 1) {
                        if (this._scriptParamsText.length > 0) {
                            this._paramSuggestion = true;
                        }
                    }
                }
            } else if (this.rawScript.split("(").length - 1 <= this.rawScript.split(")").length - 1) {
                this._paramSuggestion = false;
            }
        }
        this._lastChar = e.key === "Backspace" ? this.rawScript[this.rawScript.length - 2] : e.key;

        if (this._paramSuggestion) {
            const parameters = this._scriptParamsText.split(",");
            const index = this.rawScript.lastIndexOf("(");
            const enteredParams = this.rawScript.slice(index, this.rawScript.length);
            const splitEntered = enteredParams.split(",");
            const numEntered = splitEntered.length;

            parameters.forEach((element: string, i: number) => {
                if (i !== parameters.length - 1) {
                    parameters[i] = element + ",";
                }
            });

            let first = "";
            let last = "";

            parameters.forEach((element: string, i: number) => {
                if (i < numEntered - 1) {
                    first = first + element;
                } else if (i > numEntered - 1) {
                    last = last + element;
                }
            });

            this._scriptSuggestedParams = <div> {first} <b>{parameters[numEntered - 1]}</b> {last} </div>;
        }
    }

    @action
    handlePosChange(number: any) {
        this._caretPos = number;
        if (this._caretPos === 0) {
            this.rawScript = " " + this.rawScript;
        } else if (this._spaced) {
            this._spaced = false;
            if (this.rawScript[this._caretPos - 1] === " ") {
                this.rawScript = this.rawScript.slice(0, this._caretPos - 1) +
                    this.rawScript.slice(this._caretPos, this.rawScript.length);
            }
        }
    }

    @computed({ keepAlive: true }) get renderScriptingBox() {
        TraceMobx();
        return <div style={{ width: this.compileParams.length > 0 ? "70%" : "100%" }} ref={this._scriptTextRef}>
            <ReactTextareaAutocomplete className="ScriptingBox-textarea-script"
                minChar={1}
                placeholder="write your script here"
                onFocus={this.onFocus}
                onBlur={() => this._overlayDisposer?.()}
                onChange={e => this.rawScript = e.target.value}
                value={this.rawScript}
                movePopupAsYouType={true}
                loadingComponent={() => <span>Loading</span>}

                trigger={{
                    " ": {
                        dataProvider: (token: any) => this.handleToken(token),
                        component: ({ entity: value }) => this.renderFuncListElement(value),
                        output: (item: any, trigger) => {
                            this._spaced = true;
                            return trigger + item.trim();
                        },
                    },
                    ".": {
                        dataProvider: (token: any) => this.handleToken(token),
                        component: ({ entity: value }) => this.renderFuncListElement(value),
                        output: (item: any, trigger) => {
                            this._spaced = true;
                            return trigger + item.trim();
                        },
                    }
                }}
                onKeyDown={(e) => this.keyHandler(e, this._caretPos)}
                onCaretPositionChange={(number: any) => this.handlePosChange(number)}
            />
        </div>;
    }

    renderFuncListElement(value: string) {
        return <div>
            <div style={{ fontSize: "14px" }}>
                {value}
            </div>
            <div key="desc" style={{ fontSize: "10px" }}>{this.getDescription(value)}</div>
            <div key="params" style={{ fontSize: "10px" }}>{this.getParams(value)}</div>
        </div>;
    }

    // inputs for scripting div (script box, params box, and params column)
    @computed get renderScriptingInputs() {
        TraceMobx();

        // should there be a border? style={{ borderStyle: "groove", borderBlockWidth: "1px" }}
        // params box on bottom
        const parameterInput = <div className="scriptingBox-params">
            <EditableView display={"block"} maxHeight={72} height={35} fontSize={22}
                contents={""}
                GetValue={returnEmptyString}
                SetValue={value => value && value !== " " ? this.compileParam(value) : false}
                placeholder={"enter parameters here"}
            />
        </div>;

        // params column on right side (list)
        const definedParameters = !this.compileParams.length ? (null) :
            <div className="scriptingBox-plist" style={{ width: "30%" }}>
                {this.compileParams.map((parameter, i) =>
                    <div className="scriptingBox-pborder" onKeyPress={e => e.key === "Enter" && this._overlayDisposer?.()} >
                        <EditableView display={"block"} maxHeight={72} height={35} fontSize={12} background-color={"beige"}
                            contents={parameter}
                            GetValue={() => parameter}
                            SetValue={value => value && value !== " " ? this.compileParam(value, i) : this.onDelete(i)}
                        />
                    </div>
                )}
            </div>;

        return <div className="scriptingBox-inputDiv" onPointerDown={e => this.props.isSelected() && e.stopPropagation()} >
            <div className="scriptingBox-wrapper">
                {this.renderScriptingBox}
                {definedParameters}
            </div>
            {parameterInput}
            {this.renderErrorMessage()}
        </div>;
    }

    // toolbar (with compile and apply buttons) for scripting UI
    renderScriptingTools() {
        const buttonStyle = "scriptingBox-button" + (this.rootDoc.layoutKey === "layout_onClick" ? "third" : "");
        return <div className="scriptingBox-toolbar">
            <button className={buttonStyle} style={{ width: "33%" }} onPointerDown={e => { this.onCompile(); e.stopPropagation(); }}>Compile</button>
            <button className={buttonStyle} style={{ width: "33%" }} onPointerDown={e => { this.onApply(); e.stopPropagation(); }}>Apply</button>
            <button className={buttonStyle} style={{ width: "33%" }} onPointerDown={e => { this.onSave(); e.stopPropagation(); }}>Save</button>

            {this.rootDoc.layoutKey !== "layout_onClick" ? (null) :
                <button className={buttonStyle} onPointerDown={e => { this.onFinish(); e.stopPropagation(); }}>Finish</button>}
        </div>;
    }

    // inputs UI for params which allows you to set values for each displayed in a list
    renderParamsInputs() {
        return <div className="scriptingBox-inputDiv" onPointerDown={e => this.props.isSelected(true) && e.stopPropagation()} >
            {!this.compileParams.length || !this.paramsNames ? (null) :
                <div className="scriptingBox-plist">
                    {this.paramsNames.map((parameter: string, i: number) =>
                        <div className="scriptingBox-pborder" onKeyPress={e => e.key === "Enter" && this._overlayDisposer?.()}  >
                            <div className="scriptingBox-wrapper" style={{ maxHeight: "40px" }}>
                                <div className="scriptingBox-paramNames" > {`${parameter}:${this.paramsTypes[i]} = `} </div>
                                {this.paramsTypes[i] === "boolean" ? this.renderEnum(parameter, [true, false]) : (null)}
                                {this.paramsTypes[i] === "string" ? this.renderBasicType(parameter, false) : (null)}
                                {this.paramsTypes[i] === "number" ? this.renderBasicType(parameter, true) : (null)}
                                {this.paramsTypes[i] === "Doc" ? this.renderDoc(parameter) : (null)}
                                {this.paramsTypes[i]?.split("|")[1] ? this.renderEnum(parameter, this.paramsTypes[i].split("|").map(s => !isNaN(parseInt(s.trim())) ? parseInt(s.trim()) : s.trim())) : (null)}
                            </div>
                        </div>)}
                </div>}
            {this.renderErrorMessage()}
        </div>;
    }

    // toolbar (with edit and run buttons and error message) for params UI
    renderTools(toolSet: string, func: () => void) {
        const buttonStyle = "scriptingBox-button" + (this.rootDoc.layoutKey === "layout_onClick" ? "third" : "");
        return <div className="scriptingBox-toolbar">
            <button className={buttonStyle} onPointerDown={e => { this.onEdit(); e.stopPropagation(); }}>Edit</button>
            <button className={buttonStyle} onPointerDown={e => { func(); e.stopPropagation(); }}>{toolSet}</button>
            {this.rootDoc.layoutKey !== "layout_onClick" ? (null) :
                <button className={buttonStyle} onPointerDown={e => { this.onFinish(); e.stopPropagation(); }}>Finish</button>}
        </div>;
    }

    // renders script UI if _applied = false and params UI if _applied = true
    render() {
        TraceMobx();
        return (
            <div className={`scriptingBox`} onContextMenu={this.specificContextMenu}
                onPointerUp={!this._function ? this.suggestionPos : undefined}>
                <div className="scriptingBox-outerDiv"
                    onWheel={e => this.props.isSelected(true) && e.stopPropagation()}>
                    {this._paramSuggestion ? <div className="boxed" ref={this._suggestionRef} style={{ left: this._suggestionBoxX + 20, top: this._suggestionBoxY - 15, display: "inline" }}> {this._scriptSuggestedParams} </div> : null}
                    {!this._applied && !this._function ? this.renderScriptingInputs : null}
                    {this._applied && !this._function ? this.renderParamsInputs() : null}
                    {!this._applied && this._function ? this.renderFunctionInputs() : null}

                    {!this._applied && !this._function ? this.renderScriptingTools() : null}
                    {this._applied && !this._function ? this.renderTools("Run", () => this.onRun()) : null}
                    {!this._applied && this._function ? this.renderTools("Create Function", () => this.onCreate()) : null}
                </div>
            </div>
        );
    }
}