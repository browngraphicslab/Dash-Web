import { observable, computed, action, trace, ObservableMap, runInAction, reaction, IReactionDisposer } from "mobx";
import React = require("react");
import { observer } from "mobx-react";
import { FieldViewProps, FieldView } from "../nodes/FieldView";
import { Doc } from "../../../new_fields/Doc";
import { undoBatch } from "../../util/UndoManager";
import { NumCast, FieldValue, Cast, StrCast } from "../../../new_fields/Types";
import { CollectionViewType } from "../collections/CollectionBaseView";
import { CollectionDockingView } from "../collections/CollectionDockingView";
import { SelectionManager } from "../../util/SelectionManager";
import { DocumentManager } from "../../util/DocumentManager";
import { DocumentView } from "../nodes/DocumentView";
import "./LinkFollowBox.scss";
import { SearchUtil } from "../../util/SearchUtil";
import { Id } from "../../../new_fields/FieldSymbols";
import { listSpec } from "../../../new_fields/Schema";
import { DocServer } from "../../DocServer";
import { RefField } from "../../../new_fields/RefField";
import { Docs } from "../../documents/Documents";

enum FollowModes {
    OPENTAB = "Open in Tab",
    OPENRIGHT = "Open in Right Split",
    OPENFULL = "Open Full Screen",
    PAN = "Pan to Document",
    INPLACE = "Open In Place"
}

enum FollowOptions {
    ZOOM = "Zoom",
    NOZOOM = "No Zoom",
}

@observer
export class LinkFollowBox extends React.Component<FieldViewProps> {

    public static LayoutString() { return FieldView.LayoutString(LinkFollowBox); }
    public static Instance: LinkFollowBox;
    @observable static linkDoc: Doc | undefined = undefined;
    @observable static destinationDoc: Doc | undefined = undefined;
    @observable static sourceDoc: Doc | undefined = undefined;
    @observable selectedMode: string = "";
    @observable selectedContext: Doc | undefined = undefined;
    @observable selectedContextAliases: Doc[] | undefined = undefined;
    @observable selectedOption: string = "";
    @observable selectedContextString: string = "";
    @observable sourceView: DocumentView | undefined = undefined;
    @observable canPan: boolean = false;
    @observable shouldUseOnlyParentContext = false;
    _contextDisposer?: IReactionDisposer;
    collectionTypes: string[];

    @observable private _docs: { col: Doc, target: Doc }[] = [];
    @observable private _otherDocs: { col: Doc, target: Doc }[] = [];

    constructor(props: FieldViewProps) {
        super(props);
        LinkFollowBox.Instance = this;

        this.collectionTypes = ["Invalid", "Freeform", "Schema", "Docking", "Tree", "Stacking", "Masonry"];
    }

    @computed
    get getDoc() {
        return this.props.Document;
    }

    componentDidMount = () => {
        this.resetVars();

        this._contextDisposer = reaction(
            () => this.selectedContextString,
            async () => {
                let ref = await DocServer.GetRefField(this.selectedContextString);
                runInAction(() => {
                    if (ref instanceof Doc) {
                        this.selectedContext = ref;
                    }
                });
                if (this.selectedContext instanceof Doc) {
                    let aliases = await SearchUtil.GetViewsOfDocument(this.selectedContext);
                    runInAction(() => { this.selectedContextAliases = aliases; });
                }
            }
        );
    }

    componentWillUnmount = () => {
        this._contextDisposer && this._contextDisposer();
    }

    async resetPan() {
        if (LinkFollowBox.destinationDoc && this.sourceView && this.sourceView.props.ContainingCollectionView) {
            let colDoc = this.sourceView.props.ContainingCollectionView.props.Document;
            runInAction(() => { this.canPan = false; });
            if (colDoc.viewType && colDoc.viewType === CollectionViewType.Freeform) {
                let docs = Cast(colDoc.data, listSpec(Doc), []);
                let aliases = await SearchUtil.GetViewsOfDocument(Doc.GetProto(LinkFollowBox.destinationDoc));

                aliases.forEach(alias => {
                    if (docs.filter(doc => doc === alias).length > 0) {
                        runInAction(() => { this.canPan = true; });
                    }
                });
            }
        }
    }

