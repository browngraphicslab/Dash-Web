import { observable, action, reaction, runInAction } from "mobx";
import { observer } from "mobx-react";
import * as React from "react";
import MainViewModal from "../views/MainViewModal";
import { Opt } from "../../new_fields/Doc";
import { Identified } from "../Network";
import { RouteStore } from "../../server/RouteStore";
import "./GoogleAuthenticationManager.scss";

const AuthenticationUrl = "https://accounts.google.com/o/oauth2/v2/auth";
const prompt = "Paste authorization code here...";

@observer
export default class GoogleAuthenticationManager extends React.Component<{}> {
    public static Instance: GoogleAuthenticationManager;
    @observable private openState = false;
    private authenticationLink: Opt<string> = undefined;
    @observable private authenticationCode: Opt<string> = undefined;
    @observable private clickedState = false;
    @observable private success: Opt<boolean> = undefined;
    @observable private displayLauncher = true;

    private set isOpen(value: boolean) {
        runInAction(() => this.openState = value);
    }

    private set hasBeenClicked(value: boolean) {
        runInAction(() => this.clickedState = value);
    }

    public fetchOrGenerateAccessToken = async () => {
        let response = await Identified.FetchFromServer(RouteStore.readGoogleAccessToken);
        // if this is an authentication url, activate the UI to register the new access token
        if (new RegExp(AuthenticationUrl).test(response)) {
            this.isOpen = true;
            this.authenticationLink = response;
            return new Promise<string>(async resolve => {
                const disposer = reaction(
                    () => this.authenticationCode,
                    authenticationCode => {
                        if (authenticationCode) {
                            Identified.PostToServer(RouteStore.writeGoogleAccessToken, { authenticationCode }).then(
                                token => {
                                    runInAction(() => this.success = true);
                                    setTimeout(() => {
                                        this.isOpen = false;
                                        runInAction(() => this.displayLauncher = false);
                                        setTimeout(() => {
                                            runInAction(() => this.success = undefined);
                                            runInAction(() => this.displayLauncher = true);
                                            this.hasBeenClicked = false;
                                        }, 500);
                                    }, 1000);
                                    disposer();
                                    resolve(token);
                                },
                                () => {
                                    this.hasBeenClicked = false;
                                    runInAction(() => this.success = false);
                                }
                            );
                        }
                    }
                );
            });
        }
        // otherwise, we already have a valid, stored access token
        return response;
    }

    constructor(props: {}) {
        super(props);
        GoogleAuthenticationManager.Instance = this;
    }

    private handleClick = () => {
        window.open(this.authenticationLink);
        setTimeout(() => this.hasBeenClicked = true, 500);
    }

    private handlePaste = action((e: React.ChangeEvent<HTMLInputElement>) => {
        this.authenticationCode = e.currentTarget.value;
    });

    private get renderPrompt() {
        return (
            <div style={{ display: "flex", flexDirection: "column" }}>
                {this.displayLauncher ? <button
                    className={"dispatch"}
                    onClick={this.handleClick}
                    style={{ marginBottom: this.clickedState ? 15 : 0 }}
                >Authorize a Google account...</button> : (null)}
                {this.clickedState ? <input
                    className={'paste-target'}
                    onChange={this.handlePaste}
                    placeholder={prompt}
                /> : (null)}
            </div>
        );
    }

    render() {
        return (
            <MainViewModal
                isDisplayed={this.openState}
                interactive={true}
                contents={this.renderPrompt}
                overlayDisplayedOpacity={0.9}
                dialogueBoxStyle={{ borderColor: this.success === undefined ? "black" : this.success ? "green" : "red" }}
            />
        );
    }

}