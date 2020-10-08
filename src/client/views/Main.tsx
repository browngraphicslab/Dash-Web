import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { AssignAllExtensions } from "../../extensions/General/Extensions";
import { Docs } from "../documents/Documents";
import { CurrentUserUtils } from "../util/CurrentUserUtils";
import { CollectionView } from "./collections/CollectionView";
import { MainView } from "./MainView";

AssignAllExtensions();

(async () => {
    window.location.search.includes("safe") && CollectionView.SetSafeMode(true);
    const info = await CurrentUserUtils.loadCurrentUser();
    await Docs.Prototypes.initialize();
    if (info.id !== "__guest__") {
        // a guest will not have an id registered
        await CurrentUserUtils.loadUserDocument(info.id);
    }
    document.getElementById('root')!.addEventListener('wheel', event => {
        if (event.ctrlKey) {
            event.preventDefault();
        }
    }, true);
    ReactDOM.render(<MainView />, document.getElementById('root'));
})();