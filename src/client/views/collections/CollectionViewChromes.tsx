import * as React from "react";
import { CollectionView } from "./CollectionView";
import "./CollectionViewChromes.scss";
import { CollectionViewType } from "./CollectionBaseView";
import { undoBatch } from "../../util/UndoManager";
import { action, observable, runInAction, computed } from "mobx";
import { observer } from "mobx-react";
import { Doc, DocListCast } from "../../../new_fields/Doc";
import { DocLike } from "../MetadataEntryMenu";
const higflyout = require("@hig/flyout");
export const Flyout = higflyout.default;
import * as Autosuggest from 'react-autosuggest';
import { EditableView } from "../EditableView";
import { StrCast } from "../../../new_fields/Types";

interface CollectionViewChromeProps {
    CollectionView: CollectionView;
}

class CollectionViewBaseChrome extends React.Component<CollectionViewChromeProps> {
    @undoBatch
    viewChanged = (e: React.ChangeEvent) => {
        //@ts-ignore
        switch (e.target.selectedOptions[0].value) {
            case "freeform":
                this.props.CollectionView.props.Document.viewType = CollectionViewType.Freeform;
                break;
            case "schema":
                this.props.CollectionView.props.Document.viewType = CollectionViewType.Schema;
                break;
            case "treeview":
                this.props.CollectionView.props.Document.viewType = CollectionViewType.Tree;
                break;
            case "stacking":
                this.props.CollectionView.props.Document.viewType = CollectionViewType.Stacking;
                break;
            case "masonry":
                this.props.CollectionView.props.Document.viewType = CollectionViewType.Masonry;
                break;
            default:
                break;
        }
    }

    render() {
        return (
            <div className="collectionViewBaseChrome">
                <select onChange={this.viewChanged}>
                    <option value="freeform" selected={this.props.CollectionView.props.Document.viewType === CollectionViewType.Freeform}>Freeform View</option>
                    <option value="schema" selected={this.props.CollectionView.props.Document.viewType === CollectionViewType.Schema}>Schema View</option>
                    <option value="treeview" selected={this.props.CollectionView.props.Document.viewType === CollectionViewType.Tree}>Tree View</option>
                    <option value="stacking" selected={this.props.CollectionView.props.Document.viewType === CollectionViewType.Stacking}>Stacking View</option>
                    <option value="masonry" selected={this.props.CollectionView.props.Document.viewType === CollectionViewType.Masonry}>Masonry View</option>
                </select>
            </div>
        )
    }
}

@observer
export class CollectionStackingViewChrome extends React.Component<CollectionViewChromeProps> {
    @observable private _currentKey: string = "";
    @observable private suggestions: string[] = [];

    @computed get sectionFilter() { return StrCast(this.props.CollectionView.props.Document.sectionFilter); }

    getKeySuggestions = async (value: string): Promise<string[]> => {
        value = value.toLowerCase();
        let docs: Doc | Doc[] | Promise<Doc> | Promise<Doc[]> | (() => DocLike)
            = () => DocListCast(this.props.CollectionView.props.Document[this.props.CollectionView.props.fieldExt ? this.props.CollectionView.props.fieldExt : this.props.CollectionView.props.fieldKey]);
        if (typeof docs === "function") {
            docs = docs();
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

    @action
    onKeyChange = (e: React.ChangeEvent, { newValue }: { newValue: string }) => {
        this._currentKey = newValue;
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

    setValue = (value: string) => {
        this.props.CollectionView.props.Document.sectionFilter = value;
        return true;
    }

    @action resetValue = () => { this._currentKey = this.sectionFilter; };

    render() {
        return (
            <div className="collectionStackingViewChrome">
                <CollectionViewBaseChrome CollectionView={this.props.CollectionView} />
                <div className="collectionStackingViewChrome-sectionFilter-cont">
                    <div className="collectionStackingViewChrome-sectionFilter-label">
                        Group items by:
                    </div>
                    <div className="collectionStackingViewChrome-sectionFilter">
                        <EditableView
                            GetValue={() => this.sectionFilter}
                            autosuggestProps={
                                {
                                    resetValue: this.resetValue,
                                    value: this._currentKey,
                                    onChange: this.onKeyChange,
                                    autosuggestProps: {
                                        inputProps:
                                        {
                                            value: this._currentKey,
                                            onChange: this.onKeyChange
                                        },
                                        getSuggestionValue: this.getSuggestionValue,
                                        suggestions: this.suggestions,
                                        alwaysRenderSuggestions: true,
                                        renderSuggestion: this.renderSuggestion,
                                        onSuggestionsFetchRequested: this.onSuggestionFetch,
                                        onSuggestionsClearRequested: this.onSuggestionClear
                                    }
                                }}
                            SetValue={this.setValue}
                            contents={this.sectionFilter ? this.sectionFilter : "N/A"}
                        />
                    </div>
                </div>
            </div>
        )
    }
}