import { action, observable, runInAction } from 'mobx';
import { Doc, DocListCast, DocListCastAsync, Opt } from '../../fields/Doc';
import { Id } from '../../fields/FieldSymbols';
import { Cast, NumCast, StrCast } from '../../fields/Types';
import { returnFalse } from '../../Utils';
import { DocumentType } from '../documents/DocumentTypes';
import { CollectionDockingView } from '../views/collections/CollectionDockingView';
import { CollectionView } from '../views/collections/CollectionView';
import { LightboxView } from '../views/LightboxView';
import { DocumentView } from '../views/nodes/DocumentView';
import { Scripting } from './Scripting';

export type CreateViewFunc = (doc: Doc, followLinkLocation: string, finished?: () => void) => void;

export class DocumentManager {

    //global holds all of the nodes (regardless of which collection they're in)
    @observable public DocumentViews: DocumentView[] = [];
    @observable public LinkedDocumentViews: { a: DocumentView, b: DocumentView, l: Doc }[] = [];

    private static _instance: DocumentManager;
    public static get Instance(): DocumentManager { return this._instance || (this._instance = new this()); }

    //private constructor so no other class can create a nodemanager
    private constructor() { }

    @action
    public AddView = (view: DocumentView) => {
        DocListCast(view.rootDoc.links).forEach(link => {
            const whichOtherAnchor = view.props.LayoutTemplateString?.includes("anchor2") ? "anchor1" : "anchor2";
            const otherDoc = link && (link[whichOtherAnchor] as Doc);
            const otherDocAnno = otherDoc?.type === DocumentType.TEXTANCHOR ? otherDoc.annotationOn as Doc : undefined;
            otherDoc && DocumentManager.Instance.DocumentViews.
                filter(dv => Doc.AreProtosEqual(dv.rootDoc, otherDoc) || Doc.AreProtosEqual(dv.rootDoc, otherDocAnno)).
                forEach(otherView => {
                    if (otherView.rootDoc.type !== DocumentType.LINK || otherView.props.LayoutTemplateString !== view.props.LayoutTemplateString) {
                        this.LinkedDocumentViews.push({ a: whichOtherAnchor === "anchor1" ? otherView : view, b: whichOtherAnchor === "anchor1" ? view : otherView, l: link });
                    }
                });
        });
        this.DocumentViews.push(view);
    }
    public RemoveView = action((view: DocumentView) => {
        const index = this.DocumentViews.indexOf(view);
        index !== -1 && this.DocumentViews.splice(index, 1);

        this.LinkedDocumentViews.slice().forEach(action((pair, i) => pair.a === view || pair.b === view ? this.LinkedDocumentViews.splice(i, 1) : null));
    });

