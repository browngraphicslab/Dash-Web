import React = require("react");
import { action, IReactionDisposer, observable, reaction } from "mobx";
import { observer } from "mobx-react";
import * as rp from "request-promise";
import { makeInterface } from "../../../new_fields/Schema";
import { Cast, FieldValue, NumCast } from "../../../new_fields/Types";
import { VideoField } from "../../../new_fields/URLField";
import { RouteStore } from "../../../server/RouteStore";
import { DocServer } from "../../DocServer";
import { DocComponent } from "../DocComponent";
import { positionSchema } from "./DocumentView";
import { FieldView, FieldViewProps } from './FieldView';
import { pageSchema } from "./ImageBox";
import "./VideoBox.scss";
import { ContextMenu } from "../ContextMenu";
import { ContextMenuProps } from "../ContextMenuItem";
import { InkingControl } from "../InkingControl";
import * as $ from "jquery";

type VideoDocument = makeInterface<[typeof positionSchema, typeof pageSchema]>;
const VideoDocument = makeInterface(positionSchema, pageSchema);

@observer
export class VideoBox extends DocComponent<FieldViewProps, VideoDocument>(VideoDocument) {
    private _reactionDisposer?: IReactionDisposer;
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

    @action public Play() {
        this.Playing = true;
        if (this.player) {
            this.player.play();
            if (!this._playTimer) this._playTimer = setInterval(this.updateTimecode, 500);
        } else if (this._youtubePlayer) {
            this._youtubePlayer.playVideo();
            if (!this._playTimer) this._playTimer = setInterval(this.updateYoutubeTimecode, 1000);
        }
    }

    @action public Pause() {
        this.Playing = false;
        if (this.player) {
            this.player.pause();
            if (this._playTimer) {
                clearInterval(this._playTimer);
                this._playTimer = undefined;
            }
        } else if (this._youtubePlayer) {
            // let interactive = InkingControl.Instance.selectedTool || !this.props.isSelected() ? "" : "-interactive";
            // this._youtubePlayer.getIframe().style.pointerEvents = interactive ? "all" : "none";
            this._youtubePlayer.pauseVideo();
            if (this._playTimer) {
                clearInterval(this._playTimer);
                this._playTimer = undefined;
            }
        }
    }

    @action public FullScreen() {
        this._fullScreen = true;
        this.player && this.player.requestFullscreen();
    }

    @action
    updateTimecode = () => {
        this.player && (this.props.Document.curPage = this.player.currentTime);
    }
    @action
    updateYoutubeTimecode = () => {
        this._youtubePlayer && (this.props.Document.curPage = this._youtubePlayer.getCurrentTime());
    }
    componentDidMount() {
        if (this.props.setVideoBox) this.props.setVideoBox(this);

        let field = Cast(this.Document[this.props.fieldKey], VideoField);
        let videoid = field && field.url.href.indexOf("youtube") !== -1 ? ((arr: string[]) => arr[arr.length - 1])(field.url.href.split("/")) : "";
        if (videoid) {
            let youtubeaspect = 400 / 315;
            var nativeWidth = FieldValue(this.Document.nativeWidth, 0);
            var nativeHeight = FieldValue(this.Document.nativeHeight, 0);
            if (!nativeWidth || !nativeHeight || Math.abs(nativeWidth / nativeHeight - youtubeaspect) > 0.05) {
                if (!this.Document.nativeWidth) this.Document.nativeWidth = 600;
                this.Document.nativeHeight = this.Document.nativeWidth / youtubeaspect;
                this.Document.height = FieldValue(this.Document.width, 0) / youtubeaspect;
            }
            this._youtubePlayer = new YT.Player(`${videoid}-player`, {
                height: `${NumCast(this.props.Document.height)}`,
                width: `${NumCast(this.props.Document.width)}`,
                videoId: videoid.toString(),
                playerVars: { 'controls': VideoBox._showControls ? 1 : 0 },
                events: {
                    'onStateChange': this.onPlayerStateChange,
                }
            });
            // let iframe = $(document.getElementById(`${videoid}-player`)!);
            // iframe.on("load", function () {
            //     iframe.contents().find("head")
            //         .append($("<style type='text/css'>  .ytp-pause-overlay, .ytp-scroll-min { opacity : 0 !important; }  </style>"));
            // })
        }
    }

    @action
    onPlayerStateChange = (event: any) => {
        this.Playing = event.data == YT.PlayerState.PLAYING;
    }

    componentWillUnmount() {
        this.Pause();
        if (this._reactionDisposer) this._reactionDisposer();
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

    @observable static _showControls: boolean = false;

    specificContextMenu = (e: React.MouseEvent): void => {
        let field = Cast(this.Document[this.props.fieldKey], VideoField);
        if (field) {
            let subitems: ContextMenuProps[] = [];
            subitems.push({ description: "Toggle Show Controls", event: action(() => VideoBox._showControls = !VideoBox._showControls), icon: "expand-arrows-alt" });
            ContextMenu.Instance.addItem({ description: "Video Funcs...", subitems: subitems });
        }
    }

    render() {
        let field = Cast(this.Document[this.props.fieldKey], VideoField);
        let interactive = InkingControl.Instance.selectedTool || !this.props.isSelected() ? "" : "-interactive";
        let style = "videoBox-cont" + (this._fullScreen ? "-fullScreen" : interactive);
        let videoid = field && field.url.href.indexOf("youtube") !== -1 ? ((arr: string[]) => arr[arr.length - 1])(field.url.href.split("/")) : "";

        if (this._youtubePlayer) this._youtubePlayer.getIframe().style.pointerEvents = interactive ? "all" : "none";
        return !field ? <div>Loading</div> :
            videoid ?
                <div id={`${videoid}-player`} className={`${style}`} style={{ height: "100%" }} /> :
                <video className={`${style}`} ref={this.setVideoRef} onCanPlay={this.videoLoad} onContextMenu={this.specificContextMenu} controls={VideoBox._showControls}>
                    <source src={field.url.href} type="video/mp4" />
                    Not supported.
                </video>;
    }
}