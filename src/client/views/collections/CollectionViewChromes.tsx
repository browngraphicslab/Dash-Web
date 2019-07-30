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
import { CollectionSchemaView } from "./CollectionSchemaView";
import { COLLECTION_BORDER_WIDTH } from "../globalCssVariables.scss";
import { listSpec } from "../../../new_fields/Schema";
import { List } from "../../../new_fields/List";
import { Id } from "../../../new_fields/FieldSymbols";
import { threadId } from "worker_threads";
const datepicker = require('js-datepicker');

interface CollectionViewChromeProps {
    CollectionView: CollectionView;
    type: CollectionViewType;
    collapse?: (value: boolean) => any;
}

let stopPropagation = (e: React.SyntheticEvent) => e.stopPropagation();

@observer
export class CollectionViewBaseChrome extends React.Component<CollectionViewChromeProps> {
    @observable private _viewSpecsOpen: boolean = false;
    @observable private _dateWithinValue: string = "";
    @observable private _dateValue: Date | string = "";
    @observable private _keyRestrictions: [JSX.Element, string][] = [];
    @observable private _collapsed: boolean = false;
    @computed private get filterValue() { return Cast(this.props.CollectionView.props.Document.viewSpecScript, ScriptField); }

    private _picker: any;
    private _datePickerElGuid = Utils.GenerateGuid();

