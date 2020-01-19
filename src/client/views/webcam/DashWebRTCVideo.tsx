import { observer } from "mobx-react";
import React = require("react");
import { CollectionFreeFormDocumentViewProps } from "../nodes/CollectionFreeFormDocumentView";
import { FieldViewProps, FieldView } from "../nodes/FieldView";
import { observable } from "mobx";
import { DocumentDecorations, CloseCall } from "../DocumentDecorations";
import { InkingControl } from "../InkingControl";
import "../../views/nodes/WebBox.scss";
import "./DashWebRTC.scss";
import adapter from 'webrtc-adapter';
import { DashWebRTC } from "./DashWebRTC";
import { DocServer } from "../../DocServer";
import { DocumentView } from "../nodes/DocumentView";
import { Utils } from "../../../Utils";
import { MessageStore } from "../../../server/Message";




const mediaStreamConstraints = {
    video: true,
};

const offerOptions = {
    offerToReceiveVideo: 1,
};


/**
 * This models the component that will be rendered, that can be used as a doc that will reflect the video cams.
 */
@observer
export class DashWebRTCVideo extends React.Component<CollectionFreeFormDocumentViewProps & FieldViewProps> {

    @observable private localVideoEl: HTMLVideoElement | undefined;
    @observable private peerVideoEl: HTMLVideoElement | undefined;
    @observable private localStream: MediaStream | undefined;
    @observable private startTime: any = null;
    @observable private remoteStream: MediaStream | undefined;
    @observable private localPeerConnection: any;
    @observable private remotePeerConnection: any;
    private callButton: HTMLButtonElement | undefined;
    private startButton: HTMLButtonElement | undefined;
    private hangupButton: HTMLButtonElement | undefined;
    private roomText: HTMLInputElement | undefined;
    private roomOfCam: string = "";
    private webRTCManager: DashWebRTC | undefined;

    componentDidMount() {
        DocumentDecorations.Instance.addCloseCall(this.closeConnection);
        this.webRTCManager = new DashWebRTC();
        let self = this;
        window.onbeforeunload = function () {
            self.webRTCManager!.sendMessage('bye');
        };
    }

    closeConnection: CloseCall = () => {
        //Utils.Emit(DocServer._socket, MessageStore.NotifyRoommates, { message: 'bye', room: this.roomOfCam });
        this.webRTCManager!.hangup();
    }

    componentWillUnmount() {
        // DocumentDecorations.Instance.removeCloseCall(this.closeConnection);
    }


    // componentDidMount() {
    //     // DashWebRTC.setVideoObjects(this.localVideoEl!, this.peerVideoEl!);
    //     //DashWebRTC.init();
    // }


    // componentDidMount() {
    //     this.callButton!.disabled = true;
    //     this.hangupButton!.disabled = true;
    //     // navigator.mediaDevices.getUserMedia(mediaStreamConstraints).then(this.gotLocalMediaStream).catch(this.handleLocalMediaStreamError);
    //     this.localVideoEl!.addEventListener('loadedmetadata', this.logVideoLoaded);
    //     this.peerVideoEl!.addEventListener('loadedmetadata', this.logVideoLoaded);
    //     this.peerVideoEl!.addEventListener('onresize', this.logResizedVideo);
    // }


    // gotLocalMediaStream = (mediaStream: MediaStream) => {
    //     this.localStream = mediaStream;
    //     if (this.localVideoEl) {
    //         this.localVideoEl.srcObject = mediaStream;
    //     }
    //     this.trace('Received local stream.');
    //     this.callButton!.disabled = false;

    // }

    // gotRemoteMediaStream = (event: MediaStreamEvent) => {
    //     let mediaStream = event.stream;
    //     this.peerVideoEl!.srcObject = mediaStream;
    //     this.remoteStream = mediaStream!;

    // }

    // handleLocalMediaStreamError = (error: string) => {
    //     //console.log("navigator.getUserMedia error: ", error);
    //     this.trace(`navigator.getUserMedia error: ${error.toString()}.`);

    // }

    // logVideoLoaded = (event: any) => {
    //     let video = event.target;
    //     this.trace(`${video.id} videoWidth: ${video.videoWidth}px, ` +
    //         `videoHeight: ${video.videoHeight}px.`);
    // }

    // logResizedVideo = (event: any) => {
    //     this.logVideoLoaded(event);

