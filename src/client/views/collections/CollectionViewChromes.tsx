import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { action, computed, observable, runInAction, Lambda } from "mobx";
import { observer } from "mobx-react";
import * as React from "react";
import { Doc, DocListCast, Opt } from "../../../fields/Doc";
import { Id } from "../../../fields/FieldSymbols";
import { List } from "../../../fields/List";
import { listSpec } from "../../../fields/Schema";
import { BoolCast, Cast, NumCast, StrCast } from "../../../fields/Types";
import { Utils, emptyFunction, setupMoveUpEvents } from "../../../Utils";
import { DragManager } from "../../util/DragManager";
import { undoBatch } from "../../util/UndoManager";
import { EditableView } from "../EditableView";
import { COLLECTION_BORDER_WIDTH } from "../globalCssVariables.scss";
import { CollectionViewType } from "./CollectionView";
import { CollectionView } from "./CollectionView";
import "./CollectionViewChromes.scss";
import { CollectionFreeFormDocumentView } from "../nodes/CollectionFreeFormDocumentView";

interface CollectionViewChromeProps {
    CollectionView: CollectionView;
    type: CollectionViewType;
    collapse?: (value: boolean) => any;
    PanelWidth: () => number;
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
        script: "this.target.childLayout = getDocTemplate(this.source?.[0])",
        immediate: undoBatch((source: Doc[]) => source.length && (this.target.childLayout = Doc.getDocTemplate(source?.[0]))),
        initialize: emptyFunction,
    };
    _narrativeCommand = {
        params: ["target", "source"], title: "=> child click view",
        script: "this.target.childClickedOpenTemplateView = getDocTemplate(this.source?.[0])",
        immediate: undoBatch((source: Doc[]) => source.length && (this.target.childClickedOpenTemplateView = Doc.getDocTemplate(source?.[0]))),
        initialize: emptyFunction,
    };
    _contentCommand = {
        params: ["target", "source"], title: "=> clear content",
        script: "getProto(this.target).data = copyField(this.source);",
        immediate: undoBatch((source: Doc[]) => Doc.GetProto(this.target).data = new List<Doc>(source)), // Doc.aliasDocs(source),
        initialize: emptyFunction,
    };
    _viewCommand = {
        params: ["target"], title: "=> reset view",
        script: "this.target._panX = this.restoredPanX; this.target._panY = this.restoredPanY; this.target.scale = this.restoredScale;",
        immediate: undoBatch((source: Doc[]) => { this.target._panX = 0; this.target._panY = 0; this.target.scale = 1; }),
        initialize: (button: Doc) => { button.restoredPanX = this.target._panX; button.restoredPanY = this.target._panY; button.restoredScale = this.target.scale; },
    };
    _clusterCommand = {
        params: ["target"], title: "=> fit content",
        script: "this.target._fitToBox = !this.target._fitToBox;",
        immediate: undoBatch((source: Doc[]) => this.target._fitToBox = !this.target._fitToBox),
        initialize: emptyFunction
    };
    _fitContentCommand = {
        params: ["target"], title: "=> toggle clusters",
        script: "this.target.useClusters = !this.target.useClusters;",
        immediate: undoBatch((source: Doc[]) => this.target.useClusters = !this.target.useClusters),
        initialize: emptyFunction
    };

    _freeform_commands = [this._viewCommand, this._fitContentCommand, this._clusterCommand, this._contentCommand, this._templateCommand, this._narrativeCommand];
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
            case CollectionViewType.Carousel3D: return this._freeform_commands;
        }
        return [];
    }
    private _picker: any;
    private _commandRef = React.createRef<HTMLInputElement>();
    private _viewRef = React.createRef<HTMLInputElement>();
    @observable private _currentKey: string = "";

    componentDidMount = action(() => {
        this._currentKey = this._currentKey || (this._buttonizableCommands.length ? this._buttonizableCommands[0]?.title : "");
        // chrome status is one of disabled, collapsed, or visible. this determines initial state from document
        switch (this.props.CollectionView.props.Document._chromeStatus) {
            case "disabled":
                throw new Error("how did you get here, if chrome status is 'disabled' on a collection, a chrome shouldn't even be instantiated!");
            case "collapsed":
                this.props.collapse?.(true);
                break;
        }
    });

    @undoBatch
    viewChanged = (e: React.ChangeEvent) => {
        //@ts-ignore
        this.document._viewType = e.target.selectedOptions[0].value;
    }

    commandChanged = (e: React.ChangeEvent) => {
        //@ts-ignore
        runInAction(() => this._currentKey = e.target.selectedOptions[0].value);
    }

    @action
    toggleViewSpecs = (e: React.SyntheticEvent) => {
        this.document._facetWidth = this.document._facetWidth ? 0 : 200;
        e.stopPropagation();
    }

    @action closeViewSpecs = () => {
        this.document._facetWidth = 0;
    }

    // @action
    // openDatePicker = (e: React.PointerEvent) => {
    //     if (this._picker) {
    //         this._picker.alwaysShow = true;
    //         this._picker.show();
    //         // TODO: calendar is offset when zoomed in/out
    //         // this._picker.calendar.style.position = "absolute";
    //         // let transform = this.props.CollectionView.props.ScreenToLocalTransform();
    //         // let x = parseInt(this._picker.calendar.style.left) / transform.Scale;
    //         // let y = parseInt(this._picker.calendar.style.top) / transform.Scale;
    //         // this._picker.calendar.style.left = x;
    //         // this._picker.calendar.style.top = y;

    //         e.stopPropagation();
    //     }
    // }

    // <input className="collectionViewBaseChrome-viewSpecsMenu-rowRight"
    //     id={Utils.GenerateGuid()}
    //     ref={this.datePickerRef}
    //     value={this._dateValue instanceof Date ? this._dateValue.toLocaleDateString() : this._dateValue}
    //     onChange={(e) => runInAction(() => this._dateValue = e.target.value)}
    //     onPointerDown={this.openDatePicker}
    //     placeholder="Value" />
    // @action.bound
    // applyFilter = (e: React.MouseEvent) => {
    //     const keyRestrictionScript = "(" + this._keyRestrictions.map(i => i[1]).filter(i => i.length > 0).join(" && ") + ")";
    //     const yearOffset = this._dateWithinValue[1] === 'y' ? 1 : 0;
    //     const monthOffset = this._dateWithinValue[1] === 'm' ? parseInt(this._dateWithinValue[0]) : 0;
    //     const weekOffset = this._dateWithinValue[1] === 'w' ? parseInt(this._dateWithinValue[0]) : 0;
    //     const dayOffset = (this._dateWithinValue[1] === 'd' ? parseInt(this._dateWithinValue[0]) : 0) + weekOffset * 7;
    //     let dateRestrictionScript = "";
    //     if (this._dateValue instanceof Date) {
    //         const lowerBound = new Date(this._dateValue.getFullYear() - yearOffset, this._dateValue.getMonth() - monthOffset, this._dateValue.getDate() - dayOffset);
    //         const upperBound = new Date(this._dateValue.getFullYear() + yearOffset, this._dateValue.getMonth() + monthOffset, this._dateValue.getDate() + dayOffset + 1);
    //         dateRestrictionScript = `((doc.creationDate as any).date >= ${lowerBound.valueOf()} && (doc.creationDate as any).date <= ${upperBound.valueOf()})`;
    //     }
    //     else {
    //         const createdDate = new Date(this._dateValue);
    //         if (!isNaN(createdDate.getTime())) {
    //             const lowerBound = new Date(createdDate.getFullYear() - yearOffset, createdDate.getMonth() - monthOffset, createdDate.getDate() - dayOffset);
    //             const upperBound = new Date(createdDate.getFullYear() + yearOffset, createdDate.getMonth() + monthOffset, createdDate.getDate() + dayOffset + 1);
    //             dateRestrictionScript = `((doc.creationDate as any).date >= ${lowerBound.valueOf()} && (doc.creationDate as any).date <= ${upperBound.valueOf()})`;
    //         }
    //     }
    //     const fullScript = dateRestrictionScript.length || keyRestrictionScript.length ? dateRestrictionScript.length ?
    //         `${dateRestrictionScript} ${keyRestrictionScript.length ? "&&" : ""} (${keyRestrictionScript})` :
    //         `(${keyRestrictionScript}) ${dateRestrictionScript.length ? "&&" : ""} ${dateRestrictionScript}` :
    //         "true";

    //     this.props.CollectionView.props.Document.viewSpecScript = ScriptField.MakeFunction(fullScript, { doc: Doc.name });
    // }

    // datePickerRef = (node: HTMLInputElement) => {
    //     if (node) {
    //         try {
    //             this._picker = datepicker("#" + node.id, {
    //                 disabler: (date: Date) => date > new Date(),
    //                 onSelect: (instance: any, date: Date) => runInAction(() => {}), //  this._dateValue = date),
    //                 dateSelected: new Date()
    //             });
    //         } catch (e) {
    //             console.log("date picker exception:" + e);
    //         }
    //     }
    // }


    @action
    toggleCollapse = () => {
        this.document._chromeStatus = this.document._chromeStatus === "enabled" ? "collapsed" : "enabled";
        if (this.props.collapse) {
            this.props.collapse(this.props.CollectionView.props.Document._chromeStatus !== "enabled");
        }
    }

    @computed get subChrome() {
        const collapsed = this.document._chromeStatus !== "enabled";
        if (collapsed) return null;
        switch (this.props.type) {
            case CollectionViewType.Freeform: return (<CollectionFreeFormViewChrome key="collchrome" PanelWidth={this.props.PanelWidth} CollectionView={this.props.CollectionView} type={this.props.type} />);
            case CollectionViewType.Stacking: return (<CollectionStackingViewChrome key="collchrome" PanelWidth={this.props.PanelWidth} CollectionView={this.props.CollectionView} type={this.props.type} />);
            case CollectionViewType.Schema: return (<CollectionSchemaViewChrome key="collchrome" PanelWidth={this.props.PanelWidth} CollectionView={this.props.CollectionView} type={this.props.type} />);
            case CollectionViewType.Tree: return (<CollectionTreeViewChrome key="collchrome" PanelWidth={this.props.PanelWidth} CollectionView={this.props.CollectionView} type={this.props.type} />);
            case CollectionViewType.Masonry: return (<CollectionStackingViewChrome key="collchrome" PanelWidth={this.props.PanelWidth} CollectionView={this.props.CollectionView} type={this.props.type} />);
            case CollectionViewType.Carousel3D: return (<Collection3DCarouselViewChrome key="collchrome" PanelWidth={this.props.PanelWidth} CollectionView={this.props.CollectionView} type={this.props.type} />);
            case CollectionViewType.Grid: return (<CollectionGridViewChrome key="collchrome" PanelWidth={this.props.PanelWidth} CollectionView={this.props.CollectionView} type={this.props.type} />);
            default: return null;
        }
    }

    private get document() {
        return this.props.CollectionView.props.Document;
    }

    private dropDisposer?: DragManager.DragDropDisposer;
    protected createDropTarget = (ele: HTMLDivElement) => {
        this.dropDisposer?.();
        if (ele) {
            this.dropDisposer = DragManager.MakeDropTarget(ele, this.drop.bind(this), this.document);
        }
    }

    @undoBatch
    @action
    protected drop(e: Event, de: DragManager.DropEvent): boolean {
        const docDragData = de.complete.docDragData;
        if (docDragData?.draggedDocuments.length) {
            this._buttonizableCommands.filter(c => c.title === this._currentKey).map(c => c.immediate(docDragData.draggedDocuments || []));
            e.stopPropagation();
        }
        return true;
    }

    dragViewDown = (e: React.PointerEvent) => {
        setupMoveUpEvents(this, e, (e, down, delta) => {
            const vtype = this.props.CollectionView.collectionViewType;
            const c = {
                params: ["target"], title: vtype,
                script: `this.target._viewType = '${StrCast(this.props.CollectionView.props.Document._viewType)}'`,
                immediate: (source: Doc[]) => this.props.CollectionView.props.Document._viewType = Doc.getDocTemplate(source?.[0]),
                initialize: emptyFunction,
            };
            DragManager.StartButtonDrag([this._viewRef.current!], c.script, StrCast(c.title),
                { target: this.props.CollectionView.props.Document }, c.params, c.initialize, e.clientX, e.clientY);
            return true;
        }, emptyFunction, emptyFunction);
    }
    dragCommandDown = (e: React.PointerEvent) => {
        setupMoveUpEvents(this, e, (e, down, delta) => {
            this._buttonizableCommands.filter(c => c.title === this._currentKey).map(c =>
                DragManager.StartButtonDrag([this._commandRef.current!], c.script, c.title,
                    { target: this.props.CollectionView.props.Document }, c.params, c.initialize, e.clientX, e.clientY));
            return true;
        }, emptyFunction, () => {
            this._buttonizableCommands.filter(c => c.title === this._currentKey).map(c => c.immediate([]));
        });
    }

    @computed get templateChrome() {
        const collapsed = this.props.CollectionView.props.Document._chromeStatus !== "enabled";
        return <div className="collectionViewBaseChrome-template" ref={this.createDropTarget} style={{ display: collapsed ? "none" : undefined }}>
            <div className="commandEntry-outerDiv" title="drop document to apply or drag to create button" ref={this._commandRef} onPointerDown={this.dragCommandDown}>
                <div className="commandEntry-drop">
                    <FontAwesomeIcon icon="bullseye" size="2x" />
                </div>
                <select
                    className="collectionViewBaseChrome-cmdPicker" onPointerDown={stopPropagation} onChange={this.commandChanged} value={this._currentKey}
                    style={{ width: this.props.PanelWidth() < 300 ? 15 : undefined }}>
                    <option className="collectionViewBaseChrome-viewOption" onPointerDown={stopPropagation} key={"empty"} value={""} />
                    {this._buttonizableCommands.map(cmd =>
                        <option className="collectionViewBaseChrome-viewOption" onPointerDown={stopPropagation} key={cmd.title} value={cmd.title}>{cmd.title}</option>
                    )}
                </select>
            </div>
        </div>;
    }

    @computed get viewModes() {
        const collapsed = this.props.CollectionView.props.Document._chromeStatus !== "enabled";
        return <div className="collectionViewBaseChrome-viewModes" style={{ display: collapsed ? "none" : undefined }}>
            <div className="commandEntry-outerDiv" title="drop document to apply or drag to create button" ref={this._viewRef} onPointerDown={this.dragViewDown}>
                <div className="commandEntry-drop">
                    <FontAwesomeIcon icon="bullseye" size="2x" />
                </div>
                <select
                    className="collectionViewBaseChrome-viewPicker" style={{ width: this.props.PanelWidth() < 300 ? 15 : undefined }}
                    onPointerDown={stopPropagation}
                    onChange={this.viewChanged}
                    value={StrCast(this.props.CollectionView.props.Document._viewType)}>
                    {Object.values(CollectionViewType).map(type => ["invalid", "docking"].includes(type) ? (null) : (
                        <option
                            key={Utils.GenerateGuid()}
                            className="collectionViewBaseChrome-viewOption"
                            onPointerDown={stopPropagation}
                            value={type}>
                            {type[0].toUpperCase() + type.substring(1)}
                        </option>
                    ))}
                </select>
            </div>
        </div>;
    }

    render() {
        const collapsed = this.props.CollectionView.props.Document._chromeStatus !== "enabled";
        const scale = Math.min(1, this.props.CollectionView.props.ScreenToLocalTransform().Scale);
        return (
            <div className="collectionViewChrome-cont" style={{
                top: collapsed ? -70 : 0, height: collapsed ? 0 : undefined,
                transform: collapsed ? "" : `scale(${scale})`,
                width: `${this.props.PanelWidth() / scale}px`
            }}>
                <div className="collectionViewChrome" style={{ border: "unset", pointerEvents: collapsed ? "none" : undefined }}>
                    <div className="collectionViewBaseChrome">
                        <button className="collectionViewBaseChrome-collapse"
                            style={{
                                top: collapsed ? 70 : 10,
                                transform: `rotate(${collapsed ? 180 : 0}deg) scale(0.5) translate(${collapsed ? "-100%, -100%" : "0, 0"})`,
                                opacity: 0.9,
                                display: (collapsed && !this.props.CollectionView.props.isSelected()) ? "none" : undefined,
                                left: (collapsed ? 0 : "unset"),
                            }}
                            title="Collapse collection chrome" onClick={this.toggleCollapse}>
                            <FontAwesomeIcon icon="caret-up" size="2x" />
                        </button>
                        {this.viewModes}
                        <div className="collectionViewBaseChrome-viewSpecs" title="filter documents to show" style={{ display: collapsed ? "none" : "grid" }}>
                            <div className="collectionViewBaseChrome-filterIcon" onPointerDown={this.toggleViewSpecs} >
                                <FontAwesomeIcon icon="filter" size="2x" />
                            </div>
                        </div>
                        {this.templateChrome}
                    </div>
                    {this.subChrome}
                </div>
            </div>
        );
    }
}

