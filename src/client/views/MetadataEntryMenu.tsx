import * as React from 'react';
import "./MetadataEntryMenu.scss";
import { observer } from 'mobx-react';
import { observable, action, runInAction, trace, computed, IReactionDisposer, reaction } from 'mobx';
import { KeyValueBox } from './nodes/KeyValueBox';
import { Doc, Field, DocListCastAsync } from '../../new_fields/Doc';
import * as Autosuggest from 'react-autosuggest';
import { undoBatch } from '../util/UndoManager';
import { emptyFunction, emptyPath } from '../../Utils';

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
    private _addChildren: boolean = false;
    @observable _allSuggestions: string[] = [];
    _suggestionDispser: IReactionDisposer | undefined;
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
                let childSuccess = true;
                if (this._addChildren) {
                    for (const document of doc) {
                        const collectionChildren = await DocListCastAsync(document.data);
                        if (collectionChildren) {
                            childSuccess = collectionChildren.every(c => KeyValueBox.ApplyKVPScript(c, this._currentKey, script));
                        }
                    }
                }
                success = doc.every(d => KeyValueBox.ApplyKVPScript(d, this._currentKey, script)) && childSuccess;
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
        return (null);
    }
    componentDidMount() {

        this._suggestionDispser = reaction(() => this._currentKey,
            () => this.getKeySuggestions(this._currentKey).then(action((s: string[]) => this._allSuggestions = s)),
            { fireImmediately: true });
    }
    componentWillUnmount() {
        this._suggestionDispser && this._suggestionDispser();
    }

    onClick = (e: React.ChangeEvent<HTMLInputElement>) => {
        this._addChildren = !this._addChildren;
    }

    private get considerChildOptions() {
        let docSource = this.props.docs;
        if (typeof docSource === "function") {
            docSource = docSource();
        }
        docSource = docSource as Doc[] | Doc;
        if (docSource instanceof Doc) {
            if (docSource._viewType === undefined) {
                return (null);
            }
        } else if (Array.isArray(docSource)) {
            if (!docSource.every(doc => doc._viewType !== undefined)) {
                return null;
            }
        }
        return (
            <div style={{ display: "flex" }}>
                Children:
                <input type="checkbox" onChange={this.onClick} ></input>
            </div>
        );
    }

    _ref = React.createRef<HTMLInputElement>();
    render() {
        return (<div className="metadataEntry-outerDiv" id="metadataEntry-outer" onPointerDown={e => e.stopPropagation()}>
            <div className="metadataEntry-inputArea">
                Key:
                <div className="metadataEntry-autoSuggester" onClick={e => this.autosuggestRef.current!.input?.focus()}  >
                    <Autosuggest inputProps={{ value: this._currentKey, onChange: this.onKeyChange }}
                        getSuggestionValue={this.getSuggestionValue}
                        suggestions={emptyPath}
                        alwaysRenderSuggestions={false}
                        renderSuggestion={this.renderSuggestion}
                        onSuggestionsFetchRequested={emptyFunction}
                        onSuggestionsClearRequested={emptyFunction}
                        ref={this.autosuggestRef} />
                </div>
                Value:
                    <input className="metadataEntry-input" ref={this._ref} value={this._currentValue} onClick={e => this._ref.current!.focus()} onChange={this.onValueChange} onKeyDown={this.onValueKeyDown} />
                {this.considerChildOptions}
            </div>
            <div className="metadataEntry-keys" >
                <ul>
                    {this._allSuggestions.slice().sort().map(s => <li key={s} onClick={action(() => { this._currentKey = s; this.previewValue(); })} >{s}</li>)}
                </ul>
            </div>
        </div>
        );
    }
}