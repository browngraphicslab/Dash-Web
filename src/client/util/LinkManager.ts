import { Doc, DocListCast } from "../../new_fields/Doc";
import { List } from "../../new_fields/List";
import { listSpec } from "../../new_fields/Schema";
import { Cast, StrCast } from "../../new_fields/Types";
import { Docs } from "../documents/Documents";
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
    public static get Instance(): LinkManager {
        return this._instance || (this._instance = new this());
    }
    private constructor() {
    }

    // the linkmanagerdoc stores a list of docs representing all linkdocs in 'allLinks' and a list of strings representing all group types in 'allGroupTypes'
    // lists of strings representing the metadata keys for each group type is stored under a key that is the same as the group type 
    public get LinkManagerDoc(): Doc | undefined {
        return Docs.Prototypes.MainLinkDocument();
    }

    public getAllLinks(): Doc[] {
        const ldoc = LinkManager.Instance.LinkManagerDoc;
        if (ldoc) {
            const docs = DocListCast(ldoc.allLinks);
            return docs;
        }
        return [];
    }

    public addLink(linkDoc: Doc): boolean {
        const linkList = LinkManager.Instance.getAllLinks();
        linkList.push(linkDoc);
        if (LinkManager.Instance.LinkManagerDoc) {
            LinkManager.Instance.LinkManagerDoc.allLinks = new List<Doc>(linkList);
            return true;
        }
        return false;
    }

    public deleteLink(linkDoc: Doc): boolean {
        const linkList = LinkManager.Instance.getAllLinks();
        const index = LinkManager.Instance.getAllLinks().indexOf(linkDoc);
        if (index > -1) {
            linkList.splice(index, 1);
            if (LinkManager.Instance.LinkManagerDoc) {
                LinkManager.Instance.LinkManagerDoc.allLinks = new List<Doc>(linkList);
                return true;
            }
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

    // sets the groups of the given anchor in the given link
    public setAnchorGroups(linkDoc: Doc, anchor: Doc, groups: Doc[]) {
        if (Doc.AreProtosEqual(anchor, Cast(linkDoc.anchor1, Doc, null))) {
            linkDoc.anchor1Groups = new List<Doc>(groups);
        } else {
            linkDoc.anchor2Groups = new List<Doc>(groups);
        }
    }

    public addGroupToAnchor(linkDoc: Doc, anchor: Doc, groupDoc: Doc, replace: boolean = false) {
        const groups = LinkManager.Instance.getAnchorGroups(linkDoc, anchor);
        const index = groups.findIndex(gDoc => {
            return StrCast(groupDoc.type).toUpperCase() === StrCast(gDoc.type).toUpperCase();
        });
        if (index > -1 && replace) {
            groups[index] = groupDoc;
        }
        if (index === -1) {
            groups.push(groupDoc);
        }
        LinkManager.Instance.setAnchorGroups(linkDoc, anchor, groups);
    }

    // removes group doc of given group type only from given anchor on given link
    public removeGroupFromAnchor(linkDoc: Doc, anchor: Doc, groupType: string) {
        const groups = LinkManager.Instance.getAnchorGroups(linkDoc, anchor);
        const newGroups = groups.filter(groupDoc => StrCast(groupDoc.type).toUpperCase() !== groupType.toUpperCase());
        LinkManager.Instance.setAnchorGroups(linkDoc, anchor, newGroups);
    }

    // returns map of group type to anchor's links in that group type
    public getRelatedGroupedLinks(anchor: Doc): Map<string, Array<Doc>> {
        const related = this.getAllRelatedLinks(anchor);
        const anchorGroups = new Map<string, Array<Doc>>();
        related.forEach(link => {
            const groups = LinkManager.Instance.getAnchorGroups(link, anchor);

            if (groups.length > 0) {
                groups.forEach(groupDoc => {
                    const groupType = StrCast(groupDoc.type);
                    if (groupType === "") {
                        const group = anchorGroups.get("*");
                        anchorGroups.set("*", group ? [...group, link] : [link]);
                    } else {
                        const group = anchorGroups.get(groupType);
                        anchorGroups.set(groupType, group ? [...group, link] : [link]);
                    }
                });
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
            const anchor1Groups = LinkManager.Instance.getAnchorGroups(linkDoc, Cast(linkDoc.anchor1, Doc, null));
            const anchor2Groups = LinkManager.Instance.getAnchorGroups(linkDoc, Cast(linkDoc.anchor2, Doc, null));
            anchor1Groups.forEach(groupDoc => { if (StrCast(groupDoc.type).toUpperCase() === groupType.toUpperCase()) { const meta = Cast(groupDoc.metadata, Doc, null); meta && md.push(meta); } });
            anchor2Groups.forEach(groupDoc => { if (StrCast(groupDoc.type).toUpperCase() === groupType.toUpperCase()) { const meta = Cast(groupDoc.metadata, Doc, null); meta && md.push(meta); } });
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

Scripting.addGlobal(function links(doc: any) { return new List(LinkManager.Instance.getAllRelatedLinks(doc)); });