import { observable, runInAction, action } from "mobx";
import * as React from "react";
import MainViewModal from "../views/MainViewModal";
import { observer } from "mobx-react";
import { library } from '@fortawesome/fontawesome-svg-core';
import * as fa from '@fortawesome/free-solid-svg-icons';
import { SelectionManager } from "./SelectionManager";
import "./SettingsManager.scss";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

library.add(fa.faWindowClose);

@observer
export default class SettingsManager extends React.Component<{}> {
    public static Instance: SettingsManager;
    @observable private isOpen = false;
    @observable private dialogueBoxOpacity = 1;
    @observable private overlayOpacity = 0.4;

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

    private get settingsInterface() {
        return (
            <div className={"settings-interface"}>
                <div className={"close-button"} onClick={this.close}>
                    <FontAwesomeIcon icon={fa.faWindowClose} />
                </div>
                <h1>settings</h1>

                <div>toggle
                    second toggle
                </div>
                <div>hellow
                    heree
                    s
                    a
                    lot of information hahahahahahahah
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