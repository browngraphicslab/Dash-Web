// import { DocServer } from '../../DocServer';
// import { Utils } from '../../../Utils';
// import { MessageStore } from '../../../server/Message';



// /**
//  * This namespace will have the code required to have functionality code for the usage of webRTC.
//  */
// export class DashWebRTC {


//     private isChannelReady = false;
//     private isInitiator = false;
//     private isStarted = false;
//     localStream: MediaStream | undefined;
//     private pc: any;
//     remoteStream: MediaStream | undefined;
//     private turnReady: boolean | undefined;
//     localVideo: HTMLVideoElement | undefined;
//     remoteVideo: HTMLVideoElement | undefined;
//     curRoom: string = "";


//     private pcConfig: any;
//     private sdpConstraints: any;

//     constructor() {
//         this.pcConfig = {
//             'iceServers': [{
//                 'urls': 'stun:stun.l.google.com:19302'
//             }]
//         };

//         // Set up audio and video regardless of what devices are present.
//         this.sdpConstraints = {
//             offerToReceiveAudio: true,
//             offerToReceiveVideo: true
//         };
//     }



//     init(room: string) {

//         this.curRoom = room;
//         let self = this;

//         if (room !== '') {
//             DocServer._socket.emit('create or join', room);
//             console.log('Attempted to create or  join room', room);

//         }

//         DocServer._socket.on('created', function (room: string) {
//             console.log('Created room ' + room);
//             self.isInitiator = true;
//         });

//         DocServer._socket.on('full', function (room: string) {
//             console.log('Room ' + room + ' is full');
//         });

//         DocServer._socket.on('join', function (room: string) {
//             console.log('Another peer made a request to join room ' + room);
//             console.log('This peer is the initiator of room ' + room + '!');
//             self.isChannelReady = true;
//         });


//         DocServer._socket.on('joined', function (room: string) {
//             console.log('joined: ' + room);
//             self.isChannelReady = true;
//         });


//         DocServer._socket.on('log', function (array: any) {
//             console.log.apply(console, array);
//         });

//         // This client receives a message
//         DocServer._socket.on('message', function (message: any) {
//             console.log('Client received message:', message);
//             if (message.message === 'got user media') {
//                 self.maybeStart();
//             } else if (message.message.type === 'offer') {
//                 if (!self.isInitiator && !self.isStarted) {
//                     self.maybeStart();
//                 }
//                 self.pc.setRemoteDescription(new RTCSessionDescription(message.message));
//                 self.doAnswer();
//             } else if (message.message.type === 'answer' && self.isStarted) {
//                 self.pc.setRemoteDescription(new RTCSessionDescription(message.message));
//             } else if (message.message.type === 'candidate' && self.isStarted) {
//                 let candidate = new RTCIceCandidate({
//                     sdpMLineIndex: message.message.label,
//                     candidate: message.message.candidate
//                 });
//                 self.pc.addIceCandidate(candidate);
//             } else if (message === 'bye' && self.isStarted) {
//                 self.handleRemoteHangup();
//             }
//         });

//         navigator.mediaDevices.getUserMedia({
//             audio: false,
//             video: true
//         })
//             .then(this.gotStream)
//             .catch(function (e) {
//                 alert('getUserMedia() error: ' + e.name);
//             });

//         //Trying this one out!!!
//         console.log('Getting user media with constraints', this.constraints);

//         if (location.hostname !== 'localhost') {
//             this.requestTurn(
//                 'https://computeengineondemand.appspot.com/turn?username=41784574&key=4080218913'
//             );
//         }


//     }


//     sendMessage(message: any) {
//         console.log('Client sending message: ', message);
//         Utils.Emit(DocServer._socket, MessageStore.NotifyRoommates, { message: message, room: this.curRoom });
//         //DocServer._socket.emit('message', message);
//     }





//     setVideoObjects(localVideo: HTMLVideoElement, remoteVideo: HTMLVideoElement) {
//         this.localVideo = localVideo;
//         this.remoteVideo = remoteVideo;
//     }

//     setLocalVideoObject(localVideoRef: HTMLVideoElement) {
//         this.localVideo = localVideoRef;
//     }

//     setRemoteVideoObject(remoteVideoRef: HTMLVideoElement) {
//         this.remoteVideo = remoteVideoRef;
//     }




//     gotStream(stream: any) {
//         console.log('Adding local stream.');
//         this.localStream = stream;
//         this.localVideo!.srcObject = stream;
//         this.sendMessage('got user media');
//         if (this.isInitiator) {
//             this.maybeStart();
//         }
//     }

