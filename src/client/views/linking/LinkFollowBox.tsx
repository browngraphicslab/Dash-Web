import { observable, computed, action, runInAction, reaction, IReactionDisposer } from "mobx";
import React = require("react");
import { observer } from "mobx-react";
import { FieldViewProps, FieldView } from "../nodes/FieldView";
import { Doc, DocListCastAsync, Opt } from "../../../new_fields/Doc";
import { undoBatch } from "../../util/UndoManager";
import { NumCast, FieldValue, Cast, StrCast } from "../../../new_fields/Types";
import { CollectionViewType } from "../collections/CollectionBaseView";
import { CollectionDockingView, AddDocTabFunction } from "../collections/CollectionDockingView";
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
import { List } from "../../../new_fields/List";

export enum FollowModes {
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

type SelectorProps = { linkDoc: Doc };
@observer
export class SelectorContextMenu extends React.Component<SelectorProps> {
    // @observable private _docs: { col: Doc, target: Doc }[] = [];
    // @observable private _otherDocs: { col: Doc, target: Doc }[] = [];

    // constructor(props: SelectorProps) {
    //     super(props);

    //     this.fetchDocuments();
    // }

    // async fetchDocuments() {
    //     let aliases = (await SearchUtil.GetAliasesOfDocument(this.props.Document)).filter(doc => doc !== this.props.Document);
    //     const { docs } = await SearchUtil.Search("", true, { fq: `data_l:"${this.props.Document[Id]}"` });
    //     const map: Map<Doc, Doc> = new Map;
    //     const allDocs = await Promise.all(aliases.map(doc => SearchUtil.Search("", true, { fq: `data_l:"${doc[Id]}"` }).then(result => result.docs)));
    //     allDocs.forEach((docs, index) => docs.forEach(doc => map.set(doc, aliases[index])));
    //     docs.forEach(doc => map.delete(doc));
    //     runInAction(() => {
    //         this._docs = docs.filter(doc => !Doc.AreProtosEqual(doc, CollectionDockingView.Instance.props.Document)).map(doc => ({ col: doc, target: this.props.Document }));
    //         this._otherDocs = Array.from(map.entries()).filter(entry => !Doc.AreProtosEqual(entry[0], CollectionDockingView.Instance.props.Document)).map(([col, target]) => ({ col, target }));
    //     });
    // }

    getOnClick({ col, target }: { col: Doc, target: Doc }) {
        return () => {
            col = Doc.IsPrototype(col) ? Doc.MakeDelegate(col) : col;
            if (NumCast(col.viewType, CollectionViewType.Invalid) === CollectionViewType.Freeform) {
                const newPanX = NumCast(target.x) + NumCast(target.width) / 2;
                const newPanY = NumCast(target.y) + NumCast(target.height) / 2;
                col.panX = newPanX;
                col.panY = newPanY;
            }
            this.props.addDocTab(col, undefined, "inTab"); // bcz: dataDoc?
        };
    }

    render() {
        return (
            <>
                <p key="contexts">Select a Behavior:</p>
                {/* {this._docs.map(doc => <p key={doc.col[Id] + doc.target[Id]}><a onClick={this.getOnClick(doc)}>{doc.col.title}</a></p>)}
                {this._otherDocs.length ? <hr key="hr" /> : null}
                {this._otherDocs.map(doc => <p key="p"><a onClick={this.getOnClick(doc)}>{doc.col.title}</a></p>)} */}
                {Cast(this.props.linkDoc.savedLinkFollows, listSpec("string"))!.map(() => {
                    // do something here
                })}
            </>
        );
    }
}

@observer
export class SavedLinkFollowSelector extends React.Component<SelectorProps> {
    @observable hover = false;

    @action
    onMouseLeave = () => {
        this.hover = false;
    }

    @action
    onMouseEnter = () => {
        this.hover = true;
    }

    render() {
        let flyout;
        if (this.hover) {
            flyout = (
                <div className="PDS-flyout" title=" ">
                    <SelectorContextMenu {...this.props} />
                </div>
            );
        }
        return (
            <span className="parentDocumentSelector-button" style={{ position: "relative", display: "inline-block", paddingLeft: "5px", paddingRight: "5px" }}
                onMouseEnter={this.onMouseEnter}
                onMouseLeave={this.onMouseLeave}>
                <p>^</p>
                {flyout}
            </span>
        );
    }
}

@observer
export class LinkFollowBox extends React.Component<FieldViewProps> {

