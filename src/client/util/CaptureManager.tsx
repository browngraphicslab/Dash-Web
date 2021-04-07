import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { action, computed, observable, runInAction } from "mobx";
import { observer } from "mobx-react";
import * as React from "react";
import { Doc } from "../../fields/Doc";
import { BoolCast, StrCast, Cast } from "../../fields/Types";
import { addStyleSheet, addStyleSheetRule, Utils } from "../../Utils";
import { MainViewModal } from "../views/MainViewModal";
import "./CaptureManager.scss";
import { undoBatch } from "./UndoManager";
const higflyout = require("@hig/flyout");
export const { anchorPoints } = higflyout;
export const Flyout = higflyout.default;

@observer
export class CaptureManager extends React.Component<{}> {
    public static Instance: CaptureManager;
    static _settingsStyle = addStyleSheet();
    @observable _document: any;
    @observable isOpen: boolean = false; // whether the CaptureManager is to be displayed or not.


    constructor(props: {}) {
        super(props);
        CaptureManager.Instance = this;
    }

    public close = action(() => this.isOpen = false);
    public open = action((doc: Doc) => {
        this.isOpen = true;
        this._document = doc;
    });


    @computed get visibilityContent() {

        return <div className="capture-block">
            <div className="capture-block-title">Visibility
                <div className="visibility-radio">
                    <input type="radio" value="private" name="visibility" /> Private
                    <input type="radio" value="public" name="visibility" /> Public
                </div>
            </div>
        </div>;
    }

    @computed get linksContent() {
        return <div className="capture-block">
            <div className="capture-block-title">Links</div>

        </div>;
    }





    private get captureInterface() {
        return <div className="capture-interface">
            <div className="capture-t1">
                <div className="recordButtonOutline" style={{}}>
                    <div className="recordButtonInner" style={{}}>
                    </div>
                </div>
                Conversation Capture
            </div>
            <div className="capture-t2">

            </div>
            {this.visibilityContent}
            {this.linksContent}
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
            dialogueBoxStyle={{ width: "500px", height: "300px", border: "none", background: Cast(Doc.SharingDoc().userColor, "string", null) }}
            overlayStyle={{ background: "black" }}
            overlayDisplayedOpacity={0.6}
        />
    }
}