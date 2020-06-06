import { DocServer } from '../client/DocServer';
import { Docs } from '../client/documents/Documents';
import * as ReactDOM from "react-dom";
import { MobileInterface } from './MobileInterface';
import * as React from "react";
import { AssignAllExtensions } from '../extensions/General/Extensions';
import { CurrentUserUtils } from '../server/authentication/models/current_user_utils';

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