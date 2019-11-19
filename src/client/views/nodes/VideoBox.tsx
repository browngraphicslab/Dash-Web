import React = require("react");
import { library } from "@fortawesome/fontawesome-svg-core";
import { faVideo } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { action, computed, IReactionDisposer, observable, reaction, runInAction, untracked } from "mobx";
import { observer } from "mobx-react";
import * as rp from 'request-promise';
import { Doc } from "../../../new_fields/Doc";
import { InkTool } from "../../../new_fields/InkField";
import { createSchema, makeInterface } from "../../../new_fields/Schema";
import { ScriptField } from "../../../new_fields/ScriptField";
import { Cast, StrCast } from "../../../new_fields/Types";
import { VideoField } from "../../../new_fields/URLField";
import { RouteStore } from "../../../server/RouteStore";
import { emptyFunction, returnOne, Utils } from "../../../Utils";
import { Docs, DocUtils } from "../../documents/Documents";
import { CollectionFreeFormView } from "../collections/collectionFreeForm/CollectionFreeFormView";
import { ContextMenu } from "../ContextMenu";
import { ContextMenuProps } from "../ContextMenuItem";
import { DocAnnotatableComponent } from "../DocComponent";
import { DocumentDecorations } from "../DocumentDecorations";
import { InkingControl } from "../InkingControl";
import { FieldView, FieldViewProps } from './FieldView';
import "./VideoBox.scss";
import { documentSchema, positionSchema } from "../../../new_fields/documentSchemas";
var path = require('path');

export const timeSchema = createSchema({
    currentTimecode: "number",  // the current time of a video or other linear, time-based document.  Note, should really get set on an extension field, but that's more complicated when it needs to be set since the extension doc needs to be found first
});
type VideoDocument = makeInterface<[typeof documentSchema, typeof positionSchema, typeof timeSchema]>;
const VideoDocument = makeInterface(documentSchema, positionSchema, timeSchema);

library.add(faVideo);

@observer
export class VideoBox extends DocAnnotatableComponent<FieldViewProps, VideoDocument>(VideoDocument) {
    static _youtubeIframeCounter: number = 0;
    private _reactionDisposer?: IReactionDisposer;
    private _youtubeReactionDisposer?: IReactionDisposer;
    private _youtubePlayer: YT.Player | undefined = undefined;
    private _videoRef: HTMLVideoElement | null = null;
    private _youtubeIframeId: number = -1;
    private _youtubeContentCreated = false;
    private _isResetClick = 0;
    @observable _forceCreateYouTubeIFrame = false;
    @observable _playTimer?: NodeJS.Timeout = undefined;
    @observable _fullScreen = false;
    @observable _playing = false;
    @observable static _showControls: boolean;
    public static LayoutString(fieldKey: string) { return FieldView.LayoutString(VideoBox, fieldKey); }

    public get player(): HTMLVideoElement | null {
        return this._videoRef;
    }

    videoLoad = () => {
        let aspect = this.player!.videoWidth / this.player!.videoHeight;
        var nativeWidth = (this.Document.nativeWidth || 0);
        var nativeHeight = (this.Document.nativeHeight || 0);
        if (!nativeWidth || !nativeHeight) {
            if (!this.Document.nativeWidth) this.Document.nativeWidth = this.player!.videoWidth;
            this.Document.nativeHeight = (this.Document.nativeWidth || 0) / aspect;
            this.Document.height = (this.Document.width || 0) / aspect;
        }
        if (!this.Document.duration) this.Document.duration = this.player!.duration;
    }

    @action public Play = (update: boolean = true) => {
        this._playing = true;
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
        this._playing = false;
        update && this.player && this.player.pause();
        update && this._youtubePlayer && this._youtubePlayer.pauseVideo && this._youtubePlayer.pauseVideo();
        this._youtubePlayer && this._playTimer && clearInterval(this._playTimer);
        this._playTimer = undefined;
        this.updateTimecode();
    }

    @action public FullScreen() {
        this._fullScreen = true;
        this.player && this.player.requestFullscreen();
        this._youtubePlayer && this.props.addDocTab(this.props.Document, this.props.DataDoc, "inTab");
    }

    choosePath(url: string) {
        if (url.indexOf(window.location.origin) === -1) {
            return Utils.CorsProxy(url);
        }
        return url;
    }

