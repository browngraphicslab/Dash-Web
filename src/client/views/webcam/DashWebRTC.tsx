import { observer } from "mobx-react";
import React = require("react");
import { CollectionFreeFormDocumentViewProps } from "../nodes/CollectionFreeFormDocumentView";
import { FieldViewProps, FieldView } from "../nodes/FieldView";
import { observable, trace } from "mobx";
import { DocumentDecorations } from "../DocumentDecorations";
import { InkingControl } from "../InkingControl";
import "../../views/nodes/WebBox.scss";
import adapter from 'webrtc-adapter';




const mediaStreamConstaints = {
    video: true,
};

const offerOptions = {
    offerToReceiveVideo: 1,
};


@observer
export class DashWebRTC extends React.Component<CollectionFreeFormDocumentViewProps & FieldViewProps> {

    @observable private localVideoEl: HTMLVideoElement | undefined;
    @observable private peerVideoEl: HTMLVideoElement | undefined;
    @observable private localStream: MediaStream | undefined;
    @observable private startTime = null;
    @observable private remoteStream: MediaStream | undefined;
    @observable private localPeerConnection: any;
    @observable private remotePeerConnection: any;
    private callButton: HTMLButtonElement | undefined;
    private startButton: HTMLButtonElement | undefined;
    private hangupButton: HTMLButtonElement | undefined;


    componentDidMount() {
        this.callButton!.disabled = true;
        this.hangupButton!.disabled = true;
        navigator.mediaDevices.getUserMedia(mediaStreamConstaints).then(this.gotLocalMediaStream).catch(this.handleLocalMediaStreamError);
        this.localVideoEl!.addEventListener('loadedmetadata', this.logVideoLoaded);
        this.peerVideoEl!.addEventListener('loadedmetadata', this.logVideoLoaded);
        this.peerVideoEl!.addEventListener('onresize', this.logResizedVideo);
    }


    gotLocalMediaStream = (mediaStream: MediaStream) => {
        this.localStream = mediaStream;
        if (this.localVideoEl) {
            this.localVideoEl.srcObject = mediaStream;
        }
        trace('Received local stream.');
        this.callButton!.disabled = false;

    }

    gotRemoteMediaStream = (event: MediaStreamEvent) => {
        let mediaStream = event.stream;
        this.peerVideoEl!.srcObject = mediaStream;
        this.remoteStream = mediaStream!;

    }

    handleLocalMediaStreamError = (error: string) => {
        //console.log("navigator.getUserMedia error: ", error);
        trace(`navigator.getUserMedia error: ${error.toString()}.`);

    }

    logVideoLoaded(event: any) {
        let video = event.target;
        trace(`${video!.id} videoWidth: ${video!.videoWidth}px, ` +
            `videoHeight: ${video!.videoHeight}px.`);
    }

    logResizedVideo(event: any) {
        this.logVideoLoaded(event);

        if (this.startTime) {
            let elapsedTime = window.performance.now() - this.startTime!;
            this.startTime = null;
            trace(`Setup time: ${elapsedTime.toFixed(3)}ms.`);
        }

    }




    public static LayoutString() { return FieldView.LayoutString(DashWebRTC); }


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
                <video id="localVideo" autoPlay playsInline ref={(e) => this.localVideoEl = e!}></video>
                <video id="remoteVideo" autoPlay playsInline ref={(e) => this.peerVideoEl = e!}></video>
                <button id="startButton" ref={(e) => this.startButton = e!}>Start</button>
                <button id="callButton" ref={(e) => this.callButton = e!}>Call</button>
                <button id="hangupButton" ref={(e) => this.hangupButton = e!}>Hang Up</button>
            </div>;

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