@observer
export class CollectionFreeFormViewChrome extends React.Component<CollectionViewChromeProps> {

    get Document() { return this.props.CollectionView.props.Document; }
    @computed get dataField() {
        return this.props.CollectionView.props.Document[Doc.LayoutFieldKey(this.props.CollectionView.props.Document)];
    }
    @computed get childDocs() {
        return DocListCast(this.dataField);
    }
    @undoBatch
    @action
    nextKeyframe = (): void => {
        const currentFrame = NumCast(this.Document.currentFrame);
        if (currentFrame === undefined) {
            this.Document.currentFrame = 0;
            CollectionFreeFormDocumentView.setupKeyframes(this.childDocs, 0);
        }
        CollectionFreeFormDocumentView.updateKeyframe(this.childDocs, currentFrame || 0);
        this.Document.currentFrame = Math.max(0, (currentFrame || 0) + 1);
        this.Document.lastFrame = Math.max(NumCast(this.Document.currentFrame), NumCast(this.Document.lastFrame));
    }
    @undoBatch
    @action
    prevKeyframe = (): void => {
        const currentFrame = NumCast(this.Document.currentFrame);
        if (currentFrame === undefined) {
            this.Document.currentFrame = 0;
            CollectionFreeFormDocumentView.setupKeyframes(this.childDocs, 0);
        }
        CollectionFreeFormDocumentView.gotoKeyframe(this.childDocs.slice());
        this.Document.currentFrame = Math.max(0, (currentFrame || 0) - 1);
    }
    render() {
        return this.Document.isAnnotationOverlay ? (null) :
            <div className="collectionFreeFormViewChrome-cont">
                <div key="back" title="back frame" className="backKeyframe" onClick={this.prevKeyframe}>
                    <FontAwesomeIcon icon={"caret-left"} size={"lg"} />
                </div>
                <div key="num" title="toggle view all" className="numKeyframe" style={{ backgroundColor: this.Document.editing ? "#759c75" : "#c56565" }}
                    onClick={action(() => this.Document.editing = !this.Document.editing)} >
                    {NumCast(this.Document.currentFrame)}
                </div>
                <div key="fwd" title="forward frame" className="fwdKeyframe" onClick={this.nextKeyframe}>
                    <FontAwesomeIcon icon={"caret-right"} size={"lg"} />
                </div>
            </div>;
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

    @action
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

    get sortAscending() {
        return this.props.CollectionView.props.Document[this.props.CollectionView.props.fieldKey + "-sortAscending"];
    }
    set sortAscending(value) {
        this.props.CollectionView.props.Document[this.props.CollectionView.props.fieldKey + "-sortAscending"] = value;
    }
    @computed private get ascending() {
        return Cast(this.sortAscending, "boolean", null);
    }

    @action toggleSort = () => {
        if (this.sortAscending) this.sortAscending = undefined;
        else if (this.sortAscending === undefined) this.sortAscending = false;
        else this.sortAscending = true;
    }

    render() {
        return (
            <div className="collectionTreeViewChrome-cont">
                <button className="collectionTreeViewChrome-sort" onClick={this.toggleSort}>
                    <div className="collectionTreeViewChrome-sortLabel">
                        Sort
                        </div>
                    <div className="collectionTreeViewChrome-sortIcon" style={{ transform: `rotate(${this.ascending === undefined ? "90" : this.ascending ? "180" : "0"}deg)` }}>
                        <FontAwesomeIcon icon="caret-up" size="2x" color="white" />
                    </div>
                </button>
            </div>
        );
    }
}

// Enter scroll speed for 3D Carousel 
@observer
export class Collection3DCarouselViewChrome extends React.Component<CollectionViewChromeProps> {
    @computed get scrollSpeed() {
        return this.props.CollectionView.props.Document._autoScrollSpeed;
    }

