import { MainView } from "./MainView";
import { Docs } from "../documents/Documents";
import { CurrentUserUtils } from "../../server/authentication/models/current_user_utils";
import * as ReactDOM from 'react-dom';
import * as React from 'react';
import { Cast } from "../../new_fields/Types";
import { Doc, DocListCastAsync } from "../../new_fields/Doc";
import { List } from "../../new_fields/List";

let swapDocs = async () => {
    let oldDoc = await Cast(CurrentUserUtils.UserDocument.linkManagerDoc, Doc);
    // Docs.Prototypes.MainLinkDocument().allLinks = new List<Doc>();
    if (oldDoc) {
        let links = await DocListCastAsync(oldDoc.allLinks);
        // if (links && DocListCast(links)) {
        if (links && links.length) {
            let data = await DocListCastAsync(Docs.Prototypes.MainLinkDocument().allLinks);
            if (data) {
                data.push(...links);
            }
            else {
                Docs.Prototypes.MainLinkDocument().allLinks = new List<Doc>(links);
            }
        }
        CurrentUserUtils.UserDocument.LinkManagerDoc = undefined;
    }
}

(async () => {
    await Docs.Prototypes.initialize();
    await CurrentUserUtils.loadCurrentUser();
    await swapDocs();
    ReactDOM.render(<MainView />, document.getElementById('root'));
})();