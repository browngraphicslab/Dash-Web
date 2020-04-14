import * as React from "react";
import { observer } from "mobx-react";
import { observable, action } from "mobx";

import "./ScriptBox.scss";
import { OverlayView } from "./OverlayView";
import { DocumentIconContainer } from "./nodes/DocumentIcon";
import { Opt, Doc } from "../../new_fields/Doc";
import { emptyFunction } from "../../Utils";
import { ScriptCast } from "../../new_fields/Types";
import { CompileScript } from "../util/Scripting";
import { ScriptField } from "../../new_fields/ScriptField";
import { DragManager } from "../util/DragManager";
import { EditableView } from "./EditableView";
import { getEffectiveTypeRoots } from "typescript";

export interface ScriptBoxProps {
    onSave: (text: string, onError: (error: string) => void) => void;
    onCancel?: () => void;
    initialText?: string;
    showDocumentIcons?: boolean;
    setParams?: (p: string[]) => void;
}

@observer
export class ScriptBox extends React.Component<ScriptBoxProps> {
    @observable
    private _scriptText: string;

    constructor(props: ScriptBoxProps) {
        super(props);
        this._scriptText = props.initialText || "";
    }

    @action
    onChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        this._scriptText = e.target.value;
    }

    @action
    onError = (error: string) => {
        console.log(error);
    }

    overlayDisposer?: () => void;
    onFocus = () => {
        this.overlayDisposer?.();
        this.overlayDisposer = OverlayView.Instance.addElement(<DocumentIconContainer />, { x: 0, y: 0 });
    }

    onBlur = () => {
        this.overlayDisposer?.();
    }

    render() {
        let onFocus: Opt<() => void> = undefined, onBlur: Opt<() => void> = undefined;
        if (this.props.showDocumentIcons) {
            onFocus = this.onFocus;
            onBlur = this.onBlur;
        }
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
                    <textarea className="scriptBox-textarea" onChange={this.onChange} value={this._scriptText} onFocus={onFocus} onBlur={onBlur}></textarea>
                    <div style={{ background: "beige" }} >{params}</div>
                </div>
                <div className="scriptBox-toolbar">
                    <button onClick={e => { this.props.onSave(this._scriptText, this.onError); e.stopPropagation(); }}>Save</button>
                    <button onClick={e => { this.props.onCancel && this.props.onCancel(); e.stopPropagation(); }}>Cancel</button>
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
                Doc.GetProto(doc)[fieldKey] = undefined;
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

                Doc.GetProto(doc)[fieldKey] = new ScriptField(script);
                overlayDisposer();
            }
        }} showDocumentIcons />;
        overlayDisposer = OverlayView.Instance.addWindow(scriptingBox, { x: 400, y: 200, width: 500, height: 400, title });
    }
}