    @action public Snapshot() {
        let width = this.Document.width || 0;
        let height = this.Document.height || 0;
        var canvas = document.createElement('canvas');
        canvas.width = 640;
        canvas.height = 640 * (this.Document.nativeHeight || 0) / (this.Document.nativeWidth || 1);
        var ctx = canvas.getContext('2d');//draw image to canvas. scale to target dimensions
        if (ctx) {
            ctx.rect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = "blue";
            ctx.fill();
            this._videoRef && ctx.drawImage(this._videoRef, 0, 0, canvas.width, canvas.height);
        }

        if (!this._videoRef) { // can't find a way to take snapshots of videos
            let b = Docs.Create.ButtonDocument({
                x: (this.Document.x || 0) + width, y: (this.Document.y || 0),
                width: 150, height: 50, title: (this.Document.currentTimecode || 0).toString()
            });
            b.onClick = ScriptField.MakeScript(`this.currentTimecode = ${(this.Document.currentTimecode || 0)}`);
        } else {
            //convert to desired file format
            var dataUrl = canvas.toDataURL('image/png'); // can also use 'image/png'
            // if you want to preview the captured image,
            let filename = path.basename(encodeURIComponent("snapshot" + StrCast(this.Document.title).replace(/\..*$/, "") + "_" + (this.Document.currentTimecode || 0).toString().replace(/\./, "_")));
            VideoBox.convertDataUri(dataUrl, filename).then(returnedFilename => {
                if (returnedFilename) {
                    let url = this.choosePath(Utils.prepend(returnedFilename));
                    let imageSummary = Docs.Create.ImageDocument(url, {
                        x: (this.Document.x || 0) + width, y: (this.Document.y || 0),
                        width: 150, height: height / width * 150, title: "--snapshot" + (this.Document.currentTimecode || 0) + " image-"
                    });
                    imageSummary.isButton = true;
                    this.props.addDocument && this.props.addDocument(imageSummary);
                    DocUtils.MakeLink({ doc: imageSummary }, { doc: this.props.Document }, "snapshot from " + this.Document.title, "video frame snapshot");
                }
            });
        }
    }

    @action
    updateTimecode = () => {
        this.player && (this.Document.currentTimecode = this.player.currentTime);
        this._youtubePlayer && (this.Document.currentTimecode = this._youtubePlayer.getCurrentTime());
    }

