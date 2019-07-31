import { action } from "mobx";
import { observer } from "mobx-react";
import { NumCast } from "../../../new_fields/Types";
import { FieldView, FieldViewProps } from "../nodes/FieldView";
import { VideoBox } from "../nodes/VideoBox";
import { CollectionBaseView, CollectionRenderProps, CollectionViewType } from "./CollectionBaseView";
import { CollectionFreeFormView } from "./collectionFreeForm/CollectionFreeFormView";
import "./CollectionVideoView.scss";
import React = require("react");
import { InkingControl } from "../InkingControl";
import { InkTool } from "../../../new_fields/InkField";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";


@observer
export class CollectionVideoView extends React.Component<FieldViewProps> {
    private _videoBox?: VideoBox;

    public static LayoutString(fieldKey: string = "data", fieldExt: string = "annotations") {
        return FieldView.LayoutString(CollectionVideoView, fieldKey, fieldExt);
    }
    private get uIButtons() {
        let scaling = Math.min(1.8, this.props.ScreenToLocalTransform().Scale);
        let curTime = NumCast(this.props.Document.curPage);
        return ([<div className="collectionVideoView-time" key="time" onPointerDown={this.onResetDown} style={{ transform: `scale(${scaling})` }}>
            <span>{"" + Math.round(curTime)}</span>
            <span style={{ fontSize: 8 }}>{" " + Math.round((curTime - Math.trunc(curTime)) * 100)}</span>
        </div>,
        <div className="collectionVideoView-snapshot" key="time" onPointerDown={this.onSnapshot} style={{ transform: `scale(${scaling})` }}>
            <FontAwesomeIcon icon="camera" size="lg" />
        </div>,
        VideoBox._showControls ? (null) : [
            <div className="collectionVideoView-play" key="play" onPointerDown={this.onPlayDown} style={{ transform: `scale(${scaling})` }}>
                <FontAwesomeIcon icon={this._videoBox && this._videoBox.Playing ? "pause" : "play"} size="lg" />
            </div>,
            <div className="collectionVideoView-full" key="full" onPointerDown={this.onFullDown} style={{ transform: `scale(${scaling})` }}>
                F
            </div>
        ]]);
    }

    @action
    onPlayDown = () => {
        if (this._videoBox) {
            if (this._videoBox.Playing) {
                this._videoBox.Pause();
            } else {
                this._videoBox.Play();
            }
        }
    }

    @action
    onFullDown = (e: React.PointerEvent) => {
        if (this._videoBox) {
            this._videoBox.FullScreen();
            e.stopPropagation();
            e.preventDefault();
        }
    }

    @action
    onSnapshot = (e: React.PointerEvent) => {
        if (this._videoBox) {
            this._videoBox.Snapshot();
            e.stopPropagation();
            e.preventDefault();
        }
    }

    _isclick = 0;
    @action
    onResetDown = (e: React.PointerEvent) => {
        if (this._videoBox) {
            this._videoBox.Pause();
            e.stopPropagation();
            this._isclick = 0;
            document.addEventListener("pointermove", this.onPointerMove, true);
            document.addEventListener("pointerup", this.onPointerUp, true);
            InkingControl.Instance.switchTool(InkTool.Eraser);
        }
    }

    @action
    onPointerMove = (e: PointerEvent) => {
        this._isclick += Math.abs(e.movementX) + Math.abs(e.movementY);
        if (this._videoBox) {
            this._videoBox.Seek(Math.max(0, NumCast(this.props.Document.curPage, 0) + Math.sign(e.movementX) * 0.0333));
        }
        e.stopImmediatePropagation();
    }
    @action
    onPointerUp = (e: PointerEvent) => {
        document.removeEventListener("pointermove", this.onPointerMove, true);
        document.removeEventListener("pointerup", this.onPointerUp, true);
        InkingControl.Instance.switchTool(InkTool.None);
        this._isclick < 10 && (this.props.Document.curPage = 0);
    }
    setVideoBox = (videoBox: VideoBox) => { this._videoBox = videoBox; };

    private subView = (_type: CollectionViewType, renderProps: CollectionRenderProps) => {
        let props = { ...this.props, ...renderProps };
        return (<>
            <CollectionFreeFormView {...props} setVideoBox={this.setVideoBox} CollectionView={this} chromeCollapsed={true} />
            {this.props.isSelected() ? this.uIButtons : (null)}
        </>);
    }

    render() {
        return (
            <CollectionBaseView {...this.props} className="collectionVideoView-cont" >
                {this.subView}
            </CollectionBaseView>);
    }
}