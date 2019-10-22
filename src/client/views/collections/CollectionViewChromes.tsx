import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { action, computed, IReactionDisposer, observable, reaction, runInAction } from "mobx";
import { observer } from "mobx-react";
import * as React from "react";
import * as Autosuggest from 'react-autosuggest';
import { Doc, DocListCast, Field } from "../../../new_fields/Doc";
import { Id } from "../../../new_fields/FieldSymbols";
import { List } from "../../../new_fields/List";
import { listSpec } from "../../../new_fields/Schema";
import { ScriptField } from "../../../new_fields/ScriptField";
import { BoolCast, Cast, NumCast, StrCast } from "../../../new_fields/Types";
import { emptyFunction, Utils } from "../../../Utils";
import { DragManager } from "../../util/DragManager";
import { undoBatch } from "../../util/UndoManager";
import ".././MetadataEntryMenu.scss";
import { KeyValueBox } from '.././nodes/KeyValueBox';
import { EditableView } from "../EditableView";
import { COLLECTION_BORDER_WIDTH } from "../globalCssVariables.scss";
import { DocLike } from "../MetadataEntryMenu";
import { CollectionViewType } from "./CollectionBaseView";
import { CollectionView } from "./CollectionView";
import "./CollectionViewChromes.scss";
import KeyRestrictionRow from "./KeyRestrictionRow";
import { NPN_ENABLED } from "constants";
const datepicker = require('js-datepicker');
const higflyout = require("@hig/flyout");
export const { anchorPoints } = higflyout;
export const Flyout = higflyout.default;
NPN_ENABLED;

interface CollectionViewChromeProps {
    CollectionView: CollectionView;
    type: CollectionViewType;
    collapse?: (value: boolean) => any;
}

interface Filter {
    key: string;
    value: string;
    contains: boolean;
}

let stopPropagation = (e: React.SyntheticEvent) => e.stopPropagation();

@observer
export class CollectionViewBaseChrome extends React.Component<CollectionViewChromeProps> {
    //(!)?\(\(\(doc.(\w+) && \(doc.\w+ as \w+\).includes\(\"(\w+)\"\)

    _templateCommand = {
        title: "set template", script: "this.target.childLayout = this.source ? this.source[0] : undefined", params: ["target", "source"],
        initialize: emptyFunction,
        immediate: (draggedDocs: Doc[]) => this.props.CollectionView.props.Document.childLayout = draggedDocs.length ? draggedDocs[0] : undefined
    };
    _contentCommand = {
        // title: "set content", script: "getProto(this.target).data = aliasDocs(this.source.map(async p => await p));", params: ["target", "source"],  // bcz: doesn't look like we can do async stuff in scripting...
        title: "set content", script: "getProto(this.target).data = aliasDocs(this.source);", params: ["target", "source"],
        initialize: emptyFunction,
        immediate: (draggedDocs: Doc[]) => Doc.GetProto(this.props.CollectionView.props.Document).data = new List<Doc>(draggedDocs.map((d: any) => Doc.MakeAlias(d)))
    };
    _viewCommand = {
        title: "restore view", script: "this.target.panX = this.restoredPanX; this.target.panY = this.restoredPanY; this.target.scale = this.restoredScale;", params: ["target"],
        immediate: (draggedDocs: Doc[]) => { this.props.CollectionView.props.Document.panX = 0; this.props.CollectionView.props.Document.panY = 0; this.props.CollectionView.props.Document.scale = 1; },
        initialize: (button: Doc) => { button.restoredPanX = this.props.CollectionView.props.Document.panX; button.restoredPanY = this.props.CollectionView.props.Document.panY; button.restoredScale = this.props.CollectionView.props.Document.scale; }
    };
    _freeform_commands = [this._contentCommand, this._templateCommand, this._viewCommand];
    _stacking_commands = [this._contentCommand, this._templateCommand];
    _masonry_commands = [this._contentCommand, this._templateCommand];
    _tree_commands = [];
    private get _buttonizableCommands() {
        switch (this.props.type) {
            case CollectionViewType.Tree: return this._tree_commands;
            case CollectionViewType.Stacking: return this._stacking_commands;
            case CollectionViewType.Masonry: return this._stacking_commands;
            case CollectionViewType.Freeform: return this._freeform_commands;
        }
        return [];
    }
    private _picker: any;
    private _commandRef = React.createRef<HTMLInputElement>();
    private _autosuggestRef = React.createRef<Autosuggest>();
    @observable private _currentKey: string = "";
    @observable private _viewSpecsOpen: boolean = false;
    @observable private _dateWithinValue: string = "";
    @observable private _dateValue: Date | string = "";
    @observable private _keyRestrictions: [JSX.Element, string][] = [];
    @observable private suggestions: string[] = [];
    @computed private get filterValue() { return Cast(this.props.CollectionView.props.Document.viewSpecScript, ScriptField); }

