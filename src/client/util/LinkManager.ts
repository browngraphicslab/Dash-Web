import { runInAction } from "mobx";
import { computedFn } from "mobx-utils";
import { Doc, DocListCast, Opt } from "../../fields/Doc";
import { BoolCast, Cast, StrCast } from "../../fields/Types";
import { LightboxView } from "../views/LightboxView";
import { DocumentViewSharedProps } from "../views/nodes/DocumentView";
import { FormattedTextBoxComment } from "../views/nodes/formattedText/FormattedTextBoxComment";
import { LinkDocPreview } from "../views/nodes/LinkDocPreview";
import { CreateViewFunc, DocumentManager } from "./DocumentManager";
import { SharingManager } from "./SharingManager";
import { UndoManager } from "./UndoManager";

/* 
 * link doc: 
 * - anchor1: doc
 * - anchor1page: number
 * - anchor1groups: list of group docs representing the groups anchor1 categorizes this link/anchor2 in 
 * - anchor2: doc
 * - anchor2page: number
 * - anchor2groups: list of group docs representing the groups anchor2 categorizes this link/anchor1 in 
 * 
 * group doc:
 * - type: string representing the group type/name/category
 * - metadata: doc representing the metadata kvps
 * 
 * metadata doc:
 * - user defined kvps 
 */
export class LinkManager {

    private static _instance: LinkManager;
    public static currentLink: Opt<Doc>;
    public static get Instance(): LinkManager { return this._instance || (this._instance = new this()); }

    public addLink(linkDoc: Doc) { return Doc.AddDocToList(Doc.LinkDBDoc(), "data", linkDoc); }
    public deleteLink(linkDoc: Doc) { return Doc.RemoveDocFromList(Doc.LinkDBDoc(), "data", linkDoc); }
    public deleteAllLinksOnAnchor(anchor: Doc) { LinkManager.Instance.relatedLinker(anchor).forEach(linkDoc => LinkManager.Instance.deleteLink(linkDoc)); }

    public getAllRelatedLinks(anchor: Doc) { return this.relatedLinker(anchor); } // finds all links that contain the given anchor
    public getAllDirectLinks(anchor: Doc): Doc[] { return this.directLinker(anchor); }  // finds all links that contain the given anchor
    public getAllLinks(): Doc[] { return this.allLinks(); }

    allLinks = computedFn(function allLinks(this: any): Doc[] {
        const linkData = Doc.LinkDBDoc().data;
        const lset = new Set<Doc>(DocListCast(linkData));
        SharingManager.Instance.users.forEach(user => DocListCast(user.linkDatabase?.data).forEach(doc => lset.add(doc)));
        return Array.from(lset);
    }, true);

    directLinker = computedFn(function directLinker(this: any, anchor: Doc): Doc[] {
        return LinkManager.Instance.allLinks().filter(link => {
            const a1 = Cast(link?.anchor1, Doc, null);
            const a2 = Cast(link?.anchor2, Doc, null);
            return link && ((a1?.author !== undefined && a2?.author !== undefined) || link.author === Doc.CurrentUserEmail) && (Doc.AreProtosEqual(anchor, a1) || Doc.AreProtosEqual(anchor, a2) || Doc.AreProtosEqual(link, anchor));
        });
    }, true);

    relatedLinker = computedFn(function relatedLinker(this: any, anchor: Doc): Doc[] {
        const lfield = Doc.LayoutFieldKey(anchor);
        return DocListCast(anchor[lfield + "-annotations"]).concat(DocListCast(anchor[lfield + "-annotations-timeline"])).reduce((list, anno) =>
            [...list, ...LinkManager.Instance.relatedLinker(anno)],
            LinkManager.Instance.directLinker(anchor).slice());
    }, true);

    // returns map of group type to anchor's links in that group type
    public getRelatedGroupedLinks(anchor: Doc): Map<string, Array<Doc>> {
        const anchorGroups = new Map<string, Array<Doc>>();
        this.relatedLinker(anchor).forEach(link => {
            if (!link.linkRelationship || link?.linkRelationship !== "-ungrouped-") {
                const group = anchorGroups.get(StrCast(link.linkRelationship));
                anchorGroups.set(StrCast(link.linkRelationship), group ? [...group, link] : [link]);
            } else {
                // if link is in no groups then put it in default group
                const group = anchorGroups.get("*");
                anchorGroups.set("*", group ? [...group, link] : [link]);
            }
        });
        return anchorGroups;
    }

