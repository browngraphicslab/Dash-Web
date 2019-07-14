import * as React from 'react';
import "./MetadataEntryMenu.scss";
import { observer } from 'mobx-react';
import { observable, action, runInAction } from 'mobx';
import { KeyValueBox } from './nodes/KeyValueBox';
import { Doc } from '../../new_fields/Doc';
import * as Autosuggest from 'react-autosuggest';

export type DocLike = Doc | Doc[] | Promise<Doc> | Promise<Doc[]>;
export interface MetadataEntryProps {
    docs: DocLike | (() => DocLike);
    onError?: () => boolean;
    suggestWithFunction?: boolean;
}

@observer
export class MetadataEntryMenu extends React.Component<MetadataEntryProps>{
    @observable private _currentKey: string = "";
    @observable private _currentValue: string = "";
    @observable private suggestions: string[] = [];

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

    getKeySuggestions = async (value: string): Promise<string[]> => {
        value = value.toLowerCase();
        let docs = this.props.docs;
        if (typeof docs === "function") {
            if (this.props.suggestWithFunction) {
                docs = docs();
            } else {
                return [];
            }
        }
        docs = await docs;
        if (docs instanceof Doc) {
            return Object.keys(docs).filter(key => key.toLowerCase().startsWith(value));
        } else {
            const keys = new Set<string>();
            docs.forEach(doc => Doc.allKeys(doc).forEach(key => keys.add(key)));
            return Array.from(keys).filter(key => key.toLowerCase().startsWith(value));
        }
    }
    getSuggestionValue = (suggestion: string) => suggestion;

    renderSuggestion = (suggestion: string) => {
        return <p>{suggestion}</p>;
    }

    onSuggestionFetch = async ({ value }: { value: string }) => {
        const sugg = await this.getKeySuggestions(value);
        runInAction(() => {
            this.suggestions = sugg;
        });
    }

    @action
    onSuggestionClear = () => {
        this.suggestions = [];
    }

    render() {
        return (
            <div className="metadataEntry-outerDiv">
                Key:
                <Autosuggest inputProps={{ value: this._currentKey, onChange: this.onKeyChange, className: "metadataEntry-input" }}
                    getSuggestionValue={this.getSuggestionValue}
                    suggestions={this.suggestions}
                    renderSuggestion={this.renderSuggestion}
                    onSuggestionsFetchRequested={this.onSuggestionFetch}
                    onSuggestionsClearRequested={this.onSuggestionClear} />
                Value:
                <input className="metadataEntry-input" value={this._currentValue} onChange={this.onValueChange} onKeyDown={this.onValueKeyDown} />
            </div>
        );
    }
}