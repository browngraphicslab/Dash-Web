import { observable, runInAction, action } from "mobx";
import * as React from "react";
import MainViewModal from "../views/MainViewModal";
import { observer } from "mobx-react";
import { library } from '@fortawesome/fontawesome-svg-core';
import * as fa from '@fortawesome/free-solid-svg-icons';
import { SelectionManager } from "./SelectionManager";
import "./SettingsManager.scss";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Networking } from "../Network";
import { CurrentUserUtils } from "./CurrentUserUtils";
import { Utils } from "../../Utils";
import { Doc } from "../../fields/Doc";
import GroupManager from "./GroupManager";
import HypothesisAuthenticationManager from "../apis/HypothesisAuthenticationManager";
import GoogleAuthenticationManager from "../apis/GoogleAuthenticationManager";
import { togglePlaygroundMode } from "../../fields/util";

library.add(fa.faTimes);

@observer
export default class SettingsManager extends React.Component<{}> {
    public static Instance: SettingsManager;
    @observable private isOpen = false;
    @observable private dialogueBoxOpacity = 1;
    @observable private overlayOpacity = 0.4;
    @observable private settingsContent = "password";
    @observable private errorText = "";
    @observable private successText = "";
    @observable private playgroundMode = false;
    private curr_password_ref = React.createRef<HTMLInputElement>();
    private new_password_ref = React.createRef<HTMLInputElement>();
    private new_confirm_ref = React.createRef<HTMLInputElement>();

    public open = action(() => {
        SelectionManager.DeselectAll();
        this.isOpen = true;
    });

    public close = action(() => {
        this.isOpen = false;
    });

    constructor(props: {}) {
        super(props);
        SettingsManager.Instance = this;
    }

    @action
    private dispatchRequest = async () => {
        const curr_pass = this.curr_password_ref.current?.value;
        const new_pass = this.new_password_ref.current?.value;
        const new_confirm = this.new_confirm_ref.current?.value;

        if (!(curr_pass && new_pass && new_confirm)) {
            this.changeAlertText("Hey, we're missing some fields!", "");
            return;
        }

        const passwordBundle = {
            curr_pass,
            new_pass,
            new_confirm
        };

        const { error } = await Networking.PostToServer('/internalResetPassword', passwordBundle);
        if (error) {
            this.changeAlertText("Uh oh! " + error[0].msg + "...", "");
            return;
        }

        this.changeAlertText("", "Password successfully updated!");
    }

    @action
    private changeAlertText = (errortxt: string, successtxt: string) => {
        this.errorText = errortxt;
        this.successText = successtxt;
    }

    @action
    onClick = (event: any) => {
        this.settingsContent = event.currentTarget.value;
        this.errorText = "";
        this.successText = "";
    }
    @action
    noviceToggle = (event: any) => {
        Doc.UserDoc().noviceMode = !Doc.UserDoc().noviceMode;
    }
    @action
    googleAuthorize = (event: any) => {
        GoogleAuthenticationManager.Instance.fetchOrGenerateAccessToken(true)
    }
    @action
    hypothesisAuthorize = (event: any) => {
        HypothesisAuthenticationManager.Instance.fetchAccessToken(true)
    }

    @action
    togglePlaygroundMode = () => {
        togglePlaygroundMode();
        this.playgroundMode = !this.playgroundMode;
    }

    private get settingsInterface() {
        return (
            <div className={"settings-interface"}>
                <div className="settings-heading">
                    <h1>settings</h1>
                    <div className={"close-button"} onClick={this.close}>
                        <FontAwesomeIcon icon={fa.faTimes} color="black" size={"lg"} />
                    </div>
                </div>
                <div className="settings-body">
                    <div className="settings-type">
                        <button onClick={this.onClick} value="password">reset password</button>
                        <button onClick={this.noviceToggle} value="data">{`Set ${Doc.UserDoc().noviceMode ? "developer" : "novice"} mode`}</button>
                        <button onClick={this.togglePlaygroundMode}>{`${this.playgroundMode ? "Disable" : "Enable"} playground mode`}</button>
                        <button onClick={this.googleAuthorize} value="data">{`Link to Google`}</button>
                        <button onClick={this.hypothesisAuthorize} value="data">{`Link to Hypothes.is`}</button>
                        <button onClick={() => window.location.assign(Utils.prepend("/logout"))}>
                            {CurrentUserUtils.GuestWorkspace ? "Exit" : "Log Out"}
                        </button>
                        <button onClick={() => GroupManager.Instance.open()}>Manage groups</button>
                    </div>
                    {this.settingsContent === "password" ?
                        <div className="settings-content">
                            <input placeholder="current password" ref={this.curr_password_ref} />
                            <input placeholder="new password" ref={this.new_password_ref} />
                            <input placeholder="confirm new password" ref={this.new_confirm_ref} />
                            {this.errorText ? <div className="error-text">{this.errorText}</div> : undefined}
                            {this.successText ? <div className="success-text">{this.successText}</div> : undefined}
                            <button onClick={this.dispatchRequest}>submit</button>
                            <a href="/forgotPassword">forgot password?</a>

                        </div>
                        : undefined}
                    {this.settingsContent === "data" ?
                        <div className="settings-content">
                            <p>WARNING: <br />
                                THIS WILL ERASE ALL YOUR CURRENT DOCUMENTS STORED ON DASH. IF YOU WISH TO PROCEED, CLICK THE BUTTON BELOW.</p>
                            <button className="delete-button">DELETE</button>
                        </div>
                        : undefined}
                </div>

            </div>
        );
    }

    render() {
        return (
            <MainViewModal
                contents={this.settingsInterface}
                isDisplayed={this.isOpen}
                interactive={true}
                dialogueBoxDisplayedOpacity={this.dialogueBoxOpacity}
                overlayDisplayedOpacity={this.overlayOpacity}
                closeOnExternalClick={this.close}
            />
        );
    }

}