    //     if (this.startTime) {
    //         let elapsedTime = window.performance.now() - this.startTime;
    //         this.startTime = null;
    //         this.trace(`Setup time: ${elapsedTime.toFixed(3)}ms.`);
    //     }

    // }

    // handleConnection = (event: any) => {
    //     let peerConnection = event.target;
    //     let iceCandidate = event.candidate;

    //     if (iceCandidate) {
    //         let newIceCandidate: RTCIceCandidate = new RTCIceCandidate(iceCandidate);
    //         let otherPeer: any = this.getOtherPeer(peerConnection);

    //         otherPeer.addIceCandidate(newIceCandidate).then(() => {
    //             this.handleConnectionSuccess(peerConnection);
    //         }).catch((error: any) => {
    //             this.handleConnectionFailure(peerConnection, error);
    //         });

    //         this.trace(`${this.getPeerName(peerConnection)} ICE candidate:\n` +
    //             `${event.candidate.candidate}.`);

    //     }
    // }

    // // Logs that the connection succeeded.
    // handleConnectionSuccess = (peerConnection: any) => {
    //     this.trace(`${this.getPeerName(peerConnection)} addIceCandidate success.`);
    // }

    // handleConnectionFailure = (peerConnection: any, error: any) => {
    //     this.trace(`${this.getPeerName(peerConnection)} failed to add ICE Candidate:\n` +
    //         `${error.toString()}.`);
    // }

    // // Logs changes to the connection state.
    // handleConnectionChange = (event: any) => {
    //     let peerConnection = event.target;
    //     console.log('ICE state change event: ', event);
    //     this.trace(`${this.getPeerName(peerConnection)} ICE state: ` +
    //         `${peerConnection.iceConnectionState}.`);
    // }

    // // Logs error when setting session description fails.
    // setSessionDescriptionError = (error: any) => {
    //     this.trace(`Failed to create session description: ${error.toString()}.`);
    // }

    // // Logs success when setting session description.
    // setDescriptionSuccess = (peerConnection: any, functionName: any) => {
    //     let peerName = this.getPeerName(peerConnection);
    //     this.trace(`${peerName} ${functionName} complete.`);
    // }


    // // Logs success when localDescription is set.
    // setLocalDescriptionSuccess = (peerConnection: any) => {
    //     this.setDescriptionSuccess(peerConnection, 'setLocalDescription');
    // }

    // // Logs success when remoteDescription is set.
    // setRemoteDescriptionSuccess = (peerConnection: any) => {
    //     this.setDescriptionSuccess(peerConnection, 'setRemoteDescription');
    // }

    // createdOffer = (description: any) => {
    //     this.trace(`Offer from localPeerConnection:\n${description.sdp}`);
    //     this.trace('localPeerConnection setLocalDescription start.');

    //     this.localPeerConnection.setLocalDescription(description).then(() => {
    //         this.setLocalDescriptionSuccess(this.localPeerConnection);
    //     }).catch(this.setSessionDescriptionError);


    //     this.trace('remotePeerConnection setRemoteDescription start.');
    //     this.remotePeerConnection.setRemoteDescription(description)
    //         .then(() => {
    //             this.setRemoteDescriptionSuccess(this.remotePeerConnection);
    //         }).catch(this.setSessionDescriptionError);

    //     this.trace('remotePeerConnection createAnswer start.');
    //     this.remotePeerConnection.createAnswer()
    //         .then(this.createdAnswer)
    //         .catch(this.setSessionDescriptionError);

    // }

    // createdAnswer = (description: any) => {
    //     this.trace(`Answer from remotePeerConnection:\n${description.sdp}.`);

    //     this.trace('remotePeerConnection setLocalDescription start.');
    //     this.remotePeerConnection.setLocalDescription(description)
    //         .then(() => {
    //             this.setLocalDescriptionSuccess(this.remotePeerConnection);
    //         }).catch(this.setSessionDescriptionError);

    //     this.trace('localPeerConnection setRemoteDescription start.');
    //     this.localPeerConnection.setRemoteDescription(description)
    //         .then(() => {
    //             this.setRemoteDescriptionSuccess(this.localPeerConnection);
    //         }).catch(this.setSessionDescriptionError);
    // }


    // startAction = () => {
    //     this.startButton!.disabled = true;
    //     navigator.mediaDevices.getUserMedia(mediaStreamConstraints)
    //         .then(this.gotLocalMediaStream).catch(this.handleLocalMediaStreamError);
    //     this.trace('Requesting local stream.');
    // }


