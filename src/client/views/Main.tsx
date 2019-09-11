import { MainView } from "./MainView";
import { Docs } from "../documents/Documents";
import { CurrentUserUtils } from "../../server/authentication/models/current_user_utils";
import * as ReactDOM from 'react-dom';
import * as React from 'react';
import { Cast } from "../../new_fields/Types";
import { Doc, DocListCastAsync } from "../../new_fields/Doc";
import { List } from "../../new_fields/List";
import { DocServer } from "../DocServer";

let swapDocs = async () => {
    let oldDoc = await Cast(CurrentUserUtils.UserDocument.linkManagerDoc, Doc);
    // Docs.Prototypes.MainLinkDocument().allLinks = new List<Doc>();
    if (oldDoc) {
        let links = await DocListCastAsync(oldDoc.allLinks);
        // if (links && DocListCast(links)) {
        if (links && links.length) {
            let data = await DocListCastAsync(Docs.Prototypes.MainLinkDocument().allLinks);
            if (data) {
                data.push(...links.filter(i => data!.indexOf(i) === -1));
                Docs.Prototypes.MainLinkDocument().allLinks = new List<Doc>(data.filter((i, idx) => data!.indexOf(i) === idx));
            }
            else {
                Docs.Prototypes.MainLinkDocument().allLinks = new List<Doc>(links);
            }
        }
        CurrentUserUtils.UserDocument.linkManagerDoc = undefined;
    }
};

(async () => {
    const info = await CurrentUserUtils.loadCurrentUser();
    DocServer.init(window.location.protocol, window.location.hostname, 4321, info.email);
    await Docs.Prototypes.initialize();
    await CurrentUserUtils.loadUserDocument(info);
    // updates old user documents to prevent chrome on tree view.
    (await Cast(CurrentUserUtils.UserDocument.workspaces, Doc))!.chromeStatus = "disabled";
    (await Cast(CurrentUserUtils.UserDocument.recentlyClosed, Doc))!.chromeStatus = "disabled";
    (await Cast(CurrentUserUtils.UserDocument.sidebar, Doc))!.chromeStatus = "disabled";
    await swapDocs();
    document.getElementById('root')!.addEventListener('wheel', event => {
        if (event.ctrlKey) {
            event.preventDefault();
        }
    }, true);
    ReactDOM.render(<MainView />, document.getElementById('root'));
})();