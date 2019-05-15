import { action, observable, trace } from "mobx";
import { observer } from "mobx-react";
import { ContextMenu } from "../ContextMenu";
import { CollectionViewType, CollectionBaseView, CollectionRenderProps } from "./CollectionBaseView";
import React = require("react");
import "./CollectionVideoView.scss";
import { CollectionFreeFormView } from "./collectionFreeForm/CollectionFreeFormView";
import { FieldView, FieldViewProps } from "../nodes/FieldView";
import { emptyFunction } from "../../../Utils";
import { Id } from "../../../new_fields/RefField";
import { VideoBox } from "../nodes/VideoBox";
import { NumCast } from "../../../new_fields/Types";


@observer
export class CollectionVideoView extends React.Component<FieldViewProps> {
    private _videoBox?: VideoBox;

    public static LayoutString(fieldKey: string = "data") {
        return FieldView.LayoutString(CollectionVideoView, fieldKey);
    }
    private get uIButtons() {
        let scaling = Math.min(1.8, this.props.ScreenToLocalTransform().Scale);
        let curTime = NumCast(this.props.Document.curPage);
        return ([
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
        if (this._videoBox && this._videoBox.player) {
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

    onContextMenu = (e: React.MouseEvent): void => {
        if (!e.isPropagationStopped() && this.props.Document[Id] !== "mainDoc") { // need to test this because GoldenLayout causes a parallel hierarchy in the React DOM for its children and the main document view7
            ContextMenu.Instance.addItem({ description: "VideoOptions", event: emptyFunction });
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
        trace();
        return (
            <CollectionBaseView {...this.props} className="collectionVideoView-cont" onContextMenu={this.onContextMenu}>
                {this.subView}
            </CollectionBaseView>);
    }
}