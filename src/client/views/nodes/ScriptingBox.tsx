import { action, observable, computed, _allowStateChangesInsideComputed, runInAction } from "mobx";
import { observer } from "mobx-react";
import * as React from "react";
import { documentSchema } from "../../../fields/documentSchemas";
import { createSchema, makeInterface, listSpec } from "../../../fields/Schema";
import { ScriptField, ComputedField } from "../../../fields/ScriptField";
import { StrCast, ScriptCast, Cast, NumCast } from "../../../fields/Types";
import { InteractionUtils } from "../../util/InteractionUtils";
import { CompileScript, ScriptSucccess, ScriptParam } from "../../util/Scripting";
import { ViewBoxAnnotatableComponent } from "../DocComponent";
import { EditableView } from "../EditableView";
import { FieldView, FieldViewProps } from "../nodes/FieldView";
import "./ScriptingBox.scss";
import { OverlayView } from "../OverlayView";
import { DocumentIconContainer, DocumentIcon } from "./DocumentIcon";
import { List } from "../../../fields/List";
import { DragManager } from "../../util/DragManager";
import { ContextMenuProps } from "../ContextMenuItem";
import { copy } from "typescript-collections/dist/lib/arrays";
import { Doc, WidthSym } from "../../../fields/Doc";
import { ContextMenu } from "../ContextMenu";

const ScriptingSchema = createSchema({});
type ScriptingDocument = makeInterface<[typeof ScriptingSchema, typeof documentSchema]>;
const ScriptingDocument = makeInterface(ScriptingSchema, documentSchema);


@observer
export class ScriptingBox extends ViewBoxAnnotatableComponent<FieldViewProps, ScriptingDocument>(ScriptingDocument) {

    private dropDisposer?: DragManager.DragDropDisposer;
    protected multiTouchDisposer?: InteractionUtils.MultiTouchEventDisposer | undefined;
    public static LayoutString(fieldStr: string) { return FieldView.LayoutString(ScriptingBox, fieldStr); }
    private _overlayDisposer?: () => void;
    rowProps: any;
    _paramNum: number = 0;

    @observable private _errorMessage: string = "";
    @observable private _applied: boolean = false;
    // @observable private _paramsNames: string[] = [];
    // @observable private _paramsTypes: string[] = [];
    // @observable private _paramsValues: string[] = [];
    // @observable private _paramsCollapsed: boolean[] = [];

    protected createDashEventsTarget = (ele: HTMLDivElement, dropFunc: (e: Event, de: DragManager.DropEvent) => void) => { //used for stacking and masonry view
        if (ele) {
            this.dropDisposer?.();
            this.dropDisposer = DragManager.MakeDropTarget(ele, dropFunc, this.layoutDoc);
        }
    }

    @computed get rawScript() { return StrCast(this.dataDoc[this.props.fieldKey + "-rawScript"], StrCast(this.layoutDoc[this.props.fieldKey + "-rawScript"])); }
    @computed get compileParams() { return Cast(this.dataDoc[this.props.fieldKey + "-params"], listSpec("string"), Cast(this.layoutDoc[this.props.fieldKey + "-params"], listSpec("string"), [])); }
    set rawScript(value) { this.dataDoc[this.props.fieldKey + "-rawScript"] = value; }

    @computed get _paramsNames() { return Cast(this.dataDoc[this.props.fieldKey + "-paramsNames"], listSpec("string"), Cast(this.layoutDoc[this.props.fieldKey + "-paramsNames"], listSpec("string"), [])); }
    @computed get _paramsTypes() { return Cast(this.dataDoc[this.props.fieldKey + "-paramsTypes"], listSpec("string"), Cast(this.layoutDoc[this.props.fieldKey + "-paramsTypes"], listSpec("string"), [])); }
    @computed get _paramsValues() { return Cast(this.dataDoc[this.props.fieldKey + "-paramsValues"], listSpec("string"), Cast(this.layoutDoc[this.props.fieldKey + "-paramsValues"], listSpec("string"), [])); }
    @computed get _paramsCollapsed() { return Cast(this.dataDoc[this.props.fieldKey + "-paramsCollapsed"], listSpec("boolean"), Cast(this.layoutDoc[this.props.fieldKey + "-paramsCollapsed"], listSpec("boolean"), [])); }

    set compileParams(value) { this.dataDoc[this.props.fieldKey + "-params"] = value; }

    set _paramsNames(value: string[]) {
        for (const param of this.compileParams) {
            value.push(param.split(":")[0].trim());
        }
    }
    set _paramsTypes(value: string[]) {
        for (const param of this.compileParams) {
            value.push(param.split(":")[1].trim());
        }
    }
    set _paramsValues(value: string[]) {
        for (const param of this.compileParams) {
            value.push("undefined");
        }
    }
    set _paramsCollapsed(value: boolean[]) {
        for (const param of this.compileParams) {
            value.push(true);
        }
    }

