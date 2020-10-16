import { action, observable } from 'mobx';
import { Doc, DocListCast, DocListCastAsync, Opt } from '../../fields/Doc';
import { Id } from '../../fields/FieldSymbols';
import { Cast, NumCast, StrCast } from '../../fields/Types';
import { returnFalse } from '../../Utils';
import { DocumentType } from '../documents/DocumentTypes';
import { CollectionDockingView } from '../views/collections/CollectionDockingView';
import { CollectionView } from '../views/collections/CollectionView';
import { DocumentView } from '../views/nodes/DocumentView';
import { LinkManager } from './LinkManager';
import { Scripting } from './Scripting';
import { SelectionManager } from './SelectionManager';
import { LinkDocPreview } from '../views/nodes/LinkDocPreview';
import { FormattedTextBoxComment } from '../views/nodes/formattedText/FormattedTextBoxComment';

export type CreateViewFunc = (doc: Doc, followLinkLocation: string, finished?: () => void) => void;

export class DocumentManager {

    //global holds all of the nodes (regardless of which collection they're in)
    @observable
    public DocumentViews: DocumentView[] = [];
    @observable LinkedDocumentViews: { a: DocumentView, b: DocumentView, l: Doc }[] = [];

    // singleton instance
    private static _instance: DocumentManager;

    // create one and only one instance of NodeManager
    public static get Instance(): DocumentManager {
        return this._instance || (this._instance = new this());
    }

    //private constructor so no other class can create a nodemanager
    private constructor() {
    }

    @action
    public AddView = (view: DocumentView) => {
        const linksList = DocListCast(view.props.Document.links);
        linksList.forEach(link => {
            const linkToDoc = link && LinkManager.getOppositeAnchor(link, view.props.Document);
            linkToDoc && DocumentManager.Instance.DocumentViews.filter(dv => Doc.AreProtosEqual(dv.props.Document, linkToDoc)).forEach(dv => {
                if (dv.props.Document.type !== DocumentType.LINK || dv.props.LayoutTemplateString !== view.props.LayoutTemplateString) {
                    this.LinkedDocumentViews.push({ a: dv, b: view, l: link });
                }
            });
        });
        this.DocumentViews.push(view);
    }
    public RemoveView = (view: DocumentView) => {
        const index = this.DocumentViews.indexOf(view);
        index !== -1 && this.DocumentViews.splice(index, 1);

        this.LinkedDocumentViews.slice().forEach(action((pair, i) => pair.a === view || pair.b === view ? this.LinkedDocumentViews.splice(i, 1) : null));
    }

    //gets all views
    public getDocumentViewsById(id: string) {
        const toReturn: DocumentView[] = [];
        DocumentManager.Instance.DocumentViews.map(view => {
            if (view.props.Document[Id] === id) {
                toReturn.push(view);
            }
        });
        if (toReturn.length === 0) {
            DocumentManager.Instance.DocumentViews.map(view => {
                const doc = view.props.Document.proto;
                if (doc && doc[Id] && doc[Id] === id) {
                    toReturn.push(view);
                }
            });
        }
        return toReturn;
    }

    public getAllDocumentViews(doc: Doc) {
        return this.getDocumentViewsById(doc[Id]);
    }

    public getDocumentViewById(id: string, preferredCollection?: CollectionView): DocumentView | undefined {
        if (!id) return undefined;
        let toReturn: DocumentView | undefined;
        const passes = preferredCollection ? [preferredCollection, undefined] : [undefined];

        for (const pass of passes) {
            DocumentManager.Instance.DocumentViews.map(view => {
                if (view.props.Document[Id] === id && (!pass || view.props.ContainingCollectionView === preferredCollection)) {
                    toReturn = view;
                    return;
                }
            });
            if (!toReturn) {
                DocumentManager.Instance.DocumentViews.map(view => {
                    const doc = view.props.Document.proto;
                    if (doc && doc[Id] === id && (!pass || view.props.ContainingCollectionView === preferredCollection)) {
                        toReturn = view;
                    }
                });
            } else {
                break;
            }
        }

        return toReturn;
    }

    public getDocumentView(toFind: Doc, preferredCollection?: CollectionView): DocumentView | undefined {
        return this.getDocumentViewById(toFind[Id], preferredCollection);
    }

    public getFirstDocumentView = (toFind: Doc, originatingDoc: Opt<Doc> = undefined): DocumentView | undefined => {
        const views = this.getDocumentViews(toFind).filter(view => view.props.Document !== originatingDoc);
        return views?.find(view => view.props.focus !== returnFalse) || (views.length ? views[0] : undefined);
    }
    public getDocumentViews(toFind: Doc): DocumentView[] {
        const toReturn: DocumentView[] = [];
        const docViews = DocumentManager.Instance.DocumentViews;

        // heuristic to return the "best" documents first:
        //   choose an exact match over an alias match
        //   choose documents that have a PanelWidth() over those that don't (the treeview documents have no panelWidth)
        docViews.map(view => view.props.PanelWidth() > 1 && view.props.Document === toFind && toReturn.push(view));
        docViews.map(view => view.props.PanelWidth() <= 1 && view.props.Document === toFind && toReturn.push(view));
        docViews.map(view => view.props.PanelWidth() > 1 && view.props.Document !== toFind && Doc.AreProtosEqual(view.props.Document, toFind) && toReturn.push(view));
        docViews.map(view => view.props.PanelWidth() <= 1 && view.props.Document !== toFind && Doc.AreProtosEqual(view.props.Document, toFind) && toReturn.push(view));

        return toReturn;
    }


