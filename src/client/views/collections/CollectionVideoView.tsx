import { action, observable, trace } from "mobx";
import { observer } from "mobx-react";
import { KeyStore } from "../../../fields/KeyStore";
import { ContextMenu } from "../ContextMenu";
import { CollectionViewType, CollectionBaseView, CollectionRenderProps } from "./CollectionBaseView";
import React = require("react");
import "./CollectionVideoView.scss";
import { CollectionFreeFormView } from "./collectionFreeForm/CollectionFreeFormView";
import { FieldView, FieldViewProps } from "../nodes/FieldView";


@observer
export class CollectionVideoView extends React.Component<FieldViewProps> {
    private _intervalTimer: any = undefined;
    private _player: HTMLVideoElement | undefined = undefined;

    @observable _currentTimecode: number = 0;
    @observable _isPlaying: boolean = false;

    public static LayoutString(fieldKey: string = "DataKey") {
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
                {this._isPlaying ? "\"" : ">"}
            </div>,
            <div className="collectionVideoView-full" key="full" onPointerDown={this.onFullDown} style={{ transform: `scale(${scaling}, ${scaling})` }}>
                F
                </div>
        ]);
    }

    @action
    mainCont = (ele: HTMLDivElement | null) => {
        if (ele) {
            this._player = ele.getElementsByTagName("video")[0];
            if (this.props.Document.GetNumber(KeyStore.CurPage, -1) >= 0) {
                this._currentTimecode = this.props.Document.GetNumber(KeyStore.CurPage, -1);
            }
        }
    }

    componentDidMount() {
        this._intervalTimer = setInterval(this.updateTimecode, 1000);
    }

    componentWillUnmount() {
        clearInterval(this._intervalTimer);
    }

    @action
    updateTimecode = () => {
        if (this._player) {
            if ((this._player as any).AHackBecauseSomethingResetsTheVideoToZero !== -1) {
                this._player.currentTime = (this._player as any).AHackBecauseSomethingResetsTheVideoToZero;
                (this._player as any).AHackBecauseSomethingResetsTheVideoToZero = -1;
            } else {
                this._currentTimecode = this._player.currentTime;
                this.props.Document.SetNumber(KeyStore.CurPage, Math.round(this._currentTimecode));
            }
        }
    }

    @action
    onPlayDown = () => {
        if (this._player) {
            if (this._player.paused) {
                this._player.play();
                this._isPlaying = true;
            } else {
                this._player.pause();
                this._isPlaying = false;
            }
        }
    }

    @action
    onFullDown = (e: React.PointerEvent) => {
        if (this._player) {
            this._player.requestFullscreen();
            e.stopPropagation();
            e.preventDefault();
        }
    }

    @action
    onResetDown = () => {
        if (this._player) {
            this._player.pause();
            this._player.currentTime = 0;
        }

    }

    onContextMenu = (e: React.MouseEvent): void => {
        if (!e.isPropagationStopped() && this.props.Document.Id !== "mainDoc") { // need to test this because GoldenLayout causes a parallel hierarchy in the React DOM for its children and the main document view7
            ContextMenu.Instance.addItem({ description: "VideoOptions", event: () => { } });
        }
    }

    private subView = (_type: CollectionViewType, renderProps: CollectionRenderProps) => {
        let props = { ...this.props, ...renderProps };
        return (
            <>
                <CollectionFreeFormView {...props} />
                {this.props.isSelected() ? this.uIButtons : (null)}
            </>
        );
    }

    render() {
        trace();
        return (
            <CollectionBaseView {...this.props} className="collectionVideoView-cont" contentRef={this.mainCont} onContextMenu={this.onContextMenu}>
                {this.subView}
            </CollectionBaseView>);
    }
}