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

export namespace LinkUtils {
    export function findOppositeAnchor(link: Doc, anchor: Doc): Doc {
        if (Doc.AreProtosEqual(anchor, Cast(link.anchor1, Doc, new Doc))) {
            return Cast(link.anchor2, Doc, new Doc);
        } else {
            return Cast(link.anchor1, Doc, new Doc);
        }
    }

    // export function getAnchorGroups(link: Doc, anchor: Doc): Doc[] {
    //     let groups;
    //     if (Doc.AreProtosEqual(anchor, Cast(link.anchor1, Doc, new Doc))) {
    //         groups = Cast(link.anchor1Groups, listSpec(Doc), []);
    //     } else {
    //         groups = Cast(link.anchor2Groups, listSpec(Doc), []);
    //     }

    //     if (groups instanceof Doc[]) {
    //         return groups;
    //     } else {
    //         return [];
    //     }
    //     // if (Doc.AreProtosEqual(anchor, Cast(link.anchor1, Doc, new Doc))) {
    //     //     returnCast(link.anchor1Groups, listSpec(Doc), []);
    //     // } else {
    //     //     return Cast(link.anchor2Groups, listSpec(Doc), []);
    //     // }
    // }

    export function setAnchorGroups(link: Doc, anchor: Doc, groups: Doc[]) {
        if (Doc.AreProtosEqual(anchor, Cast(link.anchor1, Doc, new Doc))) {
            link.anchor1Groups = new List<Doc>(groups);
        } else {
            link.anchor2Groups = new List<Doc>(groups);
        }
    }
}

export class LinkManager {
    private static _instance: LinkManager;
    public static get Instance(): LinkManager {
        return this._instance || (this._instance = new this());
    }
    private constructor() {
    }

    @observable public allLinks: Array<Doc> = [];
    @observable public allGroups: Map<string, Doc> = new Map();

    public findAllRelatedLinks(anchor: Doc): Array<Doc> {
        return LinkManager.Instance.allLinks.filter(
            link => Doc.AreProtosEqual(anchor, Cast(link.anchor1, Doc, new Doc)) || Doc.AreProtosEqual(anchor, Cast(link.anchor2, Doc, new Doc)));
    }

    public findRelatedGroupedLinks(anchor: Doc): Map<string, Array<Doc>> {
        let related = this.findAllRelatedLinks(anchor);

        let anchorGroups = new Map();
        related.forEach(link => {
            // get groups of given doc
            let oppGroups = (Doc.AreProtosEqual(anchor, Cast(link.anchor1, Doc, new Doc))) ? Cast(link.anchor1Groups, listSpec(Doc), []) : Cast(link.anchor2Groups, listSpec(Doc), []);
            if (oppGroups) {
                if (oppGroups.length > 0) {
                    oppGroups.forEach(groupDoc => {
                        if (groupDoc instanceof Doc) {
                            let groupType = StrCast(groupDoc.proto!.type);
                            let group = anchorGroups.get(groupType); // TODO: clean this up lol
                            if (group) group.push(link);
                            else group = [link];
                            anchorGroups.set(groupType, group);
                        } else {
                            // promise doc
                        }

                    })
                }
                else {
                    // if link is in no groups then put it in default group
                    let group = anchorGroups.get("*");
                    if (group) group.push(link);
                    else group = [link];
                    anchorGroups.set("*", group);
                }
            }


            //     let anchor = this.findOppositeAnchor(link, source);
            //     let group = categories.get(link.linkTags);
            //     if (group) group.push(link);
            //     else group = [link];
            //     categories.set(link.linkTags, group);
        })
        return anchorGroups;
    }




    // public findAnchorTags(link: Doc, source: Doc): Doc[] {
    //     if (source)
    // }

}