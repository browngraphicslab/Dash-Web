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

library.add(fa.faWindowClose);

@observer
export default class SettingsManager extends React.Component<{}> {
    public static Instance: SettingsManager;
    @observable private isOpen = false;
    @observable private dialogueBoxOpacity = 1;
    @observable private overlayOpacity = 0.4;
    @observable private settingsContent = "settings";
    @observable private errorText = "";
    @observable private successText = "";
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
            // alert("Hey we're missing some fields!");
            return;
        }

        const passwordBundle = {
            curr_pass,
            new_pass,
            new_confirm
        };

        const res = await Networking.PostToServer('/internalResetPassword', passwordBundle);
        const error = res.error;
        console.log(res, "is res");
        if (error) {
            console.log(error, error[0].msg);
            this.changeAlertText("Uh oh! " + error[0].msg + "...", "");
            // alert("Uh oh! " + error.msg);
            return;
        }

        this.changeAlertText("", "Password successfully updated!");
        console.log('success!');
        // alert("Password successfully updated!");
    }

    @action
    private changeAlertText = (errortxt: string, successtxt: string) => {
        this.errorText = errortxt;
        this.successText = successtxt;
    }

    @action
    onClick = (event: any) => {
        this.settingsContent = event.currentTarget.value;
    }

    private get settingsInterface() {
        return (
            <div className={"settings-interface"}>
                <div className="settings-heading">
                    <h1>settings</h1>
                    <div className={"close-button"} onClick={this.close}>
                        <FontAwesomeIcon icon={fa.faWindowClose} size={"lg"} />
                    </div>
                </div>
                <div className="settings-body">
                    <div className="settings-type">
                        <button onClick={this.onClick} value="settings">settings</button>
                        <button onClick={this.onClick} value="data">data</button>
                    </div>
                    {this.settingsContent === "settings" ?
                        <div className="settings-content">
                            change password here:
                            <input placeholder="current password" ref={this.curr_password_ref} />
                            <input placeholder="new password" ref={this.new_password_ref} />
                            <input placeholder="confirm new password" ref={this.new_confirm_ref} />
                            {this.errorText ? <div className="error-text">{this.errorText}</div> : undefined}
                            {this.successText ? <div className="success-text">{this.successText}</div> : undefined}
                            <button onClick={this.dispatchRequest}>submit</button>

                        </div>
                        :
                        <div className="settings-content">hello?</div>}
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
            />
        );
    }

}