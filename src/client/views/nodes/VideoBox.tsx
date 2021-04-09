import React = require("react");
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { action, computed, IReactionDisposer, observable, ObservableMap, reaction, runInAction, untracked } from "mobx";
import { observer } from "mobx-react";
import * as rp from 'request-promise';
import { Doc, DocListCast } from "../../../fields/Doc";
import { documentSchema } from "../../../fields/documentSchemas";
import { InkTool } from "../../../fields/InkField";
import { makeInterface } from "../../../fields/Schema";
import { Cast, NumCast, StrCast } from "../../../fields/Types";
import { AudioField, nullAudio, VideoField } from "../../../fields/URLField";
import { emptyFunction, formatTime, OmitKeys, returnOne, setupMoveUpEvents, Utils } from "../../../Utils";
import { Docs, DocUtils } from "../../documents/Documents";
import { Networking } from "../../Network";
import { CurrentUserUtils } from "../../util/CurrentUserUtils";
import { SelectionManager } from "../../util/SelectionManager";
import { SnappingManager } from "../../util/SnappingManager";
import { CollectionFreeFormView } from "../collections/collectionFreeForm/CollectionFreeFormView";
import { CollectionStackedTimeline } from "../collections/CollectionStackedTimeline";
import { ContextMenu } from "../ContextMenu";
import { ContextMenuProps } from "../ContextMenuItem";
import { ViewBoxAnnotatableComponent, ViewBoxAnnotatableProps } from "../DocComponent";
import { DocumentDecorations } from "../DocumentDecorations";
import { MarqueeAnnotator } from "../MarqueeAnnotator";
import { StyleProp } from "../StyleProvider";
import { FieldView, FieldViewProps } from './FieldView';
import { LinkDocPreview } from "./LinkDocPreview";
import "./VideoBox.scss";
const path = require('path');

type VideoDocument = makeInterface<[typeof documentSchema]>;
const VideoDocument = makeInterface(documentSchema);

@observer
export class VideoBox extends ViewBoxAnnotatableComponent<ViewBoxAnnotatableProps & FieldViewProps, VideoDocument>(VideoDocument) {
    public static LayoutString(fieldKey: string) { return FieldView.LayoutString(VideoBox, fieldKey); }
    static _youtubeIframeCounter: number = 0;
    static Instance: VideoBox;
    static heightPercent = 60; // height of timeline in percent of height of videoBox.
    private _disposers: { [name: string]: IReactionDisposer } = {};
    private _youtubePlayer: YT.Player | undefined = undefined;
    private _videoRef: HTMLVideoElement | null = null;
    private _youtubeIframeId: number = -1;
    private _youtubeContentCreated = false;
    private _stackedTimeline = React.createRef<CollectionStackedTimeline>();
    private _mainCont: React.RefObject<HTMLDivElement> = React.createRef();
    private _annotationLayer: React.RefObject<HTMLDivElement> = React.createRef();
    private _playRegionTimer: any = null;
    private _playRegionDuration = 0;
    @observable static _showControls: boolean;
    @observable _marqueeing: number[] | undefined;
    @observable _savedAnnotations = new ObservableMap<number, HTMLDivElement[]>();
    @observable _screenCapture = false;
    @observable _clicking = false;
    @observable _forceCreateYouTubeIFrame = false;
    @observable _playTimer?: NodeJS.Timeout = undefined;
    @observable _fullScreen = false;
    @observable _playing = false;
    @computed get links() { return DocListCast(this.dataDoc.links); }
    @computed get heightPercent() { return NumCast(this.layoutDoc._timelineHeightPercent, 100); }
    @computed get duration() { return NumCast(this.dataDoc[this.fieldKey + "-duration"]); }

    private get transition() { return this._clicking ? "left 0.5s, width 0.5s, height 0.5s" : ""; }
    public get player(): HTMLVideoElement | null { return this._videoRef; }

    constructor(props: Readonly<ViewBoxAnnotatableProps & FieldViewProps>) {
        super(props);
        VideoBox.Instance = this;
    }

