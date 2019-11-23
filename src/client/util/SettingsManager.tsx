import { observable, runInAction, action } from "mobx";
import * as React from "react";
import MainViewModal from "../views/MainViewModal";
import { observer } from "mobx-react";
import { library } from '@fortawesome/fontawesome-svg-core';
import * as fa from '@fortawesome/free-solid-svg-icons';
import { SelectionManager } from "./SelectionManager";
import "./SettingsManager.scss";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Identified } from "../Network";

library.add(fa.faWindowClose);

@observer
export default class SettingsManager extends React.Component<{}> {
    public static Instance: SettingsManager;
    @observable private isOpen = false;
    @observable private dialogueBoxOpacity = 1;
    @observable private overlayOpacity = 0.4;
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

    private dispatchRequest = async () => {
        const curr_pass = this.curr_password_ref.current!.value;
        const new_pass = this.new_password_ref.current!.value;
        const new_confirm = this.new_confirm_ref.current!.value;
        console.log('ready!');
        // const { error, hello } = await Identified.PostToServer('/internalResetPassword', { curr_pass, new_pass, new_confirm });
        const resp = await Identified.PostToServer('/internalResetPassword', { curr_pass, new_pass, new_confirm });
        console.log('set!');
        console.log('response', resp);
        console.log('hm', resp.hm);
        if (resp.error) {
            // we failed
            console.log(resp.error);
        }
        console.log('go!');
        // do stuff with response
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
                        <p>changeable settings</p>
                        <p>static data</p>
                    </div>
                    <div className="settings-content">
                        <input ref={this.curr_password_ref} />
                        <input ref={this.new_password_ref} />
                        <input ref={this.new_confirm_ref} />
                        <button onClick={this.dispatchRequest}>submit</button>
                        this changes with what you select!
                    </div>
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