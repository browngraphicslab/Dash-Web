import * as React from "react";
import { observer } from "mobx-react";
import { observable, action } from "mobx";

import "./ScriptBox.scss";
import { OverlayView } from "./OverlayView";
import { DocumentIconContainer } from "./nodes/DocumentIcon";
import { Opt } from "../../new_fields/Doc";

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
}