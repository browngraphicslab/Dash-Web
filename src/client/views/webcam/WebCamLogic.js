'use strict';
import io from "socket.io-client";

var socket;
var isChannelReady = false;
var isInitiator = false;
var isStarted = false;
var localStream;
var pc;
var remoteStream;
var turnReady;
var room;

export function initialize(roomName, handlerUI) {

    var pcConfig = {
        'iceServers': [{
            'urls': 'stun:stun.l.google.com:19302'
        }]
    };

    // Set up audio and video regardless of what devices are present.
    var sdpConstraints = {
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
    };

    /////////////////////////////////////////////

    room = roomName;

    socket = io.connect(`${window.location.protocol}//${window.location.hostname}:${4321}`);

    if (room !== '') {
        socket.emit('create or join', room);
        console.log('Attempted to create or  join room', room);
    }

    socket.on('created', function (room) {
        console.log('Created room ' + room);
        isInitiator = true;
    });

    socket.on('full', function (room) {
        console.log('Room ' + room + ' is full');
    });

    socket.on('join', function (room) {
        console.log('Another peer made a request to join room ' + room);
        console.log('This peer is the initiator of room ' + room + '!');
        isChannelReady = true;
    });

    socket.on('joined', function (room) {
        console.log('joined: ' + room);
        isChannelReady = true;
    });

    socket.on('log', function (array) {
        console.log.apply(console, array);
    });

    ////////////////////////////////////////////////


    // This client receives a message
    socket.on('message', function (message) {
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

    ////////////////////////////////////////////////////

    var localVideo = document.querySelector('#localVideo');
    var remoteVideo = document.querySelector('#remoteVideo');

    const gotStream = (stream) => {
        console.log('Adding local stream.');
        localStream = stream;
        localVideo.srcObject = stream;
        sendMessage('got user media');
        if (isInitiator) {
            maybeStart();
        }
    }


    navigator.mediaDevices.getUserMedia({
        audio: true,
        video: true
    })
        .then(gotStream)
        .catch(function (e) {
            alert('getUserMedia() error: ' + e.name);
        });



    var constraints = {
        video: true
    };

    console.log('Getting user media with constraints', constraints);

    const requestTurn = (turnURL) => {
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
                        'credential': turnServer.password
                    });
                    turnReady = true;
                }
            };
            xhr.open('GET', turnURL, true);
            xhr.send();
        }
    }




    if (location.hostname !== 'localhost') {
        requestTurn(
            `${window.location.origin}/corsProxy/${encodeURIComponent("https://computeengineondemand.appspot.com/turn?username=41784574&key=4080218913")}`
        );
    }

    const maybeStart = () => {
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
    };

    window.onbeforeunload = function () {
        sendMessage('bye');
    };

    /////////////////////////////////////////////////////////

    const createPeerConnection = () => {
        try {
            pc = new RTCPeerConnection(null);
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

    const handleIceCandidate = (event) => {
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

    const handleCreateOfferError = (event) => {
        console.log('createOffer() error: ', event);
    }

    const doCall = () => {
        console.log('Sending offer to peer');
        pc.createOffer(setLocalAndSendMessage, handleCreateOfferError);
    }

    const doAnswer = () => {
        console.log('Sending answer to peer.');
        pc.createAnswer().then(
            setLocalAndSendMessage,
            onCreateSessionDescriptionError
        );
    }

    const setLocalAndSendMessage = (sessionDescription) => {
        pc.setLocalDescription(sessionDescription);
        console.log('setLocalAndSendMessage sending message', sessionDescription);
        sendMessage(sessionDescription);
    }

    const onCreateSessionDescriptionError = (error) => {
        trace('Failed to create session description: ' + error.toString());
    }



    const handleRemoteStreamAdded = (event) => {
        console.log('Remote stream added.');
        remoteStream = event.stream;
        remoteVideo.srcObject = remoteStream;
        handlerUI();

    };

    const handleRemoteStreamRemoved = (event) => {
        console.log('Remote stream removed. Event: ', event);
    }
}

export function hangup() {
    console.log('Hanging up.');
    stop();
    sendMessage('bye');
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
}

function stop() {
    isStarted = false;
    if (pc) {
        pc.close();
    }
    pc = null;
}

function handleRemoteHangup() {
    console.log('Session terminated.');
    stop();
    isInitiator = false;
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
}

function sendMessage(message) {
    console.log('Client sending message: ', message);
    socket.emit('message', message, room);
};

export function refreshVideos() {
    var localVideo = document.querySelector('#localVideo');
    var remoteVideo = document.querySelector('#remoteVideo');
    if (localVideo) {
        localVideo.srcObject = localStream;
    }
    if (remoteVideo) {
        remoteVideo.srcObject = remoteStream;
    }

}