    getAnchor = () => {
        const timecode = Cast(this.layoutDoc._currentTimecode, "number", null);
        return CollectionStackedTimeline.createAnchor(this.rootDoc, this.dataDoc, this.annotationKey, "_timecodeToShow"/* videoStart */, "_timecodeToHide" /* videoEnd */, timecode ? timecode : undefined) || this.rootDoc;
    }

    choosePath(url: string) {
        return url.indexOf(window.location.origin) === -1 ? Utils.CorsProxy(url) : url;
    }

    videoLoad = () => {
        const aspect = this.player!.videoWidth / this.player!.videoHeight;
        Doc.SetNativeWidth(this.dataDoc, this.player!.videoWidth);
        Doc.SetNativeHeight(this.dataDoc, this.player!.videoHeight);
        this.layoutDoc._height = (this.layoutDoc._width || 0) / aspect;
        if (Number.isFinite(this.player!.duration)) {
            this.dataDoc[this.fieldKey + "-duration"] = this.player!.duration;
        }
    }

    @action public Play = (update: boolean = true) => {
        this._playing = true;
        try {
            this._audioPlayer && this.player && (this._audioPlayer.currentTime = this.player?.currentTime);
            update && this.player?.play();
            update && this._audioPlayer?.play();
            update && this._youtubePlayer?.playVideo();
            this._youtubePlayer && !this._playTimer && (this._playTimer = setInterval(this.updateTimecode, 5));
        } catch (e) {
            console.log("Video Play Exception:", e);
        }
        this.updateTimecode();
    }

    @action public Seek(time: number) {
        try {
            this._youtubePlayer?.seekTo(Math.round(time), true);
        } catch (e) {
            console.log("Video Seek Exception:", e);
        }
        this.player && (this.player.currentTime = time);
        this._audioPlayer && (this._audioPlayer.currentTime = time);
    }

    @action public Pause = (update: boolean = true) => {
        this._playing = false;
        try {
            update && this.player?.pause();
            update && this._audioPlayer?.pause();
            update && this._youtubePlayer?.pauseVideo();
            this._youtubePlayer && this._playTimer && clearInterval(this._playTimer);
            this._youtubePlayer?.seekTo(this._youtubePlayer?.getCurrentTime(), true);
        } catch (e) {
            console.log("Video Pause Exception:", e);
        }
        this._youtubePlayer && SelectionManager.DeselectAll(); // if we don't deselect the player, then we get an annoying YouTube spinner I guess telling us we're paused.
        this._playTimer = undefined;
        this.updateTimecode();
    }

    @action public FullScreen() {
        this._fullScreen = true;
        this.player && this.player.requestFullscreen();
        try {
            this._youtubePlayer && this.props.addDocTab(this.rootDoc, "add");
        } catch (e) {
            console.log("Video FullScreen Exception:", e);
        }
    }

    @action public Snapshot() {
        const width = (this.layoutDoc._width || 0);
        const height = (this.layoutDoc._height || 0);
        const canvas = document.createElement('canvas');
        canvas.width = 640;
        canvas.height = 640 * Doc.NativeHeight(this.layoutDoc) / (Doc.NativeWidth(this.layoutDoc) || 1);
        const ctx = canvas.getContext('2d');//draw image to canvas. scale to target dimensions
        if (ctx) {
            // ctx.rect(0, 0, canvas.width, canvas.height);
            // ctx.fillStyle = "blue";
            // ctx.fill();
            this._videoRef && ctx.drawImage(this._videoRef, 0, 0, canvas.width, canvas.height);
        }

        if (!this._videoRef) {
            const b = Docs.Create.LabelDocument({
                x: (this.layoutDoc.x || 0) + width, y: (this.layoutDoc.y || 1),
                _width: 150, _height: 50, title: (this.layoutDoc._currentTimecode || 0).toString(),
                _isLinkButton: true
            });
            this.props.addDocument?.(b);
            DocUtils.MakeLink({ doc: b }, { doc: this.rootDoc }, "video snapshot");
            Networking.PostToServer("/youtubeScreenshot", {
                id: this.youtubeVideoId,
                timecode: this.layoutDoc._currentTimecode
            }).then(response => {
                const resolved = response?.accessPaths?.agnostic?.client;
                if (resolved) {
                    this.props.removeDocument?.(b);
                    this.createRealSummaryLink(resolved);
                }
            });
        } else {
            //convert to desired file format
            const dataUrl = canvas.toDataURL('image/png'); // can also use 'image/png'
            // if you want to preview the captured image,
            const retitled = StrCast(this.rootDoc.title).replace(/[ -\.]/g, "");
            const filename = path.basename(encodeURIComponent("snapshot" + retitled + "_" + (this.layoutDoc._currentTimecode || 0).toString().replace(/\./, "_")));
            VideoBox.convertDataUri(dataUrl, filename).then((returnedFilename: string) =>
                returnedFilename && this.createRealSummaryLink(returnedFilename));
        }
    }

