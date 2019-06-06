import { observable, computed, action } from "mobx";
import React = require("react");
import { SelectionManager } from "../../util/SelectionManager";
import { observer } from "mobx-react";
import './LinkEditor.scss';
import { props } from "bluebird";
import { DocumentView } from "./DocumentView";
import { link } from "fs";
import { StrCast, Cast } from "../../../new_fields/Types";
import { Doc } from "../../../new_fields/Doc";
import { listSpec } from "../../../new_fields/Schema";


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
            link => Doc.AreProtosEqual(source, Cast(link.linkedFrom, Doc, new Doc)) || Doc.AreProtosEqual(source, Cast(link.linkedTo, Doc, new Doc)));
        return related;
    }

    public findRelatedGroupedLinks(source: Doc): Map<string, Array<Doc>> {
        let related = this.findAllRelatedLinks(source);
        let categories = new Map();
        related.forEach(link => {
            let group = categories.get(link.linkTags);
            if (group) group.push(link);
            else group = [link];
            categories.set(link.linkTags, group);
        })
        return categories;
    }

    public findOppositeAnchor(link: Doc, source: Doc): Doc {
        if (Doc.AreProtosEqual(source, Cast(link.linkedFrom, Doc, new Doc))) {
            return Cast(link.linkedTo, Doc, new Doc);
        } else {
            return Cast(link.linkedFrom, Doc, new Doc);
        }
    }

}