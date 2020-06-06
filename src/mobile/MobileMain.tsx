import { MobileInterface } from "./MobileInterface";
import { Docs } from "../client/documents/Documents";
import { CurrentUserUtils } from "../client/util/CurrentUserUtils";
import * as ReactDOM from 'react-dom';
import * as React from 'react';
import { DocServer } from "../client/DocServer";
import { AssignAllExtensions } from "../extensions/General/Extensions";

AssignAllExtensions();

(async () => {
    const info = await CurrentUserUtils.loadCurrentUser();
    DocServer.init(window.location.protocol, window.location.hostname, 4321, info.email + " (mobile)");
    await Docs.Prototypes.initialize();
    if (info.id !== "__guest__") {
        // a guest will not have an id registered
        await CurrentUserUtils.loadUserDocument(info);
    }
    document.getElementById('root')!.addEventListener('wheel', event => {
        if (event.ctrlKey) {
            event.preventDefault();
        }
    }, true);
    ReactDOM.render(<MobileInterface />, document.getElementById('root'));
})();