import React = require("react");
import { library } from "@fortawesome/fontawesome-svg-core";
import { faVideo } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { action, computed, IReactionDisposer, observable, reaction, runInAction, untracked } from "mobx";
import { observer } from "mobx-react";
import * as rp from 'request-promise';
import { Doc } from "../../../fields/Doc";
import { InkTool } from "../../../fields/InkField";
import { createSchema, makeInterface } from "../../../fields/Schema";
import { ScriptField } from "../../../fields/ScriptField";
import { Cast, StrCast } from "../../../fields/Types";
import { VideoField } from "../../../fields/URLField";
import { Utils, emptyFunction, returnOne, returnZero } from "../../../Utils";
import { Docs, DocUtils } from "../../documents/Documents";
import { CollectionFreeFormView } from "../collections/collectionFreeForm/CollectionFreeFormView";
import { ContextMenu } from "../ContextMenu";
import { ContextMenuProps } from "../ContextMenuItem";
import { ViewBoxAnnotatableComponent } from "../DocComponent";
import { DocumentDecorations } from "../DocumentDecorations";
import { InkingControl } from "../InkingControl";
import { FieldView, FieldViewProps } from './FieldView';
import "./VideoBox.scss";
import { documentSchema } from "../../../fields/documentSchemas";
const path = require('path');

export const timeSchema = createSchema({
    currentTimecode: "number",  // the current time of a video or other linear, time-based document.  Note, should really get set on an extension field, but that's more complicated when it needs to be set since the extension doc needs to be found first
});
type VideoDocument = makeInterface<[typeof documentSchema, typeof timeSchema]>;
const VideoDocument = makeInterface(documentSchema, timeSchema);

library.add(faVideo);

