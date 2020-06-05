import { action, computed, observable, trace, runInAction } from "mobx";
import { observer } from "mobx-react";
import * as React from "react";
import { Doc } from "../../../fields/Doc";
import { documentSchema } from "../../../fields/documentSchemas";
import { List } from "../../../fields/List";
import { createSchema, listSpec, makeInterface } from "../../../fields/Schema";
import { ScriptField } from "../../../fields/ScriptField";
import { Cast, NumCast, ScriptCast, StrCast } from "../../../fields/Types";
import { returnEmptyString } from "../../../Utils";
import { DragManager } from "../../util/DragManager";
import { InteractionUtils } from "../../util/InteractionUtils";
import { CompileScript, ScriptParam, Scripting } from "../../util/Scripting";
import { ContextMenu } from "../ContextMenu";
import { ViewBoxAnnotatableComponent } from "../DocComponent";
import { EditableView } from "../EditableView";
import { FieldView, FieldViewProps } from "../nodes/FieldView";
import { OverlayView } from "../OverlayView";
import { DocumentIconContainer } from "./DocumentIcon";
import "./ScriptingBox.scss";
const _global = (window /* browser */ || global /* node */) as any;

import ReactTextareaAutocomplete from "@webscopeio/react-textarea-autocomplete";
import "@webscopeio/react-textarea-autocomplete/style.css";


const ScriptingSchema = createSchema({});
type ScriptingDocument = makeInterface<[typeof ScriptingSchema, typeof documentSchema]>;
const ScriptingDocument = makeInterface(ScriptingSchema, documentSchema);

@observer
export class ScriptingBox extends ViewBoxAnnotatableComponent<FieldViewProps, ScriptingDocument>(ScriptingDocument) {

    private dropDisposer?: DragManager.DragDropDisposer;
    protected multiTouchDisposer?: InteractionUtils.MultiTouchEventDisposer | undefined;
    public static LayoutString(fieldStr: string) { return FieldView.LayoutString(ScriptingBox, fieldStr); }
    private _overlayDisposer?: () => void;

    @observable private _errorMessage: string = "";
    @observable private _applied: boolean = false;
    @observable private _hovered: boolean = false;
    @observable private _spaced: boolean = false;
    @observable private _scriptKeys: any = Scripting.getGlobals();
    @observable private _scriptGlobals: any = Scripting.getGlobalObj();
    @observable private _currWord: string = "";
    @observable private _suggestions: string[] = [];
    @observable private _paramSuggestion: boolean = false;
    @observable private _scriptSuggestedParams: any = "";

    @observable private _suggestionBoxX: number = 0;
    @observable private _suggestionBoxY: number = 0;
    @observable private _lastChar: string = "";

    @observable private _suggestionRef: any = React.createRef();
    @observable private _scriptTextRef: any = React.createRef();

    @observable private _panelWidth = 0;
    @observable private _panelHeight = 0;

    @observable private _selection: any = 0;
    @observable private _selectionEnd: any = 0;

    // vars included in fields that store parameters types and names and the script itself
    @computed({ keepAlive: true }) get paramsNames() { return this.compileParams.map(p => p.split(":")[0].trim()); }
    @computed({ keepAlive: true }) get paramsTypes() { return this.compileParams.map(p => p.split(":")[1].trim()); }
    @computed({ keepAlive: true }) get rawScript() { return StrCast(this.dataDoc[this.props.fieldKey + "-rawScript"], ""); }
    @computed({ keepAlive: true }) get compileParams() { return Cast(this.dataDoc[this.props.fieldKey + "-params"], listSpec("string"), []); }
    set rawScript(value) { this.dataDoc[this.props.fieldKey + "-rawScript"] = value; }
    set compileParams(value) { this.dataDoc[this.props.fieldKey + "-params"] = new List<string>(value); }

    // WORK ON THIS
    // in: global, description, params
    @computed get _descriptions() {
        const descrip: string[] = [];
        let value = "";
        this._scriptKeys.forEach((element: any) => {
            const result = this._scriptGlobals[element];
            if (typeof result === "object") {
                const d = result[1];
                if (d !== undefined) {
                    value = d;
                } else {
                    value = "";
                }
            } else {
                value = "";
            }
            descrip.push(value);
        });
        return descrip;
    }