    //gets all views
    public getDocumentViewsById(id: string) {
        const toReturn: DocumentView[] = [];
        DocumentManager.Instance.DocumentViews.map(view => {
            if (view.rootDoc[Id] === id) {
                toReturn.push(view);
            }
        });
        if (toReturn.length === 0) {
            DocumentManager.Instance.DocumentViews.map(view => {
                const doc = view.rootDoc.proto;
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
                if (view.rootDoc[Id] === id && (!pass || view.props.ContainingCollectionView === preferredCollection)) {
                    toReturn = view;
                    return;
                }
            });
            if (!toReturn) {
                DocumentManager.Instance.DocumentViews.map(view => {
                    const doc = view.rootDoc.proto;
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

    public getLightboxDocumentView = (toFind: Doc, originatingDoc: Opt<Doc> = undefined): DocumentView | undefined => {
        const docViews = DocumentManager.Instance.DocumentViews;
        const views: DocumentView[] = [];
        docViews.map(view => view.docViewPath.includes(LightboxView.LightboxDocView.current!) && view.rootDoc === toFind && views.push(view));
        return views?.find(view => view.ContentDiv?.getBoundingClientRect().width && view.props.focus !== returnFalse) || views?.find(view => view.props.focus !== returnFalse) || (views.length ? views[0] : undefined);
    }
    public getFirstDocumentView = (toFind: Doc, originatingDoc: Opt<Doc> = undefined): DocumentView | undefined => {
        const views = this.getDocumentViews(toFind).filter(view => view.rootDoc !== originatingDoc);
        return views?.find(view => view.ContentDiv?.getBoundingClientRect().width && view.props.focus !== returnFalse) || views?.find(view => view.props.focus !== returnFalse) || (views.length ? views[0] : undefined);
    }
    public getDocumentViews(toFind: Doc): DocumentView[] {
        const toReturn: DocumentView[] = [];
        const docViews = DocumentManager.Instance.DocumentViews.filter(view => !view.docViewPath.includes(LightboxView.LightboxDocView.current!));
        const lightboxViews = DocumentManager.Instance.DocumentViews.filter(view => view.docViewPath.includes(LightboxView.LightboxDocView.current!));

        // heuristic to return the "best" documents first:
        //   choose a document in the lightbox first
        //   choose an exact match over an alias match
        lightboxViews.map(view => view.rootDoc === toFind && toReturn.push(view));
        lightboxViews.map(view => view.rootDoc !== toFind && Doc.AreProtosEqual(view.rootDoc, toFind) && toReturn.push(view));
        docViews.map(view => view.rootDoc === toFind && toReturn.push(view));
        docViews.map(view => view.rootDoc !== toFind && Doc.AreProtosEqual(view.rootDoc, toFind) && toReturn.push(view));

        return toReturn;
    }


    static addView = (doc: Doc, finished?: () => void) => {
        CollectionDockingView.AddSplit(doc, "right");
        finished?.();
    }
    public jumpToDocument = async (
        targetDoc: Doc,        // document to display
        willZoom: boolean,     // whether to zoom doc to take up most of screen
        createViewFunc = DocumentManager.addView, // how to create a view of the doc if it doesn't exist
        docContext?: Doc,  // context to load that should contain the target
        linkDoc?: Doc,   // link that's being followed
        closeContextIfNotFound: boolean = false, // after opening a context where the document should be, this determines whether the context should be closed if the Doc isn't actually there
        originatingDoc: Opt<Doc> = undefined, // doc that initiated the display of the target odoc
        finished?: () => void,
    ): Promise<void> => {
        const getFirstDocView = (toFind: Doc, originatingDoc?: Doc) => {
            const docView = DocumentManager.Instance.getFirstDocumentView(toFind, originatingDoc);
            return (!LightboxView.LightboxDoc || docView?.docViewPath.includes(LightboxView.LightboxDocView.current!)) ? docView : undefined;
        };
        const focusAndFinish = () => { finished?.(); return false; };
        const highlight = () => {
            const finalDocView = getFirstDocView(targetDoc);
            if (finalDocView) {
                const parent = targetDoc?.annotationOn as Doc;
                if (parent) finalDocView.layoutDoc.scrollToAnchorID = targetDoc?.[Id];
                Doc.linkFollowHighlight(finalDocView.rootDoc);
            }
        };
        const docView = getFirstDocView(targetDoc, originatingDoc);
        let annotatedDoc = await Cast(targetDoc.annotationOn, Doc);
        if (annotatedDoc && annotatedDoc !== originatingDoc?.context && !targetDoc?.isPushpin) {
            const first = getFirstDocView(annotatedDoc);
            if (first) {
                annotatedDoc = first.rootDoc;
                first.focus(targetDoc, false);
            }
        }
        if (docView) {  // we have a docView already and aren't forced to create a new one ... just focus on the document.  TODO move into view if necessary otherwise just highlight?
            const sameContext = annotatedDoc && annotatedDoc === originatingDoc?.context;
            if (originatingDoc?.isPushpin) {
                docView.props.focus(docView.rootDoc, willZoom, undefined, (didFocus: boolean) => {
                    if (!didFocus || docView.rootDoc.hidden) {
                        docView.rootDoc.hidden = !docView.rootDoc.hidden;
                    }
                    return focusAndFinish();
                }, sameContext, false);// don't want to focus the container if the source and target are in the same container, so pass 'sameContext' for dontCenter parameter
                //finished?.();
            }
            else {
                docView.select(false);
                docView.rootDoc.hidden && (docView.rootDoc.hidden = undefined);
                // @ts-ignore
                docView.props.focus(docView.rootDoc, willZoom, undefined, focusAndFinish, sameContext, false);
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
                if (targetDocContextView) { // we found a context view and aren't forced to create a new one ... focus on the context first..
                    targetDocContext._viewTransition = "transform 500ms";
                    targetDocContextView.props.focus(targetDocContextView.rootDoc, willZoom);

                    // now find the target document within the context
                    if (targetDoc._timecodeToShow) {  // if the target has a timecode, it should show up once the (presumed) video context scrubs to the display timecode;
                        targetDocContext._currentTimecode = targetDoc.anchorTimecodeToShow;
                        finished?.();
                    } else { // no timecode means we need to find the context view and focus on our target
                        const findView = (delay: number) => {
                            const retryDocView = getFirstDocView(targetDoc);  // test again for the target view snce we presumably created the context above by focusing on it
                            if (retryDocView) {   // we found the target in the context
                                retryDocView.props.focus(targetDoc, willZoom, undefined, focusAndFinish); // focus on the target in the context
                                highlight();
                            } else if (delay > 1500) {
                                // we didn't find the target, so it must have moved out of the context.  Go back to just creating it.
                                if (closeContextIfNotFound) targetDocContextView.props.removeDocument?.(targetDocContextView.rootDoc);
                                if (targetDoc.layout) { // there will no layout for a TEXTANCHOR type document
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
                    const finishFunc = () => this.jumpToDocument(targetDoc, willZoom, createViewFunc, docContext, linkDoc, true /* if we don't find the target, we want to get rid of the context just created */, undefined, finished);
                    if (LightboxView.LightboxDoc) {
                        runInAction(() => LightboxView.LightboxDoc = annotatedDoc ? annotatedDoc : targetDoc);
                        setTimeout(() => finishFunc, 250);
                    } else {
                        createViewFunc(targetDocContext, // after creating the context, this calls the finish function that will retry looking for the target
                            finishFunc);
                    }
                }
            }
        }
    }

}
Scripting.addGlobal(function DocFocus(doc: any) { DocumentManager.Instance.getDocumentViews(Doc.GetProto(doc)).map(view => view.props.focus(doc, true)); });