    @action
    resetVars = () => {
        this.selectedContext = undefined;
        this.selectedContextString = "";
        this.selectedMode = "";
        this.selectedOption = "";
        LinkFollowBox.linkDoc = undefined;
        LinkFollowBox.sourceDoc = undefined;
        LinkFollowBox.destinationDoc = undefined;
        this.sourceView = undefined;
        this.canPan = false;
        this.shouldUseOnlyParentContext = false;
    }

    async fetchDocuments() {
        if (LinkFollowBox.destinationDoc) {
            let dest: Doc = LinkFollowBox.destinationDoc;
            let aliases = await SearchUtil.GetViewsOfDocument(Doc.GetProto(dest));
            const { docs } = await SearchUtil.Search("", true, { fq: `data_l:"${dest[Id]}"` });
            const map: Map<Doc, Doc> = new Map;
            const allDocs = await Promise.all(aliases.map(doc => SearchUtil.Search("", true, { fq: `data_l:"${doc[Id]}"` }).then(result => result.docs)));
            allDocs.forEach((docs, index) => docs.forEach(doc => map.set(doc, aliases[index])));
            docs.forEach(doc => map.delete(doc));
            runInAction(() => {
                this._docs = docs.filter(doc => !Doc.AreProtosEqual(doc, CollectionDockingView.Instance.props.Document)).map(doc => ({ col: doc, target: dest }));
                this._otherDocs = Array.from(map.entries()).filter(entry => !Doc.AreProtosEqual(entry[0], CollectionDockingView.Instance.props.Document)).map(([col, target]) => ({ col, target }));
            });
        }
    }

    @action
    setLinkDocs = (linkDoc: Doc, source: Doc, dest: Doc) => {
        this.resetVars();

        LinkFollowBox.linkDoc = linkDoc;
        LinkFollowBox.sourceDoc = source;
        LinkFollowBox.destinationDoc = dest;
        this.fetchDocuments();

        SelectionManager.SelectedDocuments().forEach(dv => {
            if (dv.props.Document === LinkFollowBox.sourceDoc) {
                this.sourceView = dv;
            }
        });

        this.resetPan();
    }

    unhighlight = () => {
        Doc.UnhighlightAll();
        document.removeEventListener("pointerdown", this.unhighlight);
    }

    @action
    highlightDoc = () => {
        if (LinkFollowBox.destinationDoc) {
            document.removeEventListener("pointerdown", this.unhighlight);
            Doc.HighlightDoc(LinkFollowBox.destinationDoc);
            window.setTimeout(() => {
                document.addEventListener("pointerdown", this.unhighlight);
            }, 10000);
        }
    }

    @undoBatch
    openFullScreen = () => {
        if (LinkFollowBox.destinationDoc) {
            let view: DocumentView | null = DocumentManager.Instance.getDocumentView(LinkFollowBox.destinationDoc);
            view && CollectionDockingView.Instance && CollectionDockingView.Instance.OpenFullScreen(view);
            SelectionManager.DeselectAll();
        }
    }

    @undoBatch
    openColFullScreen = (options: { context: Doc }) => {
        if (LinkFollowBox.destinationDoc) {
            if (NumCast(options.context.viewType, CollectionViewType.Invalid) === CollectionViewType.Freeform) {
                const newPanX = NumCast(LinkFollowBox.destinationDoc.x) + NumCast(LinkFollowBox.destinationDoc.width) / NumCast(LinkFollowBox.destinationDoc.zoomBasis, 1) / 2;
                const newPanY = NumCast(LinkFollowBox.destinationDoc.y) + NumCast(LinkFollowBox.destinationDoc.height) / NumCast(LinkFollowBox.destinationDoc.zoomBasis, 1) / 2;
                options.context.panX = newPanX;
                options.context.panY = newPanY;
            }
            let view = DocumentManager.Instance.getDocumentView(options.context);
            view && CollectionDockingView.Instance && CollectionDockingView.Instance.OpenFullScreen(view);
            this.highlightDoc();
            SelectionManager.DeselectAll();
        }
    }

