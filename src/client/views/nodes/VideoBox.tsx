import React = require("react");
import { action, computed, IReactionDisposer, observable, reaction, runInAction, untracked, trace } from "mobx";
import { observer } from "mobx-react";
import * as rp from 'request-promise';
import { InkTool } from "../../../new_fields/InkField";
import { makeInterface } from "../../../new_fields/Schema";
import { Cast, FieldValue, NumCast } from "../../../new_fields/Types";
import { VideoField } from "../../../new_fields/URLField";
import { RouteStore } from "../../../server/RouteStore";
import { Utils } from "../../../Utils";
import { Docs, DocUtils } from "../../documents/Documents";
import { ContextMenu } from "../ContextMenu";
import { ContextMenuProps } from "../ContextMenuItem";
import { DocComponent } from "../DocComponent";
import { DocumentDecorations } from "../DocumentDecorations";
import { InkingControl } from "../InkingControl";
import { positionSchema } from "./DocumentView";
import { FieldView, FieldViewProps } from './FieldView';
import { pageSchema } from "./ImageBox";
import "./VideoBox.scss";
import { library } from "@fortawesome/fontawesome-svg-core";
import { faVideo } from "@fortawesome/free-solid-svg-icons";
import { CompileScript } from "../../util/Scripting";
import { Doc } from "../../../new_fields/Doc";
import { ScriptField } from "../../../new_fields/ScriptField";

type VideoDocument = makeInterface<[typeof positionSchema, typeof pageSchema]>;
const VideoDocument = makeInterface(positionSchema, pageSchema);

library.add(faVideo);

