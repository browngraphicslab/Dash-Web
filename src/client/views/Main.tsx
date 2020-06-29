import { MainView } from "./MainView";
import { Docs } from "../documents/Documents";
import { CurrentUserUtils } from "../util/CurrentUserUtils";
import * as ReactDOM from 'react-dom';
import * as React from 'react';
import { DocServer } from "../DocServer";
import { AssignAllExtensions } from "../../extensions/General/Extensions";
import { Networking } from "../Network";
import { CollectionView } from "./collections/CollectionView";

AssignAllExtensions();

export let resolvedPorts: { server: number, socket: number };

(async () => {
    window.location.search.includes("safe") && CollectionView.SetSafeMode(true);
    const info = await CurrentUserUtils.loadCurrentUser();
    resolvedPorts = JSON.parse(await Networking.FetchFromServer("/resolvedPorts"));
    DocServer.init(window.location.protocol, window.location.hostname, resolvedPorts.socket, info.email);
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
    ReactDOM.render(<MainView />, document.getElementById('root'));
})();