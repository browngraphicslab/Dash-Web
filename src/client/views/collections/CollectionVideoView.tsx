import { action } from "mobx";
import { observer } from "mobx-react";
import { NumCast } from "../../../new_fields/Types";
import { FieldView, FieldViewProps } from "../nodes/FieldView";
import { VideoBox } from "../nodes/VideoBox";
import { CollectionBaseView, CollectionRenderProps, CollectionViewType } from "./CollectionBaseView";
import { CollectionFreeFormView } from "./collectionFreeForm/CollectionFreeFormView";
import "./CollectionVideoView.scss";
import React = require("react");


@observer
export class CollectionVideoView extends React.Component<FieldViewProps> {
    private _videoBox?: VideoBox;

    public static LayoutString(fieldKey: string = "data", fieldExt: string = "annotations") {
        return FieldView.LayoutString(CollectionVideoView, fieldKey, fieldExt);
    }
    private get uIButtons() {
        let scaling = Math.min(1.8, this.props.ScreenToLocalTransform().Scale);
        let curTime = NumCast(this.props.Document.curPage);
        return (VideoBox._showControls ? [] : [
            <div className="collectionVideoView-time" key="time" onPointerDown={this.onResetDown} style={{ transform: `scale(${scaling}, ${scaling})` }}>
                <span>{"" + Math.round(curTime)}</span>
                <span style={{ fontSize: 8 }}>{" " + Math.round((curTime - Math.trunc(curTime)) * 100)}</span>
            </div>,
            <div className="collectionVideoView-play" key="play" onPointerDown={this.onPlayDown} style={{ transform: `scale(${scaling}, ${scaling})` }}>
                {this._videoBox && this._videoBox.Playing ? "\"" : ">"}
            </div>,
            <div className="collectionVideoView-full" key="full" onPointerDown={this.onFullDown} style={{ transform: `scale(${scaling}, ${scaling})` }}>
                F
                </div>
        ]);
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
    onResetDown = () => {
        if (this._videoBox) {
            this._videoBox.Pause();
            this.props.Document.curPage = 0;
        }
    }
    setVideoBox = (videoBox: VideoBox) => { this._videoBox = videoBox; };

    private subView = (_type: CollectionViewType, renderProps: CollectionRenderProps) => {
        let props = { ...this.props, ...renderProps };
        return (<>
            <CollectionFreeFormView {...props} setVideoBox={this.setVideoBox} CollectionView={this} />
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