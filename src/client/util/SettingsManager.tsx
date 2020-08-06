import { observable, runInAction, action, computed } from "mobx";
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
import { BoolCast, StrCast, NumCast } from "../../fields/Types";
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

    @observable private curr_password: string = "";
    @observable private new_password: string = "";
    @observable private new_confirm: string = "";

    @computed get backgroundColor() { return Doc.UserDoc().defaultColor; }

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

    @action
    changeFontFamily = (e: any) => {
        Doc.UserDoc().fontFamily = e.currentTarget.value;
    }

    @action
    changeFontSize = (e: any) => {
        Doc.UserDoc().fontSize = e.currentTarget.value;
    }

    @action @undoBatch
    switchColor = (color: ColorState) => {
        const val = String(color.hex);
        Doc.UserDoc().defaultColor = val;
        return true;
    }

    @computed get allowSubmit() {
        return this.curr_password.length > 3 &&
            this.new_password.length > 3 &&
            this.new_confirm.length > 3 && this.new_confirm === this.new_password &&
            this.new_password !== this.curr_password ? true : false;
    }

    @action
    changeVal = (e: any, pass: string) => {
        if (pass === "curr") {
            this.curr_password = e.target.value;
        } else if (pass === "new") {
            this.new_password = e.target.value;
        } else if (pass === "conf") {
            this.new_confirm = e.target.value;
        }
    }

    @computed get passwordContent() {
        return <div className="password-content">
            <div className="password-content-inputs">
                <input className="password-inputs" type="password" placeholder="current password" onChange={e => this.changeVal(e, "curr")} ref={this.curr_password_ref} />
                <input className="password-inputs" type="password" placeholder="new password" onChange={e => this.changeVal(e, "new")} ref={this.new_password_ref} />
                <input className="password-inputs" type="password" placeholder="confirm new password" onChange={e => this.changeVal(e, "conf")} ref={this.new_confirm_ref} />
            </div>
            <div className="password-content-buttons">
                {this.errorText ? <div className="error-text">{this.errorText}</div> : undefined}
                {this.successText ? <div className="success-text">{this.successText}</div> : undefined}
                {this.allowSubmit ? <button className="password-submit"
                    onClick={this.dispatchRequest}>submit</button> : <div className="grey-submit"> submit </div>}
                <a className="password-forgot" style={{ marginLeft: 65, marginTop: -20 }}
                    href="/forgotPassword">forgot password?</a>
            </div>
        </div>;
    }

    @computed get modesContent() {
        return <div className="modes-content">
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
    }

    @computed get accountsContent() {
        return <div className="accounts-content">
            <button onClick={this.googleAuthorize}
                style={{ paddingLeft: 20, paddingRight: 20, marginRight: 35 }}
                value="data">{`Link to Google`}</button>
            {/* <button onClick={this.hypothesisAuthorize} value="data">{`Link to Hypothes.is`}</button> */}
            <button onClick={() => GroupManager.Instance.open()}
                style={{ paddingLeft: 20, paddingRight: 20 }}>Manage groups</button>
        </div>;
    }

    @computed get colorBox() {
        return <SketchPicker onChange={this.switchColor}
            presetColors={['#D0021B', '#F5A623', '#F8E71C', '#8B572A', '#7ED321', '#417505',
                '#9013FE', '#4A90E2', '#50E3C2', '#B8E986', '#000000', '#4A4A4A', '#9B9B9B',
                '#FFFFFF', '#f1efeb', 'transparent']}
            color={StrCast(this.backgroundColor)} />;
    }

    @computed get colorFlyout() {
        return <div className="colorFlyout">
            <Flyout anchorPoint={anchorPoints.LEFT_TOP}
                content={this.colorBox}>
                <div>
                    <div className="colorFlyout-button" style={{ backgroundColor: StrCast(this.backgroundColor) }}
                        onPointerDown={e => e.stopPropagation()} >
                        <FontAwesomeIcon icon="palette" size="sm" color={StrCast(this.backgroundColor)} />
                    </div>
                </div>
            </Flyout>
        </div>;
    }

    @computed get preferencesContent() {
        const fontFamilies: string[] = ["Times New Roman", "Arial", "Georgia", "Comic Sans MS", "Tahoma", "Impact", "Crimson Text"];
        const fontSizes: string[] = ["7pt", "8pt", "9pt", "10pt", "12pt", "14pt", "16pt", "18pt", "20pt", "24pt", "32pt", "48pt", "72pt"];

        const preferencesContent = <div className="preferences-content">
            <div className="preferences-color">
                <div className="preferences-color-text">Background Color</div> {this.colorFlyout}
            </div>
            <div className="preferences-font">
                <div className="preferences-font-text">Default Font</div>
                <select className="font-select"
                    onChange={e => this.changeFontFamily(e)}>
                    {fontFamilies.map((font) => {
                        return <option key={font} value={font} selected={StrCast(Doc.UserDoc().fontFamily) === font}>
                            {font}
                        </option>;
                    })}
                </select>
                <select className="size-select"
                    onChange={e => this.changeFontSize(e)}>
                    {fontSizes.map((size) => {
                        return <option key={size} value={size} selected={StrCast(Doc.UserDoc().fontSize) === size}>
                            {size}
                        </option>;
                    })}
                </select>
            </div>
        </div>;

        return preferencesContent;
    }


    @computed private get settingsInterface() {

        return (<div className="settings-interface">
            <div className="settings-top">
                <div className="settings-title">Settings</div>
                <div className="settings-username">
                    <div style={{ fontSize: 9 }}> Signed in as: </div>
                    <div> {Doc.CurrentUserEmail}</div>
                </div>
                <button onClick={() => window.location.assign(Utils.prepend("/logout"))}
                    //style={{ right: 35, position: "absolute" }} >
                    style={{ left: 137, position: "absolute" }} >
                    {CurrentUserUtils.GuestWorkspace ? "Exit" : "Log Out"}
                </button>
                <div className="close-button" onClick={this.close}>
                    <FontAwesomeIcon icon={fa.faTimes} color="black" size={"lg"} />
                </div>
            </div>
            <div className="settings-content">
                <div className="settings-section">
                    <div className="settings-section-title">Password</div>
                    <div className="settings-section-context">{this.passwordContent}</div>
                </div>
                <div className="settings-section">
                    <div className="settings-section-title">Modes</div>
                    <div className="settings-section-context">{this.modesContent}</div>
                </div>
                <div className="settings-section">
                    <div className="settings-section-title">Accounts</div>
                    <div className="settings-section-context">{this.accountsContent}</div>
                </div>
                <div className="settings-section" style={{ paddingBottom: 4 }}>
                    <div className="settings-section-title">Preferences</div>
                    <div className="settings-section-context">{this.preferencesContent}</div>
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
                dialogueBoxStyle={{ width: "600px", height: "340px" }}
            />
        );
    }

}