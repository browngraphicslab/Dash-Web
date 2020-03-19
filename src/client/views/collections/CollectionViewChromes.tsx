import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { action, computed, observable, runInAction } from "mobx";
import { observer } from "mobx-react";
import * as React from "react";
import { Doc, DocListCast } from "../../../new_fields/Doc";
import { Id } from "../../../new_fields/FieldSymbols";
import { List } from "../../../new_fields/List";
import { listSpec } from "../../../new_fields/Schema";
import { ScriptField } from "../../../new_fields/ScriptField";
import { BoolCast, Cast, NumCast, StrCast } from "../../../new_fields/Types";
import { Utils, emptyFunction, setupMoveUpEvents } from "../../../Utils";
import { DragManager } from "../../util/DragManager";
import { undoBatch } from "../../util/UndoManager";
import { EditableView } from "../EditableView";
import { COLLECTION_BORDER_WIDTH } from "../globalCssVariables.scss";
import { CollectionViewType } from "./CollectionView";
import { CollectionView } from "./CollectionView";
import "./CollectionViewChromes.scss";
import * as Autosuggest from 'react-autosuggest';
import KeyRestrictionRow from "./KeyRestrictionRow";
const datepicker = require('js-datepicker');

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

const stopPropagation = (e: React.SyntheticEvent) => e.stopPropagation();

@observer
export class CollectionViewBaseChrome extends React.Component<CollectionViewChromeProps> {
    //(!)?\(\(\(doc.(\w+) && \(doc.\w+ as \w+\).includes\(\"(\w+)\"\)

    get target() { return this.props.CollectionView.props.Document; }
    _templateCommand = {
        params: ["target", "source"], title: "=> item view",
        script: "setChildLayout(this.target, this.source?.[0])",
        immediate: (source: Doc[]) => Doc.setChildLayout(this.target, source?.[0]),
        initialize: emptyFunction,
    };
    _narrativeCommand = {
        params: ["target", "source"], title: "=> click item view",
        script: "setChildDetailedLayout(this.target, this.source?.[0])",
        immediate: (source: Doc[]) => Doc.setChildDetailedLayout(this.target, source?.[0]),
        initialize: emptyFunction,
    };
    _contentCommand = {
        params: ["target", "source"], title: "=> content",
        script: "getProto(this.target).data = aliasDocs(this.source);",
        immediate: (source: Doc[]) => Doc.GetProto(this.target).data = Doc.aliasDocs(source),
        initialize: emptyFunction,
    };
    _viewCommand = {
        params: ["target"], title: "=> saved view",
        script: "this.target._panX = this.restoredPanX; this.target._panY = this.restoredPanY; this.target.scale = this.restoredScale;",
        immediate: (source: Doc[]) => { this.target._panX = 0; this.target._panY = 0; this.target.scale = 1; },
        initialize: (button: Doc) => { button.restoredPanX = this.target._panX; button.restoredPanY = this.target._panY; button.restoredScale = this.target.scale; },
    };
    _freeform_commands = [this._contentCommand, this._templateCommand, this._narrativeCommand, this._viewCommand];
    _stacking_commands = [this._contentCommand, this._templateCommand];
    _masonry_commands = [this._contentCommand, this._templateCommand];
    _schema_commands = [this._templateCommand, this._narrativeCommand];
    _tree_commands = [];
    private get _buttonizableCommands() {
        switch (this.props.type) {
            case CollectionViewType.Tree: return this._tree_commands;
            case CollectionViewType.Schema: return this._schema_commands;
            case CollectionViewType.Stacking: return this._stacking_commands;
            case CollectionViewType.Masonry: return this._stacking_commands;
            case CollectionViewType.Freeform: return this._freeform_commands;
            case CollectionViewType.Time: return this._freeform_commands;
            case CollectionViewType.Carousel: return this._freeform_commands;
        }
        return [];
    }
    private _picker: any;
    private _commandRef = React.createRef<HTMLInputElement>();
    private _viewRef = React.createRef<HTMLInputElement>();
    private _autosuggestRef = React.createRef<Autosuggest>();
    @observable private _currentKey: string = "";
    @observable private _viewSpecsOpen: boolean = false;
    @observable private _dateWithinValue: string = "";
    @observable private _dateValue: Date | string = "";
    @observable private _keyRestrictions: [JSX.Element, string][] = [];
    @observable private suggestions: string[] = [];
    @computed private get filterValue() { return Cast(this.props.CollectionView.props.Document.viewSpecScript, ScriptField); }