@observer
export class VideoBox extends ViewBoxAnnotatableComponent<FieldViewProps, VideoDocument>(VideoDocument) {
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
        const aspect = this.player!.videoWidth / this.player!.videoHeight;
        this.layoutDoc._nativeWidth = this.player!.videoWidth;
        this.layoutDoc._nativeHeight = (this.layoutDoc._nativeWidth || 0) / aspect;
        this.layoutDoc._height = (this.layoutDoc._width || 0) / aspect;
        this.dataDoc[this.fieldKey + "-" + "duration"] = this.player!.duration;
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
        this._youtubePlayer && this.props.addDocTab(this.rootDoc, "inTab");
    }

    choosePath(url: string) {
        if (url.indexOf(window.location.origin) === -1) {
            return Utils.CorsProxy(url);
        }
        return url;
    }

    @action public Snapshot() {
        const width = (this.layoutDoc._width || 0);
        const height = (this.layoutDoc._height || 0);
        const canvas = document.createElement('canvas');
        canvas.width = 640;
        canvas.height = 640 * (this.layoutDoc._nativeHeight || 0) / (this.layoutDoc._nativeWidth || 1);
        const ctx = canvas.getContext('2d');//draw image to canvas. scale to target dimensions
        if (ctx) {
            ctx.rect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = "blue";
            ctx.fill();
            this._videoRef && ctx.drawImage(this._videoRef, 0, 0, canvas.width, canvas.height);
        }

        if (!this._videoRef) { // can't find a way to take snapshots of videos
            const b = Docs.Create.ButtonDocument({
                x: (this.layoutDoc.x || 0) + width, y: (this.layoutDoc.y || 1),
                _width: 150, _height: 50, title: (this.layoutDoc.currentTimecode || 0).toString()
            });
            b.onClick = ScriptField.MakeScript(`this.currentTimecode = ${(this.layoutDoc.currentTimecode || 0)}`);
        } else {
            //convert to desired file format
            const dataUrl = canvas.toDataURL('image/png'); // can also use 'image/png'
            // if you want to preview the captured image,
            const filename = path.basename(encodeURIComponent("snapshot" + StrCast(this.rootDoc.title).replace(/\..*$/, "") + "_" + (this.layoutDoc.currentTimecode || 0).toString().replace(/\./, "_")));
            VideoBox.convertDataUri(dataUrl, filename).then(returnedFilename => {
                if (returnedFilename) {
                    const url = this.choosePath(Utils.prepend(returnedFilename));
                    const imageSummary = Docs.Create.ImageDocument(url, {
                        _nativeWidth: this.layoutDoc._nativeWidth, _nativeHeight: this.layoutDoc._nativeHeight,
                        x: (this.layoutDoc.x || 0) + width, y: (this.layoutDoc.y || 0),
                        _width: 150, _height: height / width * 150, title: "--snapshot" + (this.layoutDoc.currentTimecode || 0) + " image-"
                    });
                    Doc.GetProto(imageSummary)["data-nativeWidth"] = this.layoutDoc._nativeWidth;
                    Doc.GetProto(imageSummary)["data-nativeHeight"] = this.layoutDoc._nativeHeight;
                    imageSummary.isLinkButton = true;
                    this.props.addDocument && this.props.addDocument(imageSummary);
                    DocUtils.MakeLink({ doc: imageSummary }, { doc: this.rootDoc }, "video snapshot");
                }
            });
        }
    }

    @action
    updateTimecode = () => {
        this.player && (this.layoutDoc.currentTimecode = this.player.currentTime);
        this._youtubePlayer && (this.layoutDoc.currentTimecode = this._youtubePlayer.getCurrentTime());
    }

    componentDidMount() {
        if (this.props.setVideoBox) this.props.setVideoBox(this);

        if (this.youtubeVideoId) {
            const youtubeaspect = 400 / 315;
            const nativeWidth = (this.layoutDoc._nativeWidth || 0);
            const nativeHeight = (this.layoutDoc._nativeHeight || 0);
            if (!nativeWidth || !nativeHeight) {
                if (!this.layoutDoc._nativeWidth) this.layoutDoc._nativeWidth = 600;
                this.layoutDoc._nativeHeight = (this.layoutDoc._nativeWidth || 0) / youtubeaspect;
                this.layoutDoc._height = (this.layoutDoc._width || 0) / youtubeaspect;
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
            this._reactionDisposer = reaction(() => (this.layoutDoc.currentTimecode || 0),
                time => !this._playing && (vref.currentTime = time), { fireImmediately: true });
        }
    }

    public static async convertDataUri(imageUri: string, returnedFilename: string) {
        try {
            const posting = Utils.prepend("/uploadURI");
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
    @observable _screenCapture = false;
    specificContextMenu = (e: React.MouseEvent): void => {
        const field = Cast(this.dataDoc[this.props.fieldKey], VideoField);
        if (field) {
            const url = field.url.href;
            const subitems: ContextMenuProps[] = [];
            subitems.push({ description: "Copy path", event: () => { Utils.CopyText(url); }, icon: "expand-arrows-alt" });
            subitems.push({ description: "Toggle Show Controls", event: action(() => VideoBox._showControls = !VideoBox._showControls), icon: "expand-arrows-alt" });
            subitems.push({ description: "Take Snapshot", event: () => this.Snapshot(), icon: "expand-arrows-alt" });
            subitems.push({
                description: "Screen Capture", event: (async () => {
                    runInAction(() => this._screenCapture = !this._screenCapture);
                    this._videoRef!.srcObject = !this._screenCapture ? undefined : await (navigator.mediaDevices as any).getDisplayMedia({ video: true });
                }), icon: "expand-arrows-alt"
            });
            ContextMenu.Instance.addItem({ description: "Options...", subitems: subitems, icon: "video" });
        }
    }

    @computed get content() {
        const field = Cast(this.dataDoc[this.fieldKey], VideoField);
        const interactive = InkingControl.Instance.selectedTool || !this.props.isSelected() ? "" : "-interactive";
        const style = "videoBox-content" + (this._fullScreen ? "-fullScreen" : "") + interactive;
        return !field ? <div>Loading</div> :
            <video className={`${style}`} key="video" autoPlay={this._screenCapture} ref={this.setVideoRef}
                style={{ width: this._screenCapture ? "100%" : undefined, height: this._screenCapture ? "100%" : undefined }}
                onCanPlay={this.videoLoad}
                controls={VideoBox._showControls}
                onPlay={() => this.Play()}
                onSeeked={this.updateTimecode}
                onPause={() => this.Pause()}
                onClick={e => e.preventDefault()}>
                <source src={field.url.href} type="video/mp4" />
                Not supported.
            </video>;
    }

    @computed get youtubeVideoId() {
        const field = Cast(this.dataDoc[this.props.fieldKey], VideoField);
        return field && field.url.href.indexOf("youtube") !== -1 ? ((arr: string[]) => arr[arr.length - 1])(field.url.href.split("/")) : "";
    }

    @action youtubeIframeLoaded = (e: any) => {
        if (!this._youtubeContentCreated) {
            this._forceCreateYouTubeIFrame = !this._forceCreateYouTubeIFrame;
            return;
        }
        else this._youtubeContentCreated = false;

        const iframe = e.target;
        let started = true;
        const onYoutubePlayerStateChange = (event: any) => runInAction(() => {
            if (started && event.data === YT.PlayerState.PLAYING) {
                started = false;
                this._youtubePlayer && this._youtubePlayer.unMute();
                this.Pause();
                return;
            }
            if (event.data === YT.PlayerState.PLAYING && !this._playing) this.Play(false);
            if (event.data === YT.PlayerState.PAUSED && this._playing) this.Pause(false);
        });
        const onYoutubePlayerReady = (event: any) => {
            this._reactionDisposer && this._reactionDisposer();
            this._youtubeReactionDisposer && this._youtubeReactionDisposer();
            this._reactionDisposer = reaction(() => this.layoutDoc.currentTimecode, () => !this._playing && this.Seek((this.layoutDoc.currentTimecode || 0)));
            this._youtubeReactionDisposer = reaction(() => [this.props.isSelected(), DocumentDecorations.Instance.Interacting, InkingControl.Instance.selectedTool], () => {
                const interactive = InkingControl.Instance.selectedTool === InkTool.None && this.props.isSelected(true) && !DocumentDecorations.Instance.Interacting;
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
        const curTime = (this.layoutDoc.currentTimecode || 0);
        return ([<div className="videoBox-time" key="time" onPointerDown={this.onResetDown} >
            <span>{"" + Math.round(curTime)}</span>
            <span style={{ fontSize: 8 }}>{" " + Math.round((curTime - Math.trunc(curTime)) * 100)}</span>
        </div>,
        <div className="videoBox-snapshot" key="snap" onPointerDown={this.onSnapshot} >
            <FontAwesomeIcon icon="camera" size="lg" />
        </div>,
        VideoBox._showControls ? (null) : [
            <div className="videoBox-play" key="play" onPointerDown={this.onPlayDown} >
                <FontAwesomeIcon icon={this._playing ? "pause" : "play"} size="lg" />
            </div>,
            <div className="videoBox-full" key="full" onPointerDown={this.onFullDown} >
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
        this.Seek(Math.max(0, (this.layoutDoc.currentTimecode || 0) + Math.sign(e.movementX) * 0.0333));
        e.stopImmediatePropagation();
    }

    @action
    onResetUp = (e: PointerEvent) => {
        document.removeEventListener("pointermove", this.onResetMove, true);
        document.removeEventListener("pointerup", this.onResetUp, true);
        this._isResetClick < 10 && (this.layoutDoc.currentTimecode = 0);
    }

    @computed get youtubeContent() {
        this._youtubeIframeId = VideoBox._youtubeIframeCounter++;
        this._youtubeContentCreated = this._forceCreateYouTubeIFrame ? true : true;
        const style = "videoBox-content-YouTube" + (this._fullScreen ? "-fullScreen" : "");
        const start = untracked(() => Math.round((this.layoutDoc.currentTimecode || 0)));
        return <iframe key={this._youtubeIframeId} id={`${this.youtubeVideoId + this._youtubeIframeId}-player`}
            onLoad={this.youtubeIframeLoaded} className={`${style}`} width={(this.layoutDoc._nativeWidth || 640)} height={(this.layoutDoc._nativeHeight || 390)}
            src={`https://www.youtube.com/embed/${this.youtubeVideoId}?enablejsapi=1&rel=0&showinfo=1&autoplay=1&mute=1&start=${start}&modestbranding=1&controls=${VideoBox._showControls ? 1 : 0}`} />;
    }

    @action.bound
    addDocumentWithTimestamp(doc: Doc | Doc[]): boolean {
        const docs = doc instanceof Doc ? [doc] : doc;
        docs.forEach(doc => {
            const curTime = (this.layoutDoc.currentTimecode || -1);
            curTime !== -1 && (doc.displayTimecode = curTime);
        });
        return this.addDocument(doc);
    }

    contentFunc = () => [this.youtubeVideoId ? this.youtubeContent : this.content];
    render() {
        return (<div className="videoBox" onContextMenu={this.specificContextMenu}
            style={{ transform: `scale(${this.props.ContentScaling()})`, width: `${100 / this.props.ContentScaling()}%`, height: `${100 / this.props.ContentScaling()}%` }} >
            <div className="videoBox-viewer" >
                <CollectionFreeFormView {...this.props}
                    PanelHeight={this.props.PanelHeight}
                    PanelWidth={this.props.PanelWidth}
                    NativeHeight={returnZero}
                    NativeWidth={returnZero}
                    annotationsKey={this.annotationKey}
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
                    renderDepth={this.props.renderDepth + 1}
                    ContainingCollectionDoc={this.props.ContainingCollectionDoc}>
                    {this.contentFunc}
                </CollectionFreeFormView>
            </div>
            {this.uIButtons}
        </div >);
    }
}

VideoBox._showControls = true;