    componentDidMount() {
        if (this.props.setVideoBox) this.props.setVideoBox(this);

        if (this.youtubeVideoId) {
            let youtubeaspect = 400 / 315;
            var nativeWidth = (this.Document.nativeWidth || 0);
            var nativeHeight = (this.Document.nativeHeight || 0);
            if (!nativeWidth || !nativeHeight) {
                if (!this.Document.nativeWidth) this.Document.nativeWidth = 600;
                this.Document.nativeHeight = (this.Document.nativeWidth || 0) / youtubeaspect;
                this.Document.height = (this.Document.width || 0) / youtubeaspect;
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
            this._reactionDisposer && this._reactionDisposer();
            this._reactionDisposer = reaction(() => this.Document.currentTimecode || 0,
                time => !this._playing && (vref.currentTime = time), { fireImmediately: true });
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
        let field = Cast(this.dataDoc[this.props.fieldKey], VideoField);
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
        let field = Cast(this.dataDoc[this.props.fieldKey], VideoField);
        let interactive = InkingControl.Instance.selectedTool || !this.props.isSelected() ? "" : "-interactive";
        let style = "videoBox-content" + (this._fullScreen ? "-fullScreen" : "") + interactive;
        return !field ? <div>Loading</div> :
            <video className={`${style}`} key="video" ref={this.setVideoRef} onCanPlay={this.videoLoad} controls={VideoBox._showControls}
                onPlay={() => this.Play()} onSeeked={this.updateTimecode} onPause={() => this.Pause()} onClick={e => e.preventDefault()}>
                <source src={field.url.href} type="video/mp4" />
                Not supported.
            </video>;
    }

    @computed get youtubeVideoId() {
        let field = Cast(this.dataDoc[this.props.fieldKey], VideoField);
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
                this._youtubePlayer && this._youtubePlayer.unMute();
                this.Pause();
                return;
            }
            if (event.data === YT.PlayerState.PLAYING && !this._playing) this.Play(false);
            if (event.data === YT.PlayerState.PAUSED && this._playing) this.Pause(false);
        });
        let onYoutubePlayerReady = (event: any) => {
            this._reactionDisposer && this._reactionDisposer();
            this._youtubeReactionDisposer && this._youtubeReactionDisposer();
            this._reactionDisposer = reaction(() => this.Document.currentTimecode, () => !this._playing && this.Seek(this.Document.currentTimecode || 0));
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
    private get uIButtons() {
        let scaling = Math.min(1.8, this.props.ScreenToLocalTransform().Scale);
        let curTime = (this.Document.currentTimecode || 0);
        return ([<div className="videoBox-time" key="time" onPointerDown={this.onResetDown} style={{ transform: `scale(${scaling})` }}>
            <span>{"" + Math.round(curTime)}</span>
            <span style={{ fontSize: 8 }}>{" " + Math.round((curTime - Math.trunc(curTime)) * 100)}</span>
        </div>,
        <div className="videoBox-snapshot" key="snap" onPointerDown={this.onSnapshot} style={{ transform: `scale(${scaling})` }}>
            <FontAwesomeIcon icon="camera" size="lg" />
        </div>,
        VideoBox._showControls ? (null) : [
            <div className="videoBox-play" key="play" onPointerDown={this.onPlayDown} style={{ transform: `scale(${scaling})` }}>
                <FontAwesomeIcon icon={this._playing ? "pause" : "play"} size="lg" />
            </div>,
            <div className="videoBox-full" key="full" onPointerDown={this.onFullDown} style={{ transform: `scale(${scaling})` }}>
                F
            </div>
        ]]);
    }

    onPlayDown = () => this._playing ? this.Pause() : this.Play();

    onFullDown = (e: React.PointerEvent) => {
        this.FullScreen();
        e.stopPropagation();
        e.preventDefault();
    }

    onSnapshot = (e: React.PointerEvent) => {
        this.Snapshot();
        e.stopPropagation();
        e.preventDefault();
    }

    onResetDown = (e: React.PointerEvent) => {
        this.Pause();
        e.stopPropagation();
        this._isResetClick = 0;
        document.addEventListener("pointermove", this.onResetMove, true);
        document.addEventListener("pointerup", this.onResetUp, true);
    }

    onResetMove = (e: PointerEvent) => {
        this._isResetClick += Math.abs(e.movementX) + Math.abs(e.movementY);
        this.Seek(Math.max(0, (this.Document.currentTimecode || 0) + Math.sign(e.movementX) * 0.0333));
        e.stopImmediatePropagation();
    }

    @action
    onResetUp = (e: PointerEvent) => {
        document.removeEventListener("pointermove", this.onResetMove, true);
        document.removeEventListener("pointerup", this.onResetUp, true);
        this._isResetClick < 10 && (this.Document.currentTimecode = 0);
    }

    @computed get youtubeContent() {
        this._youtubeIframeId = VideoBox._youtubeIframeCounter++;
        this._youtubeContentCreated = this._forceCreateYouTubeIFrame ? true : true;
        let style = "videoBox-content-YouTube" + (this._fullScreen ? "-fullScreen" : "");
        let start = untracked(() => Math.round(this.Document.currentTimecode || 0));
        return <iframe key={this._youtubeIframeId} id={`${this.youtubeVideoId + this._youtubeIframeId}-player`}
            onLoad={this.youtubeIframeLoaded} className={`${style}`} width={(this.Document.nativeWidth || 640)} height={(this.Document.nativeHeight || 390)}
            src={`https://www.youtube.com/embed/${this.youtubeVideoId}?enablejsapi=1&rel=0&showinfo=1&autoplay=1&mute=1&start=${start}&modestbranding=1&controls=${VideoBox._showControls ? 1 : 0}`} />;
    }

    @action.bound
    addDocumentWithTimestamp(doc: Doc): boolean {
        var curTime = (this.Document.currentTimecode || -1);
        curTime !== -1 && (doc.displayTimecode = curTime);
        return this.addDocument(doc);
    }

    contentFunc = () => [this.youtubeVideoId ? this.youtubeContent : this.content];
    render() {
        return (<div className={"videoBox-container"} onContextMenu={this.specificContextMenu}
            style={{ transformOrigin: "top left", transform: `scale(${this.props.ContentScaling()})`, width: `${100 / this.props.ContentScaling()}%`, height: `${100 / this.props.ContentScaling()}%` }} >
            <CollectionFreeFormView {...this.props}
                PanelHeight={this.props.PanelHeight}
                PanelWidth={this.props.PanelWidth}
                annotationsKey={this.annotationsKey}
                focus={this.props.focus}
                isSelected={this.props.isSelected}
                isAnnotationOverlay={true}
                select={emptyFunction}
                active={this.annotationsActive}
                ContentScaling={returnOne}
                whenActiveChanged={this.whenActiveChanged}
                removeDocument={this.removeDocument}
                moveDocument={this.moveDocument}
                addDocument={this.addDocumentWithTimestamp}
                CollectionView={undefined}
                ScreenToLocalTransform={this.props.ScreenToLocalTransform}
                ruleProvider={undefined}
                renderDepth={this.props.renderDepth + 1}
                ContainingCollectionDoc={this.props.ContainingCollectionDoc}
                chromeCollapsed={true}>
                {this.contentFunc}
            </CollectionFreeFormView>
            {this.uIButtons}
        </div >);
    }
}

VideoBox._showControls = true;