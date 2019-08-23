import { observable, computed, action, trace, ObservableMap } from "mobx";
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

enum FollowModes {
    OPENTAB = "Open in Tab",
    OPENRIGHT = "Open in Right Split",
    OPENFULL = "Open Full Screen",
    PAN = "Pan to Document",
    INPLACE = "Open In Place"
}

enum FollowOptions {
    ZOOM = "zoom",
    NOZOOM = "no zoom",
}

@observer
export class LinkFollowBox extends React.Component<FieldViewProps> {

    public static LayoutString() { return FieldView.LayoutString(LinkFollowBox); }
    public static Instance: LinkFollowBox;
    @observable static linkDoc: Doc | undefined = undefined;
    @observable static destinationDoc: Doc | undefined = undefined;
    @observable static sourceDoc: Doc | undefined = undefined;
    @observable selectedMode: string = "";
    @observable selectedOption: string = "";

    constructor(props: FieldViewProps) {
        super(props);
        LinkFollowBox.Instance = this;
    }

    @action
    setLinkDocs = (linkDoc: Doc, source: Doc, dest: Doc) => {
        LinkFollowBox.linkDoc = linkDoc;
        LinkFollowBox.sourceDoc = source;
        LinkFollowBox.destinationDoc = dest;
    }

    unhighlight = () => {
        Doc.UnhighlightAll();
        document.removeEventListener("pointerdown", this.unhighlight);
    }

    @action
    highlightDoc = (destinationDoc: Doc) => {
        document.removeEventListener("pointerdown", this.unhighlight);
        Doc.HighlightDoc(destinationDoc);
        window.setTimeout(() => {
            document.addEventListener("pointerdown", this.unhighlight);
        }, 10000);
    }

    @undoBatch
    openFullScreen = (destinationDoc: Doc) => {
        let view: DocumentView | null = DocumentManager.Instance.getDocumentView(destinationDoc);
        view && CollectionDockingView.Instance && CollectionDockingView.Instance.OpenFullScreen(view);
        SelectionManager.DeselectAll();
    }

    // should container be a doc or documentview or what? This one needs work and is more long term
    @undoBatch
    openInContainer = (destinationDoc: Doc, options: { container: Doc }) => {

    }

    // NOT TESTED
    @undoBatch
    openLinkColRight = (destinationDoc: Doc, options: { context: Doc }) => {
        options.context = Doc.IsPrototype(options.context) ? Doc.MakeDelegate(options.context) : options.context;
        if (NumCast(options.context.viewType, CollectionViewType.Invalid) === CollectionViewType.Freeform) {
            const newPanX = NumCast(destinationDoc.x) + NumCast(destinationDoc.width) / NumCast(destinationDoc.zoomBasis, 1) / 2;
            const newPanY = NumCast(destinationDoc.y) + NumCast(destinationDoc.height) / NumCast(destinationDoc.zoomBasis, 1) / 2;
            options.context.panX = newPanX;
            options.context.panY = newPanY;
        }
        CollectionDockingView.Instance.AddRightSplit(options.context, undefined);

        this.highlightDoc(destinationDoc);
        SelectionManager.DeselectAll();
    }

    @undoBatch
    openLinkRight = (destinationDoc: Doc) => {
        let alias = Doc.MakeAlias(destinationDoc);
        CollectionDockingView.Instance.AddRightSplit(alias, undefined);
        this.highlightDoc(destinationDoc);
        SelectionManager.DeselectAll();

    }

    @undoBatch
    jumpToLink = async (destinationDoc: Doc, options: { shouldZoom: boolean, linkDoc: Doc }) => {
        let jumpToDoc = destinationDoc;
        let pdfDoc = FieldValue(Cast(destinationDoc, Doc));
        if (pdfDoc) {
            jumpToDoc = pdfDoc;
        }
        let proto = Doc.GetProto(options.linkDoc);
        let targetContext = await Cast(proto.targetContext, Doc);
        let sourceContext = await Cast(proto.sourceContext, Doc);

        let dockingFunc = (document: Doc) => { this.props.addDocTab(document, undefined, "inTab"); SelectionManager.DeselectAll(); };

        if (destinationDoc === options.linkDoc.anchor2 && targetContext) {
            DocumentManager.Instance.jumpToDocument(jumpToDoc, options.shouldZoom, false, async document => dockingFunc(document), undefined, targetContext);
        }
        else if (destinationDoc === options.linkDoc.anchor1 && sourceContext) {
            DocumentManager.Instance.jumpToDocument(jumpToDoc, options.shouldZoom, false, document => dockingFunc(sourceContext!));
        }
        else if (DocumentManager.Instance.getDocumentView(jumpToDoc)) {
            DocumentManager.Instance.jumpToDocument(jumpToDoc, options.shouldZoom, undefined, undefined, NumCast((destinationDoc === options.linkDoc.anchor2 ? options.linkDoc.anchor2Page : options.linkDoc.anchor1Page)));

        }
        else {
            DocumentManager.Instance.jumpToDocument(jumpToDoc, options.shouldZoom, false, dockingFunc);
        }

        this.highlightDoc(destinationDoc);
        SelectionManager.DeselectAll();
    }

    @undoBatch
    openLinkTab = (destinationDoc: Doc) => {
        let fullScreenAlias = Doc.MakeAlias(destinationDoc);
        this.props.addDocTab(fullScreenAlias, undefined, "inTab");

        this.highlightDoc(destinationDoc);
        SelectionManager.DeselectAll();
    }

