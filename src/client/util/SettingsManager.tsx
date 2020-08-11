import { observable, runInAction, action, computed } from "mobx";
import * as React from "react";
import MainViewModal from "../views/MainViewModal";
import { observer } from "mobx-react";
import * as fa from '@fortawesome/free-solid-svg-icons';
import { SelectionManager } from "./SelectionManager";
import "./SettingsManager.scss";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Networking } from "../Network";
import { CurrentUserUtils } from "./CurrentUserUtils";
import { Utils, addStyleSheet, addStyleSheetRule, removeStyleSheetRule } from "../../Utils";
import { Doc } from "../../fields/Doc";
import GroupManager from "./GroupManager";
import GoogleAuthenticationManager from "../apis/GoogleAuthenticationManager";
import { DocServer } from "../DocServer";
import { BoolCast, StrCast, NumCast } from "../../fields/Types";
import { undoBatch } from "./UndoManager";
import { ColorState, SketchPicker } from "react-color";
const higflyout = require("@hig/flyout");
export const { anchorPoints } = higflyout;
export const Flyout = higflyout.default;

@observer
export default class SettingsManager extends React.Component<{}> {
    public static Instance: SettingsManager;
    static _settingsStyle = addStyleSheet();
    @observable private isOpen = false;
    @observable private passwordResultText = "";
    @observable private playgroundMode = false;

    @observable private curr_password = "";
    @observable private new_password = "";
    @observable private new_confirm = "";

    @computed get backgroundColor() { return Doc.UserDoc().defaultColor; }

    constructor(props: {}) {
        super(props);
        SettingsManager.Instance = this;
    }

    public close = action(() => this.isOpen = false);
    public open = action(() => this.isOpen = true);

    private googleAuthorize = action(() => GoogleAuthenticationManager.Instance.fetchOrGenerateAccessToken(true));
    private changePassword = async () => {
        if (!(this.curr_password && this.new_password && this.new_confirm)) {
            runInAction(() => this.passwordResultText = "Error: Hey, we're missing some fields!");
        } else {
            const passwordBundle = { curr_pass: this.curr_password, new_pass: this.new_password, new_confirm: this.new_confirm };
            const { error } = await Networking.PostToServer('/internalResetPassword', passwordBundle);
            runInAction(() => this.passwordResultText = error ? "Error: " + error[0].msg + "..." : "Password successfully updated!");
        }
    }

    @undoBatch selectUserMode = action((e: React.ChangeEvent) => Doc.UserDoc().noviceMode = (e.currentTarget as any)?.value === "Novice");
    @undoBatch changeFontFamily = action((e: React.ChangeEvent) => Doc.UserDoc().fontFamily = (e.currentTarget as any).value);
    @undoBatch changeFontSize = action((e: React.ChangeEvent) => Doc.UserDoc().fontSize = (e.currentTarget as any).value);
    @undoBatch switchColor = action((color: ColorState) => Doc.UserDoc()["default-collection-background"] = String(color.hex));
    @undoBatch
    playgroundModeToggle = action(() => {
        this.playgroundMode = !this.playgroundMode;
        if (this.playgroundMode) {
            DocServer.Control.makeReadOnly();
            addStyleSheetRule(SettingsManager._settingsStyle, "lm_header", { background: "pink !important" });
        }
        else DocServer.Control.makeEditable();
    });

    @computed get preferencesContent() {
        const colorBox = <SketchPicker onChange={this.switchColor} color={StrCast(this.backgroundColor)}
            presetColors={['#D0021B', '#F5A623', '#F8E71C', '#8B572A', '#7ED321', '#417505',
                '#9013FE', '#4A90E2', '#50E3C2', '#B8E986', '#000000', '#4A4A4A', '#9B9B9B',
                '#FFFFFF', '#f1efeb', 'transparent']} />;

        const colorFlyout = <div className="colorFlyout">
            <Flyout anchorPoint={anchorPoints.LEFT_TOP} content={colorBox}>
                <div className="colorFlyout-button" style={{ backgroundColor: StrCast(this.backgroundColor) }} onPointerDown={e => e.stopPropagation()} >
                    <FontAwesomeIcon icon="palette" size="sm" color={StrCast(this.backgroundColor)} />
                </div>
            </Flyout>
        </div>;

        const fontFamilies = ["Times New Roman", "Arial", "Georgia", "Comic Sans MS", "Tahoma", "Impact", "Crimson Text"];
        const fontSizes = ["7pt", "8pt", "9pt", "10pt", "12pt", "14pt", "16pt", "18pt", "20pt", "24pt", "32pt", "48pt", "72pt"];

        return <div className="preferences-content">
            <div className="preferences-color">
                <div className="preferences-color-text">Background Color</div>
                {colorFlyout}
            </div>
            <div className="preferences-font">
                <div className="preferences-font-text">Default Font</div>
                <select className="font-select" onChange={this.changeFontFamily}>
                    {fontFamilies.map(font => <option key={font} value={font} defaultValue={StrCast(Doc.UserDoc().fontFamily)}> {font} </option>)}
                </select>
                <select className="size-select" onChange={this.changeFontSize}>
                    {fontSizes.map(size => <option key={size} value={size} defaultValue={StrCast(Doc.UserDoc().fontSize)}> {size} </option>)}
                </select>
            </div>
        </div>;
    }