    componentDidMount = () => {
        setTimeout(() => this._picker = datepicker("#" + this._datePickerElGuid, {
            disabler: (date: Date) => date > new Date(),
            onSelect: (instance: any, date: Date) => runInAction(() => this._dateValue = date),
            dateSelected: new Date()
        }), 1000);

        runInAction(() => {
            this._keyRestrictions.push([<KeyRestrictionRow key={Utils.GenerateGuid()} contains={true} script={(value: string) => runInAction(() => this._keyRestrictions[0][1] = value)} />, ""]);
            this._keyRestrictions.push([<KeyRestrictionRow key={Utils.GenerateGuid()} contains={false} script={(value: string) => runInAction(() => this._keyRestrictions[1][1] = value)} />, ""]);

            // chrome status is one of disabled, collapsed, or visible. this determines initial state from document
            let chromeStatus = this.props.CollectionView.props.Document.chromeStatus;
            if (chromeStatus) {
                if (chromeStatus === "disabled") {
                    throw new Error("how did you get here, if chrome status is 'disabled' on a collection, a chrome shouldn't even be instantiated!");
                }
                else if (chromeStatus === "collapsed") {
                    this._collapsed = true;
                    if (this.props.collapse) {
                        this.props.collapse(true);
                    }
                }
            }
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
        let dateRestrictionScript = "";
        if (this._dateValue instanceof Date) {
            let lowerBound = new Date(this._dateValue.getFullYear() - yearOffset, this._dateValue.getMonth() - monthOffset, this._dateValue.getDate() - dayOffset);
            let upperBound = new Date(this._dateValue.getFullYear() + yearOffset, this._dateValue.getMonth() + monthOffset, this._dateValue.getDate() + dayOffset + 1);
            dateRestrictionScript = `((doc.creationDate as any).date >= ${lowerBound.valueOf()} && (doc.creationDate as any).date <= ${upperBound.valueOf()})`;
        }
        else {
            let createdDate = new Date(this._dateValue);
            if (!isNaN(createdDate.getTime())) {
                let lowerBound = new Date(createdDate.getFullYear() - yearOffset, createdDate.getMonth() - monthOffset, createdDate.getDate() - dayOffset);
                let upperBound = new Date(createdDate.getFullYear() + yearOffset, createdDate.getMonth() + monthOffset, createdDate.getDate() + dayOffset + 1);
                dateRestrictionScript = `((doc.creationDate as any).date >= ${lowerBound.valueOf()} && (doc.creationDate as any).date <= ${upperBound.valueOf()})`;
            }
        }
        let fullScript = dateRestrictionScript.length || keyRestrictionScript.length ? dateRestrictionScript.length ?
            `return ${dateRestrictionScript} ${keyRestrictionScript.length ? "&&" : ""} ${keyRestrictionScript}` :
            `return ${keyRestrictionScript} ${dateRestrictionScript.length ? "&&" : ""} ${dateRestrictionScript}` :
            "return true";
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

    @action
    toggleCollapse = () => {
        this._collapsed = !this._collapsed;
        if (this.props.collapse) {
            this.props.collapse(this._collapsed);
        }
    }

    subChrome = () => {
        switch (this.props.type) {
            case CollectionViewType.Stacking: return (
                <CollectionStackingViewChrome
                    key="collchrome"
                    CollectionView={this.props.CollectionView}
                    type={this.props.type} />);
            case CollectionViewType.Schema: return (
                <CollectionSchemaViewChrome
                    key="collchrome"
                    CollectionView={this.props.CollectionView}
                    type={this.props.type}
                />);
            default:
                return null;
        }
    }

    render() {
        return (
            <div className="collectionViewChrome-cont" style={{ marginTop: this._collapsed ? -70 : 0, height: 70 }}>
                <div className="collectionViewChrome">
                    <div className="collectionViewBaseChrome">
                        <button className="collectionViewBaseChrome-collapse"
                            style={{ marginTop: this._collapsed ? 60 : 0, transform: `rotate(${this._collapsed ? 180 : 0}deg)` }}
                            title="Collapse collection chrome" onClick={this.toggleCollapse}>
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
                            <option className="collectionViewBaseChrome-viewOption" onPointerDown={stopPropagation} value="6">Masonry View</option>
                        </select>
                        <div className="collectionViewBaseChrome-viewSpecs">
                            <input className="collectionViewBaseChrome-viewSpecsInput"
                                placeholder="FILTER DOCUMENTS"
                                value={this.filterValue ? this.filterValue.script.originalScript : ""}
                                onChange={(e) => { }}
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
                                        value={this._dateValue instanceof Date ? this._dateValue.toLocaleDateString() : this._dateValue}
                                        onChange={(e) => runInAction(() => this._dateValue = e.target.value)}
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
                    {this.subChrome()}
                </div>
            </div>
        );
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

    @action toggleSort = () => { this.props.CollectionView.props.Document.stackingHeadersSortDescending = !this.props.CollectionView.props.Document.stackingHeadersSortDescending; };
    @action resetValue = () => { this._currentKey = this.sectionFilter; };

    render() {
        return (
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
                        GROUP ITEMS BY:
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
        );
    }
}


@observer
export class CollectionSchemaViewChrome extends React.Component<CollectionViewChromeProps> {
    // private _textwrapAllRows: boolean = Cast(this.props.CollectionView.props.Document.textwrappedSchemaRows, listSpec("string"), []).length > 0;

    togglePreview = () => {
        let dividerWidth = 4;
        let borderWidth = Number(COLLECTION_BORDER_WIDTH);
        let panelWidth = this.props.CollectionView.props.PanelWidth();
        let previewWidth = NumCast(this.props.CollectionView.props.Document.schemaPreviewWidth);
        let tableWidth = panelWidth - 2 * borderWidth - dividerWidth - previewWidth;
        this.props.CollectionView.props.Document.schemaPreviewWidth = previewWidth === 0 ? Math.min(tableWidth / 3, 200) : 0;
    }

    @action
    toggleTextwrap = async () => {
        let textwrappedRows = Cast(this.props.CollectionView.props.Document.textwrappedSchemaRows, listSpec("string"), []);
        if (textwrappedRows.length) {
            this.props.CollectionView.props.Document.textwrappedSchemaRows = new List<string>([]);
        } else {
            let docs: Doc | Doc[] | Promise<Doc> | Promise<Doc[]> | (() => DocLike)
                = () => DocListCast(this.props.CollectionView.props.Document[this.props.CollectionView.props.fieldExt ? this.props.CollectionView.props.fieldExt : this.props.CollectionView.props.fieldKey]);
            if (typeof docs === "function") {
                docs = docs();
            }
            docs = await docs;
            if (docs instanceof Doc) {
                let allRows = [docs[Id]];
                this.props.CollectionView.props.Document.textwrappedSchemaRows = new List<string>(allRows);
            } else {
                let allRows = docs.map(doc => doc[Id]);
                this.props.CollectionView.props.Document.textwrappedSchemaRows = new List<string>(allRows);
            }
        }
    }


    render() {
        let previewWidth = NumCast(this.props.CollectionView.props.Document.schemaPreviewWidth);
        let textWrapped = Cast(this.props.CollectionView.props.Document.textwrappedSchemaRows, listSpec("string"), []).length > 0;

        return (
            <div className="collectionSchemaViewChrome-cont">
                <div className="collectionSchemaViewChrome-toggle">
                    <div className="collectionSchemaViewChrome-label">Wrap Text: </div>
                    <div className="collectionSchemaViewChrome-toggler" onClick={this.toggleTextwrap}>
                        <div className={"collectionSchemaViewChrome-togglerButton" + (textWrapped ? " on" : " off")}>
                            {textWrapped ? "on" : "off"}
                        </div>
                    </div>
                </div>

                <div className="collectionSchemaViewChrome-toggle">
                    <div className="collectionSchemaViewChrome-label">Show Preview: </div>
                    <div className="collectionSchemaViewChrome-toggler" onClick={this.togglePreview}>
                        <div className={"collectionSchemaViewChrome-togglerButton" + (previewWidth !== 0 ? " on" : " off")}>
                            {previewWidth !== 0 ? "on" : "off"}
                        </div>
                    </div>
                </div>
            </div >
        );
    }
}