    static addRightSplit = (doc: Doc, finished?: () => void) => {
        CollectionDockingView.AddSplit(doc, "right");
        finished?.();
    }
    public jumpToDocument = async (
        targetDoc: Doc,        // document to display
        willZoom: boolean,     // whether to zoom doc to take up most of screen
        createViewFunc = DocumentManager.addRightSplit, // how to create a view of the doc if it doesn't exist
        docContext?: Doc,  // context to load that should contain the target
        linkDoc?: Doc,   // link that's being followed
        closeContextIfNotFound: boolean = false, // after opening a context where the document should be, this determines whether the context should be closed if the Doc isn't actually there
        originatingDoc: Opt<Doc> = undefined, // doc that initiated the display of the target odoc
        finished?: () => void
    ): Promise<void> => {
        const getFirstDocView = DocumentManager.Instance.getFirstDocumentView;
        const focusAndFinish = () => { finished?.(); return false; };
        const highlight = () => {
            const finalDocView = getFirstDocView(targetDoc);
            if (finalDocView) {
                finalDocView.layoutDoc.scrollToLinkID = linkDoc?.[Id];
                Doc.linkFollowHighlight(finalDocView.props.Document);
            }
        };
        const docView = getFirstDocView(targetDoc, originatingDoc);
        let annotatedDoc = await Cast(targetDoc.annotationOn, Doc);
        if (annotatedDoc && annotatedDoc !== originatingDoc?.context && !targetDoc?.isPushpin) {
            const first = getFirstDocView(annotatedDoc);
            if (first) {
                annotatedDoc = first.props.Document;
                first.props.focus(annotatedDoc, false);
            }
        }
        if (docView) {  // we have a docView already and aren't forced to create a new one ... just focus on the document.  TODO move into view if necessary otherwise just highlight?
            const sameContext = annotatedDoc && annotatedDoc === originatingDoc?.context;
            if (originatingDoc?.isPushpin) {
                const hide = !docView.props.Document.hidden;
                docView.props.focus(docView.props.Document, willZoom, undefined, (notfocused: boolean) => { // bcz: Argh! TODO: Need to add a notFocused argument to the after finish callback function that indicates whether the window had to scroll to show the target  
                    if (notfocused || docView.props.Document.hidden) {
                        docView.props.Document.hidden = !docView.props.Document.hidden;
                    }
                    return focusAndFinish();
                    // @ts-ignore   bcz: Argh TODO: Need to add a parameter to focus() everywhere for whether focus should center the target's container in the view or not. // here we don't want to focus the container if the source and target are in the same container
                }, sameContext);
                //finished?.();
            }
            else {
                docView.select(false);
                docView.props.Document.hidden && (docView.props.Document.hidden = undefined);
                // @ts-ignore
                docView.props.focus(docView.props.Document, willZoom, undefined, focusAndFinish, sameContext);
            }
            highlight();
        } else {
            const contextDocs = docContext ? await DocListCastAsync(docContext.data) : undefined;
            const contextDoc = contextDocs?.find(doc => Doc.AreProtosEqual(doc, targetDoc)) ? docContext : undefined;
            const targetDocContext = annotatedDoc || contextDoc;

            if (!targetDocContext) { // we don't have a view and there's no context specified ... create a new view of the target using the dockFunc or default
                createViewFunc(Doc.BrushDoc(targetDoc), finished); // bcz: should we use this?: Doc.MakeAlias(targetDoc)));
                highlight();
            } else {  // otherwise try to get a view of the context of the target
                const targetDocContextView = getFirstDocView(targetDocContext);
                targetDocContext._scrollY = targetDocContext._scrollPreviewY = NumCast(targetDocContext._scrollTop, 0);  // this will force PDFs to activate and load their annotations / allow scrolling
                if (targetDocContextView) { // we found a context view and aren't forced to create a new one ... focus on the context first..
                    targetDocContext._viewTransition = "transform 500ms";
                    targetDocContextView.props.focus(targetDocContextView.props.Document, willZoom);

                    // now find the target document within the context
                    if (targetDoc.displayTimecode) {  // if the target has a timecode, it should show up once the (presumed) video context scrubs to the display timecode;
                        targetDocContext._currentTimecode = targetDoc.displayTimecode;
                        finished?.();
                    } else { // no timecode means we need to find the context view and focus on our target
                        const findView = (delay: number) => {
                            const retryDocView = getFirstDocView(targetDoc);  // test again for the target view snce we presumably created the context above by focusing on it
                            if (retryDocView) {   // we found the target in the context
                                retryDocView.props.focus(targetDoc, willZoom, undefined, focusAndFinish); // focus on the target in the context
                                highlight();
                            } else if (delay > 1500) {
                                // we didn't find the target, so it must have moved out of the context.  Go back to just creating it.
                                if (closeContextIfNotFound) targetDocContextView.props.removeDocument?.(targetDocContextView.props.Document);
                                if (targetDoc.layout) {
                                    Doc.SetInPlace(targetDoc, "annotationOn", undefined, false);
                                    createViewFunc(Doc.BrushDoc(targetDoc), finished); //  create a new view of the target
                                }
                            } else {
                                setTimeout(() => findView(delay + 250), 250);
                            }
                        };
                        findView(0);
                    }
                } else {  // there's no context view so we need to create one first and try again when that finishes
                    createViewFunc(targetDocContext, // after creating the context, this calls the finish function that will retry looking for the target
                        () => this.jumpToDocument(targetDoc, willZoom, createViewFunc, docContext, linkDoc, true /* if we don't find the target, we want to get rid of the context just created */, undefined, finished));
                }
            }
        }
    }

