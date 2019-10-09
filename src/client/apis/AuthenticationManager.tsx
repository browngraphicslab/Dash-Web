import { observable, action, reaction, runInAction } from "mobx";
import { observer } from "mobx-react";
import * as React from "react";
import MainViewModal from "../views/MainViewModal";
import { Opt } from "../../new_fields/Doc";
import { Identified } from "../Network";
import { RouteStore } from "../../server/RouteStore";

@observer
export default class AuthenticationManager extends React.Component<{}> {
    public static Instance: AuthenticationManager;
    @observable private openState = false;
    private authenticationLink: Opt<string> = undefined;
    @observable private authenticationCode: Opt<string> = undefined;
    @observable private clickedState = false;

    private get isOpen() {
        return this.openState;
    }

    private set isOpen(value: boolean) {
        runInAction(() => this.openState = value);
    }

    private get hasBeenClicked() {
        return this.clickedState;
    }

    private set hasBeenClicked(value: boolean) {
        runInAction(() => this.clickedState = value);
    }

    public executeFullRoutine = async (authenticationLink: string) => {
        this.authenticationLink = authenticationLink;
        this.isOpen = true;
        return new Promise<string>(async resolve => {
            const disposer = reaction(
                () => this.authenticationCode,
                authenticationCode => {
                    if (authenticationCode) {
                        Identified.PostToServer(RouteStore.writeGooglePhotosAccessToken, { authenticationCode }).then(token => {
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
    })

    private get renderPrompt() {
        return (
            <div style={{ display: "flex", flexDirection: "column" }}>
                <button onClick={this.handleClick}>Please click here to authorize a Google account...</button>
                {this.clickedState ? <input
                    onChange={this.handlePaste}
                    placeholder={"Please paste the external authetication code here..."}
                    style={{ marginTop: 15 }}
                /> : (null)}
            </div>
        )
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