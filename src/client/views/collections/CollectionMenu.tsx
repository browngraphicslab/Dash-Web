import React = require("react");
import { FontAwesomeIcon, FontAwesomeIconProps } from "@fortawesome/react-fontawesome";
import { action, computed, observable, reaction, runInAction, Lambda } from "mobx";
import { observer } from "mobx-react";
import { Doc, DocListCast, Opt } from "../../../fields/Doc";
import { BoolCast, Cast, StrCast, NumCast } from "../../../fields/Types";
import AntimodeMenu from "../AntimodeMenu";
import "./CollectionMenu.scss";
import { undoBatch } from "../../util/UndoManager";
import { CollectionViewType, CollectionView, COLLECTION_BORDER_WIDTH } from "./CollectionView";
import { emptyFunction, setupMoveUpEvents, Utils } from "../../../Utils";
import { DragManager } from "../../util/DragManager";
import { CollectionFreeFormDocumentView } from "../nodes/CollectionFreeFormDocumentView";
import { List } from "../../../fields/List";
import { EditableView } from "../EditableView";
import { Id } from "../../../fields/FieldSymbols";
import { listSpec } from "../../../fields/Schema";
import FormatShapePane from "./collectionFreeForm/FormatShapePane";
import { ActiveFillColor, SetActiveInkWidth, ActiveInkColor, SetActiveBezierApprox, SetActiveArrowEnd, SetActiveArrowStart, SetActiveFillColor, SetActiveInkColor } from "../InkingStroke";
import GestureOverlay from "../GestureOverlay";
import { InkTool } from "../../../fields/InkField";
import { DocumentType } from "../../documents/DocumentTypes";
import { Document } from "../../../fields/documentSchemas";
import { SelectionManager } from "../../util/SelectionManager";
import { DocumentView } from "../nodes/DocumentView";
import { ColorState } from "react-color";

@observer
export default class CollectionMenu extends AntimodeMenu {
    static Instance: CollectionMenu;

    @observable SelectedCollection: CollectionView | undefined;

    constructor(props: Readonly<{}>) {
        super(props);
        CollectionMenu.Instance = this;
        this._canFade = false; // don't let the inking menu fade away
        this.Pinned = Cast(Doc.UserDoc()["menuCollections-pinned"], "boolean", true);
        this.jumpTo(300, 300);
    }

    @action
    toggleMenuPin = (e: React.MouseEvent) => {
        Doc.UserDoc()["menuCollections-pinned"] = this.Pinned = !this.Pinned;
        if (!this.Pinned && this._left < 0) {
            this.jumpTo(300, 300);
        }
    }

    render() {
        const button = <button className="antimodeMenu-button" key="pin menu" title="Pin menu" onClick={this.toggleMenuPin} style={{ backgroundColor: "#121721" }}>
            <FontAwesomeIcon icon="thumbtack" size="lg" style={{ transitionProperty: "transform", transitionDuration: "0.1s", transform: `rotate(${this.Pinned ? 45 : 0}deg)` }} />
        </button>;

        return this.getElement(!this.SelectedCollection ? [button] :
            [<CollectionViewBaseChrome key="chrome" CollectionView={this.SelectedCollection} type={StrCast(this.SelectedCollection.props.Document._viewType) as CollectionViewType} />,
                button]);
    }
}

interface CollectionMenuProps {
    CollectionView: CollectionView;
    type: CollectionViewType;
}

const stopPropagation = (e: React.SyntheticEvent) => e.stopPropagation();

@observer
export class CollectionViewBaseChrome extends React.Component<CollectionMenuProps> {
    //(!)?\(\(\(doc.(\w+) && \(doc.\w+ as \w+\).includes\(\"(\w+)\"\)