    @action
    setValue = (value: string) => {
        const numValue = Number(StrCast(value));
        if (numValue > 0) {
            this.props.CollectionView.props.Document._autoScrollSpeed = numValue;
            return true;
        }
        return false;
    }

    render() {
        return (
            <div className="collection3DCarouselViewChrome-cont">
                <div className="collection3DCarouselViewChrome-scrollSpeed-cont">
                    <div className="collectionStackingViewChrome-scrollSpeed-label">
                        AUTOSCROLL SPEED:
                    </div>
                    <div className="collection3DCarouselViewChrome-scrollSpeed">
                        <EditableView
                            GetValue={() => StrCast(this.scrollSpeed)}
                            oneLine
                            SetValue={this.setValue}
                            contents={this.scrollSpeed ? this.scrollSpeed : 1000} />
                    </div>
                </div>
            </div>
        );
    }
}

/**
 * Chrome for grid view.
 */
@observer
export class CollectionGridViewChrome extends React.Component<CollectionViewChromeProps> {

    private clicked: boolean = false;
    private entered: boolean = false;
    private decrementLimitReached: boolean = false;
    @observable private resize = false;
    private resizeListenerDisposer: Opt<Lambda>;

    componentDidMount() {

        runInAction(() => this.resize = this.props.CollectionView.props.PanelWidth() < 700);

        // listener to reduce text on chrome resize (panel resize)
        this.resizeListenerDisposer = computed(() => this.props.CollectionView.props.PanelWidth()).observe(({ newValue }) => {
            runInAction(() => this.resize = newValue < 700);
        });
    }

