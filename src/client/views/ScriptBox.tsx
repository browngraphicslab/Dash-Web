import * as React from "react";
import { observer } from "mobx-react";
import { observable, action } from "mobx";

import "./ScriptBox.scss";
import { OverlayView } from "./OverlayView";
import { DocumentIconContainer } from "./nodes/DocumentIcon";
import { Opt, Doc } from "../../new_fields/Doc";
import { emptyFunction } from "../../Utils";
import { ScriptCast, StrCast } from "../../new_fields/Types";
import { CompileScript } from "../util/Scripting";
import { ScriptField } from "../../new_fields/ScriptField";
import { DragManager } from "../util/DragManager";
import { EditableView } from "./EditableView";
import { FieldView, FieldViewProps } from "./nodes/FieldView";
import { DocAnnotatableComponent } from "./DocComponent";
import { makeInterface } from "../../new_fields/Schema";
import { documentSchema } from "../../new_fields/documentSchemas";
import { CompileResult } from "../northstar/model/idea/idea";
import { red } from "colors";
import { forEach } from "typescript-collections/dist/lib/arrays";

export interface ScriptBoxProps {
    onSave?: (text: string, onError: (error: string) => void) => void;
    onCancel?: () => void;
    initialText?: string;
    showDocumentIcons?: boolean;
    setParams?: (p: string[]) => void;
}

type ScriptDocument = makeInterface<[typeof documentSchema]>;
const ScriptDocument = makeInterface(documentSchema);

@observer
export class ScriptBox extends DocAnnotatableComponent<FieldViewProps & ScriptBoxProps, ScriptDocument>(ScriptDocument) {
    protected multiTouchDisposer?: import("../util/InteractionUtils").InteractionUtils.MultiTouchEventDisposer | undefined;
    public static LayoutString(fieldStr: string) { return FieldView.LayoutString(ScriptBox, fieldStr); }

    @observable
    private _scriptText: string;

    @observable
    private _errorMessage: string;

    constructor(props: ScriptBoxProps) {
        super(props);
        this._scriptText = props.initialText || "";
        this._errorMessage = "";
    }

    @action
    componentDidMount() {
        this._scriptText = StrCast(this.props.Document.documentText) || this.props.initialText || "";
    }

    @action
    onChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        this._scriptText = e.target.value;
    }

    @action
    onError = (error: any) => {
        for (const entry of error) {
            this._errorMessage = this._errorMessage + "   " + entry.messageText;
        }
    }

    overlayDisposer?: () => void;
    onFocus = () => {
        if (this.overlayDisposer) {
            this.overlayDisposer();
        }
        this.overlayDisposer = OverlayView.Instance.addElement(<DocumentIconContainer />, { x: 0, y: 0 });
    }

    onBlur = () => {
        this.overlayDisposer && this.overlayDisposer();
    }

    @action
    onCompile = () => {
        const result = CompileScript(this._scriptText, {});
        this._errorMessage = "";
        if (result.compiled) {
            this._errorMessage = "";
            this.props.Document.data = new ScriptField(result);
        }
        else {
            this.onError(result.errors);
        }
        this.props.Document.documentText = this._scriptText;
    }

    @action
    onRun = () => {
        const result = CompileScript(this._scriptText, {});
        this._errorMessage = "";
        if (result.compiled) {
            result.run({}, (err: any) => {
                this._errorMessage = "";
                this.onError(err);
            });
            this.props.Document.data = new ScriptField(result);
        }
        else {
            this.onError(result.errors);
        }
        this.props.Document.documentText = this._scriptText;
    }

    render() {
        let onFocus: Opt<() => void> = undefined, onBlur: Opt<() => void> = undefined;
        //if (this.props.showDocumentIcons) {
        onFocus = this.onFocus;
        onBlur = this.onBlur;
        // }
        const params = <EditableView
            contents={""}
            display={"block"}
            maxHeight={72}
            height={35}
            fontSize={28}
            GetValue={() => ""}
            SetValue={(value: string) => this.props.setParams && this.props.setParams(value.split(" ").filter(s => s !== " ")) ? true : true}
        />;
        return (
            <div className="scriptBox-outerDiv">
                <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
                    <textarea className="scriptBox-textarea" placeholder="write your script here" onChange={this.onChange} value={this._scriptText} onFocus={onFocus} onBlur={onBlur}></textarea>
                    <div className="errorMessage">{this._errorMessage}</div>
                    <div style={{ background: "beige" }} >{params}</div>
                </div>
                <div className="scriptBox-toolbar">
                    <button className="scriptBox-button" onPointerDown={e => { this.onCompile(); e.stopPropagation(); }}>Compile</button>
                    <button className="scriptBox-button" onPointerDown={e => { this.onRun(); e.stopPropagation(); }}>Run</button>
                </div>
            </div>
        );
    }
    //let l = docList(this.source[0].data).length; if (l) { let ind = this.target[0].index !== undefined ? (this.target[0].index+1) % l : 0;  this.target[0].index = ind;  this.target[0].proto = getProto(docList(this.source[0].data)[ind]);}
    public static EditButtonScript(title: string, doc: Doc, fieldKey: string, clientX: number, clientY: number, contextParams?: { [name: string]: string }) {
        let overlayDisposer: () => void = emptyFunction;
        const script = ScriptCast(doc[fieldKey]);
        let originalText: string | undefined = undefined;
        if (script) {
            originalText = script.script.originalScript;
        }
        // tslint:disable-next-line: no-unnecessary-callback-wrapper
        const params: string[] = [];
        const setParams = (p: string[]) => params.splice(0, params.length, ...p);
        const scriptingBox = <ScriptBox initialText={originalText} setParams={setParams} onCancel={overlayDisposer} onSave={(text, onError) => {
            if (!text) {
                doc[fieldKey] = undefined;
            } else {
                const script = CompileScript(text, {
                    params: { this: Doc.name, ...contextParams },
                    typecheck: false,
                    editable: true,
                    transformer: DocumentIconContainer.getTransformer()
                });
                if (!script.compiled) {
                    onError(script.errors.map(error => error.messageText).join("\n"));
                    return;
                }

                const div = document.createElement("div");
                div.style.width = "90";
                div.style.height = "20";
                div.style.background = "gray";
                div.style.position = "absolute";
                div.style.display = "inline-block";
                div.style.transform = `translate(${clientX}px, ${clientY}px)`;
                div.innerHTML = "button";
                params.length && DragManager.StartButtonDrag([div], text, doc.title + "-instance", {}, params, (button: Doc) => { }, clientX, clientY);

                doc[fieldKey] = new ScriptField(script);
                overlayDisposer();
            }
        }} showDocumentIcons />;
        overlayDisposer = OverlayView.Instance.addWindow(scriptingBox, { x: 400, y: 200, width: 500, height: 400, title: title });
    }
}
