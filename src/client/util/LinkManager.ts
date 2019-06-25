import { observable, action } from "mobx";
import { StrCast, Cast, FieldValue } from "../../new_fields/Types";
import { Doc, DocListCast } from "../../new_fields/Doc";
import { listSpec } from "../../new_fields/Schema";
import { List } from "../../new_fields/List";
import { Id } from "../../new_fields/FieldSymbols";
import { CurrentUserUtils } from "../../server/authentication/models/current_user_utils";


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
    // static Instance: LinkManager;
    // private constructor() {
    //     LinkManager.Instance = this;
    // }

    private static _instance: LinkManager;
    public static get Instance(): LinkManager {
        return this._instance || (this._instance = new this());
    }
    private constructor() {
    }

    public get LinkManagerDoc(): Doc | undefined {
        return FieldValue(Cast(CurrentUserUtils.UserDocument.linkManagerDoc, Doc));
    }
    // @observable public allLinks: Array<Doc> = []; //List<Doc> = new List<Doc>([]); // list of link docs
    // @observable public groupMetadataKeys: Map<string, Array<string>> = new Map();
    // map of group type to list of its metadata keys; serves as a dictionary of groups to what kind of metadata it holds

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

    public addGroupType(groupType: string): boolean {
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
                    LinkManager.Instance.removeGroupFromAnchor(linkDoc, Cast(linkDoc.anchor1, Doc, new Doc), groupType);
                    LinkManager.Instance.removeGroupFromAnchor(linkDoc, Cast(linkDoc.anchor2, Doc, new Doc), groupType);
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
    public getAnchorGroups(linkDoc: Doc, anchor: Doc): Array<Doc> {
        if (Doc.AreProtosEqual(anchor, Cast(linkDoc.anchor1, Doc, new Doc))) {
            return DocListCast(linkDoc.anchor1Groups);
        } else {
            return DocListCast(linkDoc.anchor2Groups);
        }
    }

    // sets the groups of the given anchor in the given link
    public setAnchorGroups(linkDoc: Doc, anchor: Doc, groups: Doc[]) {
        if (Doc.AreProtosEqual(anchor, Cast(linkDoc.anchor1, Doc, new Doc))) {
            linkDoc.anchor1Groups = new List<Doc>(groups);
        } else {
            linkDoc.anchor2Groups = new List<Doc>(groups);
        }
    }

    public addGroupToAnchor(linkDoc: Doc, anchor: Doc, groupDoc: Doc, replace: boolean = false) {
        let groups = LinkManager.Instance.getAnchorGroups(linkDoc, anchor);
        let index = groups.findIndex(gDoc => {
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
        let groups = LinkManager.Instance.getAnchorGroups(linkDoc, anchor);
        let newGroups = groups.filter(groupDoc => StrCast(groupDoc.type).toUpperCase() !== groupType.toUpperCase());
        LinkManager.Instance.setAnchorGroups(linkDoc, anchor, newGroups);
    }

    // public doesAnchorHaveGroup(linkDoc: Doc, anchor: Doc, groupDoc: Doc): boolean {
    //     let groups = LinkManager.Instance.getAnchorGroups(linkDoc, anchor);
    //     let index = groups.findIndex(gDoc => {
    //         return StrCast(groupDoc.type).toUpperCase() === StrCast(gDoc.type).toUpperCase();
    //     });
    //     return index > -1;
    // }

    // returns map of group type to anchor's links in that group type
    public getRelatedGroupedLinks(anchor: Doc): Map<string, Array<Doc>> {
        let related = this.getAllRelatedLinks(anchor);
        let anchorGroups = new Map<string, Array<Doc>>();
        related.forEach(link => {
            let groups = LinkManager.Instance.getAnchorGroups(link, anchor);

            if (groups.length > 0) {
                groups.forEach(groupDoc => {
                    let groupType = StrCast(groupDoc.type);
                    let group = anchorGroups.get(groupType);
                    if (group) group.push(link);
                    else group = [link];
                    anchorGroups.set(groupType, group);
                });
            } else {
                // if link is in no groups then put it in default group
                let group = anchorGroups.get("*");
                if (group) group.push(link);
                else group = [link];
                anchorGroups.set("*", group);
            }

        });
        return anchorGroups;
    }

    // public addMetadataKeyToGroup(groupType: string, key: string): boolean {
    //     if (LinkManager.Instance.LinkManagerDoc) {
    //         if (LinkManager.Instance.LinkManagerDoc[groupType]) {
    //             let keyList = LinkManager.Instance.findMetadataKeysInGroup(groupType);
    //             keyList.push(key);
    //             LinkManager.Instance.LinkManagerDoc[groupType] = new List<string>(keyList);
    //             return true;
    //         }
    //         return false;
    //     }
    //     return false;
    // }

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
            let anchor1Groups = LinkManager.Instance.getAnchorGroups(linkDoc, Cast(linkDoc.anchor1, Doc, new Doc));
            let anchor2Groups = LinkManager.Instance.getAnchorGroups(linkDoc, Cast(linkDoc.anchor2, Doc, new Doc));
            anchor1Groups.forEach(groupDoc => { if (StrCast(groupDoc.type).toUpperCase() === groupType.toUpperCase()) md.push(Cast(groupDoc.metadata, Doc, new Doc)); });
            anchor2Groups.forEach(groupDoc => { if (StrCast(groupDoc.type).toUpperCase() === groupType.toUpperCase()) md.push(Cast(groupDoc.metadata, Doc, new Doc)); });
        });
        return md;
    }

    // checks if a link with the given anchors exists
    public doesLinkExist(anchor1: Doc, anchor2: Doc): boolean {
        let allLinks = LinkManager.Instance.getAllLinks();
        let index = allLinks.findIndex(linkDoc => {
            return (Doc.AreProtosEqual(Cast(linkDoc.anchor1, Doc, new Doc), anchor1) && Doc.AreProtosEqual(Cast(linkDoc.anchor2, Doc, new Doc), anchor2)) ||
                (Doc.AreProtosEqual(Cast(linkDoc.anchor1, Doc, new Doc), anchor2) && Doc.AreProtosEqual(Cast(linkDoc.anchor2, Doc, new Doc), anchor1));
        });
        return index !== -1;
    }

    // finds the opposite anchor of a given anchor in a link
    public getOppositeAnchor(linkDoc: Doc, anchor: Doc): Doc {
        if (Doc.AreProtosEqual(anchor, Cast(linkDoc.anchor1, Doc, new Doc))) {
            return Cast(linkDoc.anchor2, Doc, new Doc);
        } else {
            return Cast(linkDoc.anchor1, Doc, new Doc);
        }
    }


    // @action
    // public addLinkProxy(proxy: Doc) {
    //     LinkManager.Instance.linkProxies.push(proxy);
    // }

    // public findLinkProxy(sourceViewId: string, targetViewId: string): Doc | undefined {
    //     let index = LinkManager.Instance.linkProxies.findIndex(p => {
    //         return StrCast(p.sourceViewId) === sourceViewId && StrCast(p.targetViewId) === targetViewId;
    //     });
    //     return index > -1 ? LinkManager.Instance.linkProxies[index] : undefined;
    // }

}