import { computedFn } from "mobx-utils";
import { Doc, DocListCast, Opt, DirectLinksSym, Field } from "../../fields/Doc";
import { BoolCast, Cast, StrCast, PromiseValue } from "../../fields/Types";
import { LightboxView } from "../views/LightboxView";
import { DocumentViewSharedProps, ViewAdjustment } from "../views/nodes/DocumentView";
import { DocumentManager } from "./DocumentManager";
import { SharingManager } from "./SharingManager";
import { UndoManager } from "./UndoManager";
import { observe, observable, reaction } from "mobx";
import { listSpec } from "../../fields/Schema";
import { List } from "../../fields/List";
import { ProxyField } from "../../fields/Proxy";

type CreateViewFunc = (doc: Doc, followLinkLocation: string, finished?: () => void) => void;
/* 
 * link doc: 
 * - anchor1: doc 
 * - anchor2: doc
 * 
 * group doc:
 * - type: string representing the group type/name/category
 * - metadata: doc representing the metadata kvps
 * 
 * metadata doc:
 * - user defined kvps 
 */
export class LinkManager {

    @observable static _instance: LinkManager;
    @observable static userDocs: Doc[] = [];
    public static currentLink: Opt<Doc>;
    public static get Instance() { return LinkManager._instance; }
    constructor() {
        LinkManager._instance = this;
        setTimeout(() => {
            LinkManager.userDocs = [Doc.LinkDBDoc().data as Doc, ...SharingManager.Instance.users.map(user => user.linkDatabase as Doc)];
            const addLinkToDoc = (link: Doc): any => {
                const a1 = link?.anchor1;
                const a2 = link?.anchor2;
                if (a1 instanceof Promise || a2 instanceof Promise) return PromiseValue(a1).then(a1 => PromiseValue(a2).then(a2 => addLinkToDoc(link)));
                if (a1 instanceof Doc && a2 instanceof Doc && ((a1.author !== undefined && a2.author !== undefined) || link.author === Doc.CurrentUserEmail)) {
                    Doc.GetProto(a1)[DirectLinksSym].add(link);
                    Doc.GetProto(a2)[DirectLinksSym].add(link);
                    Doc.GetProto(link)[DirectLinksSym].add(link);
                }
            }
            const remLinkFromDoc = (link: Doc): any => {
                const a1 = link?.anchor1;
                const a2 = link?.anchor2;
                if (a1 instanceof Promise || a2 instanceof Promise) return PromiseValue(a1).then(a1 => PromiseValue(a2).then(a2 => remLinkFromDoc(link)));
                if (a1 instanceof Doc && a2 instanceof Doc && ((a1.author !== undefined && a2.author !== undefined) || link.author === Doc.CurrentUserEmail)) {
                    Doc.GetProto(a1)[DirectLinksSym].delete(link);
                    Doc.GetProto(a2)[DirectLinksSym].delete(link);
                    Doc.GetProto(link)[DirectLinksSym].delete(link);
                }
            }
            const watchUserLinks = (userLinks: List<Doc>) => {
                const toRealField = (field: Field) => field instanceof ProxyField ? field.value() : field;  // see List.ts.  data structure is not a simple list of Docs, but a list of ProxyField/Fields
                observe(userLinks, change => {
                    switch (change.type) {
                        case "splice":
                            (change as any).added.forEach((link: any) => addLinkToDoc(toRealField(link)));
                            (change as any).removed.forEach((link: any) => remLinkFromDoc(toRealField(link)));
                            break;
                        case "update": let oldValue = change.oldValue;
                    }
                }, true);
            }
            observe(LinkManager.userDocs, change => {
                switch (change.type) {
                    case "splice": (change as any).added.forEach(watchUserLinks); break;
                    case "update": let oldValue = change.oldValue;
                }
            }, true);
        });
    }

    public addLink(linkDoc: Doc) {
        return Doc.AddDocToList(Doc.LinkDBDoc(), "data", linkDoc);
    }
    public deleteLink(linkDoc: Doc) { return Doc.RemoveDocFromList(Doc.LinkDBDoc(), "data", linkDoc); }
    public deleteAllLinksOnAnchor(anchor: Doc) { LinkManager.Instance.relatedLinker(anchor).forEach(linkDoc => LinkManager.Instance.deleteLink(linkDoc)); }

    public getAllRelatedLinks(anchor: Doc) { return this.relatedLinker(anchor); } // finds all links that contain the given anchor
    public getAllDirectLinks(anchor: Doc): Doc[] { return Array.from(Doc.GetProto(anchor)[DirectLinksSym]); } // finds all links that contain the given anchor
    public getAllLinks(): Doc[] { return []; }//this.allLinks(); }

    // allLinks = computedFn(function allLinks(this: any): Doc[] {
    //     const linkData = Doc.LinkDBDoc().data;
    //     const lset = new Set<Doc>(DocListCast(linkData));
    //     SharingManager.Instance.users.forEach(user => DocListCast(user.linkDatabase?.data).forEach(doc => lset.add(doc)));
    //     LinkManager.Instance.allLinks().filter(link => {
    //         const a1 = Cast(link?.anchor1, Doc, null);
    //         const a2 = Cast(link?.anchor2, Doc, null);
    //         return link && ((a1?.author !== undefined && a2?.author !== undefined) || link.author === Doc.CurrentUserEmail) && (Doc.AreProtosEqual(anchor, a1) || Doc.AreProtosEqual(anchor, a2) || Doc.AreProtosEqual(link, anchor));
    //     });
    //     return Array.from(lset);
    // }, true);

