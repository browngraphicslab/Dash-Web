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

export interface ScriptBoxProps {
    onSave: (text: string, onError: (error: string) => void) => void;
    onCancel?: () => void;
    initialText?: string;
    showDocumentIcons?: boolean;
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
        if (this.overlayDisposer) {
            this.overlayDisposer();
        }
        this.overlayDisposer = OverlayView.Instance.addElement(<DocumentIconContainer />, { x: 0, y: 0 });
    }

    onBlur = () => {
        this.overlayDisposer && this.overlayDisposer();
    }

    render() {
        let onFocus: Opt<() => void> = undefined, onBlur: Opt<() => void> = undefined;
        if (this.props.showDocumentIcons) {
            onFocus = this.onFocus;
            onBlur = this.onBlur;
        }
        return (
            <div className="scriptBox-outerDiv">
                <div className="scriptBox-toolbar">
                    <button onClick={e => { this.props.onSave(this._scriptText, this.onError); e.stopPropagation(); }}>Save</button>
                    <button onClick={e => { this.props.onCancel && this.props.onCancel(); e.stopPropagation(); }}>Cancel</button>
                </div>
                <textarea className="scriptBox-textarea" onChange={this.onChange} value={this._scriptText} onFocus={onFocus} onBlur={onBlur}></textarea>
            </div>
        );
    }
    public static EditClickScript(doc: Doc, fieldKey: string, prewrapper?: string, postwrapper?: string) {
        let overlayDisposer: () => void = emptyFunction;
        const script = ScriptCast(doc[fieldKey]);
        let originalText: string | undefined = undefined;
        if (script) {
            originalText = script.script.originalScript;
            if (prewrapper && originalText.startsWith(prewrapper)) {
                originalText = originalText.substr(prewrapper.length);
            }
            if (postwrapper && originalText.endsWith(postwrapper)) {
                originalText = originalText.substr(0, originalText.length - postwrapper.length);
            }
        }
        // tslint:disable-next-line: no-unnecessary-callback-wrapper
        let scriptingBox = <ScriptBox initialText={originalText} onCancel={() => overlayDisposer()} onSave={(text, onError) => {
            if (prewrapper) {
                text = prewrapper + text + (postwrapper ? postwrapper : "");
            }
            const script = CompileScript(text, {
                params: { this: Doc.name },
                typecheck: false,
                editable: true,
                transformer: DocumentIconContainer.getTransformer()
            });
            if (!script.compiled) {
                onError(script.errors.map(error => error.messageText).join("\n"));
                return;
            }
            doc[fieldKey] = new ScriptField(script);
            overlayDisposer();
        }} showDocumentIcons />;
        overlayDisposer = OverlayView.Instance.addWindow(scriptingBox, { x: 400, y: 200, width: 500, height: 400, title: `${doc.title || ""} OnClick` });
    }
}
