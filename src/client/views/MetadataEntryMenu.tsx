import * as React from 'react';
import "./MetadataEntryMenu.scss";
import { observer } from 'mobx-react';
import { observable, action, runInAction, trace } from 'mobx';
import { KeyValueBox } from './nodes/KeyValueBox';
import { Doc, Field } from '../../new_fields/Doc';
import * as Autosuggest from 'react-autosuggest';
import { undoBatch } from '../util/UndoManager';

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
    private userModified = false;

    private autosuggestRef = React.createRef<Autosuggest>();

    @action
    onKeyChange = (e: React.ChangeEvent, { newValue }: { newValue: string }) => {
        this._currentKey = newValue;
        if (!this.userModified) {
            this.previewValue();
        }
    }

    previewValue = async () => {
        let field: Field | undefined | null = null;
        let onProto: boolean = false;
        let value: string | undefined = undefined;
        let docs = this.props.docs;
        if (typeof docs === "function") {
            if (this.props.suggestWithFunction) {
                docs = docs();
            } else {
                return;
            }
        }
        docs = await docs;
        if (docs instanceof Doc) {
            await docs[this._currentKey];
            value = Field.toKeyValueString(docs, this._currentKey);
        } else {
            for (const doc of docs) {
                const v = await doc[this._currentKey];
                onProto = onProto || !Object.keys(doc).includes(this._currentKey);
                if (field === null) {
                    field = v;
                } else if (v !== field) {
                    value = "multiple values";
                }
            }
        }
        if (value === undefined) {
            if (field !== null && field !== undefined) {
                value = (onProto ? "" : "= ") + Field.toScriptString(field);
            } else {
                value = "";
            }
        }
        const s = value;
        runInAction(() => this._currentValue = s);
    }

    @action
    onValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        this._currentValue = e.target.value;
        this.userModified = e.target.value.trim() !== "";
    }

    @undoBatch
    @action
    onValueKeyDown = async (e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
            e.stopPropagation();
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
        this.userModified = false;
        if (this.autosuggestRef.current) {
            const input: HTMLInputElement = (this.autosuggestRef.current as any).input;
            input && input.focus();
        }
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
                <Autosuggest inputProps={{ value: this._currentKey, onChange: this.onKeyChange }}
                    getSuggestionValue={this.getSuggestionValue}
                    suggestions={this.suggestions}
                    alwaysRenderSuggestions
                    renderSuggestion={this.renderSuggestion}
                    onSuggestionsFetchRequested={this.onSuggestionFetch}
                    onSuggestionsClearRequested={this.onSuggestionClear}
                    ref={this.autosuggestRef} />
                Value:
                <input className="metadataEntry-input" value={this._currentValue} onChange={this.onValueChange} onKeyDown={this.onValueKeyDown} />
                Spread to children:
                <input type="checkbox"></input>
            </div>
        );
    }
}