    // checks if a link with the given anchors exists
    public doesLinkExist(anchor1: Doc, anchor2: Doc): boolean {
        return -1 !== LinkManager.Instance.allLinks().findIndex(linkDoc =>
            (Doc.AreProtosEqual(Cast(linkDoc.anchor1, Doc, null), anchor1) && Doc.AreProtosEqual(Cast(linkDoc.anchor2, Doc, null), anchor2)) ||
            (Doc.AreProtosEqual(Cast(linkDoc.anchor1, Doc, null), anchor2) && Doc.AreProtosEqual(Cast(linkDoc.anchor2, Doc, null), anchor1)));
    }

    // finds the opposite anchor of a given anchor in a link
    //TODO This should probably return undefined if there isn't an opposite anchor
    //TODO This should also await the return value of the anchor so we don't filter out promises
    public static getOppositeAnchor(linkDoc: Doc, anchor: Doc): Doc | undefined {
        const a1 = Cast(linkDoc.anchor1, Doc, null);
        const a2 = Cast(linkDoc.anchor2, Doc, null);
        if (Doc.AreProtosEqual(anchor, a1)) return a2;
        if (Doc.AreProtosEqual(anchor, a2)) return a1;
        if (Doc.AreProtosEqual(anchor, a1.annotationOn as Doc)) return a2;
        if (Doc.AreProtosEqual(anchor, a2.annotationOn as Doc)) return a1;
        if (Doc.AreProtosEqual(anchor, linkDoc)) return linkDoc;
    }


    // follows a link - if the target is on screen, it highlights/pans to it.
    // if the target isn't onscreen, then it will open up the target in a tab, on the right, or in place
    // depending on the followLinkLocation property of the source (or the link itself as a fallback);
    public static FollowLink = (linkDoc: Opt<Doc>, sourceDoc: Doc, docViewProps: DocumentViewSharedProps, altKey: boolean) => {
        const batch = UndoManager.StartBatch("follow link click");
        // open up target if it's not already in view ...
        const createViewFunc = (doc: Doc, followLoc: string, finished: Opt<() => void>) => {
            const targetFocusAfterDocFocus = () => {
                const where = StrCast(sourceDoc.followLinkLocation) || followLoc;
                const hackToCallFinishAfterFocus = () => {
                    finished && setTimeout(finished, 0); // finished() needs to be called right after hackToCallFinishAfterFocus(), but there's no callback for that so we use the hacky timeout.
                    return false; // we must return false here so that the zoom to the document is not reversed.  If it weren't for needing to call finished(), we wouldn't need this function at all since not having it is equivalent to returning false
                };
                const addTab = docViewProps.addDocTab(doc, where);
                addTab && setTimeout(() => {
                    const targDocView = DocumentManager.Instance.getFirstDocumentView(doc);
                    targDocView?.props.focus(doc, BoolCast(sourceDoc.followLinkZoom, false), undefined, hackToCallFinishAfterFocus);
                }); //  add the target and focus on it.
                return where !== "inPlace" || addTab; // return true to reset the initial focus&zoom (return false for 'inPlace' since resetting the initial focus&zoom will negate the zoom into the target)
            };
            if (!sourceDoc.followLinkZoom) {
                targetFocusAfterDocFocus();
            } else {
                // first focus & zoom onto this (the clicked document).  Then execute the function to focus on the target
                docViewProps.focus(sourceDoc, BoolCast(sourceDoc.followLinkZoom, true), 1, targetFocusAfterDocFocus);
            }
        };
        LinkManager.traverseLink(linkDoc, sourceDoc, createViewFunc, BoolCast(sourceDoc.followLinkZoom, false), docViewProps.ContainingCollectionDoc, batch.end, altKey ? true : undefined);
    }
    public static traverseLink(link: Opt<Doc>, doc: Doc, createViewFunc: CreateViewFunc, zoom = false, currentContext?: Doc, finished?: () => void, traverseBacklink?: boolean) {
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
                    if (LightboxView.LightboxDoc && !DocumentManager.Instance.getLightboxDocumentView(doc)) {
                        //doc.annotationOn !== LightboxView.LightboxDoc) { // following a link should replace an existing lightboxDoc unless the target is an annotation on the lightbox document
                        runInAction(() => LightboxView.LightboxDoc = (target.annotationOn as Doc) ?? target);
                        finished?.();
                    } else {
                        const containerDoc = Cast(target.annotationOn, Doc, null) || target;
                        targetTimecode !== undefined && (containerDoc._currentTimecode = targetTimecode);
                        const targetContext = Cast(containerDoc?.context, Doc, null);
                        const targetNavContext = !Doc.AreProtosEqual(targetContext, currentContext) ? targetContext : undefined;
                        DocumentManager.Instance.jumpToDocument(target, zoom, (doc, finished) => createViewFunc(doc, StrCast(linkDoc.followLinkLocation, "add:right"), finished), targetNavContext, linkDoc, undefined, doc, finished);
                    }
                } else {
                    finished?.();
                }
            } else {
                finished?.();
            }
        });
    }

}