    componentWillUnmount() {
        this.resizeListenerDisposer?.();
    }

    get numCols() { return NumCast(this.props.CollectionView.props.Document.gridNumCols, 10); }

    /**
     * Sets the value of `numCols` on the grid's Document to the value entered.
     */
    @undoBatch
    onNumColsEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter" || e.key === "Tab") {
            if (e.currentTarget.valueAsNumber > 0) {
                this.props.CollectionView.props.Document.gridNumCols = e.currentTarget.valueAsNumber;
            }

        }
    }

    /**
     * Sets the value of `rowHeight` on the grid's Document to the value entered.
     */
    // @undoBatch
    // onRowHeightEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    //     if (e.key === "Enter" || e.key === "Tab") {
    //         if (e.currentTarget.valueAsNumber > 0 && this.props.CollectionView.props.Document.rowHeight as number !== e.currentTarget.valueAsNumber) {
    //             this.props.CollectionView.props.Document.rowHeight = e.currentTarget.valueAsNumber;
    //         }
    //     }
    // }

    /**
     * Sets whether the grid is flexible or not on the grid's Document.
     */
    @undoBatch
    toggleFlex = () => {
        this.props.CollectionView.props.Document.gridFlex = !BoolCast(this.props.CollectionView.props.Document.gridFlex, true);
    }

    /**
     * Increments the value of numCols on button click
     */
    onIncrementButtonClick = () => {
        this.clicked = true;
        this.entered && (this.props.CollectionView.props.Document.gridNumCols as number)--;
        undoBatch(() => this.props.CollectionView.props.Document.gridNumCols = this.numCols + 1)();
        this.entered = false;
    }

    /**
     * Decrements the value of numCols on button click
     */
    onDecrementButtonClick = () => {
        this.clicked = true;
        if (!this.decrementLimitReached) {
            this.entered && (this.props.CollectionView.props.Document.gridNumCols as number)++;
            undoBatch(() => this.props.CollectionView.props.Document.gridNumCols = this.numCols - 1)();
        }
        this.entered = false;
    }

    /**
     * Increments the value of numCols on button hover
     */
    incrementValue = () => {
        this.entered = true;
        if (!this.clicked && !this.decrementLimitReached) {
            this.props.CollectionView.props.Document.gridNumCols = this.numCols + 1;
        }
        this.decrementLimitReached = false;
        this.clicked = false;
    }

    /**
     * Decrements the value of numCols on button hover
     */
    decrementValue = () => {
        this.entered = true;
        if (!this.clicked) {
            if (this.numCols !== 1) {
                this.props.CollectionView.props.Document.gridNumCols = this.numCols - 1;
            }
            else {
                this.decrementLimitReached = true;
            }
        }

        this.clicked = false;
    }

    /**
     * Toggles the value of preventCollision
     */
    toggleCollisions = () => {
        this.props.CollectionView.props.Document.gridPreventCollision = !this.props.CollectionView.props.Document.gridPreventCollision;
    }

    /**
     * Changes the value of the compactType
     */
    changeCompactType = (e: React.ChangeEvent<HTMLSelectElement>) => {
        // need to change startCompaction so that this operation will be undoable.
        this.props.CollectionView.props.Document.gridStartCompaction = e.target.selectedOptions[0].value;
    }

    render() {
        return (
            <div className="collectionGridViewChrome-cont" >
                <span className="grid-control" style={{ width: this.resize ? "25%" : "30%" }}>
                    <span className="grid-icon">
                        <FontAwesomeIcon icon="columns" size="1x" />
                    </span>
                    <input className="collectionGridViewChrome-entryBox" type="number" placeholder={this.numCols.toString()} onKeyDown={this.onNumColsEnter} onClick={(e: React.MouseEvent<HTMLInputElement, MouseEvent>) => { e.stopPropagation(); e.preventDefault(); e.currentTarget.focus(); }} />
                    <input className="columnButton" onClick={this.onIncrementButtonClick} onMouseEnter={this.incrementValue} onMouseLeave={this.decrementValue} type="button" value="↑" />
                    <input className="columnButton" style={{ marginRight: 5 }} onClick={this.onDecrementButtonClick} onMouseEnter={this.decrementValue} onMouseLeave={this.incrementValue} type="button" value="↓" />
                </span>
                {/* <span className="grid-control">
                    <span className="grid-icon">
                        <FontAwesomeIcon icon="text-height" size="1x" />
                    </span>
                    <input className="collectionGridViewChrome-entryBox" type="number" placeholder={this.props.CollectionView.props.Document.rowHeight as string} onKeyDown={this.onRowHeightEnter} onClick={(e: React.MouseEvent<HTMLInputElement, MouseEvent>) => { e.stopPropagation(); e.preventDefault(); e.currentTarget.focus(); }} />
                </span> */}
                <span className="grid-control" style={{ width: this.resize ? "12%" : "20%" }}>
                    <input type="checkbox" style={{ marginRight: 5 }} onChange={this.toggleCollisions} checked={!this.props.CollectionView.props.Document.gridPreventCollision} />
                    <label className="flexLabel">{this.resize ? "Coll" : "Collisions"}</label>
                </span>

                <select className="collectionGridViewChrome-viewPicker"
                    style={{ marginRight: 5, width: this.props.PanelWidth() < 300 ? 25 : undefined }}
                    onPointerDown={stopPropagation}
                    onChange={this.changeCompactType}
                    value={StrCast(this.props.CollectionView.props.Document.gridStartCompaction, StrCast(this.props.CollectionView.props.Document.gridCompaction))}>
                    {["vertical", "horizontal", "none"].map(type =>
                        <option className="collectionGridViewChrome-viewOption"
                            onPointerDown={stopPropagation}
                            value={type}>
                            {this.resize ? type[0].toUpperCase() + type.substring(1) : "Compact: " + type}
                        </option>
                    )}
                </select>

                <span className="grid-control" style={{ width: this.resize ? "12%" : "20%" }}>
                    <input style={{ marginRight: 5 }} type="checkbox" onChange={this.toggleFlex}
                        checked={BoolCast(this.props.CollectionView.props.Document.gridFlex, true)} />
                    <label className="flexLabel">{this.resize ? "Flex" : "Flexible"}</label>
                </span>

                <button onClick={() => this.props.CollectionView.props.Document.gridResetLayout = true}>
                    {!this.resize ? "Reset" :
                        <FontAwesomeIcon icon="redo-alt" size="1x" />}
                </button>

            </div>
        );
    }
}
