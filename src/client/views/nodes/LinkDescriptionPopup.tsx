import React = require("react");
import { observer } from "mobx-react";
import "./LinkDescriptionPopup.scss";
import { observable, action } from "mobx";
import { LinkManager } from "../../util/LinkManager";
import { TaskCompletionBox } from "./TaskCompletedBox";


@observer
export class LinkDescriptionPopup extends React.Component<{}> {

    @observable public static descriptionPopup: boolean = false;
    @observable public static showDescriptions: string = "ON";
    @observable public static popupX: number = 700;
    @observable public static popupY: number = 350;
    @observable description: string = "";
    @observable popupRef = React.createRef<HTMLDivElement>();

    @action
    descriptionChanged = (e: React.ChangeEvent<HTMLInputElement>) => {
        this.description = e.currentTarget.value;
    }

    @action
    onDismiss = (add: boolean) => {
        LinkDescriptionPopup.descriptionPopup = false;
        if (add) {
            LinkManager.currentLink && (LinkManager.currentLink.description = this.description);
        }
    }

    @action
    onClick = (e: PointerEvent) => {
        if (this.popupRef && !!!this.popupRef.current?.contains(e.target as any)) {
            LinkDescriptionPopup.descriptionPopup = false;
            TaskCompletionBox.taskCompleted = false;
        }
    }

    @action
    componentDidMount() {
        document.addEventListener("pointerdown", this.onClick);
    }

    componentWillUnmount() {
        document.removeEventListener("pointerdown", this.onClick);
    }

    render() {
        return <div className="linkDescriptionPopup" ref={this.popupRef}
            style={{
                left: LinkDescriptionPopup.popupX ? LinkDescriptionPopup.popupX : 700,
                top: LinkDescriptionPopup.popupY ? LinkDescriptionPopup.popupY : 350,
            }}>
            <input className="linkDescriptionPopup-input"
                onKeyPress={e => e.key === "Enter" && this.onDismiss(true)}
                placeholder={"(optional) enter link label..."}
                onChange={(e) => this.descriptionChanged(e)}>
            </input>
            <div className="linkDescriptionPopup-btn">
                <div className="linkDescriptionPopup-btn-dismiss"
                    onPointerDown={e => this.onDismiss(false)}> Dismiss </div>
                <div className="linkDescriptionPopup-btn-add"
                    onPointerDown={e => this.onDismiss(true)}> Add </div>
            </div>
        </div>;
    }
} 