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

(async () => {
    window.location.search.includes("safe") && CollectionView.SetSafeMode(true);
    const info = await CurrentUserUtils.loadCurrentUser();
    if (info.id !== "__guest__") {
        // a guest will not have an id registered
        await CurrentUserUtils.loadUserDocument(info.id);
    } else {
        await Docs.Prototypes.initialize();
    }
    document.getElementById('root')!.addEventListener('wheel', event => {
        if (event.ctrlKey) {
            event.preventDefault();
        }
    }, true);
    const startload = (document as any).startLoad;
    const loading = Date.now() - (startload ? Number(startload) : (Date.now() - 3000));
    console.log("Load Time = " + loading);
    const d = new Date();
    d.setTime(d.getTime() + (100 * 24 * 60 * 60 * 1000));
    const expires = "expires=" + d.toUTCString();
    document.cookie = `loadtime=${loading};${expires};path=/`;
    ReactDOM.render(<MainView />, document.getElementById('root'));
})();