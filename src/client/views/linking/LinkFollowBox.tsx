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

@observer
export class LinkFollowBox extends React.Component<FieldViewProps> {

    public static LayoutString() { return FieldView.LayoutString(LinkFollowBox); }
    public static Instance: LinkFollowBox;
    //set this to be the default link behavior, can be any of the above

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

    // NOT TESTED
    // col = collection the doc is in
    // target = the document to center on
    @undoBatch
    openLinkColRight = (destinationDoc: Doc, col: Doc) => {
        col = Doc.IsPrototype(col) ? Doc.MakeDelegate(col) : col;
        if (NumCast(col.viewType, CollectionViewType.Invalid) === CollectionViewType.Freeform) {
            const newPanX = NumCast(destinationDoc.x) + NumCast(destinationDoc.width) / NumCast(destinationDoc.zoomBasis, 1) / 2;
            const newPanY = NumCast(destinationDoc.y) + NumCast(destinationDoc.height) / NumCast(destinationDoc.zoomBasis, 1) / 2;
            col.panX = newPanX;
            col.panY = newPanY;
        }
        CollectionDockingView.Instance.AddRightSplit(col, undefined);
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
    jumpToLink = async (destinationDoc: Doc, shouldZoom: boolean, linkDoc: Doc) => {
        //there is an issue right now so this will be false automatically
        shouldZoom = false;
        this.highlightDoc(destinationDoc);
        let jumpToDoc = destinationDoc;
        let pdfDoc = FieldValue(Cast(destinationDoc, Doc));
        if (pdfDoc) {
            jumpToDoc = pdfDoc;
        }
        let proto = Doc.GetProto(linkDoc);
        let targetContext = await Cast(proto.targetContext, Doc);
        let sourceContext = await Cast(proto.sourceContext, Doc);

        let dockingFunc = (document: Doc) => { this.props.addDocTab(document, undefined, "inTab"); SelectionManager.DeselectAll(); };

        if (destinationDoc === linkDoc.anchor2 && targetContext) {
            DocumentManager.Instance.jumpToDocument(jumpToDoc, shouldZoom, false, async document => dockingFunc(document), undefined, targetContext);
        }
        else if (destinationDoc === linkDoc.anchor1 && sourceContext) {
            DocumentManager.Instance.jumpToDocument(jumpToDoc, shouldZoom, false, document => dockingFunc(sourceContext!));
        }
        else if (DocumentManager.Instance.getDocumentView(jumpToDoc)) {
            DocumentManager.Instance.jumpToDocument(jumpToDoc, shouldZoom, undefined, undefined, NumCast((destinationDoc === linkDoc.anchor2 ? linkDoc.anchor2Page : linkDoc.anchor1Page)));

        }
        else {
            DocumentManager.Instance.jumpToDocument(jumpToDoc, shouldZoom, false, dockingFunc);
        }
    }

    // DONE
    // opens link in new tab (not in a collection)
    // this opens it full screen, do we need a separate full screen option?
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
    openLinkColTab = (destinationDoc: Doc, col: Doc) => {
        this.highlightDoc(destinationDoc);
        col = Doc.IsPrototype(col) ? Doc.MakeDelegate(col) : col;
        if (NumCast(col.viewType, CollectionViewType.Invalid) === CollectionViewType.Freeform) {
            const newPanX = NumCast(destinationDoc.x) + NumCast(destinationDoc.width) / NumCast(destinationDoc.zoomBasis, 1) / 2;
            const newPanY = NumCast(destinationDoc.y) + NumCast(destinationDoc.height) / NumCast(destinationDoc.zoomBasis, 1) / 2;
            col.panX = newPanX;
            col.panY = newPanY;
        }
        // CollectionDockingView.Instance.AddRightSplit(col, undefined);
        this.props.addDocTab(col, undefined, "inTab");
        SelectionManager.DeselectAll();
    }

    // DONE
    // this will open a link next to the source doc
    @undoBatch
    openLinkInPlace = (destinationDoc: Doc, sourceDoc: Doc) => {
        this.highlightDoc(destinationDoc);

        let alias = Doc.MakeAlias(destinationDoc);
        let y = NumCast(sourceDoc.y);
        let x = NumCast(sourceDoc.x);

        let width = NumCast(sourceDoc.width);
        let height = NumCast(sourceDoc.height);

        alias.x = x + width + 30;
        alias.y = y;
        alias.width = width;
        alias.height = height;

        SelectionManager.SelectedDocuments().map(dv => {
            if (dv.props.Document === sourceDoc) {
                dv.props.addDocument && dv.props.addDocument(alias, false);
            }
        });
    }

    private defaultLinkBehavior: any = this.openLinkInPlace;
    private currentLinkBehavior: any = this.defaultLinkBehavior;

    render() {
        return (
            <div className="linkFollowBox-main">

            </div>
        );
    }
}