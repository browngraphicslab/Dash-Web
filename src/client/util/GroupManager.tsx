import * as React from "react";
import { observable, action } from "mobx";
import { SelectionManager } from "./SelectionManager";
import MainViewModal from "../views/MainViewModal";
import { observer } from "mobx-react";

@observer
export default class GroupManager extends React.Component<{}> {

    static Instance: GroupManager;
    @observable private isOpen: boolean = false; // whether the menu is open or not
    @observable private dialogueBoxOpacity: number = 1;
    @observable private overlayOpacity: number = 0.4;

    constructor(props: Readonly<{}>) {
        super(props);
        GroupManager.Instance = this;
    }

    public open = action(() => {
        SelectionManager.DeselectAll();
        this.isOpen = true;
    });

    public close = action(() => {
        this.isOpen = false;
    });

    private get groupInterface() {
        return (
            <div className="settings-interface">
                <div className="settings-heading">
                    <h1>settings</h1>
                    <div className={"close-button"} onClick={this.close}>
                        OI
                    </div>
                </div>
                <div className="settings-body">
                    <div className="settings-type">
                        <button value="password">reset password</button>
                        <button value="data">{`toggle novice mode`}</button>
                    </div>
                </div>
            </div>
        );
    }

    render() {
        return (
            <MainViewModal
                contents={this.groupInterface}
                isDisplayed={this.isOpen}
                interactive={true}
                dialogueBoxDisplayedOpacity={this.dialogueBoxOpacity}
                overlayDisplayedOpacity={this.overlayOpacity}
            />
        );
    }

}