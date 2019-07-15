import React = require("react");
import { action, IReactionDisposer, observable, reaction, trace, computed, runInAction } from "mobx";
import { observer } from "mobx-react";
import { makeInterface } from "../../../new_fields/Schema";
import { Cast, FieldValue, NumCast } from "../../../new_fields/Types";
import { VideoField } from "../../../new_fields/URLField";
import { ContextMenu } from "../ContextMenu";
import { ContextMenuProps } from "../ContextMenuItem";
import { DocComponent } from "../DocComponent";
import { InkingControl } from "../InkingControl";
import { positionSchema } from "./DocumentView";
import { FieldView, FieldViewProps } from './FieldView';
import { pageSchema } from "./ImageBox";
import "./VideoBox.scss";
import { InkTool } from "../../../new_fields/InkField";
import { DocumentDecorations } from "../DocumentDecorations";

type VideoDocument = makeInterface<[typeof positionSchema, typeof pageSchema]>;
const VideoDocument = makeInterface(positionSchema, pageSchema);

@observer
export class VideoBox extends DocComponent<FieldViewProps, VideoDocument>(VideoDocument) {
    private _reactionDisposer?: IReactionDisposer;
    private _youtubeReactionDisposer?: IReactionDisposer;
    private _youtubePlayer: any = undefined;
    private _videoRef: HTMLVideoElement | null = null;
    @observable _playTimer?: NodeJS.Timeout = undefined;
    @observable _fullScreen = false;
    @observable public Playing: boolean = false;
    public static LayoutString() { return FieldView.LayoutString(VideoBox); }

    public get player(): HTMLVideoElement | null {
        return this._videoRef;
    }

    videoLoad = () => {
        let aspect = this.player!.videoWidth / this.player!.videoHeight;
        var nativeWidth = FieldValue(this.Document.nativeWidth, 0);
        var nativeHeight = FieldValue(this.Document.nativeHeight, 0);
        if (!nativeWidth || !nativeHeight) {
            if (!this.Document.nativeWidth) this.Document.nativeWidth = this.player!.videoWidth;
            this.Document.nativeHeight = this.Document.nativeWidth / aspect;
            this.Document.height = FieldValue(this.Document.width, 0) / aspect;
        }
    }

    @action public Play = (update: boolean = true) => {
        this.Playing = true;
        update && this.player && this.player.play();
        update && this._youtubePlayer && this._youtubePlayer.playVideo();
        !this._playTimer && (this._playTimer = setInterval(this.updateTimecode, 500));
        this.updateTimecode();
    }

    @action public Seek(time: number) {
        this._youtubePlayer && !this.Playing && this._youtubePlayer.seekTo(time);
    }

    @action public Pause = (update: boolean = true) => {
        this.Playing = false;
        update && this.player && this.player.pause();
        update && this._youtubePlayer && this._youtubePlayer.pauseVideo();
        this._playTimer && clearInterval(this._playTimer);
        this._playTimer = undefined;
        this.updateTimecode();
    }

    @action public FullScreen() {
        this._fullScreen = true;
        this.player && this.player.requestFullscreen();
        this._youtubePlayer && this.props.addDocTab(this.props.Document, this.props.DataDoc, "inTab");
    }

    @action
    updateTimecode = () => {
        let ctime = this._youtubePlayer.getCurrentTime();
        let otime = this.lastyoutube ? (this.lastyoutube as any).getCurrentTime() : -1;
        console.log("Setting " + ctime + " " + otime);
        this.player && (this.props.Document.curPage = this.player.currentTime);
        this._youtubePlayer && (this.props.Document.curPage = this._youtubePlayer.getCurrentTime());
    }
    static _staticCounter: number = 0;
    counter: number = -1;
    _startupTime: number = -1;
    componentDidMount() {
        if (this.props.setVideoBox) this.props.setVideoBox(this);

        if (this.youtubeVideoId) {
            let youtubeaspect = 400 / 315;
            var nativeWidth = FieldValue(this.Document.nativeWidth, 0);
            var nativeHeight = FieldValue(this.Document.nativeHeight, 0);
            if (!nativeWidth || !nativeHeight || Math.abs(nativeWidth / nativeHeight - youtubeaspect) > 0.05) {
                if (!this.Document.nativeWidth) this.Document.nativeWidth = 600;
                this.Document.nativeHeight = this.Document.nativeWidth / youtubeaspect;
                this.Document.height = FieldValue(this.Document.width, 0) / youtubeaspect;
            }
            this._reactionDisposer = reaction(() => this.props.Document.curPage, () => this.Seek(this.Document.curPage || 0), { fireImmediately: true });
            this._youtubeReactionDisposer = reaction(() => [this.props.isSelected(), DocumentDecorations.Instance.Interacting, InkingControl.Instance.selectedTool], () => {
                let interactive = InkingControl.Instance.selectedTool === InkTool.None && this.props.isSelected() && !DocumentDecorations.Instance.Interacting;
                this._youtubePlayer.getIframe().style.pointerEvents = interactive ? "all" : "none";
            }, { fireImmediately: true })
        }
    }

