import * as React from 'react';
import "./MetadataEntryMenu.scss";
import { observer } from 'mobx-react';
import { observable, action } from 'mobx';
import { KeyValueBox } from './nodes/KeyValueBox';
import { Doc } from '../../new_fields/Doc';

export type DocLike = Doc | Doc[] | Promise<Doc> | Promise<Doc[]>;
export interface MetadataEntryProps {
    docs: DocLike | (() => DocLike);
    onError?: () => boolean;
}

@observer
export class MetadataEntryMenu extends React.Component<MetadataEntryProps>{
    @observable private _currentKey: string = "";
    @observable private _currentValue: string = "";

    @action
    onKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        this._currentKey = e.target.value;
    }

    @action
    onValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        this._currentValue = e.target.value;
    }

    onValueKeyDown = async (e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
            const script = KeyValueBox.CompileKVPScript(this._currentValue);
            if (!script) return;
            let doc = this.props.docs;
            if (typeof doc === "function") {
                doc = doc();
            }
            doc = await doc;
            let success: boolean;
            if (doc instanceof Doc) {
                success = KeyValueBox.ApplyKVPScript(doc, this._currentKey, script);
            } else {
                success = doc.every(d => KeyValueBox.ApplyKVPScript(d, this._currentKey, script));
            }
            if (!success) {
                if (this.props.onError) {
                    if (this.props.onError()) {
                        this.clearInputs();
                    }
                } else {
                    this.clearInputs();
                }
            } else {
                this.clearInputs();
            }
        }
    }

    @action
    clearInputs = () => {
        this._currentKey = "";
        this._currentValue = "";
    }

    render() {
        return (
            <div className="metadataEntry-outerDiv">
                Key:
                <input className="metadataEntry-input" value={this._currentKey} onChange={this.onKeyChange} />
                Value:
                <input className="metadataEntry-input" value={this._currentValue} onChange={this.onValueChange} onKeyDown={this.onValueKeyDown} />
            </div>
        );
    }
}