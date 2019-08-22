import { observable, computed, action, trace } from "mobx";
import React = require("react");
import { observer } from "mobx-react";
import { FieldViewProps, FieldView } from "../nodes/FieldView";
import { Doc } from "../../../new_fields/Doc";
import { undoBatch } from "../../util/UndoManager";
import { NumCast, FieldValue, Cast } from "../../../new_fields/Types";
import { CollectionViewType } from "../collections/CollectionBaseView";
import { CollectionDockingView } from "../collections/CollectionDockingView";
import { SelectionManager } from "../../util/SelectionManager";
import { DocumentManager } from "../../util/DocumentManager";
import { DocumentView } from "../nodes/DocumentView";
import "./LinkFollowBox.scss";

export type LinkParamOptions = {
    container: Doc;
    context: Doc;
    sourceDoc: Doc;
    shoudldZoom: boolean;
    linkDoc: Doc;
};

@observer
export class LinkFollowBox extends React.Component<FieldViewProps> {

    public static LayoutString() { return FieldView.LayoutString(LinkFollowBox); }
    public static Instance: LinkFollowBox;

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

    // DONE
    @undoBatch
    openFullScreen = (destinationDoc: Doc) => {
        let view: DocumentView | null = DocumentManager.Instance.getDocumentView(destinationDoc)
        view && CollectionDockingView.Instance && CollectionDockingView.Instance.OpenFullScreen(view);
    }

    // should container be a doc or documentview or what? This one needs work and is more long term
    @undoBatch
    openInContainer = (destinationDoc: Doc, options: { container: Doc }) => {

    }

    // NOT TESTED
    // col = collection the doc is in
    // target = the document to center on
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
    }

    // DONE
    // this opens the linked doc in a right split, NOT in its collection
    @undoBatch
    openLinkRight = (destinationDoc: Doc) => {
        this.highlightDoc(destinationDoc);
        let alias = Doc.MakeAlias(destinationDoc);
        CollectionDockingView.Instance.AddRightSplit(alias, undefined);
        SelectionManager.DeselectAll();
    }

    // DONE
    // this is the standard "follow link" (jump to document)
    // taken from follow link
    @undoBatch
    jumpToLink = async (destinationDoc: Doc, options: { shouldZoom: boolean, linkDoc: Doc }) => {
        //there is an issue right now so this will be false automatically
        options.shouldZoom = false;
        this.highlightDoc(destinationDoc);
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
    }

    // DONE
    // opens link in new tab (not in a collection)
    // this opens it full screen in new tab
    @undoBatch
    openLinkTab = (destinationDoc: Doc) => {
        this.highlightDoc(destinationDoc);
        let fullScreenAlias = Doc.MakeAlias(destinationDoc);
        this.props.addDocTab(fullScreenAlias, undefined, "inTab");
        SelectionManager.DeselectAll();
    }

    // NOT TESTED
    // opens link in new tab in collection
    // col = collection the doc is in
    // target = the document to center on
    @undoBatch
    openLinkColTab = (destinationDoc: Doc, options: { context: Doc }) => {
        this.highlightDoc(destinationDoc);
        options.context = Doc.IsPrototype(options.context) ? Doc.MakeDelegate(options.context) : options.context;
        if (NumCast(options.context.viewType, CollectionViewType.Invalid) === CollectionViewType.Freeform) {
            const newPanX = NumCast(destinationDoc.x) + NumCast(destinationDoc.width) / NumCast(destinationDoc.zoomBasis, 1) / 2;
            const newPanY = NumCast(destinationDoc.y) + NumCast(destinationDoc.height) / NumCast(destinationDoc.zoomBasis, 1) / 2;
            options.context.panX = newPanX;
            options.context.panY = newPanY;
        }
        // CollectionDockingView.Instance.AddRightSplit(col, undefined);
        this.props.addDocTab(options.context, undefined, "inTab");
        SelectionManager.DeselectAll();
    }

    // DONE
    // this will open a link next to the source doc
    @undoBatch
    openLinkInPlace = (destinationDoc: Doc, options: { sourceDoc: Doc }) => {
        this.highlightDoc(destinationDoc);

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
    }

    //set this to be the default link behavior, can be any of the above
    private defaultLinkBehavior: (destinationDoc: Doc, options?: any) => void = this.openLinkInPlace;
    private currentLinkBehavior: (destinationDoc: Doc, options?: any) => void = this.defaultLinkBehavior;

    render() {
        return (
            <div className="linkFollowBox-main" style={{ height: NumCast(this.props.Document.height), width: NumCast(this.props.Document.width) }}>

            </div>
        );
    }
}