    relatedLinker = computedFn(function relatedLinker(this: any, anchor: Doc): Doc[] {
        const lfield = Doc.LayoutFieldKey(anchor);
        return DocListCast(anchor[lfield + "-annotations"]).concat(DocListCast(anchor[lfield + "-annotations-timeline"])).reduce((list, anno) =>
            [...list, ...LinkManager.Instance.relatedLinker(anno)],
            Array.from(Doc.GetProto(anchor)[DirectLinksSym]).slice());// LinkManager.Instance.directLinker(anchor).slice());
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
    // if the target isn't onscreen, then it will open up the target in the lightbox, or in place
    // depending on the followLinkLocation property of the source (or the link itself as a fallback);
    public static FollowLink = (linkDoc: Opt<Doc>, sourceDoc: Doc, docViewProps: DocumentViewSharedProps, altKey: boolean, zoom: boolean = false) => {
        const batch = UndoManager.StartBatch("follow link click");
        // open up target if it's not already in view ...
        const createViewFunc = (doc: Doc, followLoc: string, finished?: Opt<() => void>) => {
            const createTabForTarget = (didFocus: boolean) => new Promise<ViewAdjustment>(res => {
                const where = LightboxView.LightboxDoc ? "lightbox" : StrCast(sourceDoc.followLinkLocation, followLoc);
                docViewProps.addDocTab(doc, where);
                setTimeout(() => {
                    const targDocView = DocumentManager.Instance.getFirstDocumentView(doc);
                    if (targDocView) {
                        targDocView.props.focus(doc, {
                            willZoom: BoolCast(sourceDoc.followLinkZoom, false),
                            afterFocus: (didFocus: boolean) => {
                                finished?.();
                                res(ViewAdjustment.resetView);
                                return new Promise<ViewAdjustment>(res2 => res2());
                            }
                        });
                    } else {
                        res(where !== "inPlace" ? ViewAdjustment.resetView : ViewAdjustment.doNothing); // for 'inPlace'  resetting the initial focus&zoom would negate the zoom into the target 
                    }
                });
            });

            if (!sourceDoc.followLinkZoom) {
                createTabForTarget(false);
            } else {
                // first focus & zoom onto this (the clicked document).  Then execute the function to focus on the target
                docViewProps.focus(sourceDoc, { willZoom: BoolCast(sourceDoc.followLinkZoom, true), scale: 1, afterFocus: createTabForTarget });
            }
        };
        LinkManager.traverseLink(linkDoc, sourceDoc, createViewFunc, BoolCast(sourceDoc.followLinkZoom, zoom), docViewProps.ContainingCollectionDoc, batch.end, altKey ? true : undefined);
    }

    public static traverseLink(link: Opt<Doc>, sourceDoc: Doc, createViewFunc: CreateViewFunc, zoom = false, currentContext?: Doc, finished?: () => void, traverseBacklink?: boolean) {
        const linkDocs = link ? [link] : DocListCast(sourceDoc.links);
        const firstDocs = linkDocs.filter(linkDoc => Doc.AreProtosEqual(linkDoc.anchor1 as Doc, sourceDoc) || Doc.AreProtosEqual((linkDoc.anchor1 as Doc).annotationOn as Doc, sourceDoc)); // link docs where 'doc' is anchor1
        const secondDocs = linkDocs.filter(linkDoc => Doc.AreProtosEqual(linkDoc.anchor2 as Doc, sourceDoc) || Doc.AreProtosEqual((linkDoc.anchor2 as Doc).annotationOn as Doc, sourceDoc)); // link docs where 'doc' is anchor2
        const fwdLinkWithoutTargetView = firstDocs.find(d => DocumentManager.Instance.getDocumentViews(d.anchor2 as Doc).length === 0);
        const backLinkWithoutTargetView = secondDocs.find(d => DocumentManager.Instance.getDocumentViews(d.anchor1 as Doc).length === 0);
        const linkWithoutTargetDoc = traverseBacklink === undefined ? fwdLinkWithoutTargetView || backLinkWithoutTargetView : traverseBacklink ? backLinkWithoutTargetView : fwdLinkWithoutTargetView;
        const linkDocList = linkWithoutTargetDoc ? [linkWithoutTargetDoc] : (traverseBacklink === undefined ? firstDocs.concat(secondDocs) : traverseBacklink ? secondDocs : firstDocs);
        const followLinks = linkDocList.length ? (sourceDoc.isPushpin ? linkDocList : [linkDocList[0]]) : [];
        followLinks.forEach(async linkDoc => {
            if (linkDoc) {
                const target = (sourceDoc === linkDoc.anchor1 ? linkDoc.anchor2 : sourceDoc === linkDoc.anchor2 ? linkDoc.anchor1 :
                    (Doc.AreProtosEqual(sourceDoc, linkDoc.anchor1 as Doc) || Doc.AreProtosEqual((linkDoc.anchor1 as Doc).annotationOn as Doc, sourceDoc) ? linkDoc.anchor2 : linkDoc.anchor1)) as Doc;
                if (target) {
                    if (target.TourMap) {
                        const fieldKey = Doc.LayoutFieldKey(target);
                        const tour = DocListCast(target[fieldKey]).reverse();
                        LightboxView.SetLightboxDoc(currentContext, undefined, tour);
                        setTimeout(LightboxView.Next);
                        finished?.();
                    } else {
                        const containerDoc = Cast(target.annotationOn, Doc, null) || target;
                        const targetContext = Cast(containerDoc?.context, Doc, null);
                        const targetNavContext = !Doc.AreProtosEqual(targetContext, currentContext) ? targetContext : undefined;
                        DocumentManager.Instance.jumpToDocument(target, zoom, (doc, finished) => createViewFunc(doc, StrCast(linkDoc.followLinkLocation, "lightbox"), finished), targetNavContext, linkDoc, undefined, sourceDoc, finished);
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