    // // Handles call button action: creates peer connection.
    // callAction = () => {
    //     this.callButton!.disabled = true;
    //     this.hangupButton!.disabled = false;

    //     this.trace('Starting call.');
    //     this.startTime = window.performance.now();

    //     // Get local media stream tracks.
    //     const videoTracks = this.localStream!.getVideoTracks();
    //     const audioTracks = this.localStream!.getAudioTracks();
    //     if (videoTracks.length > 0) {
    //         this.trace(`Using video device: ${videoTracks[0].label}.`);
    //     }
    //     if (audioTracks.length > 0) {
    //         this.trace(`Using audio device: ${audioTracks[0].label}.`);
    //     }

    //     let servers: RTCConfiguration | undefined = undefined;  // Allows for RTC server configuration.

    //     // Create peer connections and add behavior.
    //     this.localPeerConnection = new RTCPeerConnection(servers);
    //     this.trace('Created local peer connection object localPeerConnection.');

    //     this.localPeerConnection.addEventListener('icecandidate', this.handleConnection);
    //     this.localPeerConnection.addEventListener(
    //         'iceconnectionstatechange', this.handleConnectionChange);

    //     this.remotePeerConnection = new RTCPeerConnection(servers);
    //     this.trace('Created remote peer connection object remotePeerConnection.');

    //     this.remotePeerConnection.addEventListener('icecandidate', this.handleConnection);
    //     this.remotePeerConnection.addEventListener(
    //         'iceconnectionstatechange', this.handleConnectionChange);
    //     this.remotePeerConnection.addEventListener('addstream', this.gotRemoteMediaStream);

    //     // Add local stream to connection and create offer to connect.
    //     this.localPeerConnection.addStream(this.localStream);
    //     this.trace('Added local stream to localPeerConnection.');

    //     this.trace('localPeerConnection createOffer start.');
    //     this.localPeerConnection.createOffer(offerOptions)
    //         .then(this.createdOffer).catch(this.setSessionDescriptionError);
    // }


    // // Handles hangup action: ends up call, closes connections and resets peers.
    // hangupAction = () => {
    //     this.localPeerConnection.close();
    //     this.remotePeerConnection.close();
    //     this.localPeerConnection = null;
    //     this.remotePeerConnection = null;
    //     this.hangupButton!.disabled = true;
    //     this.callButton!.disabled = false;
    //     this.trace('Ending call.');
    // }

    // // Gets the "other" peer connection.
    // getOtherPeer = (peerConnection: any) => {
    //     return (peerConnection === this.localPeerConnection) ?
    //         this.remotePeerConnection : this.localPeerConnection;
    // }

    // // Gets the name of a certain peer connection.
    // getPeerName = (peerConnection: any) => {
    //     return (peerConnection === this.localPeerConnection) ?
    //         'localPeerConnection' : 'remotePeerConnection';
    // }

    // // Logs an action (text) and the time when it happened on the console.
    // trace = (text: string) => {
    //     text = text.trim();
    //     const now = (window.performance.now() / 1000).toFixed(3);

    //     console.log(now, text);
    // }


    /**
      * Function that submits the title entered by user on enter press.
      */
    onEnterKeyDown = (e: React.KeyboardEvent) => {
        if (e.keyCode === 13) {
            let submittedTitle = this.roomText!.value;
            this.roomText!.value = "";
            this.roomText!.blur();
            this.roomOfCam = submittedTitle;
            this.webRTCManager!.init(submittedTitle);
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
                <input type="text" placeholder="Enter room name" ref={(e) => this.roomText = e!} onKeyDown={this.onEnterKeyDown} />
                <video id="localVideo" autoPlay playsInline ref={(e) => {
                    this.localVideoEl = e!;
                    this.webRTCManager!.setLocalVideoObject(e!);
                }}></video>
                <video id="remoteVideo" autoPlay playsInline ref={(e) => {
                    this.peerVideoEl = e!;
                    this.webRTCManager!.setRemoteVideoObject(e!);
                }}></video>
                {/* <button id="startButton" ref={(e) => this.startButton = e!} onClick={this.startAction}>Start</button>
                <button id="callButton" ref={(e) => this.callButton = e!} onClick={this.callAction}>Call</button>
                <button id="hangupButton" ref={(e) => this.hangupButton = e!} onClick={this.hangupAction}>Hang Up</button> */}
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