    getFilters = (script: string) => {
        let re: any = /(!)?\(\(\(doc\.(\w+)\s+&&\s+\(doc\.\w+\s+as\s+\w+\)\.includes\(\"(\w+)\"\)/g;
        let arr: any[] = re.exec(script);
        let toReturn: Filter[] = [];
        if (arr !== null) {
            let filter: Filter = {
                key: arr[2],
                value: arr[3],
                contains: (arr[1] === "!") ? false : true,
            };
            toReturn.push(filter);
            script = script.replace(arr[0], "");
            if (re.exec(script) !== null) {
                toReturn.push(...this.getFilters(script));
            }
            else { return toReturn; }
        }
        return toReturn;
    }

    addKeyRestrictions = (fields: Filter[]) => {

        if (fields.length !== 0) {
            for (let i = 0; i < fields.length; i++) {
                this._keyRestrictions.push([<KeyRestrictionRow field={fields[i].key} value={fields[i].value} key={Utils.GenerateGuid()} contains={fields[i].contains} script={(value: string) => runInAction(() => this._keyRestrictions[i][1] = value)} />, ""]);

            }
            if (this._keyRestrictions.length === 1) {
                this._keyRestrictions.push([<KeyRestrictionRow field="" value="" key={Utils.GenerateGuid()} contains={true} script={(value: string) => runInAction(() => this._keyRestrictions[1][1] = value)} />, ""]);
            }
        }
        else {
            this._keyRestrictions.push([<KeyRestrictionRow field="" value="" key={Utils.GenerateGuid()} contains={true} script={(value: string) => runInAction(() => this._keyRestrictions[0][1] = value)} />, ""]);
            this._keyRestrictions.push([<KeyRestrictionRow field="" value="" key={Utils.GenerateGuid()} contains={false} script={(value: string) => runInAction(() => this._keyRestrictions[1][1] = value)} />, ""]);
        }
    }

    componentDidMount = () => {

        let fields: Filter[] = [];
        if (this.filterValue) {
            let string = this.filterValue.script.originalScript;
            fields = this.getFilters(string);
        }

        runInAction(() => {
            this.addKeyRestrictions(fields);
            // chrome status is one of disabled, collapsed, or visible. this determines initial state from document
            let chromeStatus = this.props.CollectionView.props.Document.chromeStatus;
            if (chromeStatus) {
                if (chromeStatus === "disabled") {
                    throw new Error("how did you get here, if chrome status is 'disabled' on a collection, a chrome shouldn't even be instantiated!");
                }
                else if (chromeStatus === "collapsed") {
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
        this._keyRestrictions.push([<KeyRestrictionRow field="" value="" key={Utils.GenerateGuid()} contains={true} script={(value: string) => runInAction(() => this._keyRestrictions[index][1] = value)} />, ""]);

        this.openViewSpecs(e);
    }

    @action.bound
    applyFilter = (e: React.MouseEvent) => {

        this.openViewSpecs(e);

        let keyRestrictionScript = "(" + this._keyRestrictions.map(i => i[1]).filter(i => i.length > 0).join(" && ") + ")";
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
            `${dateRestrictionScript} ${keyRestrictionScript.length ? "&&" : ""} (${keyRestrictionScript})` :
            `(${keyRestrictionScript}) ${dateRestrictionScript.length ? "&&" : ""} ${dateRestrictionScript}` :
            "true";

        this.props.CollectionView.props.Document.viewSpecScript = ScriptField.MakeFunction(fullScript, { doc: Doc.name });
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
        this.props.CollectionView.props.Document.chromeStatus = this.props.CollectionView.props.Document.chromeStatus === "enabled" ? "collapsed" : "enabled";
        if (this.props.collapse) {
            this.props.collapse(this.props.CollectionView.props.Document.chromeStatus !== "enabled");
        }
    }

    subChrome = () => {
        switch (this.props.type) {
            case CollectionViewType.Stacking: return (<CollectionStackingViewChrome key="collchrome" CollectionView={this.props.CollectionView} type={this.props.type} />);
            case CollectionViewType.Schema: return (<CollectionSchemaViewChrome key="collchrome" CollectionView={this.props.CollectionView} type={this.props.type} />);
            case CollectionViewType.Tree: return (<CollectionTreeViewChrome key="collchrome" CollectionView={this.props.CollectionView} type={this.props.type} />);
            case CollectionViewType.Masonry: return (<CollectionStackingViewChrome key="collchrome" CollectionView={this.props.CollectionView} type={this.props.type} />);
            case CollectionViewType.Timeline: return (<CollectionTimelineViewChrome key="collchrome" CollectionView={this.props.CollectionView} type={this.props.type} />);
            default: return null;
        }
    }

    private get document() {
        return this.props.CollectionView.props.Document;
    }

    private get pivotKey() {
        return StrCast(this.document.pivotField);
    }

    private set pivotKey(value: string) {
        this.document.pivotField = value;
    }

    @observable private pivotKeyDisplay = this.pivotKey;
    getPivotInput = () => {
        if (StrCast(this.document.freeformLayoutEngine) !== "pivot") {
            return (null);
        }
        return (<input className="collectionViewBaseChrome-viewSpecsInput"
            placeholder="PIVOT ON..."
            value={this.pivotKeyDisplay}
            onChange={action((e: React.ChangeEvent<HTMLInputElement>) => this.pivotKeyDisplay = e.currentTarget.value)}
            onKeyPress={action((e: React.KeyboardEvent<HTMLInputElement>) => {
                let value = e.currentTarget.value;
                if (e.which === 13) {
                    this.pivotKey = value;
                    this.pivotKeyDisplay = "";
                }
            })} />);
    }

    @action.bound
    clearFilter = () => {
        this.props.CollectionView.props.Document.viewSpecScript = ScriptField.MakeFunction("true", { doc: Doc.name });
        this._keyRestrictions = [];
        this.addKeyRestrictions([]);
    }

    private dropDisposer?: DragManager.DragDropDisposer;
    protected createDropTarget = (ele: HTMLDivElement) => {
        this.dropDisposer && this.dropDisposer();
        if (ele) {
            this.dropDisposer = DragManager.MakeDropTarget(ele, { handlers: { drop: this.drop.bind(this) } });
        }
    }

    @undoBatch
    @action
    protected drop(e: Event, de: DragManager.DropEvent): boolean {
        if (de.data instanceof DragManager.DocumentDragData && de.data.draggedDocuments.length) {
            this._buttonizableCommands.filter(c => c.title === this._currentKey).map(c => c.immediate(de.data.draggedDocuments));
            e.stopPropagation();
        }
        return true;
    }

    datePickerRef = (node: HTMLInputElement) => {
        if (node) {
            try {
                this._picker = datepicker("#" + node.id, {
                    disabler: (date: Date) => date > new Date(),
                    onSelect: (instance: any, date: Date) => runInAction(() => this._dateValue = date),
                    dateSelected: new Date()
                });
            } catch (e) {
                console.log("date picker exception:" + e);
            }
        }
    }

    renderSuggestion = (suggestion: string) => {
        return <p>{suggestion}</p>;
    }
    getSuggestionValue = (suggestion: string) => suggestion;

    @action
    onKeyChange = (e: React.ChangeEvent, { newValue }: { newValue: string }) => {
        this._currentKey = newValue;
    }
    onSuggestionFetch = async ({ value }: { value: string }) => {
        const sugg = await this.getKeySuggestions(value);
        runInAction(() => this.suggestions = sugg);
    }
    @action
    onSuggestionClear = () => {
        this.suggestions = [];
    }
    getKeySuggestions = async (value: string): Promise<string[]> => {
        return this._buttonizableCommands.filter(c => c.title.indexOf(value) !== -1).map(c => c.title);
    }

    autoSuggestDown = (e: React.PointerEvent) => {
        e.stopPropagation();
    }

    private _startDragPosition: { x: number, y: number } = { x: 0, y: 0 };
    private _sensitivity: number = 16;

    dragCommandDown = (e: React.PointerEvent) => {

        this._startDragPosition = { x: e.clientX, y: e.clientY };
        document.addEventListener("pointermove", this.dragPointerMove);
        document.addEventListener("pointerup", this.dragPointerUp);
        e.stopPropagation();
        e.preventDefault();
    }

    dragPointerMove = (e: PointerEvent) => {
        e.stopPropagation();
        e.preventDefault();
        let [dx, dy] = [e.clientX - this._startDragPosition.x, e.clientY - this._startDragPosition.y];
        if (Math.abs(dx) + Math.abs(dy) > this._sensitivity) {
            this._buttonizableCommands.filter(c => c.title === this._currentKey).map(c =>
                DragManager.StartButtonDrag([this._commandRef.current!], c.script, c.title,
                    { target: this.props.CollectionView.props.Document }, c.params, c.initialize, e.clientX, e.clientY));
            document.removeEventListener("pointermove", this.dragPointerMove);
            document.removeEventListener("pointerup", this.dragPointerUp);
        }
    }
    dragPointerUp = (e: PointerEvent) => {
        document.removeEventListener("pointermove", this.dragPointerMove);
        document.removeEventListener("pointerup", this.dragPointerUp);

    }

    render() {
        let collapsed = this.props.CollectionView.props.Document.chromeStatus !== "enabled";
        return (
            <div className="collectionViewChrome-cont" style={{ top: collapsed ? -70 : 0, height: collapsed ? 0 : undefined }}>
                <div className="collectionViewChrome">
                    <div className="collectionViewBaseChrome">
                        <button className="collectionViewBaseChrome-collapse"
                            style={{
                                top: collapsed ? 70 : 10,
                                transform: `rotate(${collapsed ? 180 : 0}deg) scale(${collapsed ? 0.5 : 1}) translate(${collapsed ? "-100%, -100%" : "0, 0"})`,
                                opacity: 0.9,
                                left: (collapsed ? 0 : "unset"),
                            }}
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
                            <option className="collectionViewBaseChrome-viewOption" onPointerDown={stopPropagation} value="6">Timeline View</option>
                            <option className="collectionViewBaseChrome-viewOption" onPointerDown={stopPropagation} value="7">Masonry View</option>
                            <option className="collectionViewBaseChrome-viewOption" onPointerDown={stopPropagation} value="8">Pivot View</option>
                            <option className="collectionViewBaseChrome-viewOption" onPointerDown={stopPropagation} value="9">Linear View</option>
                        </select>
                        <div className="collectionViewBaseChrome-viewSpecs" style={{ display: collapsed ? "none" : "grid" }}>
                            <input className="collectionViewBaseChrome-viewSpecsInput"
                                placeholder="FILTER"
                                value={this.filterValue ? this.filterValue.script.originalScript === "return true" ? "" : this.filterValue.script.originalScript : ""}
                                onChange={(e) => { }}
                                onPointerDown={this.openViewSpecs}
                                id="viewSpecsInput" />
                            {this.getPivotInput()}
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
                                        id={Utils.GenerateGuid()}
                                        ref={this.datePickerRef}
                                        value={this._dateValue instanceof Date ? this._dateValue.toLocaleDateString() : this._dateValue}
                                        onChange={(e) => runInAction(() => this._dateValue = e.target.value)}
                                        onPointerDown={this.openDatePicker}
                                        placeholder="Value" />
                                </div>
                                <div className="collectionViewBaseChrome-viewSpecsMenu-lastRow">
                                    <button className="collectonViewBaseChrome-viewSpecsMenu-lastRowButton" onClick={this.addKeyRestriction}> ADD KEY RESTRICTION </button>
                                    <button className="collectonViewBaseChrome-viewSpecsMenu-lastRowButton" onClick={this.applyFilter}> APPLY FILTER </button>
                                    <button className="collectonViewBaseChrome-viewSpecsMenu-lastRowButton" onClick={this.clearFilter}> CLEAR </button>
                                </div>
                            </div>
                        </div>
                        <div className="collectionViewBaseChrome-template" ref={this.createDropTarget} >
                            <div className="commandEntry-outerDiv" ref={this._commandRef} onPointerDown={this.dragCommandDown}>
                                <div className="commandEntry-inputArea" onPointerDown={this.autoSuggestDown} >
                                    <Autosuggest inputProps={{ value: this._currentKey, onChange: this.onKeyChange }}
                                        getSuggestionValue={this.getSuggestionValue}
                                        suggestions={this.suggestions}
                                        alwaysRenderSuggestions={true}
                                        renderSuggestion={this.renderSuggestion}
                                        onSuggestionsFetchRequested={this.onSuggestionFetch}
                                        onSuggestionsClearRequested={this.onSuggestionClear}
                                        ref={this._autosuggestRef} />
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
                <div className="collectionStackingViewChrome-sectionFilter-cont">
                    <div className="collectionStackingViewChrome-sectionFilter-label">
                        GROUP ITEMS BY:
                    </div>
                    <div className="collectionStackingViewChrome-sortIcon" onClick={this.toggleSort} style={{ transform: `rotate(${this.descending ? "180" : "0"}deg)` }}>
                        <FontAwesomeIcon icon="caret-up" size="2x" color="white" />
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

    @undoBatch
    togglePreview = () => {
        let dividerWidth = 4;
        let borderWidth = Number(COLLECTION_BORDER_WIDTH);
        let panelWidth = this.props.CollectionView.props.PanelWidth();
        let previewWidth = NumCast(this.props.CollectionView.props.Document.schemaPreviewWidth);
        let tableWidth = panelWidth - 2 * borderWidth - dividerWidth - previewWidth;
        this.props.CollectionView.props.Document.schemaPreviewWidth = previewWidth === 0 ? Math.min(tableWidth / 3, 200) : 0;
    }

    @undoBatch
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

@observer
export class CollectionTreeViewChrome extends React.Component<CollectionViewChromeProps> {
    @observable private _currentKey: string = "";
    @observable private suggestions: string[] = [];

    @computed private get descending() { return Cast(this.props.CollectionView.props.Document.sortAscending, "boolean", null); }
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

    @action toggleSort = () => {
        if (this.props.CollectionView.props.Document.sortAscending) this.props.CollectionView.props.Document.sortAscending = undefined;
        else if (this.props.CollectionView.props.Document.sortAscending === undefined) this.props.CollectionView.props.Document.sortAscending = false;
        else this.props.CollectionView.props.Document.sortAscending = true;
    }
    @action resetValue = () => { this._currentKey = this.sectionFilter; };

    render() {
        return (
            <div className="collectionTreeViewChrome-cont">
                <button className="collectionTreeViewChrome-sort" onClick={this.toggleSort}>
                    <div className="collectionTreeViewChrome-sortLabel">
                        Sort
                        </div>
                    <div className="collectionTreeViewChrome-sortIcon" style={{ transform: `rotate(${this.descending === undefined ? "90" : this.descending ? "180" : "0"}deg)` }}>
                        <FontAwesomeIcon icon="caret-up" size="2x" color="white" />
                    </div>
                </button>
            </div>
        );
    }
}


@observer
export class CollectionTimelineViewChrome extends React.Component<CollectionViewChromeProps> {
    // private _textwrapAllRows: boolean = Cast(this.props.CollectionView.props.Document.textwrappedSchemaRows, listSpec("string"), []).length > 0;

    @undoBatch
    togglePreview = () => {
        let dividerWidth = 4;
        let borderWidth = Number(COLLECTION_BORDER_WIDTH);
        let panelWidth = this.props.CollectionView.props.PanelWidth();
        let previewWidth = NumCast(this.props.CollectionView.props.Document.schemaPreviewWidth);
        let tableWidth = panelWidth - 2 * borderWidth - dividerWidth - previewWidth;
        this.props.CollectionView.props.Document.schemaPreviewWidth = previewWidth === 0 ? Math.min(tableWidth / 3, 200) : 0;
    }

    @undoBatch
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

    private colorrefYellow = React.createRef<HTMLDivElement>();
    private colorrefGreen = React.createRef<HTMLDivElement>();
    private colorrefRed = React.createRef<HTMLDivElement>();
    private colorrefBlue = React.createRef<HTMLDivElement>();
    @action
    toggleColor = (e: React.MouseEvent<HTMLDivElement>, color: string) => {
        this.props.CollectionView.props.Document.selectedColor = color;
        if (color === "#ffff80") {
            this.colorrefYellow.current!.style.border = "2px solid black";
            this.colorrefGreen.current!.style.border = "2px solid #9c9396";
            this.colorrefRed.current!.style.border = "2px solid #9c9396";
            this.colorrefBlue.current!.style.border = "2px solid #9c9396";
        }
        if (color === "#bfff80") {
            this.colorrefGreen.current!.style.border = "2px solid black";
            this.colorrefYellow.current!.style.border = "2px solid #9c9396";
            this.colorrefRed.current!.style.border = "2px solid #9c9396";
            this.colorrefBlue.current!.style.border = "2px solid #9c9396";
        }
        if (color === "#ff8080") {
            this.colorrefRed.current!.style.border = "2px solid black";
            this.colorrefGreen.current!.style.border = "2px solid #9c9396";
            this.colorrefYellow.current!.style.border = "2px solid #9c9396";
            this.colorrefBlue.current!.style.border = "2px solid #9c9396";
        }
        if (color === "#80dfff") {
            this.colorrefBlue.current!.style.border = "2px solid black";
            this.colorrefGreen.current!.style.border = "2px solid #9c9396";
            this.colorrefRed.current!.style.border = "2px solid #9c9396";
            this.colorrefYellow.current!.style.border = "2px solid #9c9396";
        }
    }
    private searchref = React.createRef<HTMLFormElement>();


    @action.bound
    enter = (e: React.KeyboardEvent<HTMLInputElement>) => {
        let doc = this.props.CollectionView.props.Document;

        if (e.key === "Enter") {
            var thing = (parseFloat(this.searchString!) - NumCast(this.props.CollectionView.props.Document.barwidth)) * NumCast(this.props.CollectionView.props.Document.barwidth) / NumCast(this.props.CollectionView.props.Document._range);
            if (!isNaN(thing)) {
                if (thing > NumCast(this.props.CollectionView.props.Document.barwidth)) {
                    doc.rightbound = 0;
                }
                else if
                    (NumCast(doc.leftbound) + thing >= NumCast(this.props.CollectionView.props.Document.barwidth)) {
                    doc.rightbound = (NumCast(this.props.CollectionView.props.Document.barwidth) - NumCast(doc.leftbound) - 1);
                }
                else {
                    doc.rightbound = (NumCast(this.props.CollectionView.props.Document.barwidth) - thing);
                }


            }

            this.searchref.current ? this.searchref.current.reset() : null;
            this.searchString = undefined;
            this.searchString2 = undefined;
        }
        if (e.keyCode === 9) {
            e.preventDefault;
            e.stopPropagation();
        }
    }

    @action.bound
    enter2 = (e: React.KeyboardEvent<HTMLInputElement>) => {
        let doc = this.props.CollectionView.props.Document;
        if (e.key === "Enter") {
            var thing = (parseFloat(this.searchString2!) - NumCast(this.props.CollectionView.props.Document.minvalue)) * NumCast(doc.barwidth) / NumCast(this.props.CollectionView.props.Document._range);
            if (!isNaN(thing)) {
                if (thing < 0) {
                    doc.leftbound = 0;
                }
                else if (thing >= NumCast(doc.barwidth) - NumCast(doc.rightbound)) {
                    doc.leftbound = (NumCast(doc.barwidth) - NumCast(doc.rightbound) - 1);
                }
                else {
                    doc.leftbound = thing;
                }
            }
            this.searchString2 = undefined;
            this.searchString = undefined;
            this.searchref.current!.reset();
        }
        if (e.keyCode === 9) {
            e.preventDefault;
            e.stopPropagation();
        }
    }

    @action
    enter3 = (e: React.KeyboardEvent<HTMLInputElement>) => {
        console.log("update");
        if (e.key === "Enter") {
            this._currentKey = "";
            let collection = this.props.CollectionView.props.Document;

            var thing = (parseFloat(this.searchString2!) - NumCast(collection.minvalue)) * NumCast(collection.barwidth) / NumCast(collection._range);
            if (!isNaN(thing)) {
                if (thing < 0) {
                    collection.leftbound = 0;
                }
                else if (thing >= NumCast(collection.barwidth) - NumCast(collection.rightbound)) {
                    collection.leftbound = (NumCast(collection.barwidth) - NumCast(collection.rightbound) - 1);
                }
                else {
                    collection.leftbound = thing;
                }
            }
            this.props.CollectionView.props.Document.bugfix = !BoolCast(this.props.CollectionView.props.Document.bugfix);
            console.log(this.props.CollectionView.props.Document.bugfix);
            collection.transtate = true;
            collection.sortstate = this.searchString3;
        }
        if (e.keyCode === 9) {
            e.preventDefault;
            e.stopPropagation();
        }
    }

    @action.bound
    onChange3(e: React.ChangeEvent<HTMLInputElement>) {
        this.searchString3 = e.target.value;
    }


    @action.bound
    onChange(e: React.ChangeEvent<HTMLInputElement>) {
        this.searchString = e.target.value;
    }

    @action.bound
    onChange2(e: React.ChangeEvent<HTMLInputElement>) {
        this.searchString2 = e.target.value;
    }


    @observable searchString: string | undefined;
    @observable searchString2: string | undefined;
    @observable searchString3: string | undefined;

    @action.bound
    toggleRows(e: React.ChangeEvent<HTMLInputElement>) {
        this.props.CollectionView.props.Document.rowPrev = e.currentTarget.checked;
    }

    @action.bound
    toggleUpdate(e: React.ChangeEvent<HTMLInputElement>) {
        this.props.CollectionView.props.Document.update = e.currentTarget.checked;
    }

    @action
    private updateString(string: string) {
        this.searchString3 = string;
        console.log(this.searchString3);
    }

    @observable private _currentKey: string = "";
    @observable private _currentValue: string = "";
    @observable _allSuggestions: string[] = [];
    _suggestionDispser: IReactionDisposer | undefined;
    private userModified = false;

    private autosuggestRef = React.createRef<Autosuggest>();

    @action
    onKeyChange = (e: React.ChangeEvent, { newValue }: { newValue: string }) => {
        this._currentKey = newValue;
        this.updateString(newValue);
        if (!this.userModified) {
            this.previewValue();
        }
    }

    previewValue = async () => {
        let field: Field | undefined | null = null;
        let onProto: boolean = false;
        let value: string | undefined = undefined;
        let docs = this.props.CollectionView.props.Document;
        await docs[this._currentKey];
        value = Field.toKeyValueString(docs, this._currentKey);
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
            let doc = (this.props.CollectionView.props.Document);
            let success: boolean;
            success = KeyValueBox.ApplyKVPScript(doc, this._currentKey, script);
            this.clearInputs();
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
        let docs = this.props.CollectionView.props.Document;
        return Object.keys(docs).filter(key => key.toLowerCase().startsWith(value));

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

    render() {
        return (
            <div className="collectionSchemaViewChrome-cont">
                <div className="collectionTimelineViewBottomUI-grid">
                    <div ref={this.colorrefYellow} onClick={(e) => this.toggleColor(e, "#ffff80")} className="color1" style={{ position: "relative", borderRadius: "12.5px", width: "25px", height: "25px", backgroundColor: "#ffff80", border: "2px solid black" }}></div>
                    <div ref={this.colorrefGreen} onClick={(e) => this.toggleColor(e, "#bfff80")} className="color2" style={{ position: "relative", borderRadius: "12.5px", width: "25px", height: "25px", backgroundColor: "#bfff80", border: "2px solid #9c9396" }}></div>
                    <div ref={this.colorrefRed} onClick={(e) => this.toggleColor(e, "#ff8080")} className="color3" style={{ position: "relative", borderRadius: "12.5px", width: "25px", height: "25px", backgroundColor: "#ff8080", border: "2px solid #9c9396" }}></div>
                    <div ref={this.colorrefBlue} onClick={(e) => this.toggleColor(e, "#80dfff")} className="color4" style={{ position: "relative", borderRadius: "12.5px", width: "25px", height: "25px", backgroundColor: "#80dfff", border: "2px solid #9c9396" }}></div>
                    <div className="reset"> <button onClick={() => runInAction(() => { this.props.CollectionView.props.Document.leftbound = 0; this.props.CollectionView.props.Document.rightbound = 0; (this.searchref.current ? this.searchref.current.reset() : null); })}>Reset Range</button></div>
                    <form className="form" ref={this.searchref}>
                        <div className="min">
                            <input size={10} value={this.searchString2} onChange={this.onChange2} onKeyPress={this.enter2} type="text" placeholder={"Min: " +
                                String(Math.round((NumCast(this.props.CollectionView.props.Document.leftbound) *
                                    NumCast(this.props.CollectionView.props.Document._range) / NumCast(this.props.CollectionView.props.Document.barwidth)) +
                                    NumCast(this.props.CollectionView.props.Document.minvalue)))}
                                className="searchBox-barChild searchBox-input" />
                        </div>

                        <div className="max">
                            <input size={10} value={this.searchString ? this.searchString : undefined} onChange={this.onChange} onFocus={action(() => this.searchString = "")} onKeyPress={this.enter} type="text" placeholder={
                                "Max: " + String(Math.round((NumCast(this.props.CollectionView.props.Document.barwidth) -
                                    NumCast(this.props.CollectionView.props.Document.rightbound)) *
                                    NumCast(this.props.CollectionView.props.Document._range) / NumCast(this.props.CollectionView.props.Document.barwidth) + NumCast(this.props.CollectionView.props.Document._range) /
                                    NumCast(this.props.CollectionView.props.Document.minvalue)))}
                                className="searchBox-barChild searchBox-input" />
                        </div>
                    </form>
                    <div className="metadataEntry-outerDiv">
                        <div className="metadataEntry-inputArea">
                            <Autosuggest inputProps={{ value: this._currentKey, onChange: this.onKeyChange, onKeyPress: this.enter3, placeholder: StrCast(this.props.CollectionView.props.Document.sortstate) }}
                                getSuggestionValue={this.getSuggestionValue}
                                suggestions={[]}
                                alwaysRenderSuggestions={false}
                                renderSuggestion={this.renderSuggestion}
                                onSuggestionsFetchRequested={emptyFunction}
                                onSuggestionsClearRequested={emptyFunction}
                                ref={this.autosuggestRef} />
                        </div>
                        <div className="keys" >
                            <ul>
                                {this._allSuggestions.slice().sort().map(s => <li key={s} onClick={action(() => { this._currentKey = s; this.previewValue(); })} >{s}</li>)}
                            </ul>
                        </div>
                    </div>
                    <input className="rows" type="checkbox" onChange={this.toggleRows} id="add-menu-toggle" />
                    {/* <input className="update" type="checkbox" onChange={this.toggleUpdate} id="add-menu-toggle" /> */}
                </div >
            </div>
        );
    }
}