    @action
    changeVal = (e: React.ChangeEvent, pass: string) => {
        const value = (e.target as any).value;
        switch (pass) {
            case "curr": this.curr_password = value; break;
            case "new": this.new_password = value; break;
            case "conf": this.new_confirm = value; break;
        }
    }

    @computed get passwordContent() {
        return <div className="password-content">
            <div className="password-content-inputs">
                <input className="password-inputs" type="password" placeholder="current password" onChange={e => this.changeVal(e, "curr")} />
                <input className="password-inputs" type="password" placeholder="new password" onChange={e => this.changeVal(e, "new")} />
                <input className="password-inputs" type="password" placeholder="confirm new password" onChange={e => this.changeVal(e, "conf")} />
            </div>
            <div className="password-content-buttons">
                {!this.passwordResultText ? (null) : <div className={`${this.passwordResultText.startsWith("Error") ? "error" : "success"}-text`}>{this.passwordResultText}</div>}
                <button className="password-submit" onClick={this.changePassword}>submit</button>
                <a className="password-forgot" href="/forgotPassword">forgot password?</a>
            </div>
        </div>;
    }

    @computed get modesContent() {
        return <div className="modes-content">
            <select className="modes-select" onChange={this.selectUserMode} defaultValue={Doc.UserDoc().noviceMode ? "Novice" : "Developer"}>
                <option key={"Novice"} value={"Novice"}> Novice </option>
                <option key={"Developer"} value={"Developer"}> Developer</option>
            </select>
            <div className="modes-playground">
                <input className="playground-check" type="checkbox" checked={this.playgroundMode} onChange={this.playgroundModeToggle} />
                <div className="playground-text">Playground Mode</div>
            </div>
            <div className="default-acl">
                <input className="acl-check" type="checkbox" checked={BoolCast(Doc.UserDoc()?.defaultAclPrivate)} onChange={action(() => Doc.UserDoc().defaultAclPrivate = !Doc.UserDoc().defaultAclPrivate)} />
                <div className="acl-text">Default access private</div>
            </div>
        </div>;
    }

    @computed get accountsContent() {
        return <div className="accounts-content">
            <button onClick={this.googleAuthorize} value="data">Link to Google</button>
            <button onClick={() => GroupManager.Instance?.open()}>Manage groups</button>
        </div>;
    }

    private get settingsInterface() {
        const pairs = [{ title: "Password", ele: this.passwordContent }, { title: "Modes", ele: this.modesContent },
        { title: "Accounts", ele: this.accountsContent }, { title: "Preferences", ele: this.preferencesContent }];
        return <div className="settings-interface">
            <div className="settings-top">
                <div className="settings-title">Settings</div>
                <div className="settings-username">{Doc.CurrentUserEmail}</div>
                <button className="logout-button" onClick={() => window.location.assign(Utils.prepend("/logout"))} >
                    {CurrentUserUtils.GuestWorkspace ? "Exit" : "Log Out"}
                </button>
                <div className="close-button" onClick={this.close}>
                    <FontAwesomeIcon icon={fa.faTimes} color="black" size={"lg"} />
                </div>
            </div>
            <div className="settings-content">
                {pairs.map(pair => <div className="settings-section" key={pair.title}>
                    <div className="settings-section-title">{pair.title}</div>
                    <div className="settings-section-context">{pair.ele}</div>
                </div>
                )}
            </div>
        </div>;
    }

    render() {
        return <MainViewModal
            contents={this.settingsInterface}
            isDisplayed={this.isOpen}
            interactive={true}
            closeOnExternalClick={this.close}
            dialogueBoxStyle={{ width: "600px", height: "340px" }} />;
    }
}