//     constraints = {
//         video: true,
//         audio: true
//     };





//     maybeStart() {
//         console.log('>>>>>>> maybeStart() ', this.isStarted, this.localStream, this.isChannelReady);
//         if (!this.isStarted && typeof this.localStream !== 'undefined' && this.isChannelReady) {
//             console.log('>>>>>> creating peer connection');
//             this.createPeerConnection();
//             this.pc.addStream(this.localStream);
//             this.isStarted = true;
//             console.log('isInitiator', this.isInitiator);
//             if (this.isInitiator) {
//                 this.doCall();
//             }
//         }
//     }


//     // //this will need to be changed to our version of hangUp
//     // window.onbeforeunload = function () {
//     //     sendMessage('bye');
//     // };

//     createPeerConnection() {
//         try {
//             this.pc = new RTCPeerConnection(undefined);
//             this.pc.onicecandidate = this.handleIceCandidate;
//             this.pc.onaddstream = this.handleRemoteStreamAdded;
//             this.pc.onremovestream = this.handleRemoteStreamRemoved;
//             console.log('Created RTCPeerConnnection');
//         } catch (e) {
//             console.log('Failed to create PeerConnection, exception: ' + e.message);
//             alert('Cannot create RTCPeerConnection object.');
//             return;
//         }
//     }

//     handleIceCandidate(event: any) {
//         console.log('icecandidate event: ', event);
//         if (event.candidate) {
//             this.sendMessage({
//                 type: 'candidate',
//                 label: event.candidate.sdpMLineIndex,
//                 id: event.candidate.sdpMid,
//                 candidate: event.candidate.candidate
//             });
//         } else {
//             console.log('End of candidates.');
//         }
//     }

//     handleCreateOfferError(event: any) {
//         console.log('createOffer() error: ', event);
//     }

//     doCall() {
//         console.log('Sending offer to peer');
//         this.pc.createOffer(this.setLocalAndSendMessage, this.handleCreateOfferError);
//     }

//     doAnswer() {
//         console.log('Sending answer to peer.');
//         this.pc.createAnswer().then(
//             this.setLocalAndSendMessage,
//             this.onCreateSessionDescriptionError
//         );
//     }

//     setLocalAndSendMessage(sessionDescription: any) {
//         this.pc.setLocalDescription(sessionDescription);
//         console.log('setLocalAndSendMessage sending message', sessionDescription);
//         this.sendMessage(sessionDescription);
//     }

//     onCreateSessionDescriptionError(error: any) {
//         console.log('Failed to create session description: ' + error.toString());
//     }


//     requestTurn(turnURL: any) {
//         var turnExists = false;
//         let self = this;
//         for (var i in this.pcConfig.iceServers) {
//             if (this.pcConfig.iceServers[i].urls.substr(0, 5) === 'turn:') {
//                 turnExists = true;
//                 this.turnReady = true;
//                 break;
//             }
//         }
//         if (!turnExists) {
//             console.log('Getting TURN server from ', turnURL);
//             // No TURN server. Get one from computeengineondemand.appspot.com:
//             var xhr = new XMLHttpRequest();
//             xhr.onreadystatechange = function () {
//                 if (xhr.readyState === 4 && xhr.status === 200) {
//                     var turnServer = JSON.parse(xhr.responseText);
//                     console.log('Got TURN server: ', turnServer);
//                     self.pcConfig.iceServers.push({
//                         'urls': 'turn:' + turnServer.username + '@' + turnServer.turn,
//                         //'credential': turnServer.password
//                     });
//                     self.turnReady = true;
//                 }
//             };
//             xhr.open('GET', turnURL, true);
//             xhr.send();
//         }
//     }

//     handleRemoteStreamAdded(event: MediaStreamEvent) {
//         console.log('Remote stream added.');
//         this.remoteStream = event.stream!;
//         this.remoteVideo!.srcObject = this.remoteStream;
//     }

//     handleRemoteStreamRemoved(event: MediaStreamEvent) {
//         console.log('Remote stream removed. Event: ', event);
//     }

//     hangup() {
//         console.log('Hanging up.');
//         if (this.pc) {
//             stop();
//             this.sendMessage('bye');
//         }

//         if (this.localStream) {
//             this.localStream.getTracks().forEach(track => track.stop());
//         }

//     }

//     handleRemoteHangup() {
//         console.log('Session terminated.');
//         stop();
//         this.isInitiator = false;
//     }

//     stop() {
//         this.isStarted = false;
//         this.pc.close();
//         this.pc = null;
//     }


// }