    get target() { return this.props.CollectionView.props.Document; }
    _templateCommand = {
        params: ["target", "source"], title: "item view",
        script: "this.target.childLayoutTemplate = getDocTemplate(this.source?.[0])",
        immediate: undoBatch((source: Doc[]) => source.length && (this.target.childLayoutTemplate = Doc.getDocTemplate(source?.[0]))),
        initialize: emptyFunction,
    };
    _narrativeCommand = {
        params: ["target", "source"], title: "child click view",
        script: "this.target.childClickedOpenTemplateView = getDocTemplate(this.source?.[0])",
        immediate: undoBatch((source: Doc[]) => source.length && (this.target.childClickedOpenTemplateView = Doc.getDocTemplate(source?.[0]))),
        initialize: emptyFunction,
    };
    _contentCommand = {
        params: ["target", "source"], title: "clear content",
        script: "getProto(this.target).data = copyField(this.source);",
        immediate: undoBatch((source: Doc[]) => Doc.GetProto(this.target).data = new List<Doc>(source)), // Doc.aliasDocs(source),
        initialize: emptyFunction,
    };
    _viewCommand = {
        params: ["target"], title: "bookmark view",
        script: "this.target._panX = this['target-panX']; this.target._panY = this['target-panY']; this.target._viewScale = this['target-viewScale'];",
        immediate: undoBatch((source: Doc[]) => { this.target._panX = 0; this.target._panY = 0; this.target._viewScale = 1; }),
        initialize: (button: Doc) => { button['target-panX'] = this.target._panX; button['target-panY'] = this.target._panY; button['target-viewScale'] = this.target._viewScale; },
    };
    _clusterCommand = {
        params: ["target"], title: "fit content",
        script: "this.target._fitToBox = !this.target._fitToBox;",
        immediate: undoBatch((source: Doc[]) => this.target._fitToBox = !this.target._fitToBox),
        initialize: emptyFunction
    };
    _fitContentCommand = {
        params: ["target"], title: "toggle clusters",
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


    @computed get subChrome() {
        switch (this.props.type) {
            case CollectionViewType.Freeform: return (<CollectionFreeFormViewChrome key="collchrome" CollectionView={this.props.CollectionView} type={this.props.type} />);
            case CollectionViewType.Stacking: return (<CollectionStackingViewChrome key="collchrome" CollectionView={this.props.CollectionView} type={this.props.type} />);
            case CollectionViewType.Schema: return (<CollectionSchemaViewChrome key="collchrome" CollectionView={this.props.CollectionView} type={this.props.type} />);
            case CollectionViewType.Tree: return (<CollectionTreeViewChrome key="collchrome" CollectionView={this.props.CollectionView} type={this.props.type} />);
            case CollectionViewType.Masonry: return (<CollectionStackingViewChrome key="collchrome" CollectionView={this.props.CollectionView} type={this.props.type} />);
            case CollectionViewType.Carousel3D: return (<Collection3DCarouselViewChrome key="collchrome" CollectionView={this.props.CollectionView} type={this.props.type} />);
            case CollectionViewType.Grid: return (<CollectionGridViewChrome key="collchrome" CollectionView={this.props.CollectionView} type={this.props.type} />);
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
        return <div className="collectionViewBaseChrome-template" ref={this.createDropTarget} >
            <div className="commandEntry-outerDiv" title="drop document to apply or drag to create button" ref={this._commandRef} onPointerDown={this.dragCommandDown}>
                <button className={"antimodeMenu-button"} >
                    <FontAwesomeIcon icon="bullseye" size="lg" />
                </button>
                <select
                    className="collectionViewBaseChrome-cmdPicker" onPointerDown={stopPropagation} onChange={this.commandChanged} value={this._currentKey}>
                    <option className="collectionViewBaseChrome-viewOption" onPointerDown={stopPropagation} key={"empty"} value={""} />
                    {this._buttonizableCommands.map(cmd =>
                        <option className="collectionViewBaseChrome-viewOption" onPointerDown={stopPropagation} key={cmd.title} value={cmd.title}>{cmd.title}</option>
                    )}
                </select>
            </div>
        </div>;
    }

    @computed get viewModes() {
        return <div className="collectionViewBaseChrome-viewModes" >
            <div className="commandEntry-outerDiv" title="drop document to apply or drag to create button" ref={this._viewRef} onPointerDown={this.dragViewDown}>
                <button className={"antimodeMenu-button"}>
                    <FontAwesomeIcon icon="bullseye" size="lg" />
                </button>
                <select
                    className="collectionViewBaseChrome-viewPicker"
                    onPointerDown={stopPropagation}
                    onChange={this.viewChanged}
                    value={StrCast(this.props.CollectionView.props.Document._viewType)}>
                    {Object.values(CollectionViewType).map(type => [CollectionViewType.Invalid, CollectionViewType.Docking].includes(type) ? (null) : (
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
        return (
            <div className="collectionMenu-cont" >
                <div className="collectionMenu">
                    <div className="collectionViewBaseChrome">
                        {this.viewModes}
                        {this.templateChrome}
                        <div className="collectionViewBaseChrome-viewSpecs" title="filter documents to show" style={{ display: "grid" }}>
                            <button className={"antimodeMenu-button"} onClick={this.toggleViewSpecs} >
                                <FontAwesomeIcon icon="filter" size="lg" />
                            </button>
                        </div>
                    </div>
                    {this.subChrome}
                </div>
            </div>
        );
    }
}

@observer
export class CollectionFreeFormViewChrome extends React.Component<CollectionMenuProps> {
    public static Instance: CollectionFreeFormViewChrome;
    constructor(props: any) {
        super(props);
        CollectionFreeFormViewChrome.Instance = this;
    }
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
        const currentFrame = Cast(this.Document.currentFrame, "number", null);
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
        const currentFrame = Cast(this.Document.currentFrame, "number", null);
        if (currentFrame === undefined) {
            this.Document.currentFrame = 0;
            CollectionFreeFormDocumentView.setupKeyframes(this.childDocs, 0);
        }
        CollectionFreeFormDocumentView.gotoKeyframe(this.childDocs.slice());
        this.Document.currentFrame = Math.max(0, (currentFrame || 0) - 1);
    }
    @undoBatch
    @action
    miniMap = (): void => {
        this.Document.hideMinimap = !this.Document.hideMinimap;
    }
    private _palette = ["#D0021B", "#F5A623", "#F8E71C", "#8B572A", "#7ED321", "#417505", "#9013FE", "#4A90E2", "#50E3C2", "#B8E986", "#000000", "#4A4A4A", "#9B9B9B", "#FFFFFF", ""];
    private _width = ["1", "5", "10", "100"];
    private _draw = ["⎯", "→", "↔︎", "∿", "↝", "↭", "ロ", "O", "∆"];
    private _head = ["", "", "arrow", "", "", "arrow", "", "", ""];
    private _end = ["", "arrow", "arrow", "", "arrow", "arrow", "", "", ""];
    private _shape = ["line", "line", "line", "", "", "", "rectangle", "circle", "triangle"];

    @observable _shapesNum = this._shape.length;
    @observable _selected = this._shapesNum;

    @observable _keepMode = false;

    @observable _colorBtn = false;
    @observable _widthBtn = false;
    @observable _fillBtn = false;

    @action
    clearKeep() { this._selected = this._shapesNum; }

    @action
    changeColor = (color: string, type: string) => {
        const col: ColorState = {
            hex: color, hsl: { a: 0, h: 0, s: 0, l: 0, source: "" }, hsv: { a: 0, h: 0, s: 0, v: 0, source: "" },
            rgb: { a: 0, r: 0, b: 0, g: 0, source: "" }, oldHue: 0, source: "",
        };
        if (type === "color") {
            SetActiveInkColor(Utils.colorString(col));
        } else if (type === "fill") {
            SetActiveFillColor(Utils.colorString(col));
        }
    }

    @action
    editProperties = (value: any, field: string) => {
        SelectionManager.SelectedDocuments().forEach(action((element: DocumentView) => {
            const doc = Document(element.rootDoc);
            if (doc.type === DocumentType.INK) {
                switch (field) {
                    case "width": doc.strokeWidth = Number(value); break;
                    case "color": doc.color = String(value); break;
                    case "fill": doc.fillColor = String(value); break;
                    case "dash": doc.strokeDash = value;
                }
            }
        }));
    }

    @computed get drawButtons() {
        const func = action((i: number, keep: boolean) => {
            this._keepMode = keep;
            if (this._selected !== i) {
                this._selected = i;
                Doc.SetSelectedTool(InkTool.Pen);
                SetActiveArrowStart(this._head[i]);
                SetActiveArrowEnd(this._end[i]);
                SetActiveBezierApprox("300");

                GestureOverlay.Instance.InkShape = this._shape[i];
            } else {
                this._selected = this._shapesNum;
                Doc.SetSelectedTool(InkTool.None);
                SetActiveArrowStart("");
                SetActiveArrowEnd("");
                GestureOverlay.Instance.InkShape = "";
                SetActiveBezierApprox("0");
            }
        });
        return <div className="btn-draw" key="draw">
            {this._draw.map((icon, i) =>
                <button className="antimodeMenu-button" key={icon} onPointerDown={() => func(i, false)} onDoubleClick={() => func(i, true)}
                    style={{ backgroundColor: i === this._selected ? "121212" : "", fontSize: "20" }}>
                    {this._draw[i]}
                </button>)}
        </div>;
    }

    toggleButton = (key: string, value: boolean, setter: () => {}, icon: FontAwesomeIconProps["icon"], ele: JSX.Element | null) => {
        return <button className="antimodeMenu-button" key={key} title={key}
            onPointerDown={action(e => setter())}
            style={{ backgroundColor: value ? "121212" : "" }}>
            <FontAwesomeIcon icon={icon} size="lg" />
            {ele}
        </button>;
    }

    @computed get widthPicker() {
        const widthPicker = this.toggleButton("stroke width", this._widthBtn, () => this._widthBtn = !this._widthBtn, "bars", null);
        return !this._widthBtn ? widthPicker :
            <div className="btn2-group" key="width">
                {widthPicker}
                {this._width.map(wid =>
                    <button className="antimodeMenu-button" key={wid}
                        onPointerDown={action(() => { SetActiveInkWidth(wid); this._widthBtn = false; this.editProperties(wid, "width"); })}
                        style={{ backgroundColor: this._widthBtn ? "121212" : "", zIndex: 1001 }}>
                        {wid}
                    </button>)}
            </div>;
    }

    @computed get colorPicker() {
        const colorPicker = this.toggleButton("stroke color", this._colorBtn, () => this._colorBtn = !this._colorBtn, "pen-nib",
            <div className="color-previewI" style={{ backgroundColor: ActiveInkColor() ?? "121212" }} />);
        return !this._colorBtn ? colorPicker :
            <div className="btn-group" key="color">
                {colorPicker}
                {this._palette.map(color =>
                    <button className="antimodeMenu-button" key={color}
                        onPointerDown={action(() => { this.changeColor(color, "color"); this._colorBtn = false; this.editProperties(color, "color"); })}
                        style={{ backgroundColor: this._colorBtn ? "121212" : "", zIndex: 1001 }}>
                        {/* <FontAwesomeIcon icon="pen-nib" size="lg" /> */}
                        <div className="color-previewII" style={{ backgroundColor: color }} />
                    </button>)}
            </div>;
    }
    @computed get fillPicker() {
        const fillPicker = this.toggleButton("shape fill color", this._fillBtn, () => this._fillBtn = !this._fillBtn, "fill-drip",
            <div className="color-previewI" style={{ backgroundColor: ActiveFillColor() ?? "121212" }} />);
        return !this._fillBtn ? fillPicker :
            <div className="btn-group" key="fill" >
                {fillPicker}
                {this._palette.map(color =>
                    <button className="antimodeMenu-button" key={color}
                        onPointerDown={action(() => { this.changeColor(color, "fill"); this._fillBtn = false; this.editProperties(color, "fill"); })}
                        style={{ backgroundColor: this._fillBtn ? "121212" : "", zIndex: 1001 }}>
                        <div className="color-previewII" style={{ backgroundColor: color }}></div>
                    </button>)}

            </div>;
    }

    @computed get formatPane() {
        return <button className="antimodeMenu-button" key="format" title="toggle foramatting pane"
            onPointerDown={action(e => FormatShapePane.Instance.Pinned = !FormatShapePane.Instance.Pinned)}
            style={{ backgroundColor: this._fillBtn ? "121212" : "" }}>
            <FontAwesomeIcon icon="chevron-right" size="lg" />
        </button>;
    }

    render() {
        return this.Document.isAnnotationOverlay ? (null) :
            <div className="collectionFreeFormMenu-cont">
                <div key="back" title="mini map" className="backKeyframe" onClick={this.miniMap}>
                    <FontAwesomeIcon icon={"map"} size={"lg"} />
                </div>
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

                {this.widthPicker}
                {this.colorPicker}
                {this.fillPicker}
                {this.drawButtons}
                {this.formatPane}
            </div>;
    }
}
@observer
export class CollectionStackingViewChrome extends React.Component<CollectionMenuProps> {
    @observable private _currentKey: string = "";
    @observable private suggestions: string[] = [];

    @computed private get descending() { return StrCast(this.props.CollectionView.props.Document._columnsSort) === "descending"; }
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

    @action toggleSort = () => {
        this.props.CollectionView.props.Document._columnsSort =
            this.props.CollectionView.props.Document._columnsSort === "descending" ? "ascending" :
                this.props.CollectionView.props.Document._columnsSort === "ascending" ? undefined : "descending";
    }
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
export class CollectionSchemaViewChrome extends React.Component<CollectionMenuProps> {
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
export class CollectionTreeViewChrome extends React.Component<CollectionMenuProps> {

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
export class Collection3DCarouselViewChrome extends React.Component<CollectionMenuProps> {
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
export class CollectionGridViewChrome extends React.Component<CollectionMenuProps> {

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
                    style={{ marginRight: 5 }}
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