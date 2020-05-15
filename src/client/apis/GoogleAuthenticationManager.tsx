import { observable, action, reaction, runInAction, IReactionDisposer } from "mobx";
import { observer } from "mobx-react";
import * as React from "react";
import MainViewModal from "../views/MainViewModal";
import { Opt } from "../../fields/Doc";
import { Networking } from "../Network";
import "./GoogleAuthenticationManager.scss";
import { Scripting } from "../util/Scripting";

const AuthenticationUrl = "https://accounts.google.com/o/oauth2/v2/auth";
const prompt = "Paste authorization code here...";

@observer
export default class GoogleAuthenticationManager extends React.Component<{}> {
    public static Instance: GoogleAuthenticationManager;
    private authenticationLink: Opt<string> = undefined;
    @observable private openState = false;
    @observable private authenticationCode: Opt<string> = undefined;
    @observable private showPasteTargetState = false;
    @observable private success: Opt<boolean> = undefined;
    @observable private displayLauncher = true;
    @observable private credentials: any;
    private disposer: Opt<IReactionDisposer>;

    private set isOpen(value: boolean) {
        runInAction(() => this.openState = value);
    }

    private set shouldShowPasteTarget(value: boolean) {
        runInAction(() => this.showPasteTargetState = value);
    }

    public cancel() {
        this.openState && this.resetState(0, 0);
    }

    public fetchOrGenerateAccessToken = async (displayIfFound = false) => {
        let response: any = await Networking.FetchFromServer("/readGoogleAccessToken");
        // if this is an authentication url, activate the UI to register the new access token
        if (new RegExp(AuthenticationUrl).test(response)) {
            this.isOpen = true;
            this.authenticationLink = response;
            return new Promise<string>(async resolve => {
                this.disposer?.();
                this.disposer = reaction(
                    () => this.authenticationCode,
                    async authenticationCode => {
                        if (authenticationCode && /\d{1}\/[\w-]{55}/.test(authenticationCode)) {
                            this.disposer?.();
                            const response = await Networking.PostToServer("/writeGoogleAccessToken", { authenticationCode });
                            runInAction(() => {
                                this.success = true;
                                this.credentials = response;
                            });
                            this.resetState();
                            resolve(response.access_token);
                        }
                    }
                );
            });
        }

        // otherwise, we already have a valid, stored access token and user info
        response = JSON.parse(response);
        if (displayIfFound) {
            runInAction(() => {
                this.success = true;
                this.credentials = response;
            });
            this.resetState(-1, -1);
            this.isOpen = true;
        }
        return response.access_token;
    }

    resetState = action((visibleForMS: number = 3000, fadesOutInMS: number = 500) => {
        if (!visibleForMS && !fadesOutInMS) {
            runInAction(() => {
                this.isOpen = false;
                this.success = undefined;
                this.displayLauncher = true;
                this.credentials = undefined;
                this.shouldShowPasteTarget = false;
                this.authenticationCode = undefined;
            });
            return;
        }
        this.authenticationCode = undefined;
        this.displayLauncher = false;
        this.shouldShowPasteTarget = false;
        if (visibleForMS > 0 && fadesOutInMS > 0) {
            setTimeout(action(() => {
                this.isOpen = false;
                setTimeout(action(() => {
                    this.success = undefined;
                    this.displayLauncher = true;
                    this.credentials = undefined;
                }), fadesOutInMS);
            }), visibleForMS);
        }
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
                        setTimeout(() => this.shouldShowPasteTarget = true, 500);
                    }}
                    style={{ marginBottom: this.showPasteTargetState ? 15 : 0 }}
                >Authorize a Google account...</button> : (null)}
                {this.showPasteTargetState ? <input
                    className={'paste-target'}
                    onChange={action(e => this.authenticationCode = e.currentTarget.value)}
                    placeholder={prompt}
                /> : (null)}
                {this.credentials ?
                    <>
                        <img
                            className={'avatar'}
                            src={this.credentials.userInfo.picture}
                        />
                        <span
                            className={'welcome'}
                        >Welcome to Dash, {this.credentials.userInfo.name}
                        </span>
                        <div
                            className={'disconnect'}
                            onClick={async () => {
                                await Networking.FetchFromServer("/revokeGoogleAccessToken");
                                this.resetState(0, 0);
                            }}
                        >Disconnect Account</div>
                    </> : (null)}
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

Scripting.addGlobal("GoogleAuthenticationManager", GoogleAuthenticationManager);