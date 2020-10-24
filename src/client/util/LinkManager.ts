import { Doc, DocListCast, Opt } from "../../fields/Doc";
import { Cast, StrCast } from "../../fields/Types";
import { SharingManager } from "./SharingManager";
import { computedFn } from "mobx-utils";

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

    public deleteAllLinksOnAnchor(anchor: Doc) { LinkManager.Instance.getAllRelatedLinks(anchor).forEach(linkDoc => LinkManager.Instance.deleteLink(linkDoc)); }

    public getAllRelatedLinks(anchor: Doc) { return this.relatedLinker(anchor); } // finds all links that contain the given anchor

    public getAllDirectLinks(anchor: Doc): Doc[] { return this.directLinker(anchor); }  // finds all links that contain the given anchor

    public getAllLinks(): Doc[] { return this.allLinks(); }

    allLinks = computedFn(function allLinks(this: any) {
        const lset = new Set<Doc>(DocListCast(Doc.LinkDBDoc().data));
        SharingManager.Instance.users.forEach(user => DocListCast(user.linkDatabase?.data).map(doc => lset.add(doc)));
        return Array.from(lset);
    }, true);

    directLinker = computedFn(function directLinker(this: any, anchor: Doc) {
        return LinkManager.Instance.getAllLinks().filter(link => {
            const a1 = Cast(link?.anchor1, Doc, null);
            const a2 = Cast(link?.anchor2, Doc, null);
            return link && ((a1?.author !== undefined && a2?.author !== undefined) || link.author === Doc.CurrentUserEmail) && (Doc.AreProtosEqual(anchor, a1) || Doc.AreProtosEqual(anchor, a2) || Doc.AreProtosEqual(link, anchor));
        });
    }, true);

    relatedLinker = computedFn(function relatedLinker(this: any, anchor: Doc) {
        const related = LinkManager.Instance.directLinker(anchor);
        DocListCast(anchor[Doc.LayoutFieldKey(anchor) + "-annotations"]).map(anno => related.push(...LinkManager.Instance.getAllRelatedLinks(anno)));
        return related;
    }, true);

    // returns map of group type to anchor's links in that group type
    public getRelatedGroupedLinks(anchor: Doc): Map<string, Array<Doc>> {
        const anchorGroups = new Map<string, Array<Doc>>();
        this.getAllRelatedLinks(anchor).forEach(link => {
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

    // returns a list of all metadata docs associated with the given group type
    public getAllMetadataDocsInGroup(groupType: string): Array<Doc> {
        const md: Doc[] = [];
        LinkManager.Instance.getAllLinks().forEach(linkDoc => StrCast(linkDoc.linkRelationship).toUpperCase() === groupType.toUpperCase() && md.push(linkDoc));
        return md;
    }

    // checks if a link with the given anchors exists
    public doesLinkExist(anchor1: Doc, anchor2: Doc): boolean {
        return -1 !== LinkManager.Instance.getAllLinks().findIndex(linkDoc =>
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
}