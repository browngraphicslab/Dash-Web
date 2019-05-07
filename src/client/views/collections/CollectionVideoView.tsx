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


@observer
export class CollectionVideoView extends React.Component<FieldViewProps> {
    private _videoBox: VideoBox | undefined = undefined;
    @observable _playTimer?: NodeJS.Timeout = undefined;

    @observable _currentTimecode: number = 0;

    public static LayoutString(fieldKey: string = "data") {
        return FieldView.LayoutString(CollectionVideoView, fieldKey);
    }
    private get uIButtons() {
        let scaling = Math.min(1.8, this.props.ScreenToLocalTransform().Scale);
        return ([
            <div className="collectionVideoView-time" key="time" onPointerDown={this.onResetDown} style={{ transform: `scale(${scaling}, ${scaling})` }}>
                <span>{"" + Math.round(this._currentTimecode)}</span>
                <span style={{ fontSize: 8 }}>{" " + Math.round((this._currentTimecode - Math.trunc(this._currentTimecode)) * 100)}</span>
            </div>,
            <div className="collectionVideoView-play" key="play" onPointerDown={this.onPlayDown} style={{ transform: `scale(${scaling}, ${scaling})` }}>
                {this._playTimer ? "\"" : ">"}
            </div>,
            <div className="collectionVideoView-full" key="full" onPointerDown={this.onFullDown} style={{ transform: `scale(${scaling}, ${scaling})` }}>
                F
                </div>
        ]);
    }

    @action
    updateTimecode = () => {
        if (this._videoBox && this._videoBox.player) {
            this._currentTimecode = this._videoBox.player.currentTime;
            this.props.Document.curPage = Math.round(this._currentTimecode);
        }
    }

    componentDidMount() { this.updateTimecode(); }

    componentWillUnmount() { if (this._playTimer) clearInterval(this._playTimer); }

    @action
    onPlayDown = () => {
        if (this._videoBox && this._videoBox.player) {
            if (this._videoBox.player.paused) {
                this._videoBox.player.play();
                if (!this._playTimer) this._playTimer = setInterval(this.updateTimecode, 1000);
            } else {
                this._videoBox.player.pause();
                if (this._playTimer) clearInterval(this._playTimer);
                this._playTimer = undefined;

            }
        }
    }

    @action
    onFullDown = (e: React.PointerEvent) => {
        if (this._videoBox && this._videoBox.player) {
            this._videoBox.player.requestFullscreen();
            e.stopPropagation();
            e.preventDefault();
        }
    }

    @action
    onResetDown = () => {
        if (this._videoBox && this._videoBox.player) {
            this._videoBox.player.pause();
            this._videoBox.player.currentTime = 0;
            if (this._playTimer) clearInterval(this._playTimer);
            this._playTimer = undefined;
            this.updateTimecode();
        }
    }

    onContextMenu = (e: React.MouseEvent): void => {
        if (!e.isPropagationStopped() && this.props.Document[Id] !== "mainDoc") { // need to test this because GoldenLayout causes a parallel hierarchy in the React DOM for its children and the main document view7
            ContextMenu.Instance.addItem({ description: "VideoOptions", event: emptyFunction });
        }
    }

    setVideoBox = (player: VideoBox) => { this._videoBox = player; }

    private subView = (_type: CollectionViewType, renderProps: CollectionRenderProps) => {
        let props = { ...this.props, ...renderProps };
        return (<>
            <CollectionFreeFormView {...props} setVideoBox={this.setVideoBox} CollectionView={this} />
            {this.props.isSelected() ? this.uIButtons : (null)}
        </>);
    }

    render() {
        return (
            <CollectionBaseView {...this.props} className="collectionVideoView-cont" onContextMenu={this.onContextMenu}>
                {this.subView}
            </CollectionBaseView>);
    }
}