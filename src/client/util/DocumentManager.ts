import { action, computed, observable } from 'mobx';
import { Doc, DocListCastAsync } from '../../new_fields/Doc';
import { Id } from '../../new_fields/FieldSymbols';
import { Cast, NumCast } from '../../new_fields/Types';
import { CollectionDockingView } from '../views/collections/CollectionDockingView';
import { CollectionPDFView } from '../views/collections/CollectionPDFView';
import { CollectionVideoView } from '../views/collections/CollectionVideoView';
import { CollectionView } from '../views/collections/CollectionView';
import { DocumentView } from '../views/nodes/DocumentView';
import { LinkManager } from './LinkManager';
import { undoBatch, UndoManager } from './UndoManager';
import { Scripting } from './Scripting';
import { List } from '../../new_fields/List';
import { SelectionManager } from './SelectionManager';


export class DocumentManager {

    //global holds all of the nodes (regardless of which collection they're in)
    @observable
    public DocumentViews: DocumentView[] = [];

    // singleton instance
    private static _instance: DocumentManager;

    // create one and only one instance of NodeManager
    public static get Instance(): DocumentManager {
        return this._instance || (this._instance = new this());
    }

    //private constructor so no other class can create a nodemanager
    private constructor() {
        // this.DocumentViews = new Array<DocumentView>();
    }

    //gets all views
    public getDocumentViewsById(id: string) {
        let toReturn: DocumentView[] = [];
        DocumentManager.Instance.DocumentViews.map(view => {
            if (view.props.Document[Id] === id) {
                toReturn.push(view);
            }
        });
        if (toReturn.length === 0) {
            DocumentManager.Instance.DocumentViews.map(view => {
                let doc = view.props.Document.proto;
                if (doc && doc[Id]) {
                    if (doc[Id] === id) { toReturn.push(view); }
                }
            });
        }
        return toReturn;
    }

    public getAllDocumentViews(doc: Doc) {
        return this.getDocumentViewsById(doc[Id]);
    }

    public getDocumentViewById(id: string, preferredCollection?: CollectionView | CollectionPDFView | CollectionVideoView): DocumentView | null {

        let toReturn: DocumentView | null = null;
        let passes = preferredCollection ? [preferredCollection, undefined] : [undefined];

        for (let pass of passes) {
            DocumentManager.Instance.DocumentViews.map(view => {
                if (view.props.Document[Id] === id && (!pass || view.props.ContainingCollectionView === preferredCollection)) {
                    toReturn = view;
                    return;
                }
            });
            if (!toReturn) {
                DocumentManager.Instance.DocumentViews.map(view => {
                    let doc = view.props.Document.proto;
                    if (doc && doc[Id] === id && (!pass || view.props.ContainingCollectionView === preferredCollection)) {
                        toReturn = view;
                    }
                });
            }
        }

        return toReturn;
    }

    public getDocumentView(toFind: Doc, preferredCollection?: CollectionView | CollectionPDFView | CollectionVideoView): DocumentView | null {
        return this.getDocumentViewById(toFind[Id], preferredCollection);
    }

    public getDocumentViews(toFind: Doc): DocumentView[] {

        let toReturn: DocumentView[] = [];

        //gets document view that is in a freeform canvas collection
        DocumentManager.Instance.DocumentViews.map(view => {
            let doc = view.props.Document;

            if (doc === toFind) {
                toReturn.push(view);
            } else {
                if (Doc.AreProtosEqual(doc, toFind)) {
                    toReturn.push(view);
                }
            }
        });

        return toReturn;
    }

    @computed
    public get LinkedDocumentViews() {
        let pairs = DocumentManager.Instance.DocumentViews.filter(dv => dv.isSelected() || Doc.IsBrushed(dv.props.Document)).reduce((pairs, dv) => {
            let linksList = LinkManager.Instance.getAllRelatedLinks(dv.props.Document);
            pairs.push(...linksList.reduce((pairs, link) => {
                if (link) {
                    let linkToDoc = LinkManager.Instance.getOppositeAnchor(link, dv.props.Document);
                    if (linkToDoc) {
                        DocumentManager.Instance.getDocumentViews(linkToDoc).map(docView1 => {
                            pairs.push({ a: dv, b: docView1, l: link });
                        });
                    }
                }
                return pairs;
            }, [] as { a: DocumentView, b: DocumentView, l: Doc }[]));
            // }
            return pairs;
        }, [] as { a: DocumentView, b: DocumentView, l: Doc }[]);

        return pairs;
    }


