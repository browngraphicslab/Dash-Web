import { MainView } from "./MainView";
import { Docs } from "../documents/Documents";
import { CurrentUserUtils } from "../../server/authentication/models/current_user_utils";
import * as ReactDOM from 'react-dom';
import * as React from 'react';

(async () => {
    await Docs.Prototypes.initialize();
    await CurrentUserUtils.loadCurrentUser();
    ReactDOM.render(<MainView />, document.getElementById('root'));
})();