    // should container be a doc or documentview or what? This one needs work and is more long term
    @undoBatch
    openInContainer = (options: { container: Doc }) => {

    }

    @undoBatch
    openLinkColRight = (options: { context: Doc, shouldZoom: boolean }) => {
        if (LinkFollowBox.destinationDoc) {
            options.context = Doc.IsPrototype(options.context) ? Doc.MakeDelegate(options.context) : options.context;
            if (NumCast(options.context.viewType, CollectionViewType.Invalid) === CollectionViewType.Freeform) {
                const newPanX = NumCast(LinkFollowBox.destinationDoc.x) + NumCast(LinkFollowBox.destinationDoc.width) / NumCast(LinkFollowBox.destinationDoc.zoomBasis, 1) / 2;
                const newPanY = NumCast(LinkFollowBox.destinationDoc.y) + NumCast(LinkFollowBox.destinationDoc.height) / NumCast(LinkFollowBox.destinationDoc.zoomBasis, 1) / 2;
                options.context.panX = newPanX;
                options.context.panY = newPanY;
            }
            CollectionDockingView.Instance.AddRightSplit(options.context, undefined);

            if (options.shouldZoom) this.jumpToLink({ shouldZoom: options.shouldZoom });

            this.highlightDoc();
            SelectionManager.DeselectAll();
        }
    }

    @undoBatch
    openLinkRight = () => {
        if (LinkFollowBox.destinationDoc) {
            let alias = Doc.MakeAlias(LinkFollowBox.destinationDoc);
            CollectionDockingView.Instance.AddRightSplit(alias, undefined);
            this.highlightDoc();
            SelectionManager.DeselectAll();
        }

    }

    @undoBatch
    jumpToLink = async (options: { shouldZoom: boolean }) => {
        if (LinkFollowBox.destinationDoc && LinkFollowBox.linkDoc) {
            let jumpToDoc: Doc = LinkFollowBox.destinationDoc;
            let pdfDoc = FieldValue(Cast(LinkFollowBox.destinationDoc, Doc));
            if (pdfDoc) {
                jumpToDoc = pdfDoc;
            }
            let proto = Doc.GetProto(LinkFollowBox.linkDoc);
            let targetContext = await Cast(proto.targetContext, Doc);
            let sourceContext = await Cast(proto.sourceContext, Doc);

            let dockingFunc = (document: Doc) => { this.props.addDocTab(document, undefined, "inTab"); SelectionManager.DeselectAll(); };

            if (LinkFollowBox.destinationDoc === LinkFollowBox.linkDoc.anchor2 && targetContext) {
                DocumentManager.Instance.jumpToDocument(jumpToDoc, options.shouldZoom, false, async document => dockingFunc(document), undefined, targetContext);
            }
            else if (LinkFollowBox.destinationDoc === LinkFollowBox.linkDoc.anchor1 && sourceContext) {
                DocumentManager.Instance.jumpToDocument(jumpToDoc, options.shouldZoom, false, document => dockingFunc(sourceContext!));
            }
            else if (DocumentManager.Instance.getDocumentView(jumpToDoc)) {
                DocumentManager.Instance.jumpToDocument(jumpToDoc, options.shouldZoom, undefined, undefined,
                    NumCast((LinkFollowBox.destinationDoc === LinkFollowBox.linkDoc.anchor2 ? LinkFollowBox.linkDoc.anchor2Page : LinkFollowBox.linkDoc.anchor1Page)));

            }
            else {
                DocumentManager.Instance.jumpToDocument(jumpToDoc, options.shouldZoom, false, dockingFunc);
            }

            this.highlightDoc();
            SelectionManager.DeselectAll();
        }
    }

    @undoBatch
    openLinkTab = () => {
        if (LinkFollowBox.destinationDoc) {
            let fullScreenAlias = Doc.MakeAlias(LinkFollowBox.destinationDoc);
            this.props.addDocTab(fullScreenAlias, undefined, "inTab");

            this.highlightDoc();
            SelectionManager.DeselectAll();
        }
    }