    public static LayoutString() { return FieldView.LayoutString(LinkFollowBox); }
    public static Instance: LinkFollowBox | undefined;
    @observable static linkDoc: Doc | undefined = undefined;
    @observable static destinationDoc: Doc | undefined = undefined;
    @observable static sourceDoc: Doc | undefined = undefined;
    @observable static isSaving: boolean = false;
    @observable static isLoading: boolean = false;
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
                let ref = await DocServer.GetRefField(this.selectedContextString);
                runInAction(() => {
                    if (ref instanceof Doc) {
                        this.selectedContext = ref;
                    }
                });
                if (this.selectedContext instanceof Doc) {
                    let aliases = await SearchUtil.GetViewsOfDocument(Doc.GetProto(this.selectedContext));
                    runInAction(() => { this.selectedContextAliases = aliases; });
                }
            }
        );
    }

    componentWillUnmount = () => {
        this._contextDisposer && this._contextDisposer();
    }

    @action.bound
    public minimize() {
        this.props.Document.isMinimized = true;
    }

    async resetPan() {
        if (LinkFollowBox.destinationDoc && this.sourceView && this.sourceView.props.ContainingCollectionDoc) {
            runInAction(() => this.canPan = false);
            if (this.sourceView.props.ContainingCollectionDoc.viewType === CollectionViewType.Freeform) {
                let docs = Cast(this.sourceView.props.ContainingCollectionDoc.data, listSpec(Doc), []);
                let aliases = await SearchUtil.GetViewsOfDocument(Doc.GetProto(LinkFollowBox.destinationDoc));

                aliases.forEach(alias => {
                    if (docs.filter(doc => doc === alias).length > 0) {
                        runInAction(() => { this.canPan = true; });
                    }
                });
            }
        }
    }

    public display = (linkDoc: Doc, sourceDoc: Doc, destinationDoc: Doc, addDocTab: AddDocTabFunction) => {
        this.props.Document.isMinimized = false;
        this.setLinkDocs(linkDoc, sourceDoc, destinationDoc);
        this.setAddDocTab(addDocTab);
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
        LinkFollowBox.isSaving = false;
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
            runInAction(async () => {
                this._docs = docs.filter(doc => !Doc.AreProtosEqual(doc, CollectionDockingView.Instance.props.Document)).map(doc => ({ col: doc, target: dest }));
                this._otherDocs = Array.from(map.entries()).filter(entry => !Doc.AreProtosEqual(entry[0], CollectionDockingView.Instance.props.Document)).map(([col, target]) => ({ col, target }));
                let tcontext = LinkFollowBox.linkDoc && (await Cast(LinkFollowBox.linkDoc.targetContext, Doc)) as Doc;
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
        if (this.notOpenInContext) {
            this.openSelfFullScreen();
        }
        else {
            this.selectedContext && this.openColFullScreen({ shouldZoom: this.shouldZoom, context: this.selectedContext });
        }
    }

    @undoBatch
    openSelfFullScreen = () => {
        let view: DocumentView | null = DocumentManager.Instance.getDocumentView(LinkFollowBox.destinationDoc!);
        view && CollectionDockingView.Instance && CollectionDockingView.Instance.OpenFullScreen(view);
    }

    @undoBatch
    openColFullScreen = (options: { shouldZoom: boolean, context: Doc }) => {
        if (LinkFollowBox.destinationDoc) {
            if (NumCast(options.context.viewType, CollectionViewType.Invalid) === CollectionViewType.Freeform) {
                const newPanX = NumCast(LinkFollowBox.destinationDoc.x) + NumCast(LinkFollowBox.destinationDoc.width) / 2;
                const newPanY = NumCast(LinkFollowBox.destinationDoc.y) + NumCast(LinkFollowBox.destinationDoc.height) / 2;
                options.context.panX = newPanX;
                options.context.panY = newPanY;
            }
            let view = DocumentManager.Instance.getDocumentView(options.context);
            view && CollectionDockingView.Instance && CollectionDockingView.Instance.OpenFullScreen(view);
            if (options.shouldZoom) this.jumpToLink({ shouldZoom: options.shouldZoom });
            this.highlightDoc();
        }
    }

    // should container be a doc or documentview or what? This one needs work and is more long term
    @undoBatch
    openInContainer = (options: { container: Doc }) => {

    }

    _addDocTab: (undefined | AddDocTabFunction);

    setAddDocTab = (addFunc: AddDocTabFunction) => {
        this._addDocTab = addFunc;
    }

    @undoBatch
    private openLinkColRight = (options: { shouldZoom: boolean, context: Doc }) => {
        if (LinkFollowBox.destinationDoc) {
            let context: Doc = Doc.IsPrototype(options.context) ? Doc.MakeDelegate(options.context) : options.context;
            if (NumCast(context.viewType, CollectionViewType.Invalid) === CollectionViewType.Freeform) {
                const newPanX = NumCast(LinkFollowBox.destinationDoc.x) + NumCast(LinkFollowBox.destinationDoc.width) / 2;
                const newPanY = NumCast(LinkFollowBox.destinationDoc.y) + NumCast(LinkFollowBox.destinationDoc.height) / 2;
                context.panX = newPanX;
                context.panY = newPanY;
            }
            (this._addDocTab || this.props.addDocTab)(context, undefined, "onRight");

            if (options.shouldZoom) this.jumpToLink({ shouldZoom: options.shouldZoom });

            this.highlightDoc();
            SelectionManager.DeselectAll();
        }
    }

    @undoBatch
    private openLinkSelfRight = () => {
        console.log("opening self")
        let alias = Doc.MakeAlias(LinkFollowBox.destinationDoc!);
        (this._addDocTab || this.props.addDocTab)(alias, undefined, "onRight");
        this.highlightDoc();
        SelectionManager.DeselectAll();
    }

    @undoBatch
    openLinkRight = () => {
        if (this.notOpenInContext) {
            this.openLinkSelfRight();
        }
        // open in context
        else {
            this.selectedContext && this.openLinkColRight({ shouldZoom: this.shouldZoom, context: this.selectedContext });
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
            let guid = StrCast(LinkFollowBox.linkDoc[Id]);
            const shouldZoom = options ? options.shouldZoom : false;

            let dockingFunc = (document: Doc) => { (this._addDocTab || this.props.addDocTab)(document, undefined, "inTab"); SelectionManager.DeselectAll(); };

            if (LinkFollowBox.destinationDoc === LinkFollowBox.linkDoc.anchor2 && targetContext) {
                DocumentManager.Instance.jumpToDocument(jumpToDoc, options.shouldZoom, false, async document => dockingFunc(document), undefined, targetContext);
            }
            else if (LinkFollowBox.destinationDoc === LinkFollowBox.linkDoc.anchor1 && sourceContext) {
                DocumentManager.Instance.jumpToDocument(jumpToDoc, shouldZoom, false, document => dockingFunc(sourceContext!));
                if (LinkFollowBox.sourceDoc && LinkFollowBox.destinationDoc) {
                    if (guid) {
                        let views = DocumentManager.Instance.getDocumentViews(jumpToDoc);
                        views.length && (views[0].props.Document.scrollToLinkID = guid);
                    } else {
                        jumpToDoc.linkHref = Utils.prepend("/doc/" + StrCast(LinkFollowBox.linkDoc[Id]));
                    }
                }
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

    private get notOpenInContext() {
        return this.selectedContextString === "self" || this.selectedContextString === LinkFollowBox.destinationDoc![Id];
    }

    @undoBatch
    openLinkTab = () => {
        if (this.notOpenInContext) {
            this.openLinkSelfTab();
        }
        //open in a context
        else {
            this.selectedContext && this.openLinkColTab({ shouldZoom: this.shouldZoom, context: this.selectedContext });
        }
    }

    @undoBatch
    private openLinkSelfTab = () => {
        let fullScreenAlias = Doc.MakeAlias(LinkFollowBox.destinationDoc!);
        // this.prosp.addDocTab is empty -- use the link source's addDocTab 
        (this._addDocTab || this.props.addDocTab)(fullScreenAlias, undefined, "inTab");

        this.highlightDoc();
        SelectionManager.DeselectAll();
    }

    @undoBatch
    private openLinkColTab = (options: { shouldZoom: boolean, context: Doc }) => {
        if (LinkFollowBox.destinationDoc) {
            let context: Doc = Doc.IsPrototype(options.context) ? Doc.MakeDelegate(options.context) : options.context;
            if (NumCast(context.viewType, CollectionViewType.Invalid) === CollectionViewType.Freeform) {
                const newPanX = NumCast(LinkFollowBox.destinationDoc.x) + NumCast(LinkFollowBox.destinationDoc.width) / 2;
                const newPanY = NumCast(LinkFollowBox.destinationDoc.y) + NumCast(LinkFollowBox.destinationDoc.height) / 2;
                context.panX = newPanX;
                context.panY = newPanY;
            }
            (this._addDocTab || this.props.addDocTab)(context, undefined, "inTab");
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

    // set this is the default link behavior. it parses the string that "contains" the behavior

    // and then calls the correct function
    public async defaultLinkBehavior(followString: string) {
        let params: string[] = followString.split(",");
        let mode = params[0];
        let contextString = params[1];
        runInAction(() => this.selectedContextString = contextString);
        let shouldZoomString = params[2];
        let context: Doc | undefined = undefined;
        let shouldZoom: boolean = shouldZoomString === "true" ? true : false;

        let shouldOpenInContext = contextString !== "self" && contextString !== LinkFollowBox.destinationDoc![Id];
        if (shouldOpenInContext) {
            let ref = await DocServer.GetRefField(contextString);
            if (ref instanceof Doc) {
                context = ref;
            }
        }

        if (mode === FollowModes.INPLACE) {
            this.openLinkInPlace({ shouldZoom: shouldZoom });
        }
        else if (mode === FollowModes.OPENFULL) {
            this.openFullScreen();
        }
        else if (mode === FollowModes.OPENRIGHT) {
            this.openLinkRight();
        }
        else if (mode === FollowModes.OPENTAB) {
            this.openLinkTab();
        }
        else if (mode === FollowModes.PAN) {
            this.jumpToLink({ shouldZoom: shouldZoom });
        }
        else return;
    }

    @action
    public saveLinkFollowBehavior = (followMode: string, context: string, shouldZoom: boolean) => {

        let fullBehavior: string = followMode + "," + context + "," + shouldZoom.toString() + "," + LinkFollowBox.behaviorName;
        if (LinkFollowBox.linkDoc && LinkFollowBox.linkDoc.savedLinkFollows) {
            Cast(LinkFollowBox.linkDoc.savedLinkFollows, listSpec("string"))!.push(fullBehavior);
        }

        LinkFollowBox.isSaving = false;
        LinkFollowBox.behaviorName = "";
    }

    get shouldZoom() {
        return this.selectedOption === FollowOptions.NOZOOM ? false : true;
    }

    @action
    public setDefaultFollowBehavior = (followMode: string, context: string, shouldZoom: boolean) => {
        if (LinkFollowBox.linkDoc) { LinkFollowBox.linkDoc.defaultLinkFollow = followMode + "," + context + "," + shouldZoom.toString(); }
    }

    @action
    currentLinkBehavior = () => {
        if (this.selectedContextString === "") {
            this.selectedContextString = "self";
            this.selectedContext = LinkFollowBox.destinationDoc;
        }
        if (this.selectedOption === "") this.selectedOption = FollowOptions.NOZOOM;

        if (this.selectedMode === FollowModes.INPLACE) {
            this.openLinkInPlace({ shouldZoom: this.shouldZoom });
        }
        else if (this.selectedMode === FollowModes.OPENFULL) {
            this.openFullScreen();
        }
        else if (this.selectedMode === FollowModes.OPENRIGHT) {
            this.openLinkRight();
        }
        else if (this.selectedMode === FollowModes.OPENTAB) {
            this.openLinkTab();
        }
        else if (this.selectedMode === FollowModes.PAN) {
            this.jumpToLink({ shouldZoom: this.shouldZoom });
        }
        else return;
    }

    @action
    handleModeChange = (e: React.ChangeEvent) => {
        let target = e.target as HTMLInputElement;
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
        if (this.sourceView && this.sourceView.props.ContainingCollectionDoc) {
            let colDoc = this.sourceView.props.ContainingCollectionDoc;
            if (colDoc.viewType && colDoc.viewType === CollectionViewType.Freeform) return true;
        }
        return false;
    }

    @computed
    get availableModes() {
        return (
            <div className="linkEditor-linkForm">
                <label className="linkEditor-linkOption"><input
                    type="radio"
                    name="mode"
                    value={FollowModes.OPENRIGHT}
                    checked={this.selectedMode === FollowModes.OPENRIGHT}
                    onChange={this.handleModeChange}
                    disabled={false} />
                    {FollowModes.OPENRIGHT}
                </label><br />
                <label className="linkEditor-linkOption"><input
                    type="radio"
                    name="mode"
                    value={FollowModes.OPENTAB}
                    checked={this.selectedMode === FollowModes.OPENTAB}
                    onChange={this.handleModeChange}
                    disabled={false} />
                    {FollowModes.OPENTAB}
                </label><br />
                <label className="linkEditor-linkOption"><input
                    type="radio"
                    name="mode"
                    value={FollowModes.OPENFULL}
                    checked={this.selectedMode === FollowModes.OPENFULL}
                    onChange={this.handleModeChange}
                    disabled={false} />
                    {FollowModes.OPENFULL}
                </label><br />
                <label className="linkEditor-linkOption"><input
                    type="radio"
                    name="mode"
                    value={FollowModes.PAN}
                    checked={this.selectedMode === FollowModes.PAN}
                    onChange={this.handleModeChange}
                    disabled={!this.canPan} />
                    {FollowModes.PAN}
                </label><br />
                <label className="linkEditor-linkOption"><input
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

    //if the zoom option should show up in the options tab
    @computed
    get shouldShowZoom(): boolean {
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

    @action
    escapeSaveLoad() {
        LinkFollowBox.isSaving = false;
        LinkFollowBox.isLoading = false;
        LinkFollowBox.behaviorName = "";
    }

    @action
    startLinkFollowSave() { LinkFollowBox.isSaving = true; }

    @observable static behaviorName: string = "";

    @action
    startLoad() { LinkFollowBox.isLoading = true; }

    @action
    loadBehavior() {

        LinkFollowBox.isLoading = false;

        console.log("ending load")
    }

    @computed
    get footer() {
        if (LinkFollowBox.isSaving) {
            return (
                <div className="linkFollowBox-footer">
                    <div style={{ pointerEvents: "all" }}>
                        <>Behavior Name: </>
                        <input value={LinkFollowBox.behaviorName} onChange={this.onBehaviorTitleChange} onClick={() => console.log("clicking")} type="text" autoFocus={true}></input>
                    </div>
                    <button
                        onClick={this.escapeSaveLoad}>
                        Escape<br></br>Saving
                    </button>
                    <button
                        onClick={() => this.saveLinkFollowBehavior(this.selectedMode, this.selectedContextString, this.shouldZoom)}>
                        Confirm Save
                    </button>
                </div >
            );

        }
        else if (LinkFollowBox.isLoading) {
            return (
                <div className="linkFollowBox-footer">
                    <button
                        onClick={this.escapeSaveLoad}>
                        Escape<br></br>Loading
                    </button>
                    <button
                        onClick={this.loadBehavior}>
                        Load Behavior
                    </button>
                </div >
            );
        }
        else {
            return (
                <div className="linkFollowBox-footer">
                    <button
                        onClick={this.resetVars}>
                        Clear<br></br>Link
                    </button>
                    <button
                        onClick={this.startLoad}>
                        Load Behavior
                    </button>
                    <button
                        onClick={this.startLinkFollowSave}>
                        Save Behavior
                    </button>
                    <button
                        onClick={() => this.setDefaultFollowBehavior(this.selectedMode, this.selectedContextString, this.shouldZoom)}>
                        Set As Default
                    </button>
                    <button
                        onClick={this.currentLinkBehavior}
                        disabled={(LinkFollowBox.linkDoc) ? false : true}>
                        Follow Link
                    </button>
                </div>
            );
        }
    }

    @action.bound
    onBehaviorTitleChange(e: React.ChangeEvent<HTMLInputElement>) {
        LinkFollowBox.behaviorName = e.target.value;
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
                    <div className="topHeader">
                        {LinkFollowBox.linkDoc ? "Link Title: " + StrCast(LinkFollowBox.linkDoc.title) : "No Link Selected"}
                        <div onClick={this.minimize} className="closeDocument"><FontAwesomeIcon icon={faTimes} size="lg" /></div>
                    </div>
                    <div className=" direction-indicator">{LinkFollowBox.linkDoc ?
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
                <div>
                    {this.footer}
                </div>
            </div>
        );
    }
}