    public async FollowLink(link: Opt<Doc>, doc: Doc, createViewFunc: CreateViewFunc, zoom = false, currentContext?: Doc, finished?: () => void, traverseBacklink?: boolean) {
        LinkDocPreview.TargetDoc = undefined;
        FormattedTextBoxComment.linkDoc = undefined;
        const linkDocs = link ? [link] : DocListCast(doc.links);
        const firstDocs = linkDocs.filter(linkDoc => Doc.AreProtosEqual(linkDoc.anchor1 as Doc, doc) || Doc.AreProtosEqual((linkDoc.anchor1 as Doc).annotationOn as Doc, doc)); // link docs where 'doc' is anchor1
        const secondDocs = linkDocs.filter(linkDoc => Doc.AreProtosEqual(linkDoc.anchor2 as Doc, doc) || Doc.AreProtosEqual((linkDoc.anchor2 as Doc).annotationOn as Doc, doc)); // link docs where 'doc' is anchor2
        const fwdLinkWithoutTargetView = firstDocs.find(d => DocumentManager.Instance.getDocumentViews(d.anchor2 as Doc).length === 0);
        const backLinkWithoutTargetView = secondDocs.find(d => DocumentManager.Instance.getDocumentViews(d.anchor1 as Doc).length === 0);
        const linkWithoutTargetDoc = traverseBacklink === undefined ? fwdLinkWithoutTargetView || backLinkWithoutTargetView : traverseBacklink ? backLinkWithoutTargetView : fwdLinkWithoutTargetView;
        const linkDocList = linkWithoutTargetDoc ? [linkWithoutTargetDoc] : (traverseBacklink === undefined ? firstDocs.concat(secondDocs) : traverseBacklink ? secondDocs : firstDocs);
        const followLinks = linkDocList.length ? (doc.isPushpin ? linkDocList : [linkDocList[0]]) : [];
        followLinks.forEach(async linkDoc => {
            if (linkDoc) {
                const target = (doc === linkDoc.anchor1 ? linkDoc.anchor2 : doc === linkDoc.anchor2 ? linkDoc.anchor1 :
                    (Doc.AreProtosEqual(doc, linkDoc.anchor1 as Doc) || Doc.AreProtosEqual((linkDoc.anchor1 as Doc).annotationOn as Doc, doc) ? linkDoc.anchor2 : linkDoc.anchor1)) as Doc;
                const targetTimecode = (doc === linkDoc.anchor1 ? Cast(linkDoc.anchor2_timecode, "number") :
                    doc === linkDoc.anchor2 ? Cast(linkDoc.anchor1_timecode, "number") :
                        (Doc.AreProtosEqual(doc, linkDoc.anchor1 as Doc) || Doc.AreProtosEqual((linkDoc.anchor1 as Doc).annotationOn as Doc, doc) ? Cast(linkDoc.anchor2_timecode, "number") : Cast(linkDoc.anchor1_timecode, "number")));
                if (target) {
                    const containerDoc = (await Cast(target.annotationOn, Doc)) || target;
                    containerDoc._currentTimecode = targetTimecode;
                    const targetContext = await target?.context as Doc;
                    const targetNavContext = !Doc.AreProtosEqual(targetContext, currentContext) ? targetContext : undefined;
                    DocumentManager.Instance.jumpToDocument(target, zoom, (doc, finished) => createViewFunc(doc, StrCast(linkDoc.followLinkLocation, "add:right"), finished), targetNavContext, linkDoc, undefined, doc, finished);
                } else {
                    finished?.();
                }
            } else {
                finished?.();
            }
        });
    }
}
Scripting.addGlobal(function DocFocus(doc: any) { DocumentManager.Instance.getDocumentViews(Doc.GetProto(doc)).map(view => view.props.focus(doc, true)); });