    @computed get _scriptParams() {
        const params: string[] = [];
        let value = "";
        this._scriptKeys.forEach((element: any) => {
            const result = this._scriptGlobals[element];
            if (typeof result === "object") {
                const p = result[2];
                if (p !== undefined) {
                    value = StrCast(p);
                } else {
                    value = "";
                }
            } else {
                value = "";
            }
            params.push(value);
        });
        return params;
    }


    @action
    componentDidMount() {
        this.rawScript = ScriptCast(this.dataDoc[this.props.fieldKey])?.script?.originalScript ?? this.rawScript;

        const observer = new _global.ResizeObserver(action((entries: any) => {
            for (const entry of entries) {
                this._panelWidth = entry.contentRect.width;
                this._panelHeight = entry.contentRect.height;

                const getCaretCoordinates = require('textarea-caret');
                const caret = getCaretCoordinates(this._selection, this._selectionEnd);
                console.log('(top, left, height) = (%s, %s, %s)', caret.top, caret.left, caret.height);
                let top = caret.top;
                let left = caret.left;

                const x = this.dataDoc.x;
                const suggestionWidth = this._suggestionRef.current.offsetWidth;
                const scriptWidth = this._scriptTextRef.current.offsetWidth;
                if ((left + suggestionWidth) > (x + scriptWidth)) {
                    const diff = (left + suggestionWidth) - (x + scriptWidth);
                    left = left - diff;
                }

                runInAction(() => {
                    this._suggestionBoxX = left;
                    this._suggestionBoxY = top;
                });
            }
        }));
        observer.observe(document.getElementsByClassName("scriptingBox")[0]);
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
        this.rootDoc._height = 50;
        this.rootDoc._width = 100;
        this.dataDoc.documentText = this.rawScript;
    }