    getFilters = (script: string) => {
        const re: any = /(!)?\(\(\(doc\.(\w+)\s+&&\s+\(doc\.\w+\s+as\s+\w+\)\.includes\(\"(\w+)\"\)/g;
        const arr: any[] = re.exec(script);
        const toReturn: Filter[] = [];
        if (arr !== null) {
            const filter: Filter = {
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
            const string = this.filterValue.script.originalScript;
            fields = this.getFilters(string);
        }

        runInAction(() => {
            this.addKeyRestrictions(fields);
            // chrome status is one of disabled, collapsed, or visible. this determines initial state from document
            const chromeStatus = this.props.CollectionView.props.Document._chromeStatus;
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
        this.props.CollectionView.props.Document._viewType = parseInt(e.target.selectedOptions[0].value);
    }

    commandChanged = (e: React.ChangeEvent) => {
        //@ts-ignore
        runInAction(() => this._currentKey = e.target.selectedOptions[0].value);
    }

    @action
    openViewSpecs = (e: React.SyntheticEvent) => {
        if (this._viewSpecsOpen) this.closeViewSpecs();
        else {
            this._viewSpecsOpen = true;

            //@ts-ignore
            if (!e.target?.classList[0]?.startsWith("qs")) {
                this.closeDatePicker();
            }

            e.stopPropagation();
            document.removeEventListener("pointerdown", this.closeViewSpecs);
            document.addEventListener("pointerdown", this.closeViewSpecs);
        }
    }

    @action closeViewSpecs = () => {
        this._viewSpecsOpen = false;
        document.removeEventListener("pointerdown", this.closeViewSpecs);
    }

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
        const index = this._keyRestrictions.length;
        this._keyRestrictions.push([<KeyRestrictionRow field="" value="" key={Utils.GenerateGuid()} contains={true} script={(value: string) => runInAction(() => this._keyRestrictions[index][1] = value)} />, ""]);

        this.openViewSpecs(e);
    }

    @action.bound
    applyFilter = (e: React.MouseEvent) => {

        this.openViewSpecs(e);

        const keyRestrictionScript = "(" + this._keyRestrictions.map(i => i[1]).filter(i => i.length > 0).join(" && ") + ")";
        const yearOffset = this._dateWithinValue[1] === 'y' ? 1 : 0;
        const monthOffset = this._dateWithinValue[1] === 'm' ? parseInt(this._dateWithinValue[0]) : 0;
        const weekOffset = this._dateWithinValue[1] === 'w' ? parseInt(this._dateWithinValue[0]) : 0;
        const dayOffset = (this._dateWithinValue[1] === 'd' ? parseInt(this._dateWithinValue[0]) : 0) + weekOffset * 7;
        let dateRestrictionScript = "";
        if (this._dateValue instanceof Date) {
            const lowerBound = new Date(this._dateValue.getFullYear() - yearOffset, this._dateValue.getMonth() - monthOffset, this._dateValue.getDate() - dayOffset);
            const upperBound = new Date(this._dateValue.getFullYear() + yearOffset, this._dateValue.getMonth() + monthOffset, this._dateValue.getDate() + dayOffset + 1);
            dateRestrictionScript = `((doc.creationDate as any).date >= ${lowerBound.valueOf()} && (doc.creationDate as any).date <= ${upperBound.valueOf()})`;
        }
        else {
            const createdDate = new Date(this._dateValue);
            if (!isNaN(createdDate.getTime())) {
                const lowerBound = new Date(createdDate.getFullYear() - yearOffset, createdDate.getMonth() - monthOffset, createdDate.getDate() - dayOffset);
                const upperBound = new Date(createdDate.getFullYear() + yearOffset, createdDate.getMonth() + monthOffset, createdDate.getDate() + dayOffset + 1);
                dateRestrictionScript = `((doc.creationDate as any).date >= ${lowerBound.valueOf()} && (doc.creationDate as any).date <= ${upperBound.valueOf()})`;
            }
        }
        const fullScript = dateRestrictionScript.length || keyRestrictionScript.length ? dateRestrictionScript.length ?
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
        this.props.CollectionView.props.Document._chromeStatus = this.props.CollectionView.props.Document._chromeStatus === "enabled" ? "collapsed" : "enabled";
        if (this.props.collapse) {
            this.props.collapse(this.props.CollectionView.props.Document._chromeStatus !== "enabled");
        }
    }

    subChrome = () => {
        const collapsed = this.props.CollectionView.props.Document._chromeStatus !== "enabled";
        if (collapsed) return null;
        switch (this.props.type) {
            case CollectionViewType.Stacking: return (<CollectionStackingViewChrome key="collchrome" CollectionView={this.props.CollectionView} type={this.props.type} />);
            case CollectionViewType.Schema: return (<CollectionSchemaViewChrome key="collchrome" CollectionView={this.props.CollectionView} type={this.props.type} />);
            case CollectionViewType.Tree: return (<CollectionTreeViewChrome key="collchrome" CollectionView={this.props.CollectionView} type={this.props.type} />);
            case CollectionViewType.Masonry: return (<CollectionStackingViewChrome key="collchrome" CollectionView={this.props.CollectionView} type={this.props.type} />);
            default: return null;
        }
    }

    private get document() {
        return this.props.CollectionView.props.Document;
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
            this.dropDisposer = DragManager.MakeDropTarget(ele, this.drop.bind(this));
        }
    }

    @undoBatch
    @action
    protected drop(e: Event, de: DragManager.DropEvent): boolean {
        if (de.complete.docDragData && de.complete.docDragData.draggedDocuments.length) {
            this._buttonizableCommands.filter(c => c.title === this._currentKey).map(c => c.immediate(de.complete.docDragData?.draggedDocuments || []));
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

    dragViewDown = (e: React.PointerEvent) => {
        setupMoveUpEvents(this, e, (e, down, delta) => {
            const vtype = NumCast(this.props.CollectionView.props.Document._viewType) as CollectionViewType;
            const c = {
                params: ["target"], title: CollectionViewType.stringFor(vtype),
                script: `this.target._viewType = ${NumCast(this.props.CollectionView.props.Document._viewType)}`,
                immediate: (source: Doc[]) => Doc.setChildLayout(this.target, source?.[0]),
                initialize: emptyFunction,
            };
            DragManager.StartButtonDrag([this._viewRef.current!], c.script, c.title,
                { target: this.props.CollectionView.props.Document }, c.params, c.initialize, e.clientX, e.clientY);
            return true;
        }, emptyFunction, emptyFunction);
    }
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
        const [dx, dy] = [e.clientX - this._startDragPosition.x, e.clientY - this._startDragPosition.y];
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
        const collapsed = this.props.CollectionView.props.Document._chromeStatus !== "enabled";
        return (
            <div className="collectionViewChrome-cont" style={{
                top: collapsed ? -70 : 0, height: collapsed ? 0 : undefined,
                transform: collapsed ? "" : `scale(${Math.min(1, this.props.CollectionView.props.ScreenToLocalTransform().Scale)})`,
                transformOrigin: "top left",
                width: `${100 / Math.min(1, this.props.CollectionView.props.ScreenToLocalTransform().Scale)}%`
            }}>
                <div className="collectionViewChrome" style={{ border: "unset" }}>
                    <div className="collectionViewBaseChrome">
                        <button className="collectionViewBaseChrome-collapse"
                            style={{
                                top: collapsed ? 70 : 10,
                                transform: `rotate(${collapsed ? 180 : 0}deg) scale(0.5) translate(${collapsed ? "-100%, -100%" : "0, 0"})`,
                                opacity: (collapsed && !this.props.CollectionView.props.isSelected()) ? 0 : 0.9,
                                left: (collapsed ? 0 : "unset"),
                            }}
                            title="Collapse collection chrome" onClick={this.toggleCollapse}>
                            <FontAwesomeIcon icon="caret-up" size="2x" />
                        </button><div className="collectionViewBaseChrome-template" style={{ marginLeft: 25, display: collapsed ? "none" : undefined }}>
                            <div className="commandEntry-outerDiv" title="drop document to apply or drag to create button" ref={this._viewRef} onPointerDown={this.dragViewDown}>
                                <div className="commandEntry-drop">
                                    <FontAwesomeIcon icon="bullseye" size="2x"></FontAwesomeIcon>
                                </div>
                                <select
                                    className="collectionViewBaseChrome-viewPicker"
                                    onPointerDown={stopPropagation}
                                    onChange={this.viewChanged}
                                    style={{ display: collapsed ? "none" : undefined }}
                                    value={NumCast(this.props.CollectionView.props.Document._viewType)}>
                                    <option className="collectionViewBaseChrome-viewOption" onPointerDown={stopPropagation} value="1">Freeform</option>
                                    <option className="collectionViewBaseChrome-viewOption" onPointerDown={stopPropagation} value="2">Schema</option>
                                    <option className="collectionViewBaseChrome-viewOption" onPointerDown={stopPropagation} value="4">Tree</option>
                                    <option className="collectionViewBaseChrome-viewOption" onPointerDown={stopPropagation} value="5">Stacking</option>
                                    <option className="collectionViewBaseChrome-viewOption" onPointerDown={stopPropagation} value="6">Masonry</option>
                                    <option className="collectionViewBaseChrome-viewOption" onPointerDown={stopPropagation} value="7">MultiCol</option>
                                    <option className="collectionViewBaseChrome-viewOption" onPointerDown={stopPropagation} value="8">MultiRow</option>
                                    <option className="collectionViewBaseChrome-viewOption" onPointerDown={stopPropagation} value="9">Pivot/Time</option>
                                    <option className="collectionViewBaseChrome-viewOption" onPointerDown={stopPropagation} value="10">Carousel</option>
                                </select>
                            </div>
                        </div>
                        <div className="collectionViewBaseChrome-viewSpecs" title="filter documents to show" style={{ display: collapsed ? "none" : "grid" }}>
                            <div className="collectionViewBaseChrome-filterIcon" onPointerDown={this.openViewSpecs} >
                                <FontAwesomeIcon icon="filter" size="2x" />
                            </div>
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
                        <div className="collectionViewBaseChrome-template" ref={this.createDropTarget} style={{ display: collapsed ? "none" : undefined }}>
                            <div className="commandEntry-outerDiv" title="drop document to apply or drag to create button" ref={this._commandRef} onPointerDown={this.dragCommandDown}>
                                <div className="commandEntry-drop">
                                    <FontAwesomeIcon icon="bullseye" size="2x" />
                                </div>
                                <select
                                    className="collectionViewBaseChrome-cmdPicker"
                                    onPointerDown={stopPropagation}
                                    onChange={this.commandChanged}
                                    value={this._currentKey}>
                                    <option className="collectionViewBaseChrome-viewOption" onPointerDown={stopPropagation} key={"empty"} value={""}>{""}</option>
                                    {this._buttonizableCommands.map(cmd =>
                                        <option className="collectionViewBaseChrome-viewOption" onPointerDown={stopPropagation} key={cmd.title} value={cmd.title}>{cmd.title}</option>
                                    )}
                                </select>
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
    @computed get pivotField() { return StrCast(this.props.CollectionView.props.Document._pivotField); }

    getKeySuggestions = async (value: string): Promise<string[]> => {
        value = value.toLowerCase();
        const docs = DocListCast(this.props.CollectionView.props.Document[this.props.CollectionView.props.fieldKey]);
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
        this.props.CollectionView.props.Document._pivotField = value;
        return true;
    }

    @action toggleSort = () => { this.props.CollectionView.props.Document.stackingHeadersSortDescending = !this.props.CollectionView.props.Document.stackingHeadersSortDescending; };
    @action resetValue = () => { this._currentKey = this.pivotField; };

    render() {
        return (
            <div className="collectionStackingViewChrome-cont">
                <div className="collectionStackingViewChrome-pivotField-cont">
                    <div className="collectionStackingViewChrome-pivotField-label">
                        GROUP BY:
                    </div>
                    <div className="collectionStackingViewChrome-sortIcon" onClick={this.toggleSort} style={{ transform: `rotate(${this.descending ? "180" : "0"}deg)` }}>
                        <FontAwesomeIcon icon="caret-up" size="2x" color="white" />
                    </div>
                    <div className="collectionStackingViewChrome-pivotField">
                        <EditableView
                            GetValue={() => this.pivotField}
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
                            contents={this.pivotField ? this.pivotField : "N/A"}
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
        const dividerWidth = 4;
        const borderWidth = Number(COLLECTION_BORDER_WIDTH);
        const panelWidth = this.props.CollectionView.props.PanelWidth();
        const previewWidth = NumCast(this.props.CollectionView.props.Document.schemaPreviewWidth);
        const tableWidth = panelWidth - 2 * borderWidth - dividerWidth - previewWidth;
        this.props.CollectionView.props.Document.schemaPreviewWidth = previewWidth === 0 ? Math.min(tableWidth / 3, 200) : 0;
    }

    @undoBatch
    @action
    toggleTextwrap = async () => {
        const textwrappedRows = Cast(this.props.CollectionView.props.Document.textwrappedSchemaRows, listSpec("string"), []);
        if (textwrappedRows.length) {
            this.props.CollectionView.props.Document.textwrappedSchemaRows = new List<string>([]);
        } else {
            const docs = DocListCast(this.props.CollectionView.props.Document[this.props.CollectionView.props.fieldKey]);
            const allRows = docs instanceof Doc ? [docs[Id]] : docs.map(doc => doc[Id]);
            this.props.CollectionView.props.Document.textwrappedSchemaRows = new List<string>(allRows);
        }
    }


    render() {
        const previewWidth = NumCast(this.props.CollectionView.props.Document.schemaPreviewWidth);
        const textWrapped = Cast(this.props.CollectionView.props.Document.textwrappedSchemaRows, listSpec("string"), []).length > 0;

        return (
            <div className="collectionSchemaViewChrome-cont">
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

    get dataExtension() {
        return this.props.CollectionView.props.Document[this.props.CollectionView.props.fieldKey + "_ext"] as Doc;
    }
    @computed private get descending() {
        return this.dataExtension && Cast(this.dataExtension.sortAscending, "boolean", null);
    }

    @action toggleSort = () => {
        if (this.dataExtension) {
            if (this.dataExtension.sortAscending) this.dataExtension.sortAscending = undefined;
            else if (this.dataExtension.sortAscending === undefined) this.dataExtension.sortAscending = false;
            else this.dataExtension.sortAscending = true;
        }
    }

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

