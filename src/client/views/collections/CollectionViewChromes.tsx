import * as React from "react";
import { CollectionView } from "./CollectionView";
import "./CollectionViewChromes.scss";
import { CollectionViewType } from "./CollectionBaseView";
import { undoBatch } from "../../util/UndoManager";
import { action, observable, runInAction, computed, IObservable, IObservableValue } from "mobx";
import { observer } from "mobx-react";
import { Doc, DocListCast } from "../../../new_fields/Doc";
import { DocLike } from "../MetadataEntryMenu";
import * as Autosuggest from 'react-autosuggest';
import { EditableView } from "../EditableView";
import { StrCast, NumCast, BoolCast, Cast } from "../../../new_fields/Types";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Utils } from "../../../Utils";
import KeyRestrictionRow from "./KeyRestrictionRow";
import { CompileScript } from "../../util/Scripting";
import { ScriptField } from "../../../new_fields/ScriptField";
const datepicker = require('js-datepicker');

interface CollectionViewChromeProps {
    CollectionView: CollectionView;
}

let stopPropagation = (e: React.SyntheticEvent) => e.stopPropagation();

@observer
class CollectionViewBaseChrome extends React.Component<CollectionViewChromeProps> {
    @observable private _viewSpecsOpen: boolean = false;
    @observable private _dateWithinValue: string = "";
    @observable private _dateValue: Date = new Date();
    @observable private _keyRestrictions: [JSX.Element, string][] = [];
    @computed private get filterValue() { return Cast(this.props.CollectionView.props.Document.viewSpecScript, ScriptField); }

    private _picker: any;
    private _datePickerElGuid = Utils.GenerateGuid();

    componentDidMount = () => {
        this._picker = datepicker("#" + this._datePickerElGuid, {
            disabler: (date: Date) => date > new Date(),
            onSelect: (instance: any, date: Date) => runInAction(() => this._dateValue = date),
            dateSelected: new Date()
        });

        runInAction(() => {
            this._keyRestrictions.push([<KeyRestrictionRow key={Utils.GenerateGuid()} contains={true} script={(value: string) => runInAction(() => this._keyRestrictions[0][1] = value)} />, ""]);
            this._keyRestrictions.push([<KeyRestrictionRow key={Utils.GenerateGuid()} contains={false} script={(value: string) => runInAction(() => this._keyRestrictions[1][1] = value)} />, ""]);
        });
    }

    @undoBatch
    viewChanged = (e: React.ChangeEvent) => {
        //@ts-ignore
        this.props.CollectionView.props.Document.viewType = parseInt(e.target.selectedOptions[0].value);
    }

    @action
    openViewSpecs = (e: React.SyntheticEvent) => {
        this._viewSpecsOpen = true;

        //@ts-ignore
        if (!e.target.classList[0].startsWith("qs")) {
            this.closeDatePicker();
        }

        e.stopPropagation();
        document.removeEventListener("pointerdown", this.closeViewSpecs);
        document.addEventListener("pointerdown", this.closeViewSpecs);
    }

    @action closeViewSpecs = () => { this._viewSpecsOpen = false; document.removeEventListener("pointerdown", this.closeViewSpecs); };

    @action
    openDatePicker = (e: React.PointerEvent) => {
        this.openViewSpecs(e);
        if (this._picker) {
            this._picker.alwaysShow = true;
            this._picker.show();
            // TODO: calendar is offset when zoomed in/out
            // this._picker.calendar.style.position = "absolute";
            // let transform = this.props.CollectionView.props.ScreenToLocalTransform();
            // let x = parseInt(this._picker.calendar.style.left) / transform.Scale;
            // let y = parseInt(this._picker.calendar.style.top) / transform.Scale;
            // this._picker.calendar.style.left = x;
            // this._picker.calendar.style.top = y;

            e.stopPropagation();
        }
    }

    @action
    addKeyRestriction = (e: React.MouseEvent) => {
        let index = this._keyRestrictions.length;
        this._keyRestrictions.push([<KeyRestrictionRow key={Utils.GenerateGuid()} contains={true} script={(value: string) => runInAction(() => this._keyRestrictions[index][1] = value)} />, ""]);

        this.openViewSpecs(e);
    }

    @action
    applyFilter = (e: React.MouseEvent) => {
        this.openViewSpecs(e);

        let keyRestrictionScript = `${this._keyRestrictions.map(i => i[1])
            .reduce((acc: string, value: string, i: number) => value ? `${acc} && ${value}` : acc)}`;
        let yearOffset = this._dateWithinValue[1] === 'y' ? 1 : 0;
        let monthOffset = this._dateWithinValue[1] === 'm' ? parseInt(this._dateWithinValue[0]) : 0;
        let weekOffset = this._dateWithinValue[1] === 'w' ? parseInt(this._dateWithinValue[0]) : 0;
        let dayOffset = (this._dateWithinValue[1] === 'd' ? parseInt(this._dateWithinValue[0]) : 0) + weekOffset * 7;
        let lowerBound = new Date(this._dateValue.getFullYear() - yearOffset, this._dateValue.getMonth() - monthOffset, this._dateValue.getDate() - dayOffset);
        let upperBound = new Date(this._dateValue.getFullYear() + yearOffset, this._dateValue.getMonth() + monthOffset, this._dateValue.getDate() + dayOffset + 1);
        let dateRestrictionScript = `((doc.creationDate as any).date >= ${lowerBound.valueOf()} && (doc.creationDate as any).date <= ${upperBound.valueOf()})`;
        let fullScript = `return ${dateRestrictionScript} && ${keyRestrictionScript}`;
        let compiled = CompileScript(fullScript, { params: { doc: Doc.name } });
        if (compiled.compiled) {
            this.props.CollectionView.props.Document.viewSpecScript = new ScriptField(compiled);
        }
    }