    // displays error message
    @action
    onError = (error: any) => {
        this._errorMessage = error?.map((entry: any) => entry.messageText).join("  ") || "";
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
            typecheck: true
        });
        this.dataDoc.documentText = this.rawScript;
        this.dataDoc.data = result.compiled ? new ScriptField(result) : undefined;
        this.onError(result.compiled ? undefined : result.errors);
    }

    // checks if the script compiles and then runs the script
    @action
    onRun = () => {
        this.onCompile();
        const bindings: { [name: string]: any } = {};
        this.paramsNames.forEach(key => bindings[key] = this.dataDoc[key]);
        // binds vars so user doesnt have to refer to everything as self.<var>
        ScriptCast(this.dataDoc.data, null)?.script.run({ self: this.rootDoc, this: this.layoutDoc, ...bindings }, this.onError);
    }

    // checks if the script compiles and switches to applied UI
    @action
    onApply = () => {
        this.onCompile();
        this._applied = true;
    }

    @action
    onEdit = () => {
        this._applied = false;
    }

    // overlays document numbers (ex. d32) over all documents when clicked on
    onFocus = () => {
        // this._overlayDisposer?.();
        // this._overlayDisposer = OverlayView.Instance.addElement(<DocumentIconContainer />, { x: 0, y: 0 });
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
        this.dataDoc[name] = e.target.selectedOptions[0].value;
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
    renderString(parameter: string) {
        return <div className="scriptingBox-paramInputs">
            <EditableView display={"block"} maxHeight={72} height={35} fontSize={14}
                contents={this.dataDoc[parameter] ?? "undefined"}
                GetValue={() => StrCast(this.dataDoc[parameter]) ?? "undefined"}
                SetValue={action((value: string) => {
                    if (value && value !== " ") {
                        this._errorMessage = "";
                        this.dataDoc[parameter] = value;
                        return true;
                    }
                    return false;
                })}
            />
        </div>;
    }

    // rendering when a number's value can be set in applied UI
    renderNumber(parameter: string) {
        return <div className="scriptingBox-paramInputs">
            <EditableView display={"block"} maxHeight={72} height={35} fontSize={14}
                contents={this.dataDoc[parameter] ?? "undefined"}
                GetValue={() => StrCast(this.dataDoc[parameter]) ?? "undefined"}
                SetValue={action((value: string) => {
                    if (value && value !== " ") {
                        if (parseInt(value)) {
                            this._errorMessage = "";
                            this.dataDoc[parameter] = parseInt(value);
                            return true;
                        }
                        this._errorMessage = "not a number";
                    }
                    return false;
                })}
            />
        </div>;
    }

    // rendering when an enum's value can be set in applied UI (drop down box)
    renderEnum(parameter: string, types: string[]) {
        return <div className="scriptingBox-paramInputs">
            <div className="scriptingBox-viewBase">
                <div className="commandEntry-outerDiv">
                    <select className="scriptingBox-viewPicker"
                        onPointerDown={e => e.stopPropagation()}
                        onChange={e => this.viewChanged(e, parameter)}
                        value={this.dataDoc[parameter]}>

                        {types.map(type =>
                            <option className="scriptingBox-viewOption" value={type.trim()}> {type.trim()} </option>
                        )}
                    </select>
                </div>
            </div>
        </div>;
    }

    // rendering when a boolean's value can be set in applied UI (drop down box)
    renderBoolean(parameter: string) {
        return <div className="scriptingBox-paramInputs">
            <div className="scriptingBox-viewBase">
                <div className="commandEntry-outerDiv">
                    <select className="scriptingBox-viewPicker"
                        onPointerDown={e => e.stopPropagation()}
                        onChange={e => this.viewChanged(e, parameter)}
                        value={this.dataDoc[parameter]}>
                        <option className="scriptingBox-viewOption" value={"true"}>true </option>
                        <option className="scriptingBox-viewOption" value={"false"}>false</option>
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


    // @action
    // handleKeyPress(e: React.ChangeEvent<HTMLTextAreaElement>) {

    //     this.rawScript = e.target.value;
    //     this._currWord = e.target.value.split(" ")[e.target.value.split(" ").length - 1];
    //     this._suggestions = [];

    //     this._scriptKeys.forEach((element: string | string[]) => {
    //         if (element.indexOf(this._currWord) >= 0) {
    //             this._suggestions.push(element);
    //         }
    //     });
    //     console.log(this._suggestions);
    // }

    // @action
    // handleKeyPress(num: number) {

    //     const scriptString = this.rawScript.slice(0, num);

    //     this._currWord = scriptString.split(" ")[scriptString.split(" ").length - 1];
    //     this._suggestions = [];

    //     this._scriptKeys.forEach((element: string) => {
    //         if (element.indexOf(this._currWord) >= 0) {
    //             this._suggestions.push(StrCast(element));
    //         }
    //     });

    //     console.log(this._suggestions);
    //     return (this._suggestions);
    // }

    @action
    handleToken(str: string) {

        this._currWord = str;
        this._suggestions = [];

        this._scriptKeys.forEach((element: string) => {
            if (element.toLowerCase().indexOf(this._currWord.toLowerCase()) >= 0) {
                this._suggestions.push(StrCast(element));
            }
        });

        console.log(this._suggestions);
        return (this._suggestions);
    }

    @action
    handleFunc(pos: number) {
        const scriptString = this.rawScript.slice(0, pos - 2);
        this._currWord = scriptString.split(" ")[scriptString.split(" ").length - 1];
        this._suggestions = [];

        const index = this._scriptKeys.indexOf(this._currWord);
        const params = StrCast(this._scriptParams[index]);

        this._suggestions.push(params);

        console.log(this._suggestions);

        return (this._suggestions);
    }


    getDescription(value: string) {
        const index = this._scriptKeys.indexOf(value);
        const descrip = this._descriptions[index];
        let display = "";
        if (descrip !== undefined) {
            if (descrip.length > 0) {
                display = descrip;
            }
        }
        return display;
    }

    getParams(value: string) {
        const index = this._scriptKeys.indexOf(value);
        const descrip = this._scriptParams[index];
        let display = "";
        if (descrip !== undefined) {
            if (descrip.length > 0) {
                display = descrip;
            }
        }
        return display;
    }

    setHovered(bool: boolean) {
        this._hovered = bool;
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
        let func = "";
        if (indexP > indexS) {
            func = firstScript.slice(indexP + 1, firstScript.length + 1);
        } else {
            func = firstScript.slice(indexS + 1, firstScript.length + 1);
        }

        console.log(func);

        const indexF = this._scriptKeys.indexOf(func);

        return this._scriptParams[indexF];
    }

    @action
    suggestionPos() {

        console.log("suggestionPos");

        const getCaretCoordinates = require('textarea-caret');
        const This = this;
        document.querySelector('textarea')?.addEventListener("input", function () {
            const caret = getCaretCoordinates(this, this.selectionEnd);
            This._selection = this;
            This._selectionEnd = this.selectionEnd;

            console.log('(top, left, height) = (%s, %s, %s)', caret.top, caret.left, caret.height);
            let top = caret.top;
            let left = caret.left;

            const x = This.dataDoc.x;
            const suggestionWidth = This._suggestionRef.current.offsetWidth;
            const scriptWidth = This._scriptTextRef.current.offsetWidth;
            if ((left + suggestionWidth) > (x + scriptWidth)) {
                const diff = (left + suggestionWidth) - (x + scriptWidth);
                left = left - diff;
            }

            runInAction(() => {
                This._suggestionBoxX = left;
                This._suggestionBoxY = top;
            });
        });
    }

    @action
    keyHandler(e: any, pos: number) {
        if (this._lastChar === "Enter") {
            this.rawScript = this.rawScript + " ";
        }
        console.log(e.key);
        if (e.key === "(") {
            console.log("hello");
            this.suggestionPos();

            this._scriptSuggestedParams = this.getSuggestedParams(pos);

            //this._scriptSuggestedParams = <div> </div>;

            if (this._scriptSuggestedParams !== undefined && this._scriptSuggestedParams.length > 0) {
                if (this.rawScript[pos - 2] !== "(") {
                    console.log("suggestion params");
                    this._paramSuggestion = true;
                }
            }
        } else if (e.key === ")") {
            this._paramSuggestion = false;
        } else {
            console.log(this.rawScript.split("(").length - 1);
            console.log(this.rawScript.split(")").length - 1);
            if (e.key === "Backspace") {
                if (this._lastChar === "(") {
                    console.log("removed params");
                    this._paramSuggestion = false;
                } else if (this._lastChar === ")") {
                    if (this.rawScript.slice(0, this.rawScript.length - 1).split("(").length - 1 > this.rawScript.slice(0, this.rawScript.length - 1).split(")").length - 1) {
                        if (this._scriptSuggestedParams.length > 0) {
                            console.log("suggestion params");
                            this._paramSuggestion = true;
                        }
                    }
                }
            } else {
                if (this.rawScript.split("(").length - 1 <= this.rawScript.split(")").length - 1) {
                    console.log("removed params");
                    this._paramSuggestion = false;
                }
            }

        }
        if (e.key === "Backspace") {
            this._lastChar = this.rawScript[this.rawScript.length - 2];
            console.log("last char: " + this._lastChar);
        } else {
            this._lastChar = e.key;
        }
    }

    @action
    handlePosChange(number: any) {
        this.caretPos = number;
        if (this.caretPos === 0) {
            this.rawScript = " " + this.rawScript;
        } else if (this._spaced) {
            this._spaced = false;
            if (this.rawScript[this.caretPos - 1] === " ") {
                this.rawScript = this.rawScript.slice(0, this.caretPos - 1) +
                    this.rawScript.slice(this.caretPos, this.rawScript.length);
            }
        }

        // if (this.rawScript[this.rawScript.length - 1] !== "(") {
        //     this._paramSuggestion = false;
        // }
    }

    caretPos = 0;
    textarea: any;
    @computed({ keepAlive: true }) get renderScriptingBox() {

        trace();
        return <div style={{ width: this.compileParams.length > 0 ? "70%" : "100%" }} ref={this._scriptTextRef}>
            <ReactTextareaAutocomplete className="ScriptingBox-textarea" style={{ resize: "none", height: "100%" }}
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
                        component: ({ entity: value }) =>
                            <div>
                                <div style={{ fontSize: "14px" }}
                                    onMouseEnter={() => this.setHovered(true)}
                                    onMouseLeave={() => this.setHovered(false)}>
                                    {value}
                                </div>
                                {/* {!this._hovered ? (null) :
                                    <> */}
                                <div key="desc" style={{ fontSize: "10px" }}>{this.getDescription(value)}</div>
                                <div key="params" style={{ fontSize: "10px" }}>{this.getParams(value)}</div>
                                {/* </>
                                } */}
                            </div>,
                        output: (item: any, trigger) => {
                            this._spaced = true;
                            return trigger + item.trim();
                        },
                    },
                    ".": {
                        dataProvider: (token: any) => this.handleToken(token),
                        component: ({ entity: value }) =>
                            <div>
                                <div style={{ fontSize: "14px" }}
                                    onMouseEnter={() => this.setHovered(true)}
                                    onMouseLeave={() => this.setHovered(false)}>
                                    {value}
                                </div>
                                {/* {!this._hovered ? (null) :
                                    <> */}
                                <div key="desc" style={{ fontSize: "10px" }}>{this.getDescription(value)}</div>
                                <div key="params" style={{ fontSize: "10px" }}>{this.getParams(value)}</div>
                                {/* </>
                                } */}
                            </div>,
                        output: (item: any, trigger) => {
                            this._spaced = true;
                            return trigger + item.trim();
                        },
                    }
                }}

                onKeyDown={(e) => this.keyHandler(e, this.caretPos)}

                onCaretPositionChange={(number: any) => this.handlePosChange(number)}
            />
        </div>;
    }

    // inputs for scripting div (script box, params box, and params column)
    @computed({ keepAlive: true }) get renderScriptingInputs() {

        // params box on bottom
        const parameterInput = <div className="scriptingBox-params">
            <EditableView display={"block"} maxHeight={72} height={35} fontSize={22}
                contents={""}
                GetValue={returnEmptyString}
                SetValue={value => value && value !== " " ? this.compileParam(value) : false}
            />
        </div>;

        // const scriptText =
        //     <textarea onFocus={this.onFocus} onBlur={e => this._overlayDisposer?.()}
        //         onChange={e => this.rawScript = e.target.value}
        //         placeholder="write your script here"
        //         value={this.rawScript}
        //         style={{ width: this.compileParams.length > 0 ? "70%" : "100%", resize: "none", height: "100%" }}
        //     />;



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
            <button className={buttonStyle} onPointerDown={e => { this.onCompile(); e.stopPropagation(); }}>Compile</button>
            <button className={buttonStyle} onPointerDown={e => { this.onApply(); e.stopPropagation(); }}>Apply</button>
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
                            <div className="scriptingBox-wrapper">
                                <div className="scriptingBox-paramNames"> {`${parameter}:${this.paramsTypes[i]} = `} </div>
                                {this.paramsTypes[i] === "boolean" ? this.renderBoolean(parameter) : (null)}
                                {this.paramsTypes[i] === "string" ? this.renderString(parameter) : (null)}
                                {this.paramsTypes[i] === "number" ? this.renderNumber(parameter) : (null)}
                                {this.paramsTypes[i] === "Doc" ? this.renderDoc(parameter) : (null)}
                                {this.paramsTypes[i]?.split("|")[1] ? this.renderEnum(parameter, this.paramsTypes[i].split("|")) : (null)}
                            </div>
                        </div>)}
                </div>}
        </div>;
    }

    // toolbar (with edit and run buttons and error message) for params UI
    renderParamsTools() {
        const buttonStyle = "scriptingBox-button" + (this.rootDoc.layoutKey === "layout_onClick" ? "third" : "");
        return <div className="scriptingBox-toolbar">
            {this.renderErrorMessage()}
            <button className={buttonStyle} onPointerDown={e => { this.onEdit(); e.stopPropagation(); }}>Edit</button>
            <button className={buttonStyle} onPointerDown={e => { this.onRun(); e.stopPropagation(); }}>Run</button>
            {this.rootDoc.layoutKey !== "layout_onClick" ? (null) :
                <button className={buttonStyle} onPointerDown={e => { this.onFinish(); e.stopPropagation(); }}>Finish</button>}
        </div>;
    }

    // renders script UI if _applied = false and params UI if _applied = true
    render() {
        return (
            <div className={`scriptingBox`} onContextMenu={this.specificContextMenu}
                onPointerUp={this.suggestionPos}>
                <div className="scriptingBox-outerDiv"
                    onWheel={e => this.props.isSelected(true) && e.stopPropagation()}>
                    {this._paramSuggestion ? <div className="boxed" ref={this._suggestionRef} style={{ left: this._suggestionBoxX + 20, top: this._suggestionBoxY - 15, display: "inline" }}> {this._scriptSuggestedParams} </div> : null}
                    {!this._applied ? this.renderScriptingInputs : this.renderParamsInputs()}
                    {!this._applied ? this.renderScriptingTools() : this.renderParamsTools()}
                </div>
            </div>
        );
    }
}