@observer
export class VideoBox extends DocComponent<FieldViewProps, VideoDocument>(VideoDocument) {
    private _reactionDisposer?: IReactionDisposer;
    private _youtubeReactionDisposer?: IReactionDisposer;
    private _youtubePlayer: any = undefined;
    private _videoRef: HTMLVideoElement | null = null;
    private _youtubeIframeId: number = -1;
    private _youtubeContentCreated = false;
    static _youtubeIframeCounter: number = 0;
    @observable _forceCreateYouTubeIFrame = false;
    @observable static _showControls: boolean;
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
        if (!this.Document.duration) this.Document.duration = this.player!.duration;
    }

    @action public Play = (update: boolean = true) => {
        this.Playing = true;
        update && this.player && this.player.play();
        update && this._youtubePlayer && this._youtubePlayer.playVideo();
        this._youtubePlayer && !this._playTimer && (this._playTimer = setInterval(this.updateTimecode, 5));
        this.updateTimecode();
    }

    @action public Seek(time: number) {
        this._youtubePlayer && this._youtubePlayer.seekTo(Math.round(time), true);
        this.player && (this.player.currentTime = time);
    }

    @action public Pause = (update: boolean = true) => {
        this.Playing = false;
        update && this.player && this.player.pause();
        update && this._youtubePlayer && this._youtubePlayer.pauseVideo();
        this._youtubePlayer && this._playTimer && clearInterval(this._playTimer);
        this._playTimer = undefined;
        this.updateTimecode();
    }

    @action public FullScreen() {
        this._fullScreen = true;
        this.player && this.player.requestFullscreen();
        this._youtubePlayer && this.props.addDocTab(this.props.Document, this.props.DataDoc, "inTab");
    }

    @action public Snapshot() {
        let width = NumCast(this.props.Document.width);
        let height = NumCast(this.props.Document.height);
        var canvas = document.createElement('canvas');
        canvas.width = 640;
        canvas.height = 640 * NumCast(this.props.Document.nativeHeight) / NumCast(this.props.Document.nativeWidth);
        var ctx = canvas.getContext('2d');//draw image to canvas. scale to target dimensions
        if (ctx) {
            ctx.rect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = "blue";
            ctx.fill();
            this._videoRef && ctx.drawImage(this._videoRef, 0, 0, canvas.width, canvas.height);
        }

        if (!this._videoRef) { // can't find a way to take snapshots of videos
            let b = Docs.Create.ButtonDocument({
                x: NumCast(this.props.Document.x) + width, y: NumCast(this.props.Document.y),
                width: 150, height: 50, title: NumCast(this.props.Document.curPage).toString()
            });
            const script = CompileScript(`(self as any).curPage = ${NumCast(this.props.Document.curPage)}`, {
                params: { this: Doc.name },
                capturedVariables: { self: this.props.Document },
                typecheck: false,
                editable: true,
            });
            if (script.compiled) {
                b.onClick = new ScriptField(script);
                this.props.ContainingCollectionView && this.props.ContainingCollectionView.props.addDocument && this.props.ContainingCollectionView.props.addDocument(b, false);
            } else {
                console.log(script.errors.map(error => error.messageText).join("\n"));
            }
        } else {
            //convert to desired file format
            var dataUrl = canvas.toDataURL('image/png'); // can also use 'image/png'
            // if you want to preview the captured image,
            let filename = encodeURIComponent("snapshot" + this.props.Document.title + "_" + this.props.Document.curPage).replace(/\./g, "");
            VideoBox.convertDataUri(dataUrl, filename).then(returnedFilename => {
                if (returnedFilename) {
                    let url = Utils.prepend(returnedFilename);
                    let imageSummary = Docs.Create.ImageDocument(url, {
                        x: NumCast(this.props.Document.x) + width, y: NumCast(this.props.Document.y),
                        width: 150, height: height / width * 150, title: "--snapshot" + NumCast(this.props.Document.curPage) + " image-"
                    });
                    this.props.ContainingCollectionView && this.props.ContainingCollectionView.props.addDocument && this.props.ContainingCollectionView.props.addDocument(imageSummary, false);
                    DocUtils.MakeLink(imageSummary, this.props.Document);
                }
            });
        }
    }

    @action
    updateTimecode = () => {
        this.player && (this.props.Document.curPage = this.player.currentTime);
        this._youtubePlayer && (this.props.Document.curPage = this._youtubePlayer.getCurrentTime());
    }

    componentDidMount() {
        if (this.props.setVideoBox) this.props.setVideoBox(this);

        if (this.youtubeVideoId) {
            let youtubeaspect = 400 / 315;
            var nativeWidth = FieldValue(this.Document.nativeWidth, 0);
            var nativeHeight = FieldValue(this.Document.nativeHeight, 0);
            if (!nativeWidth || !nativeHeight) {
                if (!this.Document.nativeWidth) this.Document.nativeWidth = 600;
                this.Document.nativeHeight = this.Document.nativeWidth / youtubeaspect;
                this.Document.height = FieldValue(this.Document.width, 0) / youtubeaspect;
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
            this._videoRef!.ontimeupdate = this.updateTimecode;
            vref.onfullscreenchange = action((e) => this._fullScreen = vref.webkitDisplayingFullscreen);
            if (this._reactionDisposer) this._reactionDisposer();
            this._reactionDisposer = reaction(() => this.props.Document.curPage, () =>
                !this.Playing && (vref.currentTime = this.Document.curPage || 0)
                , { fireImmediately: true });
        }
    }

    public static async convertDataUri(imageUri: string, returnedFilename: string) {
        try {
            let posting = Utils.prepend(RouteStore.dataUriToImage);
            const returnedUri = await rp.post(posting, {
                body: {
                    uri: imageUri,
                    name: returnedFilename
                },
                json: true,
            });
            return returnedUri;

        } catch (e) {
            console.log(e);
        }
    }
    specificContextMenu = (e: React.MouseEvent): void => {
        let field = Cast(this.Document[this.props.fieldKey], VideoField);
        if (field) {
            let url = field.url.href;
            let subitems: ContextMenuProps[] = [];
            subitems.push({ description: "Copy path", event: () => { Utils.CopyText(url); }, icon: "expand-arrows-alt" });
            subitems.push({ description: "Toggle Show Controls", event: action(() => VideoBox._showControls = !VideoBox._showControls), icon: "expand-arrows-alt" });
            subitems.push({ description: "Take Snapshot", event: () => this.Snapshot(), icon: "expand-arrows-alt" });
            ContextMenu.Instance.addItem({ description: "Video Funcs...", subitems: subitems, icon: "video" });
        }
    }

    @computed get content() {
        let field = Cast(this.Document[this.props.fieldKey], VideoField);
        let interactive = InkingControl.Instance.selectedTool || !this.props.isSelected() ? "" : "-interactive";
        let style = "videoBox-content" + (this._fullScreen ? "-fullScreen" : "") + interactive;
        return !field ? <div>Loading</div> :
            <video className={`${style}`} ref={this.setVideoRef} onCanPlay={this.videoLoad} controls={VideoBox._showControls}
                onPlay={() => this.Play()} onSeeked={this.updateTimecode} onPause={() => this.Pause()} onClick={e => e.preventDefault()}>
                <source src={field.url.href} type="video/mp4" />
                Not supported.
            </video>;
    }

    @computed get youtubeVideoId() {
        let field = Cast(this.Document[this.props.fieldKey], VideoField);
        return field && field.url.href.indexOf("youtube") !== -1 ? ((arr: string[]) => arr[arr.length - 1])(field.url.href.split("/")) : "";
    }

    @action youtubeIframeLoaded = (e: any) => {
        if (!this._youtubeContentCreated) {
            this._forceCreateYouTubeIFrame = !this._forceCreateYouTubeIFrame;
            return;
        }
        else this._youtubeContentCreated = false;

        let iframe = e.target;
        let started = true;
        let onYoutubePlayerStateChange = (event: any) => runInAction(() => {
            if (started && event.data === YT.PlayerState.PLAYING) {
                started = false;
                this._youtubePlayer.unMute();
                this.Pause();
                return;
            }
            if (event.data === YT.PlayerState.PLAYING && !this.Playing) this.Play(false);
            if (event.data === YT.PlayerState.PAUSED && this.Playing) this.Pause(false);
        });
        let onYoutubePlayerReady = (event: any) => {
            this._reactionDisposer && this._reactionDisposer();
            this._youtubeReactionDisposer && this._youtubeReactionDisposer();
            this._reactionDisposer = reaction(() => this.props.Document.curPage, () => !this.Playing && this.Seek(this.Document.curPage || 0));
            this._youtubeReactionDisposer = reaction(() => [this.props.isSelected(), DocumentDecorations.Instance.Interacting, InkingControl.Instance.selectedTool], () => {
                let interactive = InkingControl.Instance.selectedTool === InkTool.None && this.props.isSelected() && !DocumentDecorations.Instance.Interacting;
                iframe.style.pointerEvents = interactive ? "all" : "none";
            }, { fireImmediately: true });
        };
        this._youtubePlayer = new YT.Player(`${this.youtubeVideoId + this._youtubeIframeId}-player`, {
            events: {
                'onReady': onYoutubePlayerReady,
                'onStateChange': onYoutubePlayerStateChange,
            }
        });

    }

    @computed get youtubeContent() {
        this._youtubeIframeId = VideoBox._youtubeIframeCounter++;
        this._youtubeContentCreated = this._forceCreateYouTubeIFrame ? true : true;
        let style = "videoBox-content-YouTube" + (this._fullScreen ? "-fullScreen" : "");
        let start = untracked(() => Math.round(NumCast(this.props.Document.curPage)));
        return <iframe key={this._youtubeIframeId} id={`${this.youtubeVideoId + this._youtubeIframeId}-player`}
            onLoad={this.youtubeIframeLoaded} className={`${style}`} width={NumCast(this.props.Document.nativeWidth, 640)} height={NumCast(this.props.Document.nativeHeight, 390)}
            src={`https://www.youtube.com/embed/${this.youtubeVideoId}?enablejsapi=1&rel=0&showinfo=1&autoplay=1&mute=1&start=${start}&modestbranding=1&controls=${VideoBox._showControls ? 1 : 0}`}
        ></iframe>;
    }

    render() {
        return <div style={{ pointerEvents: "all", width: "100%", height: "100%" }} onContextMenu={this.specificContextMenu}>
            {this.youtubeVideoId ? this.youtubeContent : this.content}
        </div>;
    }
}

VideoBox._showControls = true;