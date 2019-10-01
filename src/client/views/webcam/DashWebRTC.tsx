import { observer } from "mobx-react";
import React = require("react");
import { CollectionFreeFormDocumentViewProps } from "../nodes/CollectionFreeFormDocumentView";
import { FieldViewProps } from "../nodes/FieldView";
import { observable } from "mobx";


const mediaStreamConstaints = {
    video: true,
};


@observer
export class DashWebRTC extends React.Component<{}> {

    @observable private videoEl: HTMLVideoElement | undefined;
    @observable private localStream: MediaStream | undefined;


    gotLocalMediaStream = (mediaStream: MediaStream) => {
        this.localStream = mediaStream;
        if (this.videoEl) {
            this.videoEl.srcObject = mediaStream;
        }
    }

    handleLocalMediaStreamError = (error: string) => {
        console.log("navigator.getUserMedia error: ", error);
    }

    componentDidUpdate() {
        navigator.mediaDevices.getUserMedia(mediaStreamConstaints).then(this.gotLocalMediaStream).catch(this.handleLocalMediaStreamError);
    }




    render() {
        return (
            <div>
                <video autoPlay playsInline ref={(e) => this.videoEl = e!}></video>
            </div>
        );
    }


}