    // NOT TESTED
    @undoBatch
    openLinkColTab = (destinationDoc: Doc, options: { context: Doc }) => {
        options.context = Doc.IsPrototype(options.context) ? Doc.MakeDelegate(options.context) : options.context;
        if (NumCast(options.context.viewType, CollectionViewType.Invalid) === CollectionViewType.Freeform) {
            const newPanX = NumCast(destinationDoc.x) + NumCast(destinationDoc.width) / NumCast(destinationDoc.zoomBasis, 1) / 2;
            const newPanY = NumCast(destinationDoc.y) + NumCast(destinationDoc.height) / NumCast(destinationDoc.zoomBasis, 1) / 2;
            options.context.panX = newPanX;
            options.context.panY = newPanY;
        }
        this.props.addDocTab(options.context, undefined, "inTab");

        this.highlightDoc(destinationDoc);
        SelectionManager.DeselectAll();
    }

    @undoBatch
    openLinkInPlace = (destinationDoc: Doc, options: { sourceDoc: Doc, linkDoc: Doc }) => {

        let alias = Doc.MakeAlias(destinationDoc);
        let y = NumCast(options.sourceDoc.y);
        let x = NumCast(options.sourceDoc.x);

        let width = NumCast(options.sourceDoc.width);
        let height = NumCast(options.sourceDoc.height);

        alias.x = x + width + 30;
        alias.y = y;
        alias.width = width;
        alias.height = height;

        SelectionManager.SelectedDocuments().map(dv => {
            if (dv.props.Document === options.sourceDoc) {
                dv.props.addDocument && dv.props.addDocument(alias, false);
            }
        });

        this.jumpToLink(destinationDoc, { shouldZoom: false, linkDoc: options.linkDoc });

        this.highlightDoc(destinationDoc);
        SelectionManager.DeselectAll();
    }

    //set this to be the default link behavior, can be any of the above
    private defaultLinkBehavior: (destinationDoc: Doc, options?: any) => void = this.openLinkInPlace;
    // private currentLinkBehavior: (destinationDoc: Doc, options?: any) => void = this.defaultLinkBehavior;

    @computed
    get LinkFollowTitle(): string {
        if (LinkFollowBox.linkDoc) {
            return StrCast(LinkFollowBox.linkDoc.title);
        }
        return "No Link Selected";
    }

    @action
    currentLinkBehavior = () => {
        if (this.selectedMode === FollowModes.INPLACE) {

        }
        else if (this.selectedMode === FollowModes.OPENFULL) {

        }
        else if (this.selectedMode === FollowModes.OPENRIGHT) {

        }
        else if (this.selectedMode === FollowModes.OPENTAB) {

        }
        else if (this.selectedMode === FollowModes.INPLACE) {

        }
        else if (this.selectedMode === FollowModes.PAN) {

        }
        else return;
    }

    @action
    handleModeChange = (e: React.ChangeEvent) => {
        let target = e.target as HTMLInputElement;
        this.selectedMode = target.value;
    }

    @action
    handleOptionChange = (e: React.ChangeEvent) => {
        let target = e.target as HTMLInputElement;
        this.selectedOption = target.value;
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
                    onChange={this.handleModeChange} />
                    {FollowModes.OPENRIGHT}
                </label><br />
                <label><input
                    type="radio"
                    name="mode"
                    value={FollowModes.OPENTAB}
                    checked={this.selectedMode === FollowModes.OPENTAB}
                    onChange={this.handleModeChange} />
                    {FollowModes.OPENTAB}
                </label><br />
                <label><input
                    type="radio"
                    name="mode"
                    value={FollowModes.OPENFULL}
                    checked={this.selectedMode === FollowModes.OPENFULL}
                    onChange={this.handleModeChange} />
                    {FollowModes.OPENFULL}
                </label><br />
                <label><input
                    type="radio"
                    name="mode"
                    value={FollowModes.PAN}
                    checked={this.selectedMode === FollowModes.PAN}
                    onChange={this.handleModeChange} />
                    {FollowModes.PAN}
                </label><br />
                <label><input
                    type="radio"
                    name="mode"
                    value={FollowModes.INPLACE}
                    checked={this.selectedMode === FollowModes.INPLACE}
                    onChange={this.handleModeChange} />
                    {FollowModes.INPLACE}
                </label><br />
            </div>
        );
    }

    @computed
    get contexts() {
        return (
            <div>

            </div>
        );
    }

    render() {
        return (
            <div className="linkFollowBox-main" style={{ height: NumCast(this.props.Document.height), width: NumCast(this.props.Document.width) }}>
                <div className="linkFollowBox-header">{this.LinkFollowTitle}</div>
                <div className="linkFollowBox-content" style={{ height: NumCast(this.props.Document.height) - 90 }}>
                    <div className="linkFollowBox-item">
                        <div className="linkFollowBox-item title">Mode</div>
                        <div className="linkFollowBox-itemContent">{this.availableModes}</div>
                    </div>
                    <div className="linkFollowBox-item">
                        <div className="linkFollowBox-item title">Context</div>
                        <div className="linkFollowBox-itemContent">

                        </div>
                    </div>
                    <div className="linkFollowBox-item">
                        <div className="linkFollowBox-item title">Options</div>
                        <div className="linkFollowBox-itemContent">

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