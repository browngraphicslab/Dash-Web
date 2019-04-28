import { action, observable, trace } from "mobx";
import { observer } from "mobx-react";
import { ContextMenu } from "../ContextMenu";
import { CollectionViewType, CollectionBaseView, CollectionRenderProps } from "./CollectionBaseView";
import React = require("react");
import "./CollectionVideoView.scss";
import { CollectionFreeFormView } from "./collectionFreeForm/CollectionFreeFormView";
import { FieldView, FieldViewProps } from "../nodes/FieldView";
import { emptyFunction } from "../../../Utils";
import { NumCast } from "../../../new_fields/Types";


@observer
export class CollectionVideoView extends React.Component<FieldViewProps> {
    private _intervalTimer: any = undefined;
    private _player: HTMLVideoElement | undefined = undefined;

    @observable _currentTimecode: number = 0;
    @observable _isPlaying: boolean = false;

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
                {this._isPlaying ? "\"" : ">"}
            </div>,
            <div className="collectionVideoView-full" key="full" onPointerDown={this.onFullDown} style={{ transform: `scale(${scaling}, ${scaling})` }}>
                F
                </div>
        ]);
    }

    _ele: HTMLDivElement | null = null;
    @action
    mainCont = (ele: HTMLDivElement | null) => {
        this._ele = ele;
        if (ele) {
            this._player = ele.getElementsByTagName("video")[0];
            console.log(this._player);
            const curPage = NumCast(this.props.Document.curPage, -1);
            if (curPage >= 0) {
                this._currentTimecode = curPage;
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
        this._player = this._player ? this._player : this._ele ? this._ele.getElementsByTagName("video")[0] : undefined;
        if (this._player) {
            let timecode = (this._player as any).hasOwnProperty("AHackBecauseSomethingResetsTheVideoToZero") ?
                (this._player as any).AHackBecauseSomethingResetsTheVideoToZero : -1;
            if (timecode !== -1 && Object) {
                this._player.currentTime = timecode;
                (this._player as any).AHackBecauseSomethingResetsTheVideoToZero = -1;
            } else {
                this._currentTimecode = this._player.currentTime;
                this.props.Document.curPage = Math.round(this._currentTimecode);
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
            ContextMenu.Instance.addItem({ description: "VideoOptions", event: emptyFunction });
        }
    }

    private subView = (_type: CollectionViewType, renderProps: CollectionRenderProps) => {
        let props = { ...this.props, ...renderProps };
        return (
            <>
                <CollectionFreeFormView {...props} CollectionView={this} />
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