    private createRealSummaryLink = (relative: string) => {
        const url = this.choosePath(Utils.prepend(relative));
        const width = this.layoutDoc._width || 1;
        const height = this.layoutDoc._height || 0;
        const imageSummary = Docs.Create.ImageDocument(url, {
            _nativeWidth: Doc.NativeWidth(this.layoutDoc), _nativeHeight: Doc.NativeHeight(this.layoutDoc),
            x: (this.layoutDoc.x || 0) + width, y: (this.layoutDoc.y || 0), _isLinkButton: true,
            _width: 150, _height: height / width * 150, title: "--snapshot" + (this.layoutDoc._currentTimecode || 0) + " image-"
        });
        Doc.SetNativeWidth(Doc.GetProto(imageSummary), Doc.NativeWidth(this.layoutDoc));
        Doc.SetNativeHeight(Doc.GetProto(imageSummary), Doc.NativeHeight(this.layoutDoc));
        this.props.addDocument?.(imageSummary);
        DocUtils.MakeLink({ doc: imageSummary }, { doc: this.getAnchor() }, "video snapshot");
    }

    @action
    updateTimecode = () => {
        this.player && (this.layoutDoc._currentTimecode = this.player.currentTime);
        try {
            this._youtubePlayer && (this.layoutDoc._currentTimecode = this._youtubePlayer.getCurrentTime?.());
        } catch (e) {
            console.log("Video Timecode Exception:", e);
        }
    }

    componentDidMount() {
        this.props.setContentView?.(this); // this tells the DocumentView that this AudioBox is the "content" of the document.  this allows the DocumentView to indirectly call getAnchor() on the AudioBox when making a link.
        this._disposers.selection = reaction(() => this.props.isSelected(),
            selected => !selected && setTimeout(() => {
                Array.from(this._savedAnnotations.values()).forEach(v => v.forEach(a => a.remove()));
                this._savedAnnotations.clear();
            }));
        this._disposers.triggerVideo = reaction(
            () => !LinkDocPreview.LinkInfo && this.props.renderDepth !== -1 ? NumCast(this.Document._triggerVideo, null) : undefined,
            time => time !== undefined && setTimeout(() => {
                this.player && this.Play();
                setTimeout(() => this.Document._triggerVideo = undefined, 10);
            }, this.player ? 0 : 250), // wait for mainCont and try again to play
            { fireImmediately: true }
        );
        this._disposers.triggerStop = reaction(
            () => this.props.renderDepth !== -1 && !LinkDocPreview.LinkInfo ? NumCast(this.Document._triggerVideoStop, null) : undefined,
            stop => stop !== undefined && setTimeout(() => {
                this.player && this.Pause();
                setTimeout(() => this.Document._triggerVideoStop = undefined, 10);
            }, this.player ? 0 : 250), // wait for mainCont and try again to play
            { fireImmediately: true }
        );
        if (this.youtubeVideoId) {
            const youtubeaspect = 400 / 315;
            const nativeWidth = Doc.NativeWidth(this.layoutDoc);
            const nativeHeight = Doc.NativeHeight(this.layoutDoc);
            if (!nativeWidth || !nativeHeight) {
                if (!nativeWidth) Doc.SetNativeWidth(this.dataDoc, 600);
                Doc.SetNativeHeight(this.dataDoc, (nativeWidth || 600) / youtubeaspect);
                this.layoutDoc._height = (this.layoutDoc._width || 0) / youtubeaspect;
            }
        }
    }

    componentWillUnmount() {
        this.Pause();
        Object.keys(this._disposers).forEach(d => this._disposers[d]?.());
    }