    @undoBatch
    public jumpToDocument = async (docDelegate: Doc, willZoom: boolean, forceDockFunc: boolean = false, dockFunc?: (doc: Doc) => void, linkPage?: number, docContext?: Doc): Promise<void> => {
        let doc = Doc.GetProto(docDelegate);
        const contextDoc = await Cast(doc.annotationOn, Doc);
        if (contextDoc) {
            contextDoc.scrollY = NumCast(doc.y) - NumCast(contextDoc.height) / 2 * 72 / 96;
        }

        let docView: DocumentView | null;
        // using forceDockFunc as a flag for splitting linked to doc to the right...can change later if needed
        if (!forceDockFunc && (docView = DocumentManager.Instance.getDocumentView(doc))) {
            Doc.BrushDoc(docView.props.Document);
            if (linkPage !== undefined) docView.props.Document.curPage = linkPage;
            UndoManager.RunInBatch(() => docView!.props.focus(docView!.props.Document, willZoom), "focus");
        } else {
            if (!contextDoc) {
                let docs = docContext ? await DocListCastAsync(docContext.data) : undefined;
                let found = false;
                // bcz: this just searches within the context for the target -- perhaps it should recursively search through all children?
                docs && docs.map(d => found = found || Doc.AreProtosEqual(d, docDelegate));
                if (docContext && found) {
                    let targetContextView: DocumentView | null;

                    if (!forceDockFunc && docContext && (targetContextView = DocumentManager.Instance.getDocumentView(docContext))) {
                        docContext.panTransformType = "Ease";
                        targetContextView.props.focus(docDelegate, willZoom);
                    } else {
                        (dockFunc || CollectionDockingView.AddRightSplit)(docContext, undefined);
                        setTimeout(() => {
                            let dv = DocumentManager.Instance.getDocumentView(docContext);
                            dv && this.jumpToDocument(docDelegate, willZoom, forceDockFunc,
                                doc => dv!.props.focus(dv!.props.Document, true, 1, () => dv!.props.addDocTab(doc, undefined, "inPlace")),
                                linkPage);
                        }, 1050);
                    }
                } else {
                    const actualDoc = Doc.MakeAlias(docDelegate);
                    Doc.BrushDoc(actualDoc);
                    if (linkPage !== undefined) actualDoc.curPage = linkPage;
                    (dockFunc || CollectionDockingView.AddRightSplit)(actualDoc, undefined);
                }
            } else {
                let contextView: DocumentView | null;
                Doc.BrushDoc(docDelegate);
                let contextViews = DocumentManager.Instance.getDocumentViews(contextDoc);
                if (!forceDockFunc && contextViews.length) {
                    contextView = contextViews[0];
                    SelectionManager.SelectDoc(contextView, false); // force unrendered annotations to be created
                    contextDoc.panTransformType = "Ease";
                    setTimeout(() => {
                        SelectionManager.DeselectDoc(contextView!);
                        docView = DocumentManager.Instance.getDocumentView(docDelegate);
                        docView && contextView!.props.focus(contextView!.props.Document, willZoom);
                        docView && UndoManager.RunInBatch(() => docView!.props.focus(docView!.props.Document, willZoom), "focus");
                    }, 0);
                } else {
                    (dockFunc || CollectionDockingView.AddRightSplit)(contextDoc, undefined);
                    setTimeout(() => {
                        this.jumpToDocument(docDelegate, willZoom, forceDockFunc, dockFunc, linkPage);
                    }, 1000);
                }
            }
        }
    }

    @action
    zoomIntoScale = (docDelegate: Doc, scale: number) => {
        let docView = DocumentManager.Instance.getDocumentView(Doc.GetProto(docDelegate));
        docView && docView.props.zoomToScale(scale);
    }

    getScaleOfDocView = (docDelegate: Doc) => {
        let doc = Doc.GetProto(docDelegate);

        let docView: DocumentView | null;
        docView = DocumentManager.Instance.getDocumentView(doc);
        if (docView) {
            return docView.props.getScale();
        } else {
            return 1;
        }
    }

    @action
    animateBetweenPoint = (scrpt: number[], expandedDocs: Doc[] | undefined): void => {
        expandedDocs && expandedDocs.map(expDoc => {
            if (expDoc.isMinimized || expDoc.isAnimating === "min") { // MAXIMIZE DOC
                if (expDoc.isMinimized) {  // docs are never actaully at the minimized location.  so when we unminimize one, we have to set our overrides to make it look like it was at the minimize location
                    expDoc.isMinimized = false;
                    expDoc.animateToPos = new List<number>([...scrpt, 0]);
                    expDoc.animateToDimensions = new List<number>([0, 0]);
                }
                setTimeout(() => {
                    expDoc.isAnimating = "max";
                    expDoc.animateToPos = new List<number>([0, 0, 1]);
                    expDoc.animateToDimensions = new List<number>([NumCast(expDoc.width), NumCast(expDoc.height)]);
                    setTimeout(() => expDoc.isAnimating === "max" && (expDoc.isAnimating = expDoc.animateToPos = expDoc.animateToDimensions = undefined), 600);
                }, 0);
            } else {  // MINIMIZE DOC
                expDoc.isAnimating = "min";
                expDoc.animateToPos = new List<number>([...scrpt, 0]);
                expDoc.animateToDimensions = new List<number>([0, 0]);
                setTimeout(() => {
                    if (expDoc.isAnimating === "min") {
                        expDoc.isMinimized = true;
                        expDoc.isAnimating = expDoc.animateToPos = expDoc.animateToDimensions = undefined;
                    }
                }, 600);
            }
        });
    }
}
Scripting.addGlobal(function focus(doc: any) { DocumentManager.Instance.getDocumentViews(Doc.GetProto(doc)).map(view => view.props.focus(doc, true)); });