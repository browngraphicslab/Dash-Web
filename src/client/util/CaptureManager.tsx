import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { action, computed, observable, runInAction } from "mobx";
import { observer } from "mobx-react";
import * as React from "react";
import { ColorState, SketchPicker } from "react-color";
import { Doc } from "../../fields/Doc";
import { BoolCast, StrCast, Cast } from "../../fields/Types";
import { addStyleSheet, addStyleSheetRule, Utils } from "../../Utils";
import { GoogleAuthenticationManager } from "../apis/GoogleAuthenticationManager";
import { DocServer } from "../DocServer";
import { Networking } from "../Network";
import { MainViewModal } from "../views/MainViewModal";
import { CurrentUserUtils } from "./CurrentUserUtils";
import { GroupManager } from "./GroupManager";
import "./CaptureManager.scss";
import { undoBatch } from "./UndoManager";
const higflyout = require("@hig/flyout");
export const { anchorPoints } = higflyout;
export const Flyout = higflyout.default;

@observer
export class CaptureManager extends React.Component<{}> {
    public static Instance: CaptureManager;
    static _settingsStyle = addStyleSheet();
    @observable isOpen: boolean = false; // whether the CaptureManager is to be displayed or not.


    constructor(props: {}) {
        super(props);
        CaptureManager.Instance = this;
    }

    public close = action(() => this.isOpen = false);
    public open = action(() => this.isOpen = true);


    @computed get colorsContent() {

        return <div className="colors-content">

        </div>;
    }

    @computed get formatsContent() {
        return <div className="prefs-content">

        </div>;
    }





    private get captureInterface() {
        return <div className="settings-interface">
            <div className="settings-panel">

            </div>

            <div className="close-button" onClick={this.close}>
                <FontAwesomeIcon icon={"times"} color="black" size={"lg"} />
            </div>
        </div>;

    }

    render() {
        return <MainViewModal
            contents={this.captureInterface}
            isDisplayed={this.isOpen}
            interactive={true}
            closeOnExternalClick={this.close}
            dialogueBoxStyle={{ width: "500px", height: "300px", background: Cast(Doc.SharingDoc().userColor, "string", null) }} />;
    }
}