    @undoBatch
    openLinkColTab = (options: { context: Doc, shouldZoom: boolean }) => {
        if (LinkFollowBox.destinationDoc) {
            options.context = Doc.IsPrototype(options.context) ? Doc.MakeDelegate(options.context) : options.context;
            if (NumCast(options.context.viewType, CollectionViewType.Invalid) === CollectionViewType.Freeform) {
                const newPanX = NumCast(LinkFollowBox.destinationDoc.x) + NumCast(LinkFollowBox.destinationDoc.width) / NumCast(LinkFollowBox.destinationDoc.zoomBasis, 1) / 2;
                const newPanY = NumCast(LinkFollowBox.destinationDoc.y) + NumCast(LinkFollowBox.destinationDoc.height) / NumCast(LinkFollowBox.destinationDoc.zoomBasis, 1) / 2;
                options.context.panX = newPanX;
                options.context.panY = newPanY;
            }
            this.props.addDocTab(options.context, undefined, "inTab");
            if (options.shouldZoom) this.jumpToLink({ shouldZoom: options.shouldZoom });

            this.highlightDoc();
            SelectionManager.DeselectAll();
        }
    }

    @undoBatch
    openLinkInPlace = (options: { shouldZoom: boolean }) => {

        if (LinkFollowBox.destinationDoc && LinkFollowBox.sourceDoc) {
            let alias = Doc.MakeAlias(LinkFollowBox.destinationDoc);
            let y = NumCast(LinkFollowBox.sourceDoc.y);
            let x = NumCast(LinkFollowBox.sourceDoc.x);

            let width = NumCast(LinkFollowBox.sourceDoc.width);
            let height = NumCast(LinkFollowBox.sourceDoc.height);

            alias.x = x + width + 30;
            alias.y = y;
            alias.width = width;
            alias.height = height;

            if (this.sourceView && this.sourceView.props.addDocument) {
                this.sourceView.props.addDocument(alias, false);
            }

            this.jumpToLink({ shouldZoom: options.shouldZoom });

            this.highlightDoc();
            SelectionManager.DeselectAll();
        }
    }

    //set this to be the default link behavior, can be any of the above
    private defaultLinkBehavior: (options?: any) => void = this.openLinkInPlace;

    @action
    currentLinkBehavior = () => {
        // this.resetPan();
        if (LinkFollowBox.destinationDoc) {
            if (this.selectedContextString === "") {
                this.selectedContextString = "self";
                this.selectedContext = LinkFollowBox.destinationDoc;
            }
            if (this.selectedOption === "") this.selectedOption = FollowOptions.NOZOOM;
            let shouldZoom: boolean = this.selectedOption === FollowOptions.NOZOOM ? false : true;
            let notOpenInContext: boolean = this.selectedContextString === "self" || this.selectedContextString === LinkFollowBox.destinationDoc[Id];

            if (this.selectedMode === FollowModes.INPLACE) {
                if (shouldZoom !== undefined) this.openLinkInPlace({ shouldZoom: shouldZoom });
            }
            else if (this.selectedMode === FollowModes.OPENFULL) {
                if (notOpenInContext) this.openFullScreen();
                else this.selectedContext && this.openColFullScreen({ context: this.selectedContext });
            }
            else if (this.selectedMode === FollowModes.OPENRIGHT) {
                if (notOpenInContext) this.openLinkRight();
                else this.selectedContext && this.openLinkColRight({ context: this.selectedContext, shouldZoom: shouldZoom });
            }
            else if (this.selectedMode === FollowModes.OPENTAB) {
                if (notOpenInContext) this.openLinkTab();
                else this.selectedContext && this.openLinkColTab({ context: this.selectedContext, shouldZoom: shouldZoom })
            }
            else if (this.selectedMode === FollowModes.PAN) {
                this.jumpToLink({ shouldZoom: shouldZoom });
            }
            else return;
        }
    }