    @action
    setVideoRef = (vref: HTMLVideoElement | null) => {
        this._videoRef = vref;
        if (vref) {
            this._videoRef!.ontimeupdate = this.updateTimecode;
            // @ts-ignore
            vref.onfullscreenchange = action((e) => this._fullScreen = vref.webkitDisplayingFullscreen);
            this._disposers.reactionDisposer?.();
            this._disposers.reactionDisposer = reaction(() => (this.layoutDoc._currentTimecode || 0),
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
            console.log("VideoBox :" + e);
        }
    }

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
            subitems.push({ description: (this.layoutDoc.dontAutoPlayFollowedLinks ? "" : "Don't") + " play when link is selected", event: () => this.layoutDoc.dontAutoPlayFollowedLinks = !this.layoutDoc.dontAutoPlayFollowedLinks, icon: "expand-arrows-alt" });
            subitems.push({ description: (this.layoutDoc.autoPlayAnchors ? "Don't auto play" : "Auto play") + " anchors onClick", event: () => this.layoutDoc.autoPlayAnchors = !this.layoutDoc.autoPlayAnchors, icon: "expand-arrows-alt" });
            ContextMenu.Instance.addItem({ description: "Options...", subitems: subitems, icon: "video" });
        }
    }

    // returns the path of the audio file
    @computed get audiopath() {
        const field = Cast(this.props.Document[this.props.fieldKey + '-audio'], AudioField, null);
        const vfield = Cast(this.dataDoc[this.fieldKey], VideoField, null);
        return field?.url.href ?? vfield?.url.href ?? "";
    }
    // ref for updating time
    _audioPlayer: HTMLAudioElement | null = null;
    setAudioRef = (e: HTMLAudioElement | null) => this._audioPlayer = e;
    @computed get content() {
        const field = Cast(this.dataDoc[this.fieldKey], VideoField);
        const interactive = CurrentUserUtils.SelectedTool !== InkTool.None || !this.props.isSelected() ? "" : "-interactive";
        const style = "videoBox-content" + (this._fullScreen ? "-fullScreen" : "") + interactive;
        return !field ? <div key="loading">Loading</div> :
            <div className="container" key="container" style={{ pointerEvents: this._isAnyChildContentActive || this.isContentActive() ? "all" : "none" }}>
                <div className={`${style}`} style={{ width: "100%", height: "100%", left: "0px" }}>
                    <video key="video" autoPlay={this._screenCapture} ref={this.setVideoRef}
                        style={{ height: "100%", width: "auto", display: "flex", margin: "auto" }}
                        onCanPlay={this.videoLoad}
                        controls={VideoBox._showControls}
                        onPlay={() => this.Play()}
                        onSeeked={this.updateTimecode}
                        onPause={() => this.Pause()}
                        onClick={e => e.preventDefault()}>
                        <source src={field.url.href} type="video/mp4" />
                        Not supported.
                    </video>
                    {!this.audiopath || this.audiopath === field.url.href ? (null) :
                        <audio ref={this.setAudioRef} className={`audiobox-control${this.isContentActive() ? "-interactive" : ""}`}>
                            <source src={this.audiopath} type="audio/mpeg" />
                        Not supported.
                    </audio>}
                </div>
            </div>;
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

        this.loadYouTube(e.target);
    }
    private loadYouTube = (iframe: any) => {
        let started = true;
        const onYoutubePlayerStateChange = (event: any) => runInAction(() => {
            if (started && event.data === YT.PlayerState.PLAYING) {
                started = false;
                this._youtubePlayer?.unMute();
                //this.Pause();
                return;
            }
            if (event.data === YT.PlayerState.PLAYING && !this._playing) this.Play(false);
            if (event.data === YT.PlayerState.PAUSED && this._playing) this.Pause(false);
        });
        const onYoutubePlayerReady = (event: any) => {
            this._disposers.reactionDisposer?.();
            this._disposers.youtubeReactionDisposer?.();
            this._disposers.reactionDisposer = reaction(() => this.layoutDoc._currentTimecode, () => !this._playing && this.Seek((this.layoutDoc._currentTimecode || 0)));
            this._disposers.youtubeReactionDisposer = reaction(
                () => CurrentUserUtils.SelectedTool === InkTool.None && this.props.isSelected(true) && !SnappingManager.GetIsDragging() && !DocumentDecorations.Instance.Interacting,
                (interactive) => iframe.style.pointerEvents = interactive ? "all" : "none", { fireImmediately: true });
        };
        if (typeof (YT) === undefined) setTimeout(() => this.loadYouTube(iframe), 100);
        else {
            (YT as any)?.ready(() => {
                this._youtubePlayer = new YT.Player(`${this.youtubeVideoId + this._youtubeIframeId}-player`, {
                    events: {
                        'onReady': this.props.dontRegisterView ? undefined : onYoutubePlayerReady,
                        'onStateChange': this.props.dontRegisterView ? undefined : onYoutubePlayerStateChange,
                    }
                });
            });
        }
    }
    private get uIButtons() {
        const curTime = (this.layoutDoc._currentTimecode || 0);
        return ([<div className="videoBox-time" key="time" onPointerDown={this.onResetDown} >
            <span>{"" + formatTime(curTime)}</span>
            <span style={{ fontSize: 8 }}>{" " + Math.round((curTime - Math.trunc(curTime)) * 100)}</span>
        </div>,
        <div className="videoBox-snapshot" key="snap" onClick={this.onSnapshot} >
            <FontAwesomeIcon icon="camera" size="lg" />
        </div>,
        <div className="videoBox-timelineButton" key="timeline" onPointerDown={this.onTimelineHdlDown} style={{ bottom: `${100 - this.heightPercent}%` }}>
            <FontAwesomeIcon icon={"eye"} size="lg" />
        </div>,
        VideoBox._showControls ? (null) : [
            // <div className="control-background">
            <div className="videoBox-play" key="play" onPointerDown={this.onPlayDown} >
                <FontAwesomeIcon icon={this._playing ? "pause" : "play"} size="lg" />
            </div>,
            <div className="videoBox-full" key="full" onPointerDown={this.onFullDown} >
                F
                {/* </div> */}
            </div>
        ]]);
    }

    onPlayDown = () => this._playing ? this.Pause() : this.Play();

    onFullDown = (e: React.PointerEvent) => {
        this.FullScreen();
        e.stopPropagation();
        e.preventDefault();
    }

    onSnapshot = (e: React.MouseEvent) => {
        this.Snapshot();
        e.stopPropagation();
        e.preventDefault();
    }

    onTimelineHdlDown = action((e: React.PointerEvent) => {
        this._clicking = true;
        console.log('timeline click');
        setupMoveUpEvents(this, e,
            action((e: PointerEvent) => {
                this._clicking = false;
                if (this.isContentActive()) {
                    const local = this.props.ScreenToLocalTransform().scale(this.props.scaling?.() || 1).transformPoint(e.clientX, e.clientY);
                    this.layoutDoc._timelineHeightPercent = Math.max(0, Math.min(100, local[1] / this.props.PanelHeight() * 100));
                }
                return false;
            }), emptyFunction,
            () => {
                this.layoutDoc._timelineHeightPercent = this.heightPercent !== 100 ? 100 : VideoBox.heightPercent;
                setTimeout(action(() => this._clicking = false), 500);
            }, this.isContentActive(), this.isContentActive());
    });

    onResetDown = (e: React.PointerEvent) => {
        setupMoveUpEvents(this, e,
            (e: PointerEvent) => {
                this.Seek(Math.max(0, (this.layoutDoc._currentTimecode || 0) + Math.sign(e.movementX) * 0.0333));
                e.stopImmediatePropagation();
                return false;
            },
            emptyFunction,
            (e: PointerEvent) => this.layoutDoc._currentTimecode = 0);
    }

    @computed get youtubeContent() {
        this._youtubeIframeId = VideoBox._youtubeIframeCounter++;
        this._youtubeContentCreated = this._forceCreateYouTubeIFrame ? true : true;
        const style = "videoBox-content-YouTube" + (this._fullScreen ? "-fullScreen" : "");
        const start = untracked(() => Math.round((this.layoutDoc._currentTimecode || 0)));
        return <iframe key={this._youtubeIframeId} id={`${this.youtubeVideoId + this._youtubeIframeId}-player`}
            onPointerLeave={this.updateTimecode}
            onLoad={this.youtubeIframeLoaded} className={`${style}`} width={Doc.NativeWidth(this.layoutDoc) || 640} height={Doc.NativeHeight(this.layoutDoc) || 390}
            src={`https://www.youtube.com/embed/${this.youtubeVideoId}?enablejsapi=1&rel=0&showinfo=1&autoplay=0&mute=1&start=${start}&modestbranding=1&controls=${VideoBox._showControls ? 1 : 0}`} />;
    }

    @action.bound
    addDocWithTimecode(doc: Doc | Doc[]): boolean {
        const docs = doc instanceof Doc ? [doc] : doc;
        const curTime = NumCast(this.layoutDoc._currentTimecode);
        docs.forEach(doc => doc._timecodeToHide = (doc._timecodeToShow = curTime) + 1);
        return this.addDocument(doc);
    }

    // play back the video from time
    @action
    playFrom = (seekTimeInSeconds: number, endTime: number = this.duration) => {
        clearTimeout(this._playRegionTimer);
        this._playRegionDuration = endTime - seekTimeInSeconds;
        if (Number.isNaN(this.player?.duration)) {
            setTimeout(() => this.playFrom(seekTimeInSeconds, endTime), 500);
        } else if (this.player) {
            if (seekTimeInSeconds < 0) {
                if (seekTimeInSeconds > -1) {
                    setTimeout(() => this.playFrom(0), -seekTimeInSeconds * 1000);
                } else {
                    this.Pause();
                }
            } else if (seekTimeInSeconds <= this.player.duration) {
                this.player.currentTime = seekTimeInSeconds;
                this._audioPlayer && (this._audioPlayer.currentTime = seekTimeInSeconds);
                this.player.play();
                this._audioPlayer?.play();
                runInAction(() => this._playing = true);
                if (endTime !== this.duration) {
                    this._playRegionTimer = setTimeout(() => this.Pause(), (this._playRegionDuration) * 1000); // use setTimeout to play a specific duration
                }
            } else {
                this.Pause();
            }
        }
    }

    playLink = (doc: Doc) => {
        const startTime = Math.max(0, (this._stackedTimeline.current?.anchorStart(doc) || 0) - .25);
        const endTime = this._stackedTimeline.current?.anchorEnd(doc);
        if (startTime !== undefined) {
            if (!this.layoutDoc.dontAutoPlayFollowedLinks) endTime ? this.playFrom(startTime, endTime) : this.playFrom(startTime);
            else this.Seek(startTime);
        }
    }

    playing = () => this._playing;
    timelineWhenChildContentsActiveChanged = action((isActive: boolean) => this.props.whenChildContentsActiveChanged(this._isAnyChildContentActive = isActive));
    timelineScreenToLocal = () => this.props.ScreenToLocalTransform().scale(this.scaling()).translate(0, -this.heightPercent / 100 * this.props.PanelHeight());
    setAnchorTime = (time: number) => this.player!.currentTime = this.layoutDoc._currentTimecode = time;
    timelineHeight = () => this.props.PanelHeight() * (100 - this.heightPercent) / 100;
    @computed get renderTimeline() {
        return <div className="videoBox-stackPanel" style={{ transition: this.transition, height: `${100 - this.heightPercent}%` }}>
            <CollectionStackedTimeline ref={this._stackedTimeline} {...this.props}
                fieldKey={this.annotationKey}
                dictationKey={this.fieldKey + "-dictation"}
                mediaPath={this.audiopath}
                renderDepth={this.props.renderDepth + 1}
                startTag={"_timecodeToShow" /* videoStart */}
                endTag={"_timecodeToHide" /* videoEnd */}
                bringToFront={emptyFunction}
                CollectionView={undefined}
                duration={this.duration}
                playFrom={this.playFrom}
                setTime={this.setAnchorTime}
                playing={this.playing}
                whenChildContentsActiveChanged={this.timelineWhenChildContentsActiveChanged}
                removeDocument={this.removeDocument}
                ScreenToLocalTransform={this.timelineScreenToLocal}
                Play={this.Play}
                Pause={this.Pause}
                isContentActive={this.isContentActive}
                playLink={this.playLink}
                PanelHeight={this.timelineHeight}
            />
        </div>;
    }

    @computed get annotationLayer() {
        return <div className="imageBox-annotationLayer" style={{ transition: this.transition, height: `${this.heightPercent}%` }} ref={this._annotationLayer} />;
    }

    marqueeDown = action((e: React.PointerEvent) => {
        if (!e.altKey && e.button === 0 && this.layoutDoc._viewScale === 1 && this.isContentActive(true)) this._marqueeing = [e.clientX, e.clientY];
    });

    finishMarquee = action(() => {
        this._marqueeing = undefined;
        this.props.select(true);
    });

    contentFunc = () => [this.youtubeVideoId ? this.youtubeContent : this.content];
    scaling = () => this.props.scaling?.() || 1;
    panelWidth = () => this.props.PanelWidth() * this.heightPercent / 100;
    panelHeight = () => this.layoutDoc._fitWidth ? this.panelWidth() / (Doc.NativeAspect(this.rootDoc) || 1) : this.props.PanelHeight() * this.heightPercent / 100;
    screenToLocalTransform = () => {
        const offset = (this.props.PanelWidth() - this.panelWidth()) / 2 / this.scaling();
        return this.props.ScreenToLocalTransform().translate(-offset, 0).scale(100 / this.heightPercent);
    }
    marqueeFitScaling = () => (this.props.scaling?.() || 1) * this.heightPercent / 100;
    marqueeOffset = () => [this.panelWidth() / 2 * (1 - this.heightPercent / 100) / (this.heightPercent / 100), 0];
    timelineDocFilter = () => ["_timelineLabel:true:x"];
    render() {
        const borderRad = this.props.styleProvider?.(this.layoutDoc, this.props, StyleProp.BorderRounding);
        const borderRadius = borderRad?.includes("px") ? `${Number(borderRad.split("px")[0]) / this.scaling()}px` : borderRad;
        return (<div className="videoBox" onContextMenu={this.specificContextMenu} ref={this._mainCont}
            style={{
                pointerEvents: this.props.layerProvider?.(this.layoutDoc) === false ? "none" : undefined,
                borderRadius
            }} onWheel={e => { e.stopPropagation(); e.preventDefault(); }}>
            <div className="videoBox-viewer" onPointerDown={this.marqueeDown} >
                <div style={{ position: "absolute", transition: this.transition, width: this.panelWidth(), height: this.panelHeight(), top: 0, left: `${(100 - this.heightPercent) / 2}%` }}>
                    <CollectionFreeFormView {...OmitKeys(this.props, ["NativeWidth", "NativeHeight", "setContentView"]).omit}
                        fieldKey={this.annotationKey}
                        isAnnotationOverlay={true}
                        annotationLayerHostsContent={true}
                        select={emptyFunction}
                        isContentActive={this.isContentActive}
                        scaling={returnOne}
                        docFilters={this.timelineDocFilter}
                        PanelWidth={this.panelWidth}
                        PanelHeight={this.panelHeight}
                        ScreenToLocalTransform={this.screenToLocalTransform}
                        whenChildContentsActiveChanged={this.whenChildContentsActiveChanged}
                        removeDocument={this.removeDocument}
                        moveDocument={this.moveDocument}
                        addDocument={this.addDocWithTimecode}
                        CollectionView={undefined}
                        renderDepth={this.props.renderDepth + 1}>
                        {this.contentFunc}
                    </CollectionFreeFormView>
                </div>
                {this.uIButtons}
                {this.annotationLayer}
                {this.renderTimeline}
                {!this._marqueeing || !this._mainCont.current || !this._annotationLayer.current ? (null) :
                    <MarqueeAnnotator
                        scrollTop={0}
                        rootDoc={this.rootDoc}
                        down={this._marqueeing}
                        docView={this.props.docViewPath().lastElement()}
                        scaling={this.marqueeFitScaling}
                        containerOffset={this.marqueeOffset}
                        addDocument={this.addDocWithTimecode}
                        finishMarquee={this.finishMarquee}
                        savedAnnotations={this._savedAnnotations}
                        annotationLayer={this._annotationLayer.current} mainCont={this._mainCont.current}
                    />}
            </div>
        </div >);
    }
}

VideoBox._showControls = true;