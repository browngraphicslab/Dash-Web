import { observable, action } from "mobx";
import { StrCast, Cast, FieldValue } from "../../new_fields/Types";
import { Doc, DocListCast } from "../../new_fields/Doc";
import { listSpec } from "../../new_fields/Schema";
import { List } from "../../new_fields/List";
import { Id } from "../../new_fields/FieldSymbols";
import { CurrentUserUtils } from "../../server/authentication/models/current_user_utils";

export enum LinkDirection {
    Uni = 1,
    Bi = 2,
}

/* 
 * link doc: 
 * - anchor1: doc
 * - anchor1page: number
 * - anchor1group: group doc representing the group anchor1 categorizes this link/anchor2 in 
 * - anchor2: doc
 * - anchor2page: number
 * - anchor2group: group doc representing the groups anchor2 categorizes this link/anchor1 in 
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
        return FieldValue(Cast(CurrentUserUtils.UserDocument.linkManagerDoc, Doc));
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

    // finds all links that contain the given anchor
    public getAllRelatedLinks(anchor: Doc): Doc[] {//List<Doc> {
        let related = LinkManager.Instance.getAllLinks().filter(link => {
            let protomatch1 = Doc.AreProtosEqual(anchor, Cast(link.anchor1, Doc, new Doc));
            let protomatch2 = Doc.AreProtosEqual(anchor, Cast(link.anchor2, Doc, new Doc));
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

    // removes all group docs from all links with the given group type
    public deleteGroupType(groupType: string): boolean {
        if (LinkManager.Instance.LinkManagerDoc) {
            if (LinkManager.Instance.LinkManagerDoc[groupType]) {
                let groupTypes = LinkManager.Instance.getAllGroupTypes();
                let index = groupTypes.findIndex(type => type.toUpperCase() === groupType.toUpperCase());
                if (index > -1) groupTypes.splice(index, 1);
                LinkManager.Instance.LinkManagerDoc.allGroupTypes = new List<string>(groupTypes);
                LinkManager.Instance.LinkManagerDoc[groupType] = undefined;
                LinkManager.Instance.getAllLinks().forEach(linkDoc => {
                    if (StrCast(Cast(linkDoc.anchor1Group, Doc, new Doc).type).toUpperCase() === groupType.toUpperCase()) linkDoc.anchor1Group = new Doc();
                    if (StrCast(Cast(linkDoc.anchor2Group, Doc, new Doc).type).toUpperCase() === groupType.toUpperCase()) linkDoc.anchor2Group = new Doc();
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

    // // gets the groups associates with an anchor in a link
    // public getAnchorGroups(linkDoc: Doc, anchor: Doc): Array<Doc> {
    //     if (Doc.AreProtosEqual(anchor, Cast(linkDoc.anchor1, Doc, new Doc))) {
    //         return DocListCast(linkDoc.anchor1Groups);
    //     } else {
    //         return DocListCast(linkDoc.anchor2Groups);
    //     }
    // }

    // sets the groups of the given anchor in the given link
    public setAnchorGroupDoc(linkDoc: Doc, anchor: Doc, groupDoc: Doc) {
        if (Doc.AreProtosEqual(anchor, Cast(linkDoc.anchor1, Doc, new Doc))) {
            linkDoc.anchor1Group = groupDoc;
        }
        if (Doc.AreProtosEqual(anchor, Cast(linkDoc.anchor2, Doc, new Doc))) {
            linkDoc.anchor2Group = groupDoc;
        }
    }

    public getAnchorGroupDoc(linkDoc: Doc, anchor: Doc) {
        if (Doc.AreProtosEqual(anchor, Cast(linkDoc.anchor1, Doc, new Doc))) {
            return Cast(linkDoc.anchor1Group, Doc, new Doc);
        }
        if (Doc.AreProtosEqual(anchor, Cast(linkDoc.anchor2, Doc, new Doc))) {
            return Cast(linkDoc.anchor2Group, Doc, new Doc);
        }
    }

    // public addGroupToAnchor(linkDoc: Doc, anchor: Doc, groupDoc: Doc, replace: boolean = false) {
    //     let groups = LinkManager.Instance.getAnchorGroups(linkDoc, anchor);
    //     let index = groups.findIndex(gDoc => {
    //         return StrCast(groupDoc.type).toUpperCase() === StrCast(gDoc.type).toUpperCase();
    //     });
    //     if (index > -1 && replace) {
    //         groups[index] = groupDoc;
    //     }
    //     if (index === -1) {
    //         groups.push(groupDoc);
    //     }
    //     LinkManager.Instance.setAnchorGroups(linkDoc, anchor, groups);
    // }

    // // removes group doc of given group type only from given anchor on given link
    // public removeGroupFromAnchor(linkDoc: Doc, anchor: Doc, groupType: string) {
    //     let groups = LinkManager.Instance.getAnchorGroups(linkDoc, anchor);
    //     let newGroups = groups.filter(groupDoc => StrCast(groupDoc.type).toUpperCase() !== groupType.toUpperCase());
    //     LinkManager.Instance.setAnchorGroups(linkDoc, anchor, newGroups);
    // }

    // returns map of group type to anchor's links in that group type
    public getRelatedGroupedLinks(anchor: Doc): Map<string, Array<Doc>> {
        let related = this.getAllRelatedLinks(anchor);
        let anchorGroups = new Map<string, Array<Doc>>();
        related.forEach(linkDoc => {
            // let groups = LinkManager.Instance.getAnchorGroups(link, anchor);
            let groupType;
            if (Doc.AreProtosEqual(anchor, Cast(linkDoc.anchor1, Doc, new Doc))) {
                groupType = StrCast(Cast(linkDoc.anchor1Group, Doc, new Doc).type);
            } else {
                groupType = StrCast(Cast(linkDoc.anchor2Group, Doc, new Doc).type);
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
                if (Doc.AreProtosEqual(anchor, Cast(linkDoc.anchor1, Doc, new Doc))) {
                    newMd.anchor1 = Cast(linkDoc.anchor1, Doc, new Doc).title;
                    newMd.anchor2 = Cast(linkDoc.anchor2, Doc, new Doc).title;
                    linkDoc.anchor1Group = newGroup;
                }
                if (Doc.AreProtosEqual(anchor, Cast(linkDoc.anchor2c, Doc, new Doc))) {
                    newMd.anchor1 = Cast(linkDoc.anchor2, Doc, new Doc).title;
                    newMd.anchor2 = Cast(linkDoc.anchor1, Doc, new Doc).title;
                    linkDoc.anchor2Group = newGroup;
                }
            });
        }
        return false;
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
        let md: Doc[] = [];
        let allLinks = LinkManager.Instance.getAllLinks();
        allLinks.forEach(linkDoc => {
            let anchor1Group = Cast(linkDoc.anchor1Group, Doc, new Doc);
            let anchor2Group = Cast(linkDoc.anchor2Group, Doc, new Doc);
            if (StrCast(anchor1Group.type).toUpperCase() === groupType.toUpperCase()) md.push(Cast(anchor1Group.metadata, Doc, new Doc));
            if (StrCast(anchor2Group.type).toUpperCase() === groupType.toUpperCase()) md.push(Cast(anchor2Group.metadata, Doc, new Doc));
        });
        return md;
    }

    // checks if a link with the given anchors exists
    public doesLinkExist(anchor1: Doc, anchor2: Doc): Doc | undefined {
        let allLinks = LinkManager.Instance.getAllLinks();
        let index = allLinks.findIndex(linkDoc => {
            return (Doc.AreProtosEqual(Cast(linkDoc.anchor1, Doc, new Doc), anchor1) && Doc.AreProtosEqual(Cast(linkDoc.anchor2, Doc, new Doc), anchor2)) ||
                (Doc.AreProtosEqual(Cast(linkDoc.anchor1, Doc, new Doc), anchor2) && Doc.AreProtosEqual(Cast(linkDoc.anchor2, Doc, new Doc), anchor1));
        });
        return index === -1 ? undefined : allLinks[index];
    }

    // finds the opposite anchor of a given anchor in a link
    public getOppositeAnchor(linkDoc: Doc, anchor: Doc): Doc | undefined {
        if (Doc.AreProtosEqual(anchor, Cast(linkDoc.anchor1, Doc, new Doc))) {
            return Cast(linkDoc.anchor2, Doc, new Doc);
        }
        if (Doc.AreProtosEqual(anchor, Cast(linkDoc.anchor2, Doc, new Doc))) {
            return Cast(linkDoc.anchor1, Doc, new Doc);
        }
    }
}