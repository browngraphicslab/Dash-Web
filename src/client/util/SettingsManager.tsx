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
        const { error: resultError, ...others } = await Identified.PostToServer('/internalResetPassword', { curr_pass });
        if (resultError) {
            // we failed
        }
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
                        <input ref={this.curr_password_ref}></input>
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