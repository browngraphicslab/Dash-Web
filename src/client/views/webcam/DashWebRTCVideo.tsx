import { observer } from "mobx-react";
import React = require("react");
import { CollectionFreeFormDocumentViewProps } from "../nodes/CollectionFreeFormDocumentView";
import { FieldViewProps, FieldView } from "../nodes/FieldView";
import { observable, action } from "mobx";
import { DocumentDecorations, CloseCall } from "../DocumentDecorations";
import { InkingControl } from "../InkingControl";
import "../../views/nodes/WebBox.scss";
import "./DashWebRTCVideo.scss";
import adapter from 'webrtc-adapter';
import { initialize, hangup } from "./WebCamLogic";

/**
 * This models the component that will be rendered, that can be used as a doc that will reflect the video cams.
 */
@observer
export class DashWebRTCVideo extends React.Component<CollectionFreeFormDocumentViewProps & FieldViewProps> {

    private roomText: HTMLInputElement | undefined;
    @observable remoteVideoAdded: boolean = false;

    componentDidMount() {
        DocumentDecorations.Instance.addCloseCall(this.closeConnection);
    }

    closeConnection: CloseCall = () => {
        hangup();
    }

    @action
    changeUILook = () => {
        this.remoteVideoAdded = true;
    }

    /**
      * Function that submits the title entered by user on enter press.
      */
    private onEnterKeyDown = (e: React.KeyboardEvent) => {
        if (e.keyCode === 13) {
            let submittedTitle = this.roomText!.value;
            this.roomText!.value = "";
            this.roomText!.blur();
            initialize(submittedTitle, this.changeUILook);
        }
    }


    public static LayoutString(fieldKey: string) { return FieldView.LayoutString(DashWebRTCVideo, fieldKey); }

    _ignore = 0;
    onPreWheel = (e: React.WheelEvent) => {
        this._ignore = e.timeStamp;
    }
    onPrePointer = (e: React.PointerEvent) => {
        this._ignore = e.timeStamp;
    }
    onPostPointer = (e: React.PointerEvent) => {
        if (this._ignore !== e.timeStamp) {
            e.stopPropagation();
        }
    }
    onPostWheel = (e: React.WheelEvent) => {
        if (this._ignore !== e.timeStamp) {
            e.stopPropagation();
        }
    }

    render() {
        let content =
            <div className="webcam-cont" style={{ width: "100%", height: "100%" }} onWheel={this.onPostWheel} onPointerDown={this.onPostPointer} onPointerMove={this.onPostPointer} onPointerUp={this.onPostPointer}>
                <div className="webcam-header">DashWebRTC</div>
                <input id="roomName" type="text" placeholder="Enter room name" ref={(e) => this.roomText = e!} onKeyDown={this.onEnterKeyDown} />
                <video id="localVideo" className={"RTCVideo" + (this.remoteVideoAdded ? " side" : " main")} autoPlay playsInline muted ref={(e) => {
                }}></video>
                <video id="remoteVideo" className="RTCVideo main" autoPlay playsInline ref={(e) => {
                }}></video>

            </div >;

        let frozen = !this.props.isSelected() || DocumentDecorations.Instance.Interacting;
        let classname = "webBox-cont" + (this.props.isSelected() && !InkingControl.Instance.selectedTool && !DocumentDecorations.Instance.Interacting ? "-interactive" : "");


        return (
            <>
                <div className={classname}  >
                    {content}
                </div>
                {!frozen ? (null) : <div className="webBox-overlay" onWheel={this.onPreWheel} onPointerDown={this.onPrePointer} onPointerMove={this.onPrePointer} onPointerUp={this.onPrePointer} />}
            </>);
    }


}