    @action
    closeDatePicker = () => {
        if (this._picker) {
            this._picker.alwaysShow = false;
            this._picker.hide();
        }
        document.removeEventListener("pointerdown", this.closeDatePicker);
    }

    render() {
        return (
            <div className="collectionViewBaseChrome">
                <button className="collectionViewBaseChrome-collapse" title="Collapse collection chrome">
                    <FontAwesomeIcon icon="caret-up" size="2x" />
                </button>
                <select
                    className="collectionViewBaseChrome-viewPicker"
                    onPointerDown={stopPropagation}
                    onChange={this.viewChanged}
                    value={NumCast(this.props.CollectionView.props.Document.viewType)}>
                    <option className="collectionViewBaseChrome-viewOption" onPointerDown={stopPropagation} value="1">Freeform View</option>
                    <option className="collectionViewBaseChrome-viewOption" onPointerDown={stopPropagation} value="2">Schema View</option>
                    <option className="collectionViewBaseChrome-viewOption" onPointerDown={stopPropagation} value="4">Tree View</option>
                    <option className="collectionViewBaseChrome-viewOption" onPointerDown={stopPropagation} value="5">Stacking View</option>
                    <option className="collectionViewBaseChrome-viewOption" onPointerDown={stopPropagation} value="6">Masonry View></option>
                </select>
                <div className="collectionViewBaseChrome-viewSpecs">
                    <input className="collectionViewBaseChrome-viewSpecsInput"
                        placeholder="Filter Documents"
                        value={this.filterValue ? this.filterValue.script.originalScript : ""}
                        onPointerDown={this.openViewSpecs} />
                    <div className="collectionViewBaseChrome-viewSpecsMenu"
                        onPointerDown={this.openViewSpecs}
                        style={{
                            height: this._viewSpecsOpen ? "fit-content" : "0px",
                            overflow: this._viewSpecsOpen ? "initial" : "hidden"
                        }}>
                        {this._keyRestrictions.map(i => i[0])}
                        <div className="collectionViewBaseChrome-viewSpecsMenu-row">
                            <div className="collectionViewBaseChrome-viewSpecsMenu-rowLeft">
                                CREATED WITHIN:
                            </div>
                            <select className="collectionViewBaseChrome-viewSpecsMenu-rowMiddle"
                                style={{ textTransform: "uppercase", textAlign: "center" }}
                                value={this._dateWithinValue}
                                onChange={(e) => runInAction(() => this._dateWithinValue = e.target.value)}>
                                <option value="1d">1 day of</option>
                                <option value="3d">3 days of</option>
                                <option value="1w">1 week of</option>
                                <option value="2w">2 weeks of</option>
                                <option value="1m">1 month of</option>
                                <option value="2m">2 months of</option>
                                <option value="6m">6 months of</option>
                                <option value="1y">1 year of</option>
                            </select>
                            <input className="collectionViewBaseChrome-viewSpecsMenu-rowRight"
                                id={this._datePickerElGuid}
                                value={this._dateValue.toLocaleDateString()}
                                onPointerDown={this.openDatePicker}
                                placeholder="Value" />
                        </div>
                        <div className="collectionViewBaseChrome-viewSpecsMenu-lastRow">
                            <button className="collectonViewBaseChrome-viewSpecsMenu-lastRowButton" onClick={this.addKeyRestriction}>
                                ADD KEY RESTRICTION
                            </button>
                            <button className="collectonViewBaseChrome-viewSpecsMenu-lastRowButton" onClick={this.applyFilter}>
                                APPLY FILTER
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        )
    }
}

@observer
export class CollectionStackingViewChrome extends React.Component<CollectionViewChromeProps> {
    @observable private _currentKey: string = "";
    @observable private suggestions: string[] = [];

    @computed private get descending() { return BoolCast(this.props.CollectionView.props.Document.stackingHeadersSortDescending); }
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

    @action toggleSort = () => { this.props.CollectionView.props.Document.stackingHeadersSortDescending = !this.props.CollectionView.props.Document.stackingHeadersSortDescending; }
    @action resetValue = () => { this._currentKey = this.sectionFilter; };

    render() {
        return (
            <div className="collectionStackingViewChrome">
                <CollectionViewBaseChrome CollectionView={this.props.CollectionView} />
                <div className="collectionStackingViewChrome-cont">
                    <button className="collectionStackingViewChrome-sort" onClick={this.toggleSort}>
                        <div className="collectionStackingViewChrome-sortLabel">
                            Sort
                        </div>
                        <div className="collectionStackingViewChrome-sortIcon" style={{ transform: `rotate(${this.descending ? "180" : "0"}deg)` }}>
                            <FontAwesomeIcon icon="caret-up" size="2x" color="white" />
                        </div>
                    </button>
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
                                oneLine
                                SetValue={this.setValue}
                                contents={this.sectionFilter ? this.sectionFilter : "N/A"}
                            />
                        </div>
                    </div>
                </div>
            </div>
        )
    }
}