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


export class LinkManager {
    private static _instance: LinkManager;
    public static get Instance(): LinkManager {
        return this._instance || (this._instance = new this());
    }
    private constructor() {
    }

    @observable
    public allLinks: Array<Doc> = [];

    public findAllRelatedLinks(source: Doc): Array<Doc> {
        let related = LinkManager.Instance.allLinks.filter(
            link => Doc.AreProtosEqual(source, Cast(link.anchor1, Doc, new Doc)) || Doc.AreProtosEqual(source, Cast(link.anchor2, Doc, new Doc)));
        return related;
    }

    public findRelatedGroupedLinks(source: Doc): Map<string, Array<Doc>> {
        let related = this.findAllRelatedLinks(source);

        let categories = new Map();
        related.forEach(link => {
            // get groups of given doc
            let groups = (Doc.AreProtosEqual(source, Cast(link.anchor1, Doc, new Doc))) ? Cast(link.anchor1Groups, listSpec(Doc), []) : Cast(link.anchor2Groups, listSpec(Doc), []);
            if (groups) {
                if (groups.length > 0) {
                    groups.forEach(groupDoc => {
                        if (groupDoc instanceof Doc) {
                            let groupType = StrCast(groupDoc.proto!.type);
                            let group = categories.get(groupType); // TODO: clean this up lol
                            if (group) group.push(link);
                            else group = [link];
                            categories.set(groupType, group);
                        } else {
                            // promise doc
                        }

                    })
                }
                else {
                    // if link is in no groups then put it in default group
                    let group = categories.get("*");
                    if (group) group.push(link);
                    else group = [link];
                    categories.set("*", group);
                }
            }


            //     let anchor = this.findOppositeAnchor(link, source);
            //     let group = categories.get(link.linkTags);
            //     if (group) group.push(link);
            //     else group = [link];
            //     categories.set(link.linkTags, group);
        })
        return categories;
    }

    public findOppositeAnchor(link: Doc, source: Doc): Doc {
        if (Doc.AreProtosEqual(source, Cast(link.anchor1, Doc, new Doc))) {
            return Cast(link.anchor2, Doc, new Doc);
        } else {
            return Cast(link.anchor1, Doc, new Doc);
        }
    }

    // public findAnchorTags(link: Doc, source: Doc): Doc[] {
    //     if (source)
    // }

}