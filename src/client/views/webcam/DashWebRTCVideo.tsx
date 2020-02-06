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
    private roomText: HTMLInputElement | undefined;
    private roomOfCam: string = "";
    private isChannelReady = false;
    private isInitiator = false;
    private isStarted = false;
    localStream: MediaStream | undefined;
    private pc: any;
    remoteStream: MediaStream | undefined;
    private turnReady: boolean | undefined;
    //localVideo: HTMLVideoElement | undefined;
    //remoteVideo: HTMLVideoElement | undefined;
    curRoom: string = "";


    private pcConfig = {
        'iceServers': [{
            'urls': 'stun:stun.l.google.com:19302'
        }]
    };

    // Set up audio and video regardless of what devices are present.
    private sdpConstraints = {
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
    };

    componentDidMount() {
        DocumentDecorations.Instance.addCloseCall(this.closeConnection);
        let self = this;
        window.onbeforeunload = function () {
            self.sendMessage('bye');
        };
    }

    closeConnection: CloseCall = () => {
        this.hangup();
    }

    componentWillUnmount() {
    }


    init(room: string) {

        this.curRoom = room;
        let self = this;

        if (room !== '') {
            DocServer._socket.emit('create or join', room);
            console.log('Attempted to create or  join room', room);

        }

        DocServer._socket.on('created', function (room: string) {
            console.log('Created room ' + room);
            self.isInitiator = true;
        });

        DocServer._socket.on('full', function (room: string) {
            console.log('Room ' + room + ' is full');
        });

        DocServer._socket.on('join', function (room: string) {
            console.log('Another peer made a request to join room ' + room);
            console.log('This peer is the initiator of room ' + room + '!');
            self.isChannelReady = true;
        });


        DocServer._socket.on('joined', function (room: string) {
            console.log('joined: ' + room);
            self.isChannelReady = true;
        });


        DocServer._socket.on('log', function (array: any) {
            console.log.apply(console, array);
        });

        // This client receives a message
        DocServer._socket.on('message', function (message: any) {
            console.log('Client received message:', message);
            if (message.message === 'got user media') {
                self.maybeStart();
            } else if (message.message.type === 'offer') {
                if (!self.isInitiator && !self.isStarted) {
                    self.maybeStart();
                }
                self.pc.setRemoteDescription(new RTCSessionDescription(message.message));
                self.doAnswer();
            } else if (message.message.type === 'answer' && self.isStarted) {
                self.pc.setRemoteDescription(new RTCSessionDescription(message.message));
            } else if (message.message.type === 'candidate' && self.isStarted) {
                let candidate = new RTCIceCandidate({
                    sdpMLineIndex: message.message.label,
                    candidate: message.message.candidate
                });
                self.pc.addIceCandidate(candidate);
            } else if (message.message === 'bye' && self.isStarted) {
                self.handleRemoteHangup();
            }
        });

        navigator.mediaDevices.getUserMedia({
            audio: false,
            video: true
        })
            .then(this.gotStream)
            .catch(function (e) {
                alert('getUserMedia() error: ' + e.name);
            });

        //Trying this one out!!!
        console.log('Getting user media with constraints', this.constraints);

        if (location.hostname !== 'localhost') {
            this.requestTurn(
                'https://computeengineondemand.appspot.com/turn?username=41784574&key=4080218913'
            );
        }


    }


    private sendMessage = (message: any) => {
        console.log('Client sending message: ', message);
        Utils.Emit(DocServer._socket, MessageStore.NotifyRoommates, { message: message, room: this.curRoom });
        //DocServer._socket.emit('message', message);
    }





    // setVideoObjects(localVideo: HTMLVideoElement, remoteVideo: HTMLVideoElement) {
    //     this.localVideo = localVideo;
    //     this.remoteVideo = remoteVideo;
    // }

    // setLocalVideoObject(localVideoRef: HTMLVideoElement) {
    //     this.localVideo = localVideoRef;

    // }

    // setRemoteVideoObject(remoteVideoRef: HTMLVideoElement) {
    //     this.remoteVideo = remoteVideoRef;
    // }




    private gotStream = (stream: any) => {
        console.log('Adding local stream.');
        this.localStream = stream;
        this.localVideoEl!.srcObject = stream;
        this.sendMessage('got user media');
        if (this.isInitiator) {
            this.maybeStart();
        }
    }

    constraints = {
        video: true,
        audio: true
    };





    private maybeStart = () => {
        console.log('>>>>>>> maybeStart() ', this.isStarted, this.localStream, this.isChannelReady);
        if (!this.isStarted && typeof this.localStream !== 'undefined' && this.isChannelReady) {
            console.log('>>>>>> creating peer connection');
            this.createPeerConnection();
            this.pc.addStream(this.localStream);
            this.isStarted = true;
            console.log('isInitiator', this.isInitiator);
            if (this.isInitiator) {
                this.doCall();
            }
        }
    }


    // //this will need to be changed to our version of hangUp
    // window.onbeforeunload = function () {
    //     sendMessage('bye');
    // };

    private createPeerConnection = () => {
        try {
            this.pc = new RTCPeerConnection(undefined);
            this.pc.onicecandidate = this.handleIceCandidate;
            this.pc.onaddstream = this.handleRemoteStreamAdded;
            this.pc.onremovestream = this.handleRemoteStreamRemoved;
            console.log('Created RTCPeerConnnection');
        } catch (e) {
            console.log('Failed to create PeerConnection, exception: ' + e.message);
            alert('Cannot create RTCPeerConnection object.');
            return;
        }
    }

    private handleIceCandidate = (event: any) => {
        console.log('icecandidate event: ', event);
        if (event.candidate) {
            this.sendMessage({
                type: 'candidate',
                label: event.candidate.sdpMLineIndex,
                id: event.candidate.sdpMid,
                candidate: event.candidate.candidate
            });
        } else {
            console.log('End of candidates.');
        }
    }

    private handleCreateOfferError = (event: any) => {
        console.log('createOffer() error: ', event);
    }

    private doCall = () => {
        console.log('Sending offer to peer');
        this.pc.createOffer(this.setLocalAndSendMessage, this.handleCreateOfferError);
    }

    private doAnswer = () => {
        console.log('Sending answer to peer.');
        this.pc.createAnswer().then(
            this.setLocalAndSendMessage,
            this.onCreateSessionDescriptionError
        );
    }

    private setLocalAndSendMessage = (sessionDescription: any) => {
        this.pc.setLocalDescription(sessionDescription);
        console.log('setLocalAndSendMessage sending message', sessionDescription);
        this.sendMessage(sessionDescription);
    }

    private onCreateSessionDescriptionError = (error: any) => {
        console.log('Failed to create session description: ' + error.toString());
    }


    private requestTurn = (turnURL: any) => {
        var turnExists = false;
        let self = this;
        for (var i in this.pcConfig.iceServers) {
            if (this.pcConfig.iceServers[i].urls.substr(0, 5) === 'turn:') {
                turnExists = true;
                this.turnReady = true;
                break;
            }
        }
        if (!turnExists) {
            console.log('Getting TURN server from ', turnURL);
            // No TURN server. Get one from computeengineondemand.appspot.com:
            var xhr = new XMLHttpRequest();
            xhr.onreadystatechange = function () {
                if (xhr.readyState === 4 && xhr.status === 200) {
                    var turnServer = JSON.parse(xhr.responseText);
                    console.log('Got TURN server: ', turnServer);
                    self.pcConfig.iceServers.push({
                        'urls': 'turn:' + turnServer.username + '@' + turnServer.turn,
                        //'credential': turnServer.password
                    });
                    self.turnReady = true;
                }
            };
            xhr.open('GET', turnURL, true);
            xhr.send();
        }
    }

    private handleRemoteStreamAdded = (event: MediaStreamEvent) => {
        console.log('Remote stream added.');
        this.remoteStream = event.stream!;
        this.peerVideoEl!.srcObject = this.remoteStream;
    }

    private handleRemoteStreamRemoved = (event: MediaStreamEvent) => {
        console.log('Remote stream removed. Event: ', event);
    }

    private hangup = () => {
        console.log('Hanging up.');
        if (this.pc) {
            stop();
            this.sendMessage('bye');
        }

        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
        }

    }

    private handleRemoteHangup = () => {
        console.log('Session terminated.');
        this.stop();
        this.isInitiator = false;

        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
        }


    }

    private stop = () => {
        this.isStarted = false;
        this.pc.close();
        this.pc = null;
    }






    /**
      * Function that submits the title entered by user on enter press.
      */
    private onEnterKeyDown = (e: React.KeyboardEvent) => {
        if (e.keyCode === 13) {
            let submittedTitle = this.roomText!.value;
            this.roomText!.value = "";
            this.roomText!.blur();
            this.roomOfCam = submittedTitle;
            this.init(submittedTitle);
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
                    //this.setLocalVideoObject(e!);
                }}></video>
                <video id="remoteVideo" autoPlay playsInline ref={(e) => {
                    this.peerVideoEl = e!;
                    //this.setRemoteVideoObject(e!);
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