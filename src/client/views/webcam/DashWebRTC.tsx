import { observer } from "mobx-react";
import React = require("react");
import { CollectionFreeFormDocumentViewProps } from "../nodes/CollectionFreeFormDocumentView";
import { FieldViewProps, FieldView } from "../nodes/FieldView";
import { observable } from "mobx";
import { DocumentDecorations } from "../DocumentDecorations";
import { InkingControl } from "../InkingControl";
import "../../views/nodes/WebBox.scss";



const mediaStreamConstaints = {
    video: true,
};


@observer
export class DashWebRTC extends React.Component<CollectionFreeFormDocumentViewProps & FieldViewProps> {

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
                <video autoPlay playsInline ref={(e) => this.videoEl = e!}></video>
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
        );
    }


}