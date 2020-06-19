import React from "react";
import { observable, action } from "mobx";
import { SelectionManager } from "./SelectionManager";
import MainViewModal from "../views/MainViewModal";


export default class GroupManager extends React.Component<{}>{

    static Instance: GroupManager;
    @observable private isOpen: boolean = false; // whether the menu is open or not
    @observable private dialogueBoxOpacity = 1;
    @observable private overlayOpacity = 0.4;

    constructor(props: Readonly<{}>) {
        super(props);
        GroupManager.Instance = this;
    }


    open = action(() => {
        SelectionManager.DeselectAll();
        this.isOpen = true;
    });

    close = action(() => {
        this.isOpen = false;
    });

    private get groupInterface() {
        return <div>TESTING</div>;
    }

    render() {
        return <MainViewModal
            contents={this.groupInterface}
            isDisplayed={this.isOpen}
            interactive={true}
            dialogueBoxDisplayedOpacity={this.dialogueBoxOpacity}
            overlayDisplayedOpacity={this.overlayOpacity}
        />;
    }

}