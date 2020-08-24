import { faPhoneSlash, faSync } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { action, observable } from "mobx";
import { observer } from "mobx-react";
import { Doc } from "../../../fields/Doc";
import { InkTool } from "../../../fields/InkField";
import "../../views/nodes/WebBox.scss";
import { DocumentDecorations } from "../DocumentDecorations";
import { CollectionFreeFormDocumentViewProps } from "../nodes/CollectionFreeFormDocumentView";
import { FieldView, FieldViewProps } from "../nodes/FieldView";
import "./DashWebRTCVideo.scss";
import { hangup, initialize, refreshVideos } from "./WebCamLogic";
import React = require("react");


/**
 * This models the component that will be rendered, that can be used as a doc that will reflect the video cams.
 */
@observer
export class DashWebRTCVideo extends React.Component<CollectionFreeFormDocumentViewProps & FieldViewProps> {

    private roomText: HTMLInputElement | undefined;
    @observable remoteVideoAdded: boolean = false;

    @action
    changeUILook = () => {
        this.remoteVideoAdded = true;
    }

    /**
      * Function that submits the title entered by user on enter press.
      */
    private onEnterKeyDown = (e: React.KeyboardEvent) => {
        if (e.keyCode === 13) {
            const submittedTitle = this.roomText!.value;
            this.roomText!.value = "";
            this.roomText!.blur();
            initialize(submittedTitle, this.changeUILook);
        }
    }


    public static LayoutString(fieldKey: string) { return FieldView.LayoutString(DashWebRTCVideo, fieldKey); }

    @action
    onClickRefresh = () => {
        refreshVideos();
    }

    onClickHangUp = () => {
        hangup();
    }

    render() {
        const content =
            <div className="webcam-cont" style={{ width: "100%", height: "100%" }}>
                <div className="webcam-header">DashWebRTC</div>
                <input id="roomName" type="text" placeholder="Enter room name" ref={(e) => this.roomText = e!} onKeyDown={this.onEnterKeyDown} />
                <div className="videoContainer">
                    <video id="localVideo" className={"RTCVideo" + (this.remoteVideoAdded ? " side" : " main")} autoPlay playsInline muted ref={(e) => {
                    }}></video>
                    <video id="remoteVideo" className="RTCVideo main" autoPlay playsInline ref={(e) => {
                    }}></video>
                </div>
                <div className="buttonContainer">
                    <div className="videoButtons" style={{ background: "red" }} onClick={this.onClickHangUp}><FontAwesomeIcon icon={faPhoneSlash} color="white" /></div>
                    <div className="videoButtons" style={{ background: "green" }} onClick={this.onClickRefresh}><FontAwesomeIcon icon={faSync} color="white" /></div>
                </div>
            </div >;

        const frozen = !this.props.isSelected() || DocumentDecorations.Instance.Interacting;
        const classname = "webBox-cont" + (this.props.isSelected() && Doc.GetSelectedTool() === InkTool.None && !DocumentDecorations.Instance.Interacting ? "-interactive" : "");

        return (
            <>
                <div className={classname}  >
                    {content}
                </div>
                {!frozen ? (null) : <div className="webBox-overlay" />}
            </>);
    }


}