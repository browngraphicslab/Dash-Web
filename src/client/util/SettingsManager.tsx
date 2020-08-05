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
import { Utils, addStyleSheet, addStyleSheetRule, removeStyleSheetRule } from "../../Utils";
import { Doc } from "../../fields/Doc";
import GroupManager from "./GroupManager";
import HypothesisAuthenticationManager from "../apis/HypothesisAuthenticationManager";
import GoogleAuthenticationManager from "../apis/GoogleAuthenticationManager";
import { DocServer } from "../DocServer";
import { BoolCast } from "../../fields/Types";
import { undoBatch } from "./UndoManager";
import { ColorState, SketchPicker } from "react-color";
const higflyout = require("@hig/flyout");
export const { anchorPoints } = higflyout;
export const Flyout = higflyout.default;

library.add(fa.faTimes);

@observer
export default class SettingsManager extends React.Component<{}> {
    public static Instance: SettingsManager;
    static _settingsStyle = addStyleSheet();
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


    @observable private backgroundColor = "white";

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
        GoogleAuthenticationManager.Instance.fetchOrGenerateAccessToken(true);
    }
    @action
    hypothesisAuthorize = (event: any) => {
        HypothesisAuthenticationManager.Instance.fetchAccessToken(true);
    }

    @action
    togglePlaygroundMode = () => {
        this.playgroundMode = !this.playgroundMode;
        if (this.playgroundMode) DocServer.Control.makeReadOnly();
        else DocServer.Control.makeEditable();

        addStyleSheetRule(SettingsManager._settingsStyle, "lm_header", { background: "pink !important" });
    }

    @action
    changeMode = (e: any) => {
        if (e.currentTarget.value === "Novice") {
            Doc.UserDoc().noviceMode = true;
        } else {
            Doc.UserDoc().noviceMode = false;
        }
    }

    @action @undoBatch
    switchColor = (color: ColorState) => {
        const val = String(color.hex);
        this.backgroundColor = val;
        return true;
    }

    private get settingsInterface() {

        const oldSettings = <div className={"settings-interface"}>
            <div className="settings-heading">
                <h1>Settings</h1>
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
                    <button onClick={() => GroupManager.Instance.open()}>Manage groups</button>
                    <button onClick={() => window.location.assign(Utils.prepend("/logout"))}>
                        {CurrentUserUtils.GuestWorkspace ? "Exit" : "Log Out"}
                    </button>
                </div>
                {this.settingsContent === "password" ?
                    <div className="settings-content">
                        <input placeholder="current password" ref={this.curr_password_ref} />
                        <input placeholder="new password" ref={this.new_password_ref} />
                        <input placeholder="confirm new password" ref={this.new_confirm_ref} />
                        {this.errorText ? <div className="error-text">{this.errorText}</div> : undefined}
                        {this.successText ? <div className="success-text">{this.successText}</div> : undefined}
                        <button onClick={this.dispatchRequest}>submit</button>
                        <a style={{ marginLeft: 65, marginTop: -20 }} href="/forgotPassword">forgot password?</a>

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

        </div>;


        const passwordContent = <div className="password-content">
            <div className="password-content-inputs">
                <input className="password-inputs" placeholder="current password" ref={this.curr_password_ref} />
                <input className="password-inputs" placeholder="new password" ref={this.new_password_ref} />
                <input className="password-inputs" placeholder="confirm new password" ref={this.new_confirm_ref} />
            </div>
            <div className="password-content-buttons">
                {this.errorText ? <div className="error-text">{this.errorText}</div> : undefined}
                {this.successText ? <div className="success-text">{this.successText}</div> : undefined}
                <button className="password-submit" onClick={this.dispatchRequest}>submit</button>
                <a className="password-forgot" style={{ marginLeft: 65, marginTop: -20 }}
                    href="/forgotPassword">forgot password?</a>
            </div>
        </div>;

        const modesContent = <div className="modes-content">
            <select className="modes-select"
                onChange={e => this.changeMode(e)}>
                <option key={"Novice"} value={"Novice"} selected={BoolCast(Doc.UserDoc().noviceMode)}>
                    Novice
                </option>
                <option key={"Developer"} value={"Developer"} selected={!BoolCast(Doc.UserDoc().noviceMode)}>
                    Developer
                </option>
            </select>
            <div className="modes-playground">
                <input className="playground-check" type="checkbox"
                    checked={this.playgroundMode}
                    onChange={undoBatch(action(() => this.togglePlaygroundMode()))}
                /><div className="playground-text">Playground Mode</div>
            </div>
        </div>;

        const accountsContent = <div className="accounts-content">
            <button onClick={this.googleAuthorize} value="data">{`Link to Google`}</button>
            <button onClick={this.hypothesisAuthorize} value="data">{`Link to Hypothes.is`}</button>
            <button onClick={() => GroupManager.Instance.open()}>Manage groups</button>
        </div>;

        const colorBox = <SketchPicker onChange={this.switchColor}
            presetColors={['#D0021B', '#F5A623', '#F8E71C', '#8B572A', '#7ED321', '#417505',
                '#9013FE', '#4A90E2', '#50E3C2', '#B8E986', '#000000', '#4A4A4A', '#9B9B9B',
                '#FFFFFF', '#f1efeb', 'transparent']}
            color={this.backgroundColor} />;

        const colorFlyout = <div className="colorFlyout">
            <Flyout anchorPoint={anchorPoints.LEFT_TOP}
                content={colorBox}>
                <div>
                    <div className="colorFlyout-button" style={{ backgroundColor: this.backgroundColor }}
                        onPointerDown={e => e.stopPropagation()} >
                        <FontAwesomeIcon icon="palette" size="sm" color={this.backgroundColor} />
                    </div>
                </div>
            </Flyout>
        </div>;

        const preferencesContent = <div className="preferences-content">
            <div className="preferences-color">
                <div className="preferences-color-text">Background Color</div> {colorFlyout}
            </div>
            <div className="preferences-font">
                <div className="preferences-font-text">Default Font</div>
                <select className="font-select"
                    onChange={e => this.changeMode(e)}>
                    <option key={"Times New Roman"} value={"Times New Roman"} selected={BoolCast(Doc.UserDoc().noviceMode)}>
                        Times New Roman
                    </option>
                    <option key={"Georgia"} value={"Georgia"} selected={!BoolCast(Doc.UserDoc().noviceMode)}>
                        Georgia
                    </option>
                    <option key={"Georgia"} value={"Georgia"} selected={!BoolCast(Doc.UserDoc().noviceMode)}>
                        Georgia
                    </option>
                </select>
                <select className="size-select"
                    onChange={e => this.changeMode(e)}>
                    <option key={"5px"} value={"5px"} selected={BoolCast(Doc.UserDoc().noviceMode)}>
                        5px
                    </option>
                    <option key={"8px"} value={"8px"} selected={!BoolCast(Doc.UserDoc().noviceMode)}>
                        8px
                    </option>
                </select>
            </div>
        </div>;

        return (<div className="settings-interface">
            <div className="settings-top">
                <div className="settings-title">Settings</div>
                <button onClick={() => window.location.assign(Utils.prepend("/logout"))}>
                    {CurrentUserUtils.GuestWorkspace ? "Exit" : "Log Out"}
                </button>
                <div className="close-button" onClick={this.close}>
                    <FontAwesomeIcon icon={fa.faTimes} color="black" size={"lg"} />
                </div>
            </div>
            <div className="settings-content">
                <div className="settings-section">
                    <div className="settings-section-title">Password</div>
                    <div className="settings-section-context">{passwordContent}</div>
                </div>
                <div className="settings-section">
                    <div className="settings-section-title">Modes</div>
                    <div className="settings-section-context">{modesContent}</div>
                </div>
                <div className="settings-section">
                    <div className="settings-section-title">Accounts</div>
                    <div className="settings-section-context">{accountsContent}</div>
                </div>
                <div className="settings-section" style={{ paddingBottom: 4 }}>
                    <div className="settings-section-title">Preferences</div>
                    <div className="settings-section-context">{preferencesContent}</div>
                </div>
            </div>
        </div>);
    }

    render() {
        return (
            <MainViewModal
                contents={this.settingsInterface}
                isDisplayed={this.isOpen}
                interactive={true}
                closeOnExternalClick={this.close}
                width={600}
                height={340}
            />
        );
    }

}