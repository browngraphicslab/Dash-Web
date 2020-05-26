import { observable, action, reaction, runInAction } from "mobx";
import { observer } from "mobx-react";
import * as React from "react";
import MainViewModal from "../views/MainViewModal";
import { Opt } from "../../fields/Doc";
import { Networking } from "../Network";
import "./GoogleAuthenticationManager.scss";

const AuthenticationUrl = "https://accounts.google.com/o/oauth2/v2/auth";
const prompt = "Paste authorization code here...";

@observer
export default class GoogleAuthenticationManager extends React.Component<{}> {
    public static Instance: GoogleAuthenticationManager;
    private authenticationLink: Opt<string> = undefined;
    @observable private openState = false;
    @observable private authenticationCode: Opt<string> = undefined;
    @observable private clickedState = false;
    @observable private success: Opt<boolean> = undefined;
    @observable private displayLauncher = true;
    @observable private avatar: Opt<string> = undefined;
    @observable private username: Opt<string> = undefined;

    private set isOpen(value: boolean) {
        runInAction(() => this.openState = value);
    }

    private set hasBeenClicked(value: boolean) {
        runInAction(() => this.clickedState = value);
    }

    public fetchOrGenerateAccessToken = async () => {
        const response = await Networking.FetchFromServer("/readGoogleAccessToken");
        // if this is an authentication url, activate the UI to register the new access token
        if (new RegExp(AuthenticationUrl).test(response)) {
            this.isOpen = true;
            this.authenticationLink = response;
            return new Promise<string>(async resolve => {
                const disposer = reaction(
                    () => this.authenticationCode,
                    async authenticationCode => {
                        if (authenticationCode) {
                            disposer();
                            const { access_token, avatar, name } = await Networking.PostToServer("/writeGoogleAccessToken", { authenticationCode });
                            runInAction(() => {
                                this.avatar = avatar;
                                this.username = name;
                                this.hasBeenClicked = false;
                                this.success = false;
                            });
                            this.beginFadeout();
                            resolve(access_token);
                        }
                    }
                );
            });
        }
        // otherwise, we already have a valid, stored access token
        return response;
    }

    beginFadeout = action(() => {
        this.success = true;
        this.authenticationCode = undefined;
        this.displayLauncher = false;
        this.hasBeenClicked = false;
        setTimeout(action(() => {
            this.isOpen = false;
            setTimeout(action(() => {
                this.success = undefined;
                this.displayLauncher = true;
                this.avatar = undefined;
                this.username = undefined;
            }), 500);
        }), 3000);
    });

    constructor(props: {}) {
        super(props);
        GoogleAuthenticationManager.Instance = this;
    }

    private get renderPrompt() {
        return (
            <div className={'authorize-container'}>
                {this.displayLauncher ? <button
                    className={"dispatch"}
                    onClick={() => {
                        window.open(this.authenticationLink);
                        setTimeout(() => this.hasBeenClicked = true, 500);
                    }}
                    style={{ marginBottom: this.clickedState ? 15 : 0 }}
                >Authorize a Google account...</button> : (null)}
                {this.clickedState ? <input
                    className={'paste-target'}
                    onChange={action(e => this.authenticationCode = e.currentTarget.value)}
                    placeholder={prompt}
                /> : (null)}
                {this.avatar ? <img
                    className={'avatar'}
                    src={this.avatar}
                /> : (null)}
                {this.username ? <span
                    className={'welcome'}
                >Welcome to Dash, {this.username}
                </span> : (null)}
            </div>
        );
    }

    private get dialogueBoxStyle() {
        const borderColor = this.success === undefined ? "black" : this.success ? "green" : "red";
        return { borderColor, transition: "0.2s borderColor ease" };
    }

    render() {
        return (
            <MainViewModal
                isDisplayed={this.openState}
                interactive={true}
                contents={this.renderPrompt}
                overlayDisplayedOpacity={0.9}
                dialogueBoxStyle={this.dialogueBoxStyle}
            />
        );
    }

}