    stopPropagation = (e: React.SyntheticEvent) => e.stopPropagation();

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
        this.dataDoc.documentText = this.rawScript;
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
            this.dataDoc.data = new ScriptField(result);
        }
        else {
            this.onError(result.errors);
        }
        this.dataDoc.documentText = this.rawScript;
    }


    @action
    onRun = () => {
        const params = this.compileParams.reduce((o: ScriptParam, p: string) => {
            const param = p.split(":");
            o[param[0].trim()] = param[1].trim();
            return o;
        },
            {} as ScriptParam);

        const bindings: { [name: string]: any } = {};
        Array.from(Object.keys(params)).forEach(key => bindings[key] = this.dataDoc[key]);
        const result = CompileScript(this.rawScript, {
            editable: true,
            transformer: DocumentIconContainer.getTransformer(),
            params,
            typecheck: true
        });
        this._errorMessage = "";
        if (result.compiled) {
            // this automatically saves
            result.run({ self: this.rootDoc, this: this.layoutDoc, ...bindings }, (err: any) => {
                this._errorMessage = "";
                this.onError(err);
            });
            this.dataDoc.data = new ScriptField(result);
        }
        else {
            this.onError(result.errors);
        }
        this.dataDoc.documentText = this.rawScript;
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
            this.dataDoc.data = new ScriptField(result);

            this._applied = true;
        }
        else {
            this.onError(result.errors);
        }
        this.dataDoc.documentText = this.rawScript;
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
    onDrop = (e: Event, de: DragManager.DropEvent, fieldKey: string) => {
        console.log("drop");
        const droppedDocs = de.complete.docDragData?.droppedDocuments;
        if (droppedDocs?.length) {
            const dropped = droppedDocs[0];
            this.dataDoc[fieldKey] = dropped;
            const num = this._paramsNames.indexOf(fieldKey);
            this._paramsValues[num] = StrCast(dropped.title);
        }
        e.stopPropagation();
    }

    @action
    onDelete = (num: number) => {
        this.compileParams.splice(num, 1);
        const name = this._paramsNames[this._paramsNames.length - num - 1];
        this.dataDoc[name] = undefined;
        this._paramsNames.splice(this._paramsNames.length - num - 1, 1);
        this._paramsTypes.splice(this._paramsTypes.length - num - 1, 1);
        this._paramsValues.splice(this._paramsValues.length - num - 1, 1);
    }

    @action
    viewChanged = (e: React.ChangeEvent, i: number, name: string) => {
        //@ts-ignore
        this.dataDoc[name] = e.target.selectedOptions[0].value;
        //@ts-ignore
        this._paramsValues[i] = e.target.selectedOptions[0].value;
    }

    @action
    selected = (val: string, index: number, name: string) => {
        this.stopPropagation;
        this.dataDoc[name] = val;
        this._paramsValues[index] = val;
    }

    @action
    toggleCollapse = (num: number) => {
        if (this._paramsCollapsed[num]) {
            this._paramsCollapsed[num] = false;
        } else {
            this._paramsCollapsed[num] = true;
        }
    }

    @action
    selectedBool = (val: boolean, index: number, name: string) => {
        this.stopPropagation;
        if (val) {
            this._paramsValues[index] = "true";
            this.dataDoc[name] = true;
        } else {
            this._paramsValues[index] = "false";
            this.dataDoc[name] = false;
        }
    }

    onCopy = () => {
        const copy = Doc.MakeCopy(this.rootDoc, true);
        copy.x = Number(this.dataDoc._width) + Number(this.dataDoc.x);
        this.props.addDocument?.(copy);
    }

    specificContextMenu = (e: React.MouseEvent): void => {
        const existingMore = ContextMenu.Instance.findByDescription("More...");
        const mores: ContextMenuProps[] = existingMore && "subitems" in existingMore ? existingMore.subitems : [];
        mores.push({ description: "Create a Copy", event: this.onCopy, icon: "copy" });
        !existingMore && ContextMenu.Instance.addItem({ description: "More...", subitems: mores, icon: "hand-point-right" });
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
                        if (parameter[1].trim() === "Doc" || parameter[1].trim() === "string"
                            || parameter[1].split("|")[1] || parameter[1].trim() === "number"
                            || parameter[1].trim() === "boolean") {

                            if (!!!this._paramsNames.includes(parameter[0].trim()) &&
                                this.dataDoc[parameter[0].trim()] === undefined) {

                                this._errorMessage = "";
                                this._paramNum++;
                                const par = this.compileParams;
                                this.compileParams = new List<string>(value.split(";").filter(s => s !== " "));
                                this.compileParams.push.apply(this.compileParams, par);
                                this._paramsNames.push(parameter[0].trim());
                                this._paramsTypes.push(parameter[1].trim());
                                this._paramsValues.push("undefined");
                                this._paramsCollapsed.push(true);
                                return true;

                            } else {
                                this._errorMessage = "this name has already been used";
                                return false;
                            }
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


        // might want to change this display later on
        const listParams = this.compileParams.map((parameter, i) =>
            <div className="scriptingBox-pborder"
                background-color="white"
                onKeyPress={e => e.key === "Enter" && this._overlayDisposer?.()}
            >
                <EditableView
                    contents={parameter}
                    display={"block"}
                    maxHeight={72}
                    height={35}
                    fontSize={12}
                    GetValue={() => parameter}
                    SetValue={value => {
                        if (value && value !== " ") {
                            const parameter = value.split(":");
                            if (parameter[1] !== undefined) {
                                if (parameter[1].trim() === "Doc" || parameter[1].trim() === "string"
                                    || parameter[1].split("|")[1] || parameter[1].trim() === "number"
                                    || parameter[1].trim() === "boolean") {

                                    if ((!!!this._paramsNames.includes(parameter[0].trim()) &&
                                        this.dataDoc[parameter[0].trim()] === undefined) || parameter[0].trim() === this._paramsNames[this._paramsNames.length - i - 1]) {
                                        this._errorMessage = "";
                                        this._paramsNames[this._paramsNames.length - i - 1] = parameter[0].trim();
                                        this._paramsTypes[this._paramsTypes.length - i - 1] = parameter[1].trim();
                                        this._paramsValues[this._paramsValues.length - i - 1] = "undefined";
                                        this.compileParams[i] = value;
                                        return true;

                                    } else {
                                        this._errorMessage = "this name has already been used";
                                        return false;
                                    }
                                } else {
                                    this._errorMessage = "this type is not supported";
                                    return false;
                                }
                            } else {
                                this._errorMessage = "must set type of parameter";
                                return false;
                            }
                        } else {
                            this.onDelete(i);
                            return true;
                        }
                    }}
                />
            </div>
        );


        const settingParams = this._paramsNames.map((parameter: string, i: number) =>
            <div className="scriptingBox-pborder"
                background-color="white"
                onKeyPress={e => e.key === "Enter" && this._overlayDisposer?.()}
            >

                {this._paramsTypes[i] === "Doc" ? <div>
                    <div className="scriptingBox-wrapper">

                        <div className="scriptingBox-paramNames">
                            {parameter + ":" + this._paramsTypes[i] + " = "}
                        </div>

                        <div className="scriptingBox-paramInputs"
                            ref={ele => ele && this.createDashEventsTarget(ele, (e, de) => this.onDrop(e, de, this._paramsNames[i]))}
                            onFocus={this.onFocus}>
                            <EditableView
                                contents={this._paramsValues[i]}
                                display={"block"}
                                maxHeight={72}
                                height={35}
                                fontSize={14}
                                GetValue={() => this._paramsValues[i]}
                                SetValue={action((value: string) => {
                                    const script = CompileScript(
                                        value, {
                                        addReturn: true,
                                        typecheck: false,
                                        transformer: DocumentIconContainer.getTransformer(),
                                        params: { makeInterface: "any" }
                                    });
                                    const results = script.compiled && script.run();
                                    if (results && results.success) {
                                        this._errorMessage = "";
                                        this.dataDoc[parameter] = results.result;
                                        this._paramsValues[i] = results.result.title;
                                        return true;
                                    } else {
                                        this._errorMessage = "invalid document";
                                        return false;
                                    }
                                })
                                }
                            />
                        </div>
                    </div>
                </div> : null}


                {this._paramsTypes[i] === "string" ? <div>
                    <div className="scriptingBox-wrapper">
                        <div className="scriptingBox-paramNames">
                            {parameter + ":" + this._paramsTypes[i] + " = "}
                        </div>
                        <div className="scriptingBox-paramInputs">
                            <EditableView
                                contents={this.dataDoc[parameter] ?? "undefined"}
                                display={"block"}
                                maxHeight={72}
                                height={35}
                                fontSize={14}
                                GetValue={() => StrCast(this.dataDoc[parameter]) ?? "undefined"}
                                SetValue={action((value: string) => {
                                    if (value !== "" && value !== " ") {
                                        this._errorMessage = "";
                                        this.dataDoc[parameter] = value;
                                        this._paramsValues[i] = value;
                                        return true;
                                    }
                                    return false;
                                })}
                            />
                        </div>
                    </div>
                </div> : null}

                {this._paramsTypes[i] === "number" ? <div>
                    <div className="scriptingBox-wrapper">
                        <div className="scriptingBox-paramNames">
                            {parameter + ":" + this._paramsTypes[i] + " = "}
                        </div>
                        <div className="scriptingBox-paramInputs">
                            <EditableView
                                contents={this.dataDoc[parameter] ?? "undefined"}
                                display={"block"}
                                maxHeight={72}
                                height={35}
                                fontSize={14}
                                GetValue={() => StrCast(this.dataDoc[parameter]) ?? "undefined"}
                                SetValue={action((value: string) => {
                                    if (value !== "" && value !== " ") {
                                        if (parseInt(value)) {
                                            this._errorMessage = "";
                                            this.dataDoc[parameter] = parseInt(value);
                                            this._paramsValues[i] = StrCast(parseInt(value));
                                            return true;
                                        } else {
                                            this._errorMessage = "not a number";
                                            return false;
                                        }
                                    } else {
                                        return false;
                                    }
                                })}
                            />
                        </div>
                    </div>
                </div> : null}

                {this._paramsTypes[i]?.split("|")[1] ? <div>
                    <div className="scriptingBox-wrapper">
                        <div className="scriptingBox-paramNames">
                            {parameter + ":" + this._paramsTypes[i] + " = "}
                        </div>

                        <div className="scriptingBox-paramInputs">
                            <div className="scriptingBox-viewBase">
                                <div className="commandEntry-outerDiv">
                                    <select
                                        className="scriptingBox-viewPicker"
                                        onPointerDown={this.stopPropagation}
                                        onChange={(e: React.ChangeEvent) => this.viewChanged(e, i, parameter)}
                                        value={this._paramsValues[i]}>

                                        {this._paramsTypes[i].split("|").map((type: string) =>
                                            <option
                                                className="scriptingBox-viewOption"
                                                onPointerDown={(e: React.PointerEvent<HTMLOptionElement>) =>
                                                    this.selected(type, i, parameter)}
                                                value={type.trim()}>
                                                {type.trim()}
                                            </option>
                                        )}

                                    </select>
                                </div>
                            </div>
                        </div>
                    </div>
                </div> : null}

                {this._paramsTypes[i] === "boolean" ? <div>
                    <div className="scriptingBox-wrapper">
                        <div className="scriptingBox-paramNames">
                            {parameter + ":" + this._paramsTypes[i] + " = "}
                        </div>
                        <div className="scriptingBox-paramInputs">
                            <div className="scriptingBox-viewBase">
                                <div className="commandEntry-outerDiv">
                                    <select
                                        className="scriptingBox-viewPicker"
                                        onPointerDown={this.stopPropagation}
                                        onChange={(e: React.ChangeEvent) => this.viewChanged(e, i, parameter)}
                                        value={this._paramsValues[i]}>
                                        <option
                                            className="scriptingBox-viewOption"
                                            onPointerDown={(e: React.PointerEvent<HTMLOptionElement>) =>
                                                this.selectedBool(true, i, parameter)}
                                            value={"true"}>
                                            true
                                        </option>
                                        <option
                                            className="scriptingBox-viewOption"
                                            onPointerDown={(e: React.PointerEvent<HTMLOptionElement>) =>
                                                this.selectedBool(false, i, parameter)}
                                            value={"false"}>
                                            false
                                        </option>

                                    </select>
                                </div>
                            </div>
                        </div>
                    </div>
                </div> : null}



            </div>
        );

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
                {settingParams}
            </div> : null}

        </div>;

        const paramsTools = <div className="scriptingBox-toolbar">
            {this._errorMessage ? <div className="scriptingBox-errorMessage">
                {this._errorMessage}
            </div> : null}
            <button className="scriptingBox-button" style={{ width: this.rootDoc.layoutKey === "layout_onClick" ? "33%" : "50%" }}
                onPointerDown={e => { this.onEdit(); e.stopPropagation(); }}>Edit</button>
            <button className="scriptingBox-button" style={{ width: this.rootDoc.layoutKey === "layout_onClick" ? "33%" : "50%" }}
                onPointerDown={e => { this.onRun(); e.stopPropagation(); }}>Run</button>
            {this.rootDoc.layoutKey === "layout_onClick" ? <button className="scriptingBox-button"
                style={{ width: this.rootDoc.layoutKey === "layout_onClick" ? "33%" : "50%" }}
                onPointerDown={e => { this.onFinish(); e.stopPropagation(); }}>Finish</button> : null}
        </div>;



        return (
            <div className={`scriptingBox`} onContextMenu={this.specificContextMenu}>

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
            </div>
        );
    }

}