    @action
    handleModeChange = (e: React.ChangeEvent) => {
        let target = e.target as HTMLInputElement;
        this.selectedMode = target.value;
        this.selectedContext = undefined;
        this.selectedContextString = "";

        this.shouldUseOnlyParentContext = (this.selectedMode === FollowModes.INPLACE || this.selectedMode === FollowModes.PAN);

        if (this.shouldUseOnlyParentContext) {
            if (this.sourceView && this.sourceView.props.ContainingCollectionView) {
                this.selectedContext = this.sourceView.props.ContainingCollectionView.props.Document;
                this.selectedContextString = (StrCast(this.sourceView.props.ContainingCollectionView.props.Document.title));
            }
        }
    }

    @action
    handleOptionChange = (e: React.ChangeEvent) => {
        let target = e.target as HTMLInputElement;
        this.selectedOption = target.value;
    }

    @action
    handleContextChange = (e: React.ChangeEvent) => {
        let target = e.target as HTMLInputElement;
        this.selectedContextString = target.value;
        // selectedContext is updated in reaction
        this.selectedOption = "";
    }

    @computed
    get canOpenInPlace() {
        if (this.sourceView && this.sourceView.props.ContainingCollectionView) {
            let colView = this.sourceView.props.ContainingCollectionView;
            let colDoc = colView.props.Document;
            if (colDoc.viewType && colDoc.viewType === CollectionViewType.Freeform) return true;
        }
        return false;
    }

    @computed
    get availableModes() {
        return (
            <div>
                <label><input
                    type="radio"
                    name="mode"
                    value={FollowModes.OPENRIGHT}
                    checked={this.selectedMode === FollowModes.OPENRIGHT}
                    onChange={this.handleModeChange}
                    disabled={false} />
                    {FollowModes.OPENRIGHT}
                </label><br />
                <label><input
                    type="radio"
                    name="mode"
                    value={FollowModes.OPENTAB}
                    checked={this.selectedMode === FollowModes.OPENTAB}
                    onChange={this.handleModeChange}
                    disabled={false} />
                    {FollowModes.OPENTAB}
                </label><br />
                <label><input
                    type="radio"
                    name="mode"
                    value={FollowModes.OPENFULL}
                    checked={this.selectedMode === FollowModes.OPENFULL}
                    onChange={this.handleModeChange}
                    disabled={false} />
                    {FollowModes.OPENFULL}
                </label><br />
                <label><input
                    type="radio"
                    name="mode"
                    value={FollowModes.PAN}
                    checked={this.selectedMode === FollowModes.PAN}
                    onChange={this.handleModeChange}
                    disabled={!this.canPan} />
                    {FollowModes.PAN}
                </label><br />
                <label><input
                    type="radio"
                    name="mode"
                    value={FollowModes.INPLACE}
                    checked={this.selectedMode === FollowModes.INPLACE}
                    onChange={this.handleModeChange}
                    disabled={!this.canOpenInPlace} />
                    {FollowModes.INPLACE}
                </label><br />
            </div>
        );
    }

    @computed
    get parentName() {
        if (this.sourceView && this.sourceView.props.ContainingCollectionView) {
            let colView = this.sourceView.props.ContainingCollectionView;
            return colView.props.Document.title;
        }
    }

    @computed
    get parentID(): string {
        if (this.sourceView && this.sourceView.props.ContainingCollectionView) {
            let colView = this.sourceView.props.ContainingCollectionView;
            return StrCast(colView.props.Document[Id]);
        }
        return "col";
    }

    @computed
    get availableContexts() {
        return (
            this.shouldUseOnlyParentContext ?
                <label><input
                    type="radio" disabled={true}
                    name="context"
                    value={this.parentID}
                    checked={true} />
                    {this.parentName} (Parent Collection)
                </label>
                :
                <div>
                    <label><input
                        type="radio" disabled={LinkFollowBox.linkDoc ? false : true}
                        name="context"
                        value={LinkFollowBox.destinationDoc ? StrCast(LinkFollowBox.destinationDoc[Id]) : "self"}
                        checked={LinkFollowBox.destinationDoc ? this.selectedContextString === StrCast(LinkFollowBox.destinationDoc[Id]) || this.selectedContextString === "self" : true}
                        onChange={this.handleContextChange} />
                        Open Self
                </label><br />
                    {[...this._docs, ...this._otherDocs].map(doc => {
                        if (doc && doc.target && doc.col.title !== "Recently Closed") {
                            return <div key={doc.col[Id] + doc.target[Id]}><label key={doc.col[Id] + doc.target[Id]}>
                                <input
                                    type="radio" disabled={LinkFollowBox.linkDoc ? false : true}
                                    name="context"
                                    value={StrCast(doc.col[Id])}
                                    checked={this.selectedContextString === StrCast(doc.col[Id])}
                                    onChange={this.handleContextChange} />
                                {doc.col.title}
                            </label><br /></div>;
                        }
                    })}
                </div>
        );
    }

