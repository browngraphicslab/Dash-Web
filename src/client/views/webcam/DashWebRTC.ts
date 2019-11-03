import { DocServer } from '../../DocServer';



export namespace DashWebRTC {


    let isChannelReady = false;
    let isInitiator = false;
    let isStarted = false;
    let localStream: MediaStream | undefined;
    let pc: any;
    let remoteStream: MediaStream | undefined;
    let turnReady;
    let localVideo: HTMLVideoElement;
    let remoteVideo: HTMLVideoElement;


    let pcConfig = {
        'iceServers': [{
            'urls': 'stun:stun.l.google.com:19302'
        }]
    };

    // Set up audio and video regardless of what devices are present.
    let sdpConstraints = {
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
    };

    export function init() {
        let room = 'test';

        if (room !== '') {
            DocServer._socket.emit('create or join', room);
            console.log('Attempted to create or  join room', room);

        }

        DocServer._socket.on('created', function (room: string) {
            console.log('Created room ' + room);
            isInitiator = true;
        });

        DocServer._socket.on('full', function (room: string) {
            console.log('Room ' + room + ' is full');
        });

        DocServer._socket.on('join', function (room: string) {
            console.log('Another peer made a request to join room ' + room);
            console.log('This peer is the initiator of room ' + room + '!');
            isChannelReady = true;
        });


        DocServer._socket.on('joined', function (room: string) {
            console.log('joined: ' + room);
            isChannelReady = true;
        });


        DocServer._socket.on('log', function (array: any) {
            console.log.apply(console, array);
        });

        // This client receives a message
        DocServer._socket.on('message', function (message: any) {
            console.log('Client received message:', message);
            if (message === 'got user media') {
                maybeStart();
            } else if (message.type === 'offer') {
                if (!isInitiator && !isStarted) {
                    maybeStart();
                }
                pc.setRemoteDescription(new RTCSessionDescription(message));
                doAnswer();
            } else if (message.type === 'answer' && isStarted) {
                pc.setRemoteDescription(new RTCSessionDescription(message));
            } else if (message.type === 'candidate' && isStarted) {
                var candidate = new RTCIceCandidate({
                    sdpMLineIndex: message.label,
                    candidate: message.candidate
                });
                pc.addIceCandidate(candidate);
            } else if (message === 'bye' && isStarted) {
                handleRemoteHangup();
            }
        });

        navigator.mediaDevices.getUserMedia({
            audio: false,
            video: true
        })
            .then(gotStream)
            .catch(function (e) {
                alert('getUserMedia() error: ' + e.name);
            });

        //Trying this one out!!!
        console.log('Getting user media with constraints', constraints);

        if (location.hostname !== 'localhost') {
            requestTurn(
                'https://computeengineondemand.appspot.com/turn?username=41784574&key=4080218913'
            );
        }


    }




    //let socket = io.connect();




    function sendMessage(message: any) {
        console.log('Client sending message: ', message);
        DocServer._socket.emit('message', message);
    }





    export function setVideoObjects(localVideo: HTMLVideoElement, remoteVideo: HTMLVideoElement) {
        localVideo = localVideo;
        remoteVideo = remoteVideo;
    }




    function gotStream(stream: any) {
        console.log('Adding local stream.');
        localStream = stream;
        localVideo.srcObject = stream;
        sendMessage('got user media');
        if (isInitiator) {
            maybeStart();
        }
    }

    let constraints = {
        video: true,
        audio: true
    };





    function maybeStart() {
        console.log('>>>>>>> maybeStart() ', isStarted, localStream, isChannelReady);
        if (!isStarted && typeof localStream !== 'undefined' && isChannelReady) {
            console.log('>>>>>> creating peer connection');
            createPeerConnection();
            pc.addStream(localStream);
            isStarted = true;
            console.log('isInitiator', isInitiator);
            if (isInitiator) {
                doCall();
            }
        }
    }


    //this will need to be changed to our version of hangUp
    window.onbeforeunload = function () {
        sendMessage('bye');
    };

    function createPeerConnection() {
        try {
            pc = new RTCPeerConnection(undefined);
            pc.onicecandidate = handleIceCandidate;
            pc.onaddstream = handleRemoteStreamAdded;
            pc.onremovestream = handleRemoteStreamRemoved;
            console.log('Created RTCPeerConnnection');
        } catch (e) {
            console.log('Failed to create PeerConnection, exception: ' + e.message);
            alert('Cannot create RTCPeerConnection object.');
            return;
        }
    }

    function handleIceCandidate(event: any) {
        console.log('icecandidate event: ', event);
        if (event.candidate) {
            sendMessage({
                type: 'candidate',
                label: event.candidate.sdpMLineIndex,
                id: event.candidate.sdpMid,
                candidate: event.candidate.candidate
            });
        } else {
            console.log('End of candidates.');
        }
    }

    function handleCreateOfferError(event: any) {
        console.log('createOffer() error: ', event);
    }

    function doCall() {
        console.log('Sending offer to peer');
        pc.createOffer(setLocalAndSendMessage, handleCreateOfferError);
    }

    function doAnswer() {
        console.log('Sending answer to peer.');
        pc.createAnswer().then(
            setLocalAndSendMessage,
            onCreateSessionDescriptionError
        );
    }

    function setLocalAndSendMessage(sessionDescription: any) {
        pc.setLocalDescription(sessionDescription);
        console.log('setLocalAndSendMessage sending message', sessionDescription);
        sendMessage(sessionDescription);
    }

    function onCreateSessionDescriptionError(error: any) {
        console.log('Failed to create session description: ' + error.toString());
    }


    function requestTurn(turnURL: any) {
        var turnExists = false;
        for (var i in pcConfig.iceServers) {
            if (pcConfig.iceServers[i].urls.substr(0, 5) === 'turn:') {
                turnExists = true;
                turnReady = true;
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
                    pcConfig.iceServers.push({
                        'urls': 'turn:' + turnServer.username + '@' + turnServer.turn,
                        //'credential': turnServer.password
                    });
                    turnReady = true;
                }
            };
            xhr.open('GET', turnURL, true);
            xhr.send();
        }
    }

    function handleRemoteStreamAdded(event: MediaStreamEvent) {
        console.log('Remote stream added.');
        remoteStream = event.stream!;
        remoteVideo.srcObject = remoteStream;
    }

    function handleRemoteStreamRemoved(event: MediaStreamEvent) {
        console.log('Remote stream removed. Event: ', event);
    }

    function hangup() {
        console.log('Hanging up.');
        stop();
        sendMessage('bye');
    }

    function handleRemoteHangup() {
        console.log('Session terminated.');
        stop();
        isInitiator = false;
    }

    function stop() {
        isStarted = false;
        pc.close();
        pc = null;
    }


































}