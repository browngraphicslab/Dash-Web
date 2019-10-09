import { observable, action, reaction, runInAction } from "mobx";
import { observer } from "mobx-react";
import * as React from "react";
import MainViewModal from "../views/MainViewModal";
import { Opt } from "../../new_fields/Doc";
import { Identified } from "../Network";

const AuthenticationUrl = "https://accounts.google.com/o/oauth2/v2/auth";
const prompt = "Please paste the external authetication code here...";

@observer
export default class AuthenticationManager extends React.Component<{}> {
    public static Instance: AuthenticationManager;
    @observable private openState = false;
    private authenticationLink: Opt<string> = undefined;
    @observable private authenticationCode: Opt<string> = undefined;
    @observable private clickedState = false;

    private set isOpen(value: boolean) {
        runInAction(() => this.openState = value);
    }

    private set hasBeenClicked(value: boolean) {
        runInAction(() => this.clickedState = value);
    }

    public executeFullRoutine = async (service: string) => {
        let response = await Identified.FetchFromServer(`/read${service}AccessToken`);
        // if this is an authentication url, activate the UI to register the new access token
        if (new RegExp(AuthenticationUrl).test(response)) {
            this.isOpen = true;
            this.authenticationLink = response;
            return new Promise<string>(async resolve => {
                const disposer = reaction(
                    () => this.authenticationCode,
                    authenticationCode => {
                        if (authenticationCode) {
                            Identified.PostToServer(`/write${service}AccessToken`, { authenticationCode }).then(token => {
                                this.isOpen = false;
                                this.hasBeenClicked = false;
                                resolve(token);
                                disposer();
                            });
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
        AuthenticationManager.Instance = this;
    }

    private handleClick = () => {
        window.open(this.authenticationLink);
        this.hasBeenClicked = true;
    }

    private handlePaste = action((e: React.ChangeEvent<HTMLInputElement>) => {
        this.authenticationCode = e.currentTarget.value;
    });

    private get renderPrompt() {
        return (
            <div style={{ display: "flex", flexDirection: "column" }}>
                <button onClick={this.handleClick}>Please click here to authorize a Google account...</button>
                {this.clickedState ? <input
                    onChange={this.handlePaste}
                    placeholder={prompt}
                    style={{ marginTop: 15 }}
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
            />
        );
    }

}