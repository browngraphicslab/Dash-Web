import { observable, action } from "mobx";
import { StrCast, Cast, FieldValue } from "../../new_fields/Types";
import { Doc, DocListCast } from "../../new_fields/Doc";
import { listSpec } from "../../new_fields/Schema";
import { List } from "../../new_fields/List";
import { Id } from "../../new_fields/FieldSymbols";
import { CurrentUserUtils } from "../../server/authentication/models/current_user_utils";
import { Docs } from "../documents/Documents";

export enum LinkDirection {
    Uni = 1,
    Bi = 2,
}

/* A link can be used by a user to expose and define the relationship between two documents. The relationship is defined by
 * the direction (i.e. A -> B,  A <- B,  A <-> B) of the relationship, the type/name of the relationship, and user defined 
 * metadata about that type of relationship.
 *
 * link doc: 
 * - anchor1: doc
 * - anchor1Page: number
 * - anchor1Group: group doc representing the group anchor1 categorizes this link/anchor2 in 
 * - anchor2: doc
 * - anchor2Page: number
 * - anchor2Group: group doc representing the groups anchor2 categorizes this link/anchor1 in 
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

    /* the linkmanagerdoc stores a list of docs representing all linkdocs under the key 'allLinks' and a list of strings representing all group types under the key 'allGroupTypes'
     * lists of strings representing the metadata keys for each group type are stored under a key that is the same as the group type 
     */
    public get LinkManagerDoc(): Doc | undefined {
        // return FieldValue(Cast(CurrentUserUtils.UserDocument.linkManagerDoc, Doc));

        return Docs.Prototypes.MainLinkDocument();
    }

    public getAllLinks(): Doc[] {
        return LinkManager.Instance.LinkManagerDoc ? LinkManager.Instance.LinkManagerDoc.allLinks ? DocListCast(LinkManager.Instance.LinkManagerDoc.allLinks) : [] : [];
    }

    public addLink(linkDoc: Doc): boolean {
        let linkList = LinkManager.Instance.getAllLinks();
        linkList.push(linkDoc);
        if (LinkManager.Instance.LinkManagerDoc) {
            LinkManager.Instance.LinkManagerDoc.allLinks = new List<Doc>(linkList);
            return true;
        }
        return false;
    }

    public deleteLink(linkDoc: Doc): boolean {
        let linkList = LinkManager.Instance.getAllLinks();
        let index = LinkManager.Instance.getAllLinks().indexOf(linkDoc);
        if (index > -1) {
            linkList.splice(index, 1);
            if (LinkManager.Instance.LinkManagerDoc) {
                LinkManager.Instance.LinkManagerDoc.allLinks = new List<Doc>(linkList);
                return true;
            }
        }
        return false;
    }

    /* finds all links that contain the given anchor */
    public getAllRelatedLinks(anchor: Doc): Doc[] {//List<Doc> {
        let related = LinkManager.Instance.getAllLinks().filter(link => {
            let protomatch1 = Doc.AreProtosEqual(anchor, Cast(link.anchor1, Doc, null));
            let protomatch2 = Doc.AreProtosEqual(anchor, Cast(link.anchor2, Doc, null));
            return protomatch1 || protomatch2;
        });
        return related;
    }

    public deleteAllLinksOnAnchor(anchor: Doc) {
        let related = LinkManager.Instance.getAllRelatedLinks(anchor);
        related.forEach(linkDoc => LinkManager.Instance.deleteLink(linkDoc));
    }

    public createGroupType(groupType: string): boolean {
        if (LinkManager.Instance.LinkManagerDoc) {
            LinkManager.Instance.LinkManagerDoc[groupType] = new List<string>([]);
            let groupTypes = LinkManager.Instance.getAllGroupTypes();
            groupTypes.push(groupType);
            LinkManager.Instance.LinkManagerDoc.allGroupTypes = new List<string>(groupTypes);
            return true;
        }
        return false;
    }

    /* removes all group docs from all links with the given group type */
    public deleteGroupType(groupType: string): boolean {
        if (LinkManager.Instance.LinkManagerDoc) {
            if (LinkManager.Instance.LinkManagerDoc[groupType]) {
                let groupTypes = LinkManager.Instance.getAllGroupTypes();
                let index = groupTypes.findIndex(type => type.toUpperCase() === groupType.toUpperCase());
                if (index > -1) groupTypes.splice(index, 1);
                LinkManager.Instance.LinkManagerDoc.allGroupTypes = new List<string>(groupTypes);
                LinkManager.Instance.LinkManagerDoc[groupType] = undefined;
                LinkManager.Instance.getAllLinks().forEach(linkDoc => {
                    const anchor1Group = Cast(linkDoc.anchor1Group, Doc, null);
                    const anchor2Group = Cast(linkDoc.anchor2Group, Doc, null);
                    if (anchor1Group && StrCast(anchor1Group.type).toUpperCase() === groupType.toUpperCase()) linkDoc.anchor1Group = new Doc();
                    if (anchor2Group && StrCast(anchor2Group.type).toUpperCase() === groupType.toUpperCase()) linkDoc.anchor2Group = new Doc();
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

    /* sets the groups of the given anchor in the given link */
    public setAnchorGroupDoc(linkDoc: Doc, anchor: Doc, groupDoc: Doc) {
        if (Doc.AreProtosEqual(anchor, Cast(linkDoc.anchor1, Doc, null))) {
            linkDoc.anchor1Group = groupDoc;
        }
        if (Doc.AreProtosEqual(anchor, Cast(linkDoc.anchor2, Doc, null))) {
            linkDoc.anchor2Group = groupDoc;
        }
    }

    public getAnchorGroupDoc(linkDoc: Doc, anchor: Doc) {
        if (Doc.AreProtosEqual(anchor, Cast(linkDoc.anchor1, Doc, null))) {
            return Cast(linkDoc.anchor1Group, Doc, null);
        }
        if (Doc.AreProtosEqual(anchor, Cast(linkDoc.anchor2, Doc, null))) {
            return Cast(linkDoc.anchor2Group, Doc, null);
        }
    }

    /* returns map of group type to anchor's links in that group type */
    public getRelatedGroupedLinks(anchor: Doc): Map<string, Array<Doc>> {
        let related = this.getAllRelatedLinks(anchor);
        let anchorGroups = new Map<string, Array<Doc>>();
        related.forEach(linkDoc => {
            // let groups = LinkManager.Instance.getAnchorGroups(link, anchor);
            let groupType;
            if (Doc.AreProtosEqual(anchor, Cast(linkDoc.anchor1, Doc, null))) {
                let anchor1Group = Cast(linkDoc.anchor1Group, Doc, null);
                groupType = StrCast(anchor1Group && anchor1Group.type);
            } else {
                let anchor2Group = Cast(linkDoc.anchor2Group, Doc, null);
                groupType = StrCast(anchor2Group && anchor2Group.type);
            }

            if (!groupType || groupType === "") {
                let group = anchorGroups.get("*");
                anchorGroups.set("*", group ? [...group, linkDoc] : [linkDoc]);
            } else {
                let group = anchorGroups.get(groupType);
                anchorGroups.set(groupType, group ? [...group, linkDoc] : [linkDoc]);
            }
        });
        return anchorGroups;
    }

    removeGroupFromAnchor(anchor: Doc, groupType: string): boolean {
        let groups = LinkManager.Instance.getRelatedGroupedLinks(anchor);
        let links = groups.get(groupType);
        if (links) {
            links.forEach(linkDoc => {
                let newGroup = new Doc();
                let newMd = new Doc();
                newGroup.metadata = newMd;
                newGroup.type = "";
                if (Doc.AreProtosEqual(anchor, Cast(linkDoc.anchor1, Doc, null))) {
                    newMd.anchor1 = Cast(linkDoc.anchor1, Doc, null).title;
                    newMd.anchor2 = Cast(linkDoc.anchor2, Doc, null).title;
                    linkDoc.anchor1Group = newGroup;
                }
                if (Doc.AreProtosEqual(anchor, Cast(linkDoc.anchor2c, Doc, null))) {
                    newMd.anchor1 = Cast(linkDoc.anchor2, Doc, null).title;
                    newMd.anchor2 = Cast(linkDoc.anchor1, Doc, null).title;
                    linkDoc.anchor2Group = newGroup;
                }
            });
        }
        return false;
    }

    /* gets a list of strings representing the keys of the metadata associated with the given group type */
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

    /* returns a list of all metadata docs associated with the given group type */
    public getAllMetadataDocsInGroup(groupType: string): Array<Doc> {
        let md: Doc[] = [];
        let allLinks = LinkManager.Instance.getAllLinks();
        allLinks.forEach(linkDoc => {
            let anchor1Group = Cast(linkDoc.anchor1Group, Doc, null);
            let anchor2Group = Cast(linkDoc.anchor2Group, Doc, null);

            let linkDocProto = Doc.GetProto(linkDoc);
            if (linkDocProto.direction === LinkDirection.Bi && StrCast(anchor1Group.type).toUpperCase() === groupType.toUpperCase()) {
                const meta = Cast(anchor1Group.metadata, Doc, null);
                meta && md.push(meta);
            } else {
                if (anchor1Group && StrCast(anchor1Group.type).toUpperCase() === groupType.toUpperCase()) { const meta = Cast(anchor1Group.metadata, Doc, null); meta && md.push(meta); }
                if (anchor2Group && StrCast(anchor2Group.type).toUpperCase() === groupType.toUpperCase()) { const meta = Cast(anchor2Group.metadata, Doc, null); meta && md.push(meta); }
            }
        });
        return md;
    }

    /* checks if a link with the given anchors exists */
    public doesLinkExist(anchor1: Doc, anchor2: Doc): Doc | undefined {
        let allLinks = LinkManager.Instance.getAllLinks();
        let index = allLinks.findIndex(linkDoc => {
            return (Doc.AreProtosEqual(Cast(linkDoc.anchor1, Doc, null), anchor1) && Doc.AreProtosEqual(Cast(linkDoc.anchor2, Doc, null), anchor2)) ||
                (Doc.AreProtosEqual(Cast(linkDoc.anchor1, Doc, null), anchor2) && Doc.AreProtosEqual(Cast(linkDoc.anchor2, Doc, null), anchor1));
        });
        return index === -1 ? undefined : allLinks[index];
    }

    /* finds the opposite anchor of a given anchor in a link */
    public getOppositeAnchor(linkDoc: Doc, anchor: Doc): Doc | undefined {
        if (Doc.AreProtosEqual(anchor, Cast(linkDoc.anchor1, Doc, null))) {
            return Cast(linkDoc.anchor2, Doc, null);
        }
        if (Doc.AreProtosEqual(anchor, Cast(linkDoc.anchor2, Doc, null))) {
            return Cast(linkDoc.anchor1, Doc, null);
        }
    }
}