import { observable } from "mobx";
import { StrCast, Cast } from "../../new_fields/Types";
import { Doc, DocListCast } from "../../new_fields/Doc";
import { listSpec } from "../../new_fields/Schema";
import { List } from "../../new_fields/List";


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

    @observable public allLinks: Array<Doc> = []; // list of link docs
    @observable public groupMetadataKeys: Map<string, Array<string>> = new Map(); // map of group type to list of its metadata keys

    // finds all links that contain the given anchor
    public findAllRelatedLinks(anchor: Doc): Array<Doc> {
        return LinkManager.Instance.allLinks.filter(
            link => Doc.AreProtosEqual(anchor, Cast(link.anchor1, Doc, new Doc)) || Doc.AreProtosEqual(anchor, Cast(link.anchor2, Doc, new Doc)));
    }

    // returns map of group type to anchor's links in that group type
    public findRelatedGroupedLinks(anchor: Doc): Map<string, Array<Doc>> {
        let related = this.findAllRelatedLinks(anchor);
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

    // returns a list of all metadata docs associated with the given group type
    public findAllMetadataDocsInGroup(groupType: string): Array<Doc> {
        let md: Doc[] = [];
        let allLinks = LinkManager.Instance.allLinks;
        allLinks.forEach(linkDoc => {
            let anchor1Groups = LinkManager.Instance.getAnchorGroups(linkDoc, Cast(linkDoc.anchor1, Doc, new Doc));
            let anchor2Groups = LinkManager.Instance.getAnchorGroups(linkDoc, Cast(linkDoc.anchor2, Doc, new Doc));
            anchor1Groups.forEach(groupDoc => { if (StrCast(groupDoc.type).toUpperCase() === groupType.toUpperCase()) md.push(Cast(groupDoc.metadata, Doc, new Doc)); });
            anchor2Groups.forEach(groupDoc => { if (StrCast(groupDoc.type).toUpperCase() === groupType.toUpperCase()) md.push(Cast(groupDoc.metadata, Doc, new Doc)); });
        });
        return md;
    }

    // removes all group docs from all links with the given group type
    public deleteGroup(groupType: string): void {
        let deleted = LinkManager.Instance.groupMetadataKeys.delete(groupType);
        if (deleted) {
            LinkManager.Instance.allLinks.forEach(linkDoc => {
                LinkManager.Instance.removeGroupFromAnchor(linkDoc, Cast(linkDoc.anchor1, Doc, new Doc), groupType);
                LinkManager.Instance.removeGroupFromAnchor(linkDoc, Cast(linkDoc.anchor2, Doc, new Doc), groupType);
            });
        }
    }

    // removes group doc of given group type only from given anchor on given link
    public removeGroupFromAnchor(linkDoc: Doc, anchor: Doc, groupType: string) {
        let groups = LinkManager.Instance.getAnchorGroups(linkDoc, anchor);
        let newGroups = groups.filter(groupDoc => StrCast(groupDoc.type).toUpperCase() !== groupType.toUpperCase());
        LinkManager.Instance.setAnchorGroups(linkDoc, anchor, newGroups);
    }

    // checks if a link with the given anchors exists
    public doesLinkExist(anchor1: Doc, anchor2: Doc) {
        let allLinks = LinkManager.Instance.allLinks;
        let index = allLinks.findIndex(linkDoc => {
            return (Doc.AreProtosEqual(Cast(linkDoc.anchor1, Doc, new Doc), anchor1) && Doc.AreProtosEqual(Cast(linkDoc.anchor2, Doc, new Doc), anchor2)) ||
                (Doc.AreProtosEqual(Cast(linkDoc.anchor1, Doc, new Doc), anchor2) && Doc.AreProtosEqual(Cast(linkDoc.anchor2, Doc, new Doc), anchor1));
        });
        return index !== -1;
    }

    // finds the opposite anchor of a given anchor in a link
    public findOppositeAnchor(linkDoc: Doc, anchor: Doc): Doc {
        if (Doc.AreProtosEqual(anchor, Cast(linkDoc.anchor1, Doc, new Doc))) {
            return Cast(linkDoc.anchor2, Doc, new Doc);
        } else {
            return Cast(linkDoc.anchor1, Doc, new Doc);
        }
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

}