import { Doc, DocListCast, Opt } from "../../fields/Doc";
import { List } from "../../fields/List";
import { listSpec } from "../../fields/Schema";
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

    public static get Instance(): LinkManager {
        return this._instance || (this._instance = new this());
    }

    private constructor() {
    }


    public getAllLinks(): Doc[] {
        const lset = new Set<Doc>(DocListCast(Doc.UserDoc().myLinkDatabase));
        SharingManager.Instance.users.forEach(user => DocListCast(user.sharingDoc.myLinkDatabase).map(lset.add));
        return Array.from(lset);
    }

    public addLink(linkDoc: Doc): boolean {
        return Doc.AddDocToList(Doc.UserDoc(), "myLinkDatabase", linkDoc);
    }

    public deleteLink(linkDoc: Doc): boolean {
        return Doc.RemoveDocFromList(Doc.UserDoc(), "myLinkDatabase", linkDoc);
    }

    // finds all links that contain the given anchor
    public getAllDirectLinks(anchor: Doc): Doc[] {
        const related = LinkManager.Instance.getAllLinks().filter(link => link).filter(link => {
            const a1 = Cast(link.anchor1, Doc, null);
            const a2 = Cast(link.anchor2, Doc, null);
            const protomatch1 = Doc.AreProtosEqual(anchor, a1);
            const protomatch2 = Doc.AreProtosEqual(anchor, a2);
            return ((a1?.author !== undefined && a2?.author !== undefined) || link.author === Doc.CurrentUserEmail) && (protomatch1 || protomatch2 || Doc.AreProtosEqual(link, anchor));
        });
        return related;
    }

    relatedLinker = computedFn(function realtedLinker(this: any, anchor: Doc) {
        const related = LinkManager.Instance.getAllDirectLinks(anchor);
        DocListCast(anchor[Doc.LayoutFieldKey(anchor) + "-annotations"]).map(anno => {
            related.push(...LinkManager.Instance.getAllRelatedLinks(anno));
        });
        return related;
    }.bind(this));

    // finds all links that contain the given anchor
    public getAllRelatedLinks(anchor: Doc): Doc[] {
        return this.relatedLinker(anchor);
    }

    public deleteAllLinksOnAnchor(anchor: Doc) {
        const related = LinkManager.Instance.getAllRelatedLinks(anchor);
        related.forEach(linkDoc => LinkManager.Instance.deleteLink(linkDoc));
    }

    // gets the groups associates with an anchor in a link
    public getAnchorGroups(linkDoc: Doc, anchor?: Doc): Array<Doc> {
        if (Doc.AreProtosEqual(anchor, Cast(linkDoc.anchor1, Doc, null))) {
            return DocListCast(linkDoc.anchor1Groups);
        } else {
            return DocListCast(linkDoc.anchor2Groups);
        }
    }
    public addGroupToAnchor(linkDoc: Doc, anchor: Doc, groupDoc: Doc, replace: boolean = false) {
        Doc.GetProto(linkDoc).linkRelationship = groupDoc.linkRelationship;
    }

    // removes group doc of given group type only from given anchor on given link
    public removeGroupFromAnchor(linkDoc: Doc, anchor: Doc, groupType: string) {
        Doc.GetProto(linkDoc).linkRelationship = "-ungrouped-";
    }

    // returns map of group type to anchor's links in that group type
    public getRelatedGroupedLinks(anchor: Doc): Map<string, Array<Doc>> {
        const related = this.getAllRelatedLinks(anchor);
        const anchorGroups = new Map<string, Array<Doc>>();
        related.forEach(link => {
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
        const allLinks = LinkManager.Instance.getAllLinks();
        allLinks.forEach(linkDoc => {
            if (StrCast(linkDoc.linkRelationship).toUpperCase() === groupType.toUpperCase()) { md.push(linkDoc); }
        });
        return md;
    }

    // checks if a link with the given anchors exists
    public doesLinkExist(anchor1: Doc, anchor2: Doc): boolean {
        const allLinks = LinkManager.Instance.getAllLinks();
        const index = allLinks.findIndex(linkDoc => {
            return (Doc.AreProtosEqual(Cast(linkDoc.anchor1, Doc, null), anchor1) && Doc.AreProtosEqual(Cast(linkDoc.anchor2, Doc, null), anchor2)) ||
                (Doc.AreProtosEqual(Cast(linkDoc.anchor1, Doc, null), anchor2) && Doc.AreProtosEqual(Cast(linkDoc.anchor2, Doc, null), anchor1));
        });
        return index !== -1;
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