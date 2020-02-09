import { observable, computed, action, runInAction, reaction, IReactionDisposer } from "mobx";
import React = require("react");
import { observer } from "mobx-react";
import { FieldViewProps, FieldView } from "../nodes/FieldView";
import { Doc, DocListCastAsync, Opt } from "../../../new_fields/Doc";
import { undoBatch } from "../../util/UndoManager";
import { NumCast, FieldValue, Cast, StrCast } from "../../../new_fields/Types";
import { CollectionViewType } from "../collections/CollectionView";
import { CollectionDockingView } from "../collections/CollectionDockingView";
import { SelectionManager } from "../../util/SelectionManager";
import { DocumentManager } from "../../util/DocumentManager";
import { DocumentView } from "../nodes/DocumentView";
import "./LinkFollowBox.scss";
import { SearchUtil } from "../../util/SearchUtil";
import { Id } from "../../../new_fields/FieldSymbols";
import { listSpec } from "../../../new_fields/Schema";
import { DocServer } from "../../DocServer";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTimes } from '@fortawesome/free-solid-svg-icons';
import { docs_v1 } from "googleapis";
import { Utils } from "../../../Utils";
import { Link } from "@react-pdf/renderer";

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

    public static LayoutString(fieldKey: string) { return FieldView.LayoutString(LinkFollowBox, fieldKey); }
    public static Instance: LinkFollowBox | undefined;
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

    @observable private _docs: { col: Doc, target: Doc }[] = [];
    @observable private _otherDocs: { col: Doc, target: Doc }[] = [];

    constructor(props: FieldViewProps) {
        super(props);
        LinkFollowBox.Instance = this;
        this.resetVars();
        this.props.Document.isBackground = true;
    }

    componentDidMount = () => {
        this.resetVars();

        this._contextDisposer = reaction(
            () => this.selectedContextString,
            async () => {
                const ref = await DocServer.GetRefField(this.selectedContextString);
                runInAction(() => {
                    if (ref instanceof Doc) {
                        this.selectedContext = ref;
                    }
                });
                if (this.selectedContext instanceof Doc) {
                    const aliases = await SearchUtil.GetViewsOfDocument(this.selectedContext);
                    runInAction(() => { this.selectedContextAliases = aliases; });
                }
            }
        );
    }

    componentWillUnmount = () => {
        this._contextDisposer && this._contextDisposer();
    }

    async resetPan() {
        if (LinkFollowBox.destinationDoc && this.sourceView && this.sourceView.props.ContainingCollectionDoc) {
            runInAction(() => this.canPan = false);
            if (this.sourceView.props.ContainingCollectionDoc._viewType === CollectionViewType.Freeform) {
                const docs = Cast(this.sourceView.props.ContainingCollectionDoc.data, listSpec(Doc), []);
                const aliases = await SearchUtil.GetViewsOfDocument(Doc.GetProto(LinkFollowBox.destinationDoc));

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
            const dest: Doc = LinkFollowBox.destinationDoc;
            const aliases = await SearchUtil.GetViewsOfDocument(Doc.GetProto(dest));
            const { docs } = await SearchUtil.Search("", true, { fq: `data_l:"${dest[Id]}"` });
            const map: Map<Doc, Doc> = new Map;
            const allDocs = await Promise.all(aliases.map(doc => SearchUtil.Search("", true, { fq: `data_l:"${doc[Id]}"` }).then(result => result.docs)));
            allDocs.forEach((docs, index) => docs.forEach(doc => map.set(doc, aliases[index])));
            docs.forEach(doc => map.delete(doc));
            runInAction(async () => {
                this._docs = docs.filter(doc => !Doc.AreProtosEqual(doc, CollectionDockingView.Instance.props.Document)).map(doc => ({ col: doc, target: dest }));
                this._otherDocs = Array.from(map.entries()).filter(entry => !Doc.AreProtosEqual(entry[0], CollectionDockingView.Instance.props.Document)).map(([col, target]) => ({ col, target }));
                const tcontext = LinkFollowBox.linkDoc && (await Cast(LinkFollowBox.linkDoc.anchor2Context, Doc)) as Doc;
                runInAction(() => tcontext && this._docs.splice(0, 0, { col: tcontext, target: dest }));
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

    highlightDoc = () => LinkFollowBox.destinationDoc && Doc.linkFollowHighlight(LinkFollowBox.destinationDoc);

    @undoBatch
    openFullScreen = () => {
        if (LinkFollowBox.destinationDoc) {
            const view = DocumentManager.Instance.getDocumentView(LinkFollowBox.destinationDoc);
            view && CollectionDockingView.Instance && CollectionDockingView.Instance.OpenFullScreen(view);
        }
    }

    @undoBatch
    openColFullScreen = (options: { context: Doc }) => {
        if (LinkFollowBox.destinationDoc) {
            if (NumCast(options.context._viewType, CollectionViewType.Invalid) === CollectionViewType.Freeform) {
                const newPanX = NumCast(LinkFollowBox.destinationDoc.x) + NumCast(LinkFollowBox.destinationDoc._width) / 2;
                const newPanY = NumCast(LinkFollowBox.destinationDoc.y) + NumCast(LinkFollowBox.destinationDoc._height) / 2;
                options.context._panX = newPanX;
                options.context._panY = newPanY;
            }
            const view = DocumentManager.Instance.getDocumentView(options.context);
            view && CollectionDockingView.Instance && CollectionDockingView.Instance.OpenFullScreen(view);
            this.highlightDoc();
        }
    }

    // should container be a doc or documentview or what? This one needs work and is more long term
    @undoBatch
    openInContainer = (options: { container: Doc }) => {

    }

    static _addDocTab: (undefined | ((doc: Doc, dataDoc: Opt<Doc>, where: string) => boolean));

    static setAddDocTab = (addFunc: (doc: Doc, dataDoc: Opt<Doc>, where: string) => boolean) => {
        LinkFollowBox._addDocTab = addFunc;
    }

    @undoBatch
    openLinkColRight = (options: { context: Doc, shouldZoom: boolean }) => {
        if (LinkFollowBox.destinationDoc) {
            options.context = Doc.IsPrototype(options.context) ? Doc.MakeDelegate(options.context) : options.context;
            if (NumCast(options.context._viewType, CollectionViewType.Invalid) === CollectionViewType.Freeform) {
                const newPanX = NumCast(LinkFollowBox.destinationDoc.x) + NumCast(LinkFollowBox.destinationDoc._width) / 2;
                const newPanY = NumCast(LinkFollowBox.destinationDoc.y) + NumCast(LinkFollowBox.destinationDoc._height) / 2;
                options.context._panX = newPanX;
                options.context._panY = newPanY;
            }
            (LinkFollowBox._addDocTab || this.props.addDocTab)(options.context, undefined, "onRight");

            if (options.shouldZoom) this.jumpToLink({ shouldZoom: options.shouldZoom });

            this.highlightDoc();
            SelectionManager.DeselectAll();
        }
    }

    @undoBatch
    openLinkRight = () => {
        if (LinkFollowBox.destinationDoc) {
            const alias = Doc.MakeAlias(LinkFollowBox.destinationDoc);
            (LinkFollowBox._addDocTab || this.props.addDocTab)(alias, undefined, "onRight");
            this.highlightDoc();
            SelectionManager.DeselectAll();
        }

    }

    @undoBatch
    jumpToLink = async (options: { shouldZoom: boolean }) => {
        if (LinkFollowBox.sourceDoc && LinkFollowBox.linkDoc) {
            const focus = (document: Doc) => { (LinkFollowBox._addDocTab || this.props.addDocTab)(document, undefined, "inTab"); SelectionManager.DeselectAll(); };
            //let focus = (doc: Doc, maxLocation: string) => this.props.focus(docthis.props.focus(LinkFollowBox.destinationDoc, true, 1, () => this.props.addDocTab(doc, undefined, maxLocation));

            DocumentManager.Instance.FollowLink(LinkFollowBox.linkDoc, LinkFollowBox.sourceDoc, focus, options && options.shouldZoom, false, undefined);
        }
    }

    @undoBatch
    openLinkTab = () => {
        if (LinkFollowBox.destinationDoc) {
            const fullScreenAlias = Doc.MakeAlias(LinkFollowBox.destinationDoc);
            // this.prosp.addDocTab is empty -- use the link source's addDocTab 
            (LinkFollowBox._addDocTab || this.props.addDocTab)(fullScreenAlias, undefined, "inTab");

            this.highlightDoc();
            SelectionManager.DeselectAll();
        }
    }

    @undoBatch
    openLinkColTab = (options: { context: Doc, shouldZoom: boolean }) => {
        if (LinkFollowBox.destinationDoc) {
            options.context = Doc.IsPrototype(options.context) ? Doc.MakeDelegate(options.context) : options.context;
            if (NumCast(options.context._viewType, CollectionViewType.Invalid) === CollectionViewType.Freeform) {
                const newPanX = NumCast(LinkFollowBox.destinationDoc.x) + NumCast(LinkFollowBox.destinationDoc._width) / 2;
                const newPanY = NumCast(LinkFollowBox.destinationDoc.y) + NumCast(LinkFollowBox.destinationDoc._height) / 2;
                options.context._panX = newPanX;
                options.context._panY = newPanY;
            }
            (LinkFollowBox._addDocTab || this.props.addDocTab)(options.context, undefined, "inTab");
            if (options.shouldZoom) this.jumpToLink({ shouldZoom: options.shouldZoom });

            this.highlightDoc();
            SelectionManager.DeselectAll();
        }
    }

    @undoBatch
    openLinkInPlace = (options: { shouldZoom: boolean }) => {

        if (LinkFollowBox.destinationDoc && LinkFollowBox.sourceDoc) {
            if (this.sourceView && this.sourceView.props.addDocument) {
                const destViews = DocumentManager.Instance.getDocumentViews(LinkFollowBox.destinationDoc);
                if (!destViews.find(dv => dv.props.ContainingCollectionView === this.sourceView!.props.ContainingCollectionView)) {
                    const alias = Doc.MakeAlias(LinkFollowBox.destinationDoc);
                    const y = NumCast(LinkFollowBox.sourceDoc.y);
                    const x = NumCast(LinkFollowBox.sourceDoc.x);

                    const width = NumCast(LinkFollowBox.sourceDoc._width);
                    const height = NumCast(LinkFollowBox.sourceDoc._height);

                    alias.x = x + width + 30;
                    alias.y = y;
                    alias._width = width;
                    alias._height = height;

                    this.sourceView.props.addDocument(alias);
                }
            }

            this.jumpToLink({ shouldZoom: options.shouldZoom });

            this.highlightDoc();
            SelectionManager.DeselectAll();
        }
    }

    //set this to be the default link behavior, can be any of the above
    public defaultLinkBehavior: (options?: any) => void = this.jumpToLink;

    @action
    currentLinkBehavior = () => {
        // this.resetPan();
        if (LinkFollowBox.destinationDoc) {
            if (this.selectedContextString === "") {
                this.selectedContextString = "self";
                this.selectedContext = LinkFollowBox.destinationDoc;
            }
            if (this.selectedOption === "") this.selectedOption = FollowOptions.NOZOOM;
            const shouldZoom: boolean = this.selectedOption === FollowOptions.NOZOOM ? false : true;
            const notOpenInContext: boolean = this.selectedContextString === "self" || this.selectedContextString === LinkFollowBox.destinationDoc[Id];

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
                else this.selectedContext && this.openLinkColTab({ context: this.selectedContext, shouldZoom: shouldZoom });
            }
            else if (this.selectedMode === FollowModes.PAN) {
                this.jumpToLink({ shouldZoom: shouldZoom });
            }
            else return;
        }
    }

    @action
    handleModeChange = (e: React.ChangeEvent) => {
        const target = e.target as HTMLInputElement;
        this.selectedMode = target.value;
        this.selectedContext = undefined;
        this.selectedContextString = "";

        this.shouldUseOnlyParentContext = (this.selectedMode === FollowModes.INPLACE || this.selectedMode === FollowModes.PAN);

        if (this.shouldUseOnlyParentContext) {
            if (this.sourceView && this.sourceView.props.ContainingCollectionDoc) {
                this.selectedContext = this.sourceView.props.ContainingCollectionDoc;
                this.selectedContextString = (StrCast(this.sourceView.props.ContainingCollectionDoc.title));
            }
        }
    }

    @action
    handleOptionChange = (e: React.ChangeEvent) => {
        const target = e.target as HTMLInputElement;
        this.selectedOption = target.value;
    }

    @action
    handleContextChange = (e: React.ChangeEvent) => {
        const target = e.target as HTMLInputElement;
        this.selectedContextString = target.value;
        // selectedContext is updated in reaction
        this.selectedOption = "";
    }

    @computed
    get canOpenInPlace() {
        if (this.sourceView && this.sourceView.props.ContainingCollectionDoc) {
            const colDoc = this.sourceView.props.ContainingCollectionDoc;
            if (colDoc._viewType === CollectionViewType.Freeform) return true;
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
        if (this.sourceView && this.sourceView.props.ContainingCollectionDoc) {
            return this.sourceView.props.ContainingCollectionDoc.title;
        }
    }

    @computed
    get parentID(): string {
        if (this.sourceView && this.sourceView.props.ContainingCollectionDoc) {
            return StrCast(this.sourceView.props.ContainingCollectionDoc[Id]);
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
                if (alias._viewType === CollectionViewType.Freeform) contextMatch = true;
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
            <div className="linkFollowBox-main" style={{ height: NumCast(this.props.Document._height), width: NumCast(this.props.Document._width) }}>
                <div className="linkFollowBox-header">
                    <div className="topHeader">
                        {LinkFollowBox.linkDoc ? "Link Title: " + StrCast(LinkFollowBox.linkDoc.title) : "No Link Selected"}
                        <div onClick={() => this.props.Document.isMinimized = true} className="closeDocument"><FontAwesomeIcon icon={faTimes} size="lg" /></div>
                    </div>
                    <div className=" direction-indicator">{LinkFollowBox.linkDoc ?
                        LinkFollowBox.sourceDoc && LinkFollowBox.destinationDoc ? "Source: " + StrCast(LinkFollowBox.sourceDoc.title) + ", Destination: " + StrCast(LinkFollowBox.destinationDoc.title)
                            : "" : ""}</div>
                </div>
                <div className="linkFollowBox-content" style={{ height: NumCast(this.props.Document._height) - 110 }}>
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
                        onClick={this.resetVars}>
                        Clear Link
                    </button>
                    <div style={{ width: 20 }}></div>
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