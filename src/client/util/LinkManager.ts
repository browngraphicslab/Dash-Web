import { observable, computed, action } from "mobx";
import React = require("react");
import { SelectionManager } from "./SelectionManager";
import { observer } from "mobx-react";
import { props } from "bluebird";
import { DocumentView } from "../views/nodes/DocumentView";
import { link } from "fs";
import { StrCast, Cast } from "../../new_fields/Types";
import { Doc } from "../../new_fields/Doc";
import { listSpec } from "../../new_fields/Schema";
import { List } from "../../new_fields/List";
import { string } from "prop-types";
import { Docs } from "../documents/Documents";

export namespace LinkUtils {
    export function findOppositeAnchor(link: Doc, anchor: Doc): Doc {
        if (Doc.AreProtosEqual(anchor, Cast(link.anchor1, Doc, new Doc))) {
            return Cast(link.anchor2, Doc, new Doc);
        } else {
            return Cast(link.anchor1, Doc, new Doc);
        }
    }

    export function setAnchorGroups(link: Doc, anchor: Doc, groups: Doc[]) {
        // console.log("setting groups for anchor", anchor["title"]);
        if (Doc.AreProtosEqual(anchor, Cast(link.anchor1, Doc, new Doc))) {
            link.anchor1Groups = new List<Doc>(groups);

            let print: string[] = [];
            Cast(link.anchor1Groups, listSpec(Doc), []).forEach(doc => {
                if (doc instanceof Doc) {
                    print.push(StrCast(doc.type));
                }
            });
            console.log("set anchor's groups as", print);
        } else {
            link.anchor2Groups = new List<Doc>(groups);

            let print: string[] = [];
            Cast(link.anchor2Groups, listSpec(Doc), []).forEach(doc => {
                if (doc instanceof Doc) {
                    print.push(StrCast(doc.type));
                }
            });
            console.log("set anchor's groups as", print);
        }
    }

    export function removeGroupFromAnchor(link: Doc, anchor: Doc, groupType: string) {
        let groups = Doc.AreProtosEqual(anchor, Cast(link.anchor1, Doc, new Doc)) ?
            Cast(link.proto!.anchor1Groups, listSpec(Doc), []) : Cast(link.proto!.anchor2Groups, listSpec(Doc), []);

        let newGroups: Doc[] = [];
        groups.forEach(groupDoc => {
            if (groupDoc instanceof Doc && StrCast(groupDoc.type) !== groupType) {
                newGroups.push(groupDoc);
            } // TODO: promise
        });

        // let grouptypes: string[] = [];
        // newGroups.forEach(groupDoc => {
        //     grouptypes.push(StrCast(groupDoc.type));
        // });
        // console.log("remove anchor's groups as", grouptypes);

        LinkUtils.setAnchorGroups(link, anchor, newGroups);
    }
}

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

    public findAllRelatedLinks(anchor: Doc): Array<Doc> {
        return LinkManager.Instance.allLinks.filter(
            link => Doc.AreProtosEqual(anchor, Cast(link.anchor1, Doc, new Doc)) || Doc.AreProtosEqual(anchor, Cast(link.anchor2, Doc, new Doc)));
    }

    // returns map of group type to anchor's links in that group type
    public findRelatedGroupedLinks(anchor: Doc): Map<string, Array<Doc>> {
        let related = this.findAllRelatedLinks(anchor);

        let anchorGroups = new Map<string, Array<Doc>>();
        related.forEach(link => {

            // get groups of given anchor categorizes this link/opposite anchor in
            let groups = (Doc.AreProtosEqual(anchor, Cast(link.anchor1, Doc, new Doc))) ? Cast(link.anchor1Groups, listSpec(Doc), []) : Cast(link.anchor2Groups, listSpec(Doc), []);
            if (groups.length > 0) {
                groups.forEach(groupDoc => {
                    if (groupDoc instanceof Doc) {
                        let groupType = StrCast(groupDoc.type);
                        let group = anchorGroups.get(groupType); // TODO: clean this up lol
                        if (group) group.push(link);
                        else group = [link];
                        anchorGroups.set(groupType, group);
                    } else {
                        // promise doc
                    }

                });
            }
            else {
                // if link is in no groups then put it in default group
                let group = anchorGroups.get("*");
                if (group) group.push(link);
                else group = [link];
                anchorGroups.set("*", group);
            }

        });
        return anchorGroups;
    }

    public findMetadataInGroup(groupType: string) {
        let md: Doc[] = [];
        let allLinks = LinkManager.Instance.allLinks;
        // for every link find its groups
        // allLinks.forEach(linkDoc => {
        //     let anchor1groups = LinkManager.Instance.findRelatedGroupedLinks(Cast(linkDoc["anchor1"], Doc, new Doc));
        //     if (anchor1groups.get(groupType)) {
        //         md.push(linkDoc["anchor1"]["group"])
        //     }
        // })
        allLinks.forEach(linkDoc => {
            let anchor1Groups = Cast(linkDoc.anchor1Groups, listSpec(Doc), []);
            let anchor2Groups = Cast(linkDoc.anchor2Groups, listSpec(Doc), []);
            anchor1Groups.forEach(groupDoc => {
                if (groupDoc instanceof Doc) {
                    if (StrCast(groupDoc.type) === groupType) {
                        md.push(Cast(groupDoc.metadata, Doc, new Doc));
                    }
                } else {
                    // TODO: promise
                }
            });
            anchor2Groups.forEach(groupDoc => {
                if (groupDoc instanceof Doc) {
                    if (StrCast(groupDoc.type) === groupType) {
                        md.push(Cast(groupDoc.metadata, Doc, new Doc));
                    }
                } else {
                    // TODO: promise
                }
            });

        });
        return md;
    }

    public deleteGroup(groupType: string) {
        let deleted = LinkManager.Instance.groupMetadataKeys.delete(groupType);
        if (deleted) {
            LinkManager.Instance.allLinks.forEach(linkDoc => {
                LinkUtils.removeGroupFromAnchor(linkDoc, Cast(linkDoc.anchor1, Doc, new Doc), groupType);
                LinkUtils.removeGroupFromAnchor(linkDoc, Cast(linkDoc.anchor2, Doc, new Doc), groupType);
            });
        }
    }

    public doesLinkExist(anchor1: Doc, anchor2: Doc) {
        let allLinks = LinkManager.Instance.allLinks;
        let index = allLinks.findIndex(linkDoc => {
            return (Doc.AreProtosEqual(Cast(linkDoc.anchor1, Doc, new Doc), anchor1) && Doc.AreProtosEqual(Cast(linkDoc.anchor2, Doc, new Doc), anchor2)) ||
                (Doc.AreProtosEqual(Cast(linkDoc.anchor1, Doc, new Doc), anchor2) && Doc.AreProtosEqual(Cast(linkDoc.anchor2, Doc, new Doc), anchor1));
        });
        return index !== -1;
    }

}