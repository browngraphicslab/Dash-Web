import { Doc, DocListCast, Opt } from "../../fields/Doc";
import { List } from "../../fields/List";
import { listSpec } from "../../fields/Schema";
import { Cast, StrCast } from "../../fields/Types";
import { Scripting } from "./Scripting";

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

    // the linkmanagerdoc stores a list of docs representing all linkdocs in 'allLinks' and a list of strings representing all group types in 'allGroupTypes'
    // lists of strings representing the metadata keys for each group type is stored under a key that is the same as the group type 
    public get LinkManagerDoc(): Doc | undefined {
        return Doc.UserDoc().globalLinkDatabase as Doc;
    }

    public getAllLinks(): Doc[] {
        const ldoc = LinkManager.Instance.LinkManagerDoc;
        return ldoc ? DocListCast(ldoc.data) : [];
    }

    public addLink(linkDoc: Doc): boolean {
        if (LinkManager.Instance.LinkManagerDoc) {
            Doc.AddDocToList(LinkManager.Instance.LinkManagerDoc, "data", linkDoc);
            return true;
        }
        return false;
    }

    public deleteLink(linkDoc: Doc): boolean {
        if (LinkManager.Instance.LinkManagerDoc && linkDoc instanceof Doc) {
            Doc.RemoveDocFromList(LinkManager.Instance.LinkManagerDoc, "data", linkDoc);
            return true;
        }
        return false;
    }

    // finds all links that contain the given anchor
    public getAllRelatedLinks(anchor: Doc): Doc[] {
        const related = LinkManager.Instance.getAllLinks().filter(link => {
            const protomatch1 = Doc.AreProtosEqual(anchor, Cast(link.anchor1, Doc, null));
            const protomatch2 = Doc.AreProtosEqual(anchor, Cast(link.anchor2, Doc, null));
            return protomatch1 || protomatch2 || Doc.AreProtosEqual(link, anchor);
        });
        DocListCast(anchor[Doc.LayoutFieldKey(anchor) + "-annotations"]).map(anno => {
            related.push(...LinkManager.Instance.getAllRelatedLinks(anno));
        });
        return related;
    }

    public deleteAllLinksOnAnchor(anchor: Doc) {
        const related = LinkManager.Instance.getAllRelatedLinks(anchor);
        related.forEach(linkDoc => LinkManager.Instance.deleteLink(linkDoc));
    }

    public addGroupType(groupType: string): boolean {
        if (LinkManager.Instance.LinkManagerDoc) {
            LinkManager.Instance.LinkManagerDoc[groupType] = new List<string>([]);
            const groupTypes = LinkManager.Instance.getAllGroupTypes();
            groupTypes.push(groupType);
            LinkManager.Instance.LinkManagerDoc.allGroupTypes = new List<string>(groupTypes);
            return true;
        }
        return false;
    }

    // removes all group docs from all links with the given group type
    public deleteGroupType(groupType: string): boolean {
        if (LinkManager.Instance.LinkManagerDoc) {
            if (LinkManager.Instance.LinkManagerDoc[groupType]) {
                const groupTypes = LinkManager.Instance.getAllGroupTypes();
                const index = groupTypes.findIndex(type => type.toUpperCase() === groupType.toUpperCase());
                if (index > -1) groupTypes.splice(index, 1);
                LinkManager.Instance.LinkManagerDoc.allGroupTypes = new List<string>(groupTypes);
                LinkManager.Instance.LinkManagerDoc[groupType] = undefined;
                LinkManager.Instance.getAllLinks().forEach(async linkDoc => {
                    const anchor1 = await Cast(linkDoc.anchor1, Doc);
                    const anchor2 = await Cast(linkDoc.anchor2, Doc);
                    anchor1 && LinkManager.Instance.removeGroupFromAnchor(linkDoc, anchor1, groupType);
                    anchor2 && LinkManager.Instance.removeGroupFromAnchor(linkDoc, anchor2, groupType);
                });
            }
            return true;
        } else return false;
    }

    public getAllGroupTypes(): string[] {
        if (LinkManager.Instance.LinkManagerDoc) {
            if (LinkManager.Instance.LinkManagerDoc.allGroupTypes) {
                return Cast(LinkManager.Instance.LinkManagerDoc.allGroupTypes, listSpec("string"), []);
            } else {
                LinkManager.Instance.LinkManagerDoc.allGroupTypes = new List<string>([]);
                return [];
            }
        }
        return [];
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

    // gets a list of strings representing the keys of the metadata associated with the given group type
    public getMetadataKeysInGroup(groupType: string): string[] {
        if (LinkManager.Instance.LinkManagerDoc) {
            return LinkManager.Instance.LinkManagerDoc[groupType] ? Cast(LinkManager.Instance.LinkManagerDoc[groupType], listSpec("string"), []) : [];
        }
        return [];
    }

    public setMetadataKeysForGroup(groupType: string, keys: string[]): boolean {
        if (LinkManager.Instance.LinkManagerDoc) {
            LinkManager.Instance.LinkManagerDoc[groupType] = new List<string>(keys);
            return true;
        }
        return false;
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
    public getOppositeAnchor(linkDoc: Doc, anchor: Doc): Doc | undefined {
        const a1 = Cast(linkDoc.anchor1, Doc, null);
        const a2 = Cast(linkDoc.anchor2, Doc, null);
        if (Doc.AreProtosEqual(anchor, a1)) return a2;
        if (Doc.AreProtosEqual(anchor, a2)) return a1;
        if (Doc.AreProtosEqual(anchor, linkDoc)) return linkDoc;
    }
}

Scripting.addGlobal(function links(doc: any) { return new List(LinkManager.Instance.getAllRelatedLinks(doc)); },
    "creates a link to inputted document", "(doc: any)");