    @computed
    get shouldShowZoom(): boolean {
        if (this.selectedMode === FollowModes.OPENFULL) return false;
        if (this.shouldUseOnlyParentContext) return true;
        if (LinkFollowBox.destinationDoc ? this.selectedContextString === LinkFollowBox.destinationDoc[Id] : "self") return false;

        let contextMatch: boolean = false;
        if (this.selectedContextAliases) {
            this.selectedContextAliases.forEach(alias => {
                if (alias.viewType === CollectionViewType.Freeform) contextMatch = true;
            });
        }
        if (contextMatch) return true;

        return false;
    }

    @computed
    get availableOptions() {
        if (LinkFollowBox.destinationDoc) {
            return (
                this.shouldShowZoom ?
                    <div>
                        <label><input
                            type="radio"
                            name="option"
                            value={FollowOptions.ZOOM}
                            checked={this.selectedOption === FollowOptions.ZOOM}
                            onChange={this.handleOptionChange}
                            disabled={false} />
                            {FollowOptions.ZOOM}
                        </label><br />
                        <label><input
                            type="radio"
                            name="option"
                            value={FollowOptions.NOZOOM}
                            checked={this.selectedOption === FollowOptions.NOZOOM}
                            onChange={this.handleOptionChange}
                            disabled={false} />
                            {FollowOptions.NOZOOM}
                        </label><br />
                    </div>
                    :
                    <div>No Available Options</div>
            );
        }
        return null;
    }

    render() {
        return (
            <div className="linkFollowBox-main" style={{ height: NumCast(this.props.Document.height), width: NumCast(this.props.Document.width) }}>
                <div className="linkFollowBox-header">
                    {LinkFollowBox.linkDoc ? "Link Title: " + StrCast(LinkFollowBox.linkDoc.title) : "No Link Selected"}
                    <div className="linkFollowBox-header direction-indicator">{LinkFollowBox.linkDoc ?
                        LinkFollowBox.sourceDoc && LinkFollowBox.destinationDoc ? "Source: " + StrCast(LinkFollowBox.sourceDoc.title) + ", Destination: " + StrCast(LinkFollowBox.destinationDoc.title)
                            : "" : ""}</div>
                </div>
                <div className="linkFollowBox-content" style={{ height: NumCast(this.props.Document.height) - 110 }}>
                    <div className="linkFollowBox-item">
                        <div className="linkFollowBox-item title">Mode</div>
                        <div className="linkFollowBox-itemContent">
                            {LinkFollowBox.linkDoc ? this.availableModes : "Please select a link to view modes"}
                        </div>
                    </div>
                    <div className="linkFollowBox-item">
                        <div className="linkFollowBox-item title">Context</div>
                        <div className="linkFollowBox-itemContent">
                            {this.selectedMode !== "" ? this.availableContexts : "Please select a mode to view contexts"}
                        </div>
                    </div>
                    <div className="linkFollowBox-item">
                        <div className="linkFollowBox-item title">Options</div>
                        <div className="linkFollowBox-itemContent">
                            {this.selectedContextString !== "" ? this.availableOptions : "Please select a context to view options"}
                        </div>
                    </div>
                </div>
                <div className="linkFollowBox-footer">
                    <button
                        onClick={this.currentLinkBehavior}
                        disabled={(LinkFollowBox.linkDoc) ? false : true}>
                        Follow Link
                    </button>
                </div>
            </div>
        );
    }
}