    @action
    onYoutubePlayerReady = (event: any) => {
        this._youtubePlayer && (this._youtubePlayer.getIframe().style.pointerEvents = "none");
        if (this.Document.curPage) {
            this.Playing = false;
            if (this._startupTime !== -1) {
                this.Seek(this.Document.curPage);
            }
            else {
                let cpage = this.Document.curPage;
                this.Pause();
                this._startupTime = cpage;
                this._youtubePlayer.seekTo(cpage);
            }
        }
    }

    componentWillUnmount() {
        this.Pause();
        this._reactionDisposer && this._reactionDisposer();
        this._youtubeReactionDisposer && this._youtubeReactionDisposer();
    }

    @action
    setVideoRef = (vref: HTMLVideoElement | null) => {
        this._videoRef = vref;
        if (vref) {
            vref.onfullscreenchange = action((e) => this._fullScreen = vref.webkitDisplayingFullscreen);
            if (this._reactionDisposer) this._reactionDisposer();
            this._reactionDisposer = reaction(() => this.props.Document.curPage, () =>
                !this.Playing && (vref.currentTime = this.Document.curPage || 0)
                , { fireImmediately: true });
        }
    }

    @observable static _showControls: boolean;

    @computed get youtubeVideoId() {
        let field = Cast(this.Document[this.props.fieldKey], VideoField);
        return field && field.url.href.indexOf("youtube") !== -1 ? ((arr: string[]) => arr[arr.length - 1])(field.url.href.split("/")) : "";
    }

    specificContextMenu = (e: React.MouseEvent): void => {
        let field = Cast(this.Document[this.props.fieldKey], VideoField);
        if (field) {
            let subitems: ContextMenuProps[] = [];
            subitems.push({ description: "Toggle Show Controls", event: action(() => VideoBox._showControls = !VideoBox._showControls), icon: "expand-arrows-alt" });
            ContextMenu.Instance.addItem({ description: "Video Funcs...", subitems: subitems });
        }
    }

    @computed get content() {
        let field = Cast(this.Document[this.props.fieldKey], VideoField);
        let interactive = InkingControl.Instance.selectedTool || !this.props.isSelected() ? "" : "-interactive";
        let style = "videoBox-content" + (this._fullScreen ? "-fullScreen" : "") + interactive;
        return !field ? <div>Loading</div> :
            <video className={`${style}`} ref={this.setVideoRef} onCanPlay={this.videoLoad} controls={VideoBox._showControls} onPlay={this.Play} onSeeked={this.updateTimecode} onPause={this.Pause}>
                <source src={field.url.href} type="video/mp4" />
                Not supported.
            </video>;
    }

    times = 0;
    lastyoutube = undefined;
    @action load = () => {
        let x = ++this.times;
        console.log("LOADED " + x + " times = " + this.times);
        let onYoutubePlayerStateChange = (event: any) => runInAction(() => {
            console.log("STATE + " + event.data + "  times = " + this.times + " " + x);
            //if (this.times !== x) return;
            if (event.data === YT.PlayerState.UNSTARTED || event.data === YT.PlayerState.BUFFERING)
                return;
            if (this._startupTime !== -1) {
                this._startupTime = -1;
                if (event.data === YT.PlayerState.PLAYING) this.Pause();
            }
            if (event.data == YT.PlayerState.PLAYING && !this.Playing) this.Play(false);
            if (event.data == YT.PlayerState.PAUSED && this.Playing) this.Pause(false);
        });
        let cpage = NumCast(this.Document.curPage);
        this._startupTime = cpage;
        this.lastyoutube = this._youtubePlayer;
        this._youtubePlayer = new YT.Player(`${this.youtubeVideoId + this.counter}-player`, {
            events: {
                'onReady': this.onYoutubePlayerReady,
                'onStateChange': onYoutubePlayerStateChange
            }
        });
    }

    @computed get youtubeContent() {
        this.counter = VideoBox._staticCounter++;
        let style = "videoBox-content-YouTube" + (this._fullScreen ? "-fullScreen" : "");
        return <iframe id={`${this.youtubeVideoId + this.counter.toString()}-player`} onLoad={this.load} className={`${style}`} width="640" height="390"
            src={`http://www.youtube.com/embed/${this.youtubeVideoId}?enablejsapi=1`} />
    }

    render() {
        trace();
        return <div style={{ pointerEvents: "all", width: "100%", height: "100%" }} onContextMenu={this.specificContextMenu}>
            {this.youtubeVideoId ? this.youtubeContent : this.content}
        </div>;
    }
}

VideoBox._showControls = true;