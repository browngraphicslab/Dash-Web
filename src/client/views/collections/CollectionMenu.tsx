import React = require("react");
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { action, computed, observable, reaction, runInAction } from "mobx";
import { observer } from "mobx-react";
import { Doc, DocListCast } from "../../../fields/Doc";
import { BoolCast, Cast, StrCast, NumCast } from "../../../fields/Types";
import AntimodeMenu from "../AntimodeMenu";
import "./CollectionMenu.scss";
import { undoBatch } from "../../util/UndoManager";
import { CollectionViewType, CollectionView } from "./CollectionView";
import { emptyFunction, setupMoveUpEvents, Utils } from "../../../Utils";
import { CollectionGridViewChrome } from "./CollectionViewChromes";
import { DragManager } from "../../util/DragManager";
import { CollectionFreeFormDocumentView } from "../nodes/CollectionFreeFormDocumentView";
import { List } from "../../../fields/List";
import { SelectionManager } from "../../util/SelectionManager";

@observer
export default class CollectionMenu extends AntimodeMenu {
    static Instance: CollectionMenu;

    @observable SelectedCollection: CollectionView | undefined;

    constructor(props: Readonly<{}>) {
        super(props);
        CollectionMenu.Instance = this;
        this._canFade = false; // don't let the inking menu fade away
        this.Pinned = Cast(Doc.UserDoc()["menuCollections-pinned"], "boolean", true);
    }

    @action
    toggleMenuPin = (e: React.MouseEvent) => {
        Doc.UserDoc()["menuCollections-pinned"] = this.Pinned = !this.Pinned;
    }

    @computed get aButton() {
        return <div className="btn-draw" key="draw">
            <button className="antimodeMenu-button" key="abutton" onClick={() => alert("clicked")} style={{ fontSize: "20" }}>
                <FontAwesomeIcon icon="palette" size="lg" />
            </button>
        </div>;
    }

    render() {
        return this.getElement([
            this.aButton,
            !this.SelectedCollection ? <></> : <CollectionViewBaseChrome CollectionView={this.SelectedCollection} type={StrCast(this.SelectedCollection.props.Document._viewType) as CollectionViewType} />,
            <button className="antimodeMenu-button" key="pin menu" title="Pin menu" onClick={this.toggleMenuPin} style={{ backgroundColor: this.Pinned ? "#121212" : "" }}>
                <FontAwesomeIcon icon="thumbtack" size="lg" style={{ transitionProperty: "transform", transitionDuration: "0.1s", transform: `rotate(${this.Pinned ? 45 : 0}deg)` }} />
            </button>
        ]);
    }
}

interface CollectionViewChromeProps {
    CollectionView: CollectionView;
    type: CollectionViewType;
    collapse?: (value: boolean) => any;
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
            // case CollectionViewType.Stacking: return (<CollectionStackingViewChrome key="collchrome" PanelWidth={this.props.PanelWidth} CollectionView={this.props.CollectionView} type={this.props.type} />);
            // case CollectionViewType.Schema: return (<CollectionSchemaViewChrome key="collchrome" PanelWidth={this.props.PanelWidth} CollectionView={this.props.CollectionView} type={this.props.type} />);
            // case CollectionViewType.Tree: return (<CollectionTreeViewChrome key="collchrome" PanelWidth={this.props.PanelWidth} CollectionView={this.props.CollectionView} type={this.props.type} />);
            // case CollectionViewType.Masonry: return (<CollectionStackingViewChrome key="collchrome" PanelWidth={this.props.PanelWidth} CollectionView={this.props.CollectionView} type={this.props.type} />);
            // case CollectionViewType.Carousel3D: return (<Collection3DCarouselViewChrome key="collchrome" PanelWidth={this.props.PanelWidth} CollectionView={this.props.CollectionView} type={this.props.type} />);
            // case CollectionViewType.Grid: return (<CollectionGridViewChrome key="collchrome" CollectionView={this.props.CollectionView} type={this.props.type} />);
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
                <div className="commandEntry-drop">
                    <FontAwesomeIcon icon="bullseye" size="2x" />
                </div>
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
        const collapsed = this.props.CollectionView.props.Document._chromeStatus !== "enabled";
        return <div className="collectionViewBaseChrome-viewModes" style={{ display: collapsed ? "none" : undefined }}>
            <div className="commandEntry-outerDiv" title="drop document to apply or drag to create button" ref={this._viewRef} onPointerDown={this.dragViewDown}>
                <div className="commandEntry-drop">
                    <FontAwesomeIcon icon="bullseye" size="2x" />
                </div>
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
        const scale = Math.min(1, this.props.CollectionView.props.ScreenToLocalTransform()?.Scale);
        return (
            <div className="collectionViewChrome-cont" style={{
                top: 0,
                transform: `scale(${scale})`,
                width: "100%"
            }}>
                <div className="collectionViewChrome" style={{ border: "unset" }}>
                    <div className="collectionViewBaseChrome">
                        {this.viewModes}
                        <div className="collectionViewBaseChrome-viewSpecs" title="filter documents to show" style={{ display: "grid" }}>
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
