import { observable, action, reaction, runInAction, IReactionDisposer } from "mobx";
import { observer } from "mobx-react";
import * as React from "react";
import MainViewModal from "../views/MainViewModal";
import { Opt } from "../../fields/Doc";
import { Networking } from "../Network";
import "./HypothesisAuthenticationManager.scss";
import { Scripting } from "../util/Scripting";

const prompt = "Paste authorization code here...";

@observer
export default class HypothesisAuthenticationManager extends React.Component<{}> {
    public static Instance: HypothesisAuthenticationManager;
    private authenticationLink: Opt<string> = undefined;
    @observable private openState = false;
    @observable private authenticationCode: Opt<string> = undefined;
    @observable private showPasteTargetState = false;
    @observable private success: Opt<boolean> = undefined;
    @observable private displayLauncher = true;
    @observable private credentials: string;
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

    public fetchAccessToken = async (displayIfFound = false) => {
        const response: any = await Networking.FetchFromServer("/readHypothesisAccessToken");
        // if this is an authentication url, activate the UI to register the new access token
        if (!response) { // new RegExp(AuthenticationUrl).test(response)) {
            this.isOpen = true;
            this.authenticationLink = response;
            return new Promise<string>(async resolve => {
                this.disposer?.();
                this.disposer = reaction(
                    () => this.authenticationCode,
                    async authenticationCode => {
                        if (authenticationCode) {
                            this.disposer?.();
                            Networking.PostToServer("/writeHypothesisAccessToken", { authenticationCode });
                            runInAction(() => {
                                this.success = true;
                                this.credentials = response;
                            });
                            this.resetState();
                            resolve(authenticationCode);
                        }
                    }
                );
            });
        }

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
                this.credentials = "";
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
                    this.credentials = "";
                }), fadesOutInMS);
            }), visibleForMS);
        }
    });

    constructor(props: {}) {
        super(props);
        HypothesisAuthenticationManager.Instance = this;
    }

    private get renderPrompt() {
        return (
            <div className={'authorize-container'}>

                {this.displayLauncher ? <button
                    className={"dispatch"}
                    onClick={() => {
                        this.shouldShowPasteTarget = true;
                    }}
                    style={{ marginBottom: this.showPasteTargetState ? 15 : 0 }}
                >Authorize a Hypothesis account...</button> : (null)}
                {this.showPasteTargetState ? <input
                    className={'paste-target'}
                    onChange={action(e => this.authenticationCode = e.currentTarget.value)}
                    placeholder={prompt}
                /> : (null)}
                {this.credentials ?
                    <>
                        <span
                            className={'welcome'}
                        >Welcome to Dash, {this.credentials}
                        </span>
                        <div
                            className={'disconnect'}
                            onClick={async () => {
                                await Networking.FetchFromServer("/revokeHypothesisAccessToken");
                                this.resetState(0, 0);
                            }}
                        >Disconnect Account</div>
                    </> : (null)}
            </div>
        );
    }

    private get dialogueBoxStyle() {
        const borderColor = this.success === undefined ? "black" : this.success ? "green" : "red";
        return { borderColor, transition: "0.2s borderColor ease", zIndex: 1002 };
    }

    render() {
        return (
            <MainViewModal
                isDisplayed={this.openState}
                interactive={true}
                contents={this.renderPrompt}
                // overlayDisplayedOpacity={0.9}
                dialogueBoxStyle={this.dialogueBoxStyle}
                overlayStyle={{ zIndex: 1001 }}
                closeOnExternalClick={action(() => this.isOpen = false)}
            />
        );
    }

}

Scripting.addGlobal("HypothesisAuthenticationManager", HypothesisAuthenticationManager);