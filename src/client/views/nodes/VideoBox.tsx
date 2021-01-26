import React = require("react");
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { action, computed, IReactionDisposer, observable, reaction, runInAction, untracked } from "mobx";
import { observer } from "mobx-react";
import * as rp from 'request-promise';
import { Doc, Opt, DocListCast } from "../../../fields/Doc";
import { InkTool } from "../../../fields/InkField";
import { createSchema, makeInterface } from "../../../fields/Schema";
import { Cast, StrCast, NumCast } from "../../../fields/Types";
import { VideoField } from "../../../fields/URLField";
import { Utils, emptyFunction, returnOne, returnZero, OmitKeys, setupMoveUpEvents, returnFalse, returnTrue, formatTime } from "../../../Utils";
import { Docs, DocUtils } from "../../documents/Documents";
import { CollectionFreeFormView } from "../collections/collectionFreeForm/CollectionFreeFormView";
import { ContextMenu } from "../ContextMenu";
import { ContextMenuProps } from "../ContextMenuItem";
import { ViewBoxAnnotatableComponent } from "../DocComponent";
import { DocumentDecorations } from "../DocumentDecorations";
import { FieldView, FieldViewProps } from './FieldView';
import "./VideoBox.scss";
import { documentSchema } from "../../../fields/documentSchemas";
import { Networking } from "../../Network";
import { SnappingManager } from "../../util/SnappingManager";
import { SelectionManager } from "../../util/SelectionManager";
import { ComputedField, ScriptField } from "../../../fields/ScriptField";
import { List } from "../../../fields/List";
import { DocumentView } from "./DocumentView";
import { LinkDocPreview } from "./LinkDocPreview";
import { FormattedTextBoxComment } from "./formattedText/FormattedTextBoxComment";
import { StyleProp } from "../StyleProvider";
import { computedFn } from "mobx-utils";
import { Dictionary } from "typescript-collections";
import { MarqueeAnnotator } from "../MarqueeAnnotator";
import { Id } from "../../../fields/FieldSymbols";
import { LabelBox } from "./LabelBox";
const path = require('path');

export const timeSchema = createSchema({
    _currentTimecode: "number",  // the current time of a video or other linear, time-based document.  Note, should really get set on an extension field, but that's more complicated when it needs to be set since the extension doc needs to be found first
});
type VideoDocument = makeInterface<[typeof documentSchema, typeof timeSchema]>;
const VideoDocument = makeInterface(documentSchema, timeSchema);

@observer
export class VideoBox extends ViewBoxAnnotatableComponent<FieldViewProps, VideoDocument>(VideoDocument) {
    public static LayoutString(fieldKey: string) { return FieldView.LayoutString(VideoBox, fieldKey); }
    static _youtubeIframeCounter: number = 0;
    static Instance: VideoBox;
    static RangeScript: ScriptField;
    static LabelScript: ScriptField;
    static RangePlayScript: ScriptField;
    static LabelPlayScript: ScriptField;
    static heightPercent = 60; // height of timeline in percent of height of videoBox.
    private _disposers: { [name: string]: IReactionDisposer } = {};
    private _doubleTime: NodeJS.Timeout | undefined; // bcz: Hack!  this must be called _doubleTime since setupMoveDragEvents will use that field name
    private _youtubePlayer: YT.Player | undefined = undefined;
    private _videoRef: HTMLVideoElement | null = null;
    private _youtubeIframeId: number = -1;
    private _youtubeContentCreated = false;
    private _isResetClick = 0;
    private _mainCont: React.RefObject<HTMLDivElement> = React.createRef();
    private _annotationLayer: React.RefObject<HTMLDivElement> = React.createRef();
    private _play: any = null;
    private _timeline: Opt<HTMLDivElement>;
    private _audioRef = React.createRef<HTMLDivElement>();
    private _markerStart: number = 0;
    private _left: boolean = false;
    private _duration = 0;
    private _start: boolean = true;
    private _currAnchor: Doc | undefined;
    @observable static _showControls: boolean;
    @observable static SelectingRegion: VideoBox | undefined = undefined;
    @observable _marqueeing: number[] | undefined;
    @observable _savedAnnotations: Dictionary<number, HTMLDivElement[]> = new Dictionary<number, HTMLDivElement[]>();
    @observable _screenCapture = false;
    @observable _visible: boolean = false;
    @observable _markerEnd: number = 0;
    @observable _forceCreateYouTubeIFrame = false;
    @observable _playTimer?: NodeJS.Timeout = undefined;
    @observable _fullScreen = false;
    @observable _playing = false;
    @computed get links() { return DocListCast(this.dataDoc.links); }
    @computed get heightPercent() { return this.layoutDoc._timelineShow ? NumCast(this.layoutDoc._videoTimelineHeightPercent, VideoBox.heightPercent) : 100; }
    @computed get duration() { return NumCast(this.dataDoc[this.fieldKey + "-duration"]); }
    @computed get anchorDocs() { return DocListCast(this.dataDoc[this.annotationKey + "-timeline"]).concat(DocListCast(this.dataDoc[this.annotationKey])); }

    public get player(): HTMLVideoElement | null { return this._videoRef; }

    constructor(props: Readonly<FieldViewProps>) {
        super(props);
        VideoBox.Instance = this;

        // onClick play scripts
        VideoBox.RangeScript = VideoBox.RangeScript || ScriptField.MakeFunction(`scriptContext.clickAnchor(this, clientX)`, { this: Doc.name, clientX: "number", scriptContext: "any" })!;
        VideoBox.LabelScript = VideoBox.LabelScript || ScriptField.MakeFunction(`scriptContext.clickAnchor(this, clientX)`, { this: Doc.name, clientX: "number", scriptContext: "any" })!;
        VideoBox.RangePlayScript = VideoBox.RangePlayScript || ScriptField.MakeFunction(`scriptContext.playOnClick(this, clientX)`, { self: Doc.name, clientX: "number", scriptContext: "any" })!;
        VideoBox.LabelPlayScript = VideoBox.LabelPlayScript || ScriptField.MakeFunction(`scriptContext.playOnClick(this, clientX)`, { self: Doc.name, clientX: "number", scriptContext: "any" })!;
    }

    anchorStart = (anchor: Doc) => NumCast(anchor.anchorStartTime, NumCast(anchor._timecodeToShow, NumCast(anchor.videoStart)))
    anchorEnd = (anchor: Doc, defaultVal: any = null) => NumCast(anchor.anchorEndTime, NumCast(anchor._timecodeToHide, NumCast(anchor.videoEnd, defaultVal)))

    getAnchor = () => {
        return this.createAnchor(Cast(this.layoutDoc._currentTimecode, "number", null));
    }

    choosePath(url: string) {
        return url.indexOf(window.location.origin) === -1 ? Utils.CorsProxy(url) : url;
    }

    videoLoad = () => {
        const aspect = this.player!.videoWidth / this.player!.videoHeight;
        Doc.SetNativeWidth(this.dataDoc, this.player!.videoWidth);
        Doc.SetNativeHeight(this.dataDoc, this.player!.videoHeight);
        this.layoutDoc._height = (this.layoutDoc._width || 0) / aspect;
        this.dataDoc[this.fieldKey + "-duration"] = this.player!.duration;
    }

    @action public Play = (update: boolean = true) => {
        document.removeEventListener("keydown", VideoBox.keyEventsWrapper, true);
        document.addEventListener("keydown", VideoBox.keyEventsWrapper, true);
        this._playing = true;
        try {
            update && this.player?.play();
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
    }

    @action public Pause = (update: boolean = true) => {
        this._playing = false;
        try {
            update && this.player?.pause();
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
            });
            b.isLinkButton = true;
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
            const filename = path.basename(encodeURIComponent("snapshot" + StrCast(this.rootDoc.title).replace(/\..*$/, "") + "_" + (this.layoutDoc._currentTimecode || 0).toString().replace(/\./, "_")));
            VideoBox.convertDataUri(dataUrl, filename).then((returnedFilename: string) =>
                returnedFilename && this.createRealSummaryLink(returnedFilename));
        }
    }

    private createRealSummaryLink = (relative: string) => {
        const url = this.choosePath(Utils.prepend(relative));
        const width = this.layoutDoc._width || 0;
        const height = this.layoutDoc._height || 0;
        const imageSummary = Docs.Create.ImageDocument(url, {
            _nativeWidth: Doc.NativeWidth(this.layoutDoc), _nativeHeight: Doc.NativeHeight(this.layoutDoc),
            x: (this.layoutDoc.x || 0) + width, y: (this.layoutDoc.y || 0),
            _width: 150, _height: height / width * 150, title: "--snapshot" + (this.layoutDoc._currentTimecode || 0) + " image-"
        });
        Doc.SetNativeWidth(Doc.GetProto(imageSummary), Doc.NativeWidth(this.layoutDoc));
        Doc.SetNativeHeight(Doc.GetProto(imageSummary), Doc.NativeHeight(this.layoutDoc));
        imageSummary.isLinkButton = true;
        this.props.addDocument?.(imageSummary);
        DocUtils.MakeLink({ doc: imageSummary }, { doc: this.rootDoc }, "video snapshot");
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
            selected => {
                if (!selected) {
                    this._savedAnnotations.values().forEach(v => v.forEach(a => a.remove()));
                    this._savedAnnotations.clear();
                }
            },
            { fireImmediately: true });
        this._disposers.triggerVideo = reaction(
            () => !LinkDocPreview.TargetDoc && !FormattedTextBoxComment.linkDoc && this.props.renderDepth !== -1 ? NumCast(this.Document._triggerVideo, null) : undefined,
            time => time !== undefined && setTimeout(() => {
                this.player && this.Play();
                setTimeout(() => this.Document._triggerVideo = undefined, 10);
            }, this.player ? 0 : 250), // wait for mainCont and try again to play
            { fireImmediately: true }
        );
        this._disposers.triggerStop = reaction(
            () => this.props.renderDepth !== -1 && !LinkDocPreview.TargetDoc && !FormattedTextBoxComment.linkDoc ? NumCast(this.Document._triggerVideoStop, null) : undefined,
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
        this._disposers.reactionDisposer?.();
        this._disposers.youtubeReactionDisposer?.();
        this._disposers.videoStart?.();
        document.removeEventListener("keydown", VideoBox.keyEventsWrapper, true);
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
            subitems.push({ description: (this.layoutDoc.playOnSelect ? "Don't play" : "Play") + " when link is selected", event: () => this.layoutDoc.playOnSelect = !this.layoutDoc.playOnSelect, icon: "expand-arrows-alt" });
            subitems.push({ description: (this.layoutDoc.autoPlay ? "Don't auto play" : "Auto play") + " anchors onClick", event: () => this.layoutDoc.autoPlay = !this.layoutDoc.autoPlay, icon: "expand-arrows-alt" });
            ContextMenu.Instance.addItem({ description: "Options...", subitems: subitems, icon: "video" });
        }
    }

    @computed get content() {
        const field = Cast(this.dataDoc[this.fieldKey], VideoField);
        const interactive = Doc.GetSelectedTool() !== InkTool.None || !this.props.isSelected() ? "" : "-interactive";
        const style = "videoBox-content" + (this._fullScreen ? "-fullScreen" : "") + interactive;
        return !field ? <div>Loading</div> :
            <div className="container" style={{ pointerEvents: this._isChildActive || this.active() ? "all" : "none" }}>
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
                () => !this.props.Document.isAnnotating && Doc.GetSelectedTool() === InkTool.None && this.props.isSelected(true) && !SnappingManager.GetIsDragging() && !DocumentDecorations.Instance.Interacting,
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
        <div className="videoBox-snapshot" key="snap" onPointerDown={this.onSnapshot} >
            <FontAwesomeIcon icon="camera" size="lg" />
        </div>,
        <div className="timeline-button" key="timeline-button" onPointerDown={this.toggleTimeline} style={{
            transform: `scale(${this.scaling()})`,
            right: this.scaling() * 10 - 10,
            bottom: this.scaling() * 10 - 10
        }}>
            <FontAwesomeIcon icon={this.layoutDoc._timelineShow ? "eye-slash" : "eye"} style={{ width: "100%" }} />
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
        this.Seek(Math.max(0, (this.layoutDoc._currentTimecode || 0) + Math.sign(e.movementX) * 0.0333));
        e.stopImmediatePropagation();
    }

    @action
    onResetUp = (e: PointerEvent) => {
        document.removeEventListener("pointermove", this.onResetMove, true);
        document.removeEventListener("pointerup", this.onResetUp, true);
        this._isResetClick < 10 && (this.layoutDoc._currentTimecode = 0);
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
        docs.forEach(doc => doc._timecodeToShow = curTime);
        return this.addDocument(doc);
    }

    // play back the video from time
    @action
    playFrom = (seekTimeInSeconds: number, endTime: number = this.duration) => {
        clearTimeout(this._play);
        this._duration = endTime - seekTimeInSeconds;
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
                this.player.play();
                runInAction(() => this._playing = true);
                if (endTime !== this.duration) {
                    this._play = setTimeout(() => this.Pause(), (this._duration) * 1000); // use setTimeout to play a specific duration
                }
            } else {
                this.Pause();
            }
        }
    }

    @action
    toggleTimeline = (e: React.PointerEvent) => this.layoutDoc._timelineShow = !this.layoutDoc._timelineShow

    // ref for timeline
    timelineRef = (timeline: HTMLDivElement) => this._timeline = timeline

    // starting the drag event creating a range mark
    @action
    onPointerDownTimeline = (e: React.PointerEvent): void => {
        const rect = this._timeline?.getBoundingClientRect();
        if (rect && e.target !== this._audioRef.current && this.active()) {
            const wasPlaying = this._playing;
            if (this._playing) this.Pause();
            else if (!this._doubleTime) {
                this._doubleTime = setTimeout(() => {
                    this._doubleTime = undefined;
                    this.player!.currentTime = this.layoutDoc._currentTimecode = (e.clientX - rect.x) / rect.width * this.duration;
                }, 300);
            }

            this._markerStart = this._markerEnd = this.toTimeline(e.clientX - rect.x, rect.width);
            VideoBox.SelectingRegion = this;
            setupMoveUpEvents(this, e,
                action(e => {
                    this._markerEnd = this.toTimeline(e.clientX - rect.x, rect.width);
                    return false;
                }),
                action((e, movement) => {
                    if (this._markerEnd < this._markerStart) {
                        const tmp = this._markerStart;
                        this._markerStart = this._markerEnd;
                        this._markerEnd = tmp;
                    }
                    VideoBox.SelectingRegion === this && (Math.abs(movement[0]) > 15) && this.createAnchor(this._markerStart, this._markerEnd);
                    VideoBox.SelectingRegion = undefined;
                }),
                (e, doubleTap) => {
                    this.props.select(false);
                    e.shiftKey && this.createAnchor(this.player!.currentTime);
                    !wasPlaying && doubleTap && this.Play();
                }
                , this.props.isSelected(true) || this._isChildActive);
        }
    }

    @action
    createAnchor(anchorStartTime: number, anchorEndTime?: number) {
        const anchor = Docs.Create.LabelDocument({
            title: ComputedField.MakeFunction(`"#" + formatToTime(self.anchorStartTime) + "-" + formatToTime(self.anchorEndTime)`) as any,
            useLinkSmallAnchor: true, // bcz: note this also flags that the annotation is not on the video itself, just the timeline
            hideLinkButton: true,
            anchorStartTime,
            anchorEndTime,
            annotationOn: this.props.Document
        });
        if (this.dataDoc[this.annotationKey + "-timeline"]) {
            this.dataDoc[this.annotationKey + "-timeline"].push(anchor);
        } else {
            this.dataDoc[this.annotationKey + "-timeline"] = new List<Doc>([anchor]);
        }
        return anchor;
    }

    @action
    playOnClick = (anchorDoc: Doc, clientX: number) => {
        const seekTimeInSeconds = this.anchorStart(anchorDoc);
        const endTime = this.anchorEnd(anchorDoc);
        if (this.layoutDoc.autoPlay) {
            if (this._playing) this.Pause();
            else this.playFrom(seekTimeInSeconds, endTime);
        } else {
            if (seekTimeInSeconds < NumCast(this.layoutDoc._currentTimecode) && endTime > NumCast(this.layoutDoc._currentTimecode)) {
                if (!this.layoutDoc.autoPlay && this._playing) {
                    this.Pause();
                } else {
                    this.Play();
                }
            } else {
                this.playFrom(seekTimeInSeconds, endTime);
            }
        }
        return { select: true };
    }

    @action
    clickAnchor = (anchorDoc: Doc, clientX: number) => {
        const seekTimeInSeconds = this.anchorStart(anchorDoc);
        const endTime = this.anchorEnd(anchorDoc);
        if (seekTimeInSeconds < NumCast(this.layoutDoc._currentTimecode) + 1e-4 && endTime > NumCast(this.layoutDoc._currentTimecode) - 1e-4) {
            if (this._playing) this.Pause();
            else if (this.layoutDoc.autoPlay) this.Play();
            else if (!this.layoutDoc.autoPlay) {
                const rect = this._timeline?.getBoundingClientRect();
                rect && this.Seek(this.toTimeline(clientX - rect.x, rect.width));
            }
        } else {
            if (this.layoutDoc.autoPlay) this.playFrom(seekTimeInSeconds, endTime);
            else this.Seek(seekTimeInSeconds);
        }
        return { select: true };
    }

    toTimeline = (screen_delta: number, width: number) => Math.max(0, Math.min(this.duration, screen_delta / width * this.duration));
    // starting the drag event for anchor resizing
    onPointerDown = (e: React.PointerEvent, m: Doc, left: boolean): void => {
        this._currAnchor = m;
        this._left = left;
        this._timeline?.setPointerCapture(e.pointerId);
        setupMoveUpEvents(this, e,
            (e: PointerEvent) => {
                const rect = (e.target as any).getBoundingClientRect();
                this.changeAnchor(this._currAnchor, this.toTimeline(e.clientX - rect.x, rect.width));
                return false;
            },
            (e: PointerEvent) => {
                const rect = (e.target as any).getBoundingClientRect();
                this.player!.currentTime = this.layoutDoc._currentTimecode = this.toTimeline(e.clientX - rect.x, rect.width);
                this._timeline?.releasePointerCapture(e.pointerId);
            },
            emptyFunction);
    }

    // makes sure no anchors overlaps each other by setting the correct position and width
    getLevel = (m: any, placed: { anchorStartTime: number, videoEnd: number, level: number }[]) => {
        const timelineContentWidth = this.props.PanelWidth();
        const x1 = this.anchorStart(m);
        const x2 = this.anchorEnd(m, x1 + 10 / timelineContentWidth * this.duration);
        let max = 0;
        const overlappedLevels = new Set(placed.map(p => {
            const y1 = p.anchorStartTime;
            const y2 = p.videoEnd;
            if ((x1 >= y1 && x1 <= y2) || (x2 >= y1 && x2 <= y2) ||
                (y1 >= x1 && y1 <= x2) || (y2 >= x1 && y2 <= x2)) {
                max = Math.max(max, p.level);
                return p.level;
            }
        }));
        let level = max + 1;
        for (let j = max; j >= 0; j--) !overlappedLevels.has(j) && (level = j);

        placed.push({ anchorStartTime: x1, videoEnd: x2, level });
        return level;
    }

    playLink = (doc: Doc) => {
        const startTime = NumCast(doc.anchorStartTime, NumCast(doc._timecodeToShow));
        const endTime = NumCast(doc.anchorEndTime, NumCast(doc._timecodeToHide, null));
        if (startTime !== undefined) {
            if (this.layoutDoc.playOnSelect) endTime ? this.playFrom(startTime, endTime) : this.playFrom(startTime);
            else this.Seek(startTime);
        }
    }
    // renders the anchors as a document
    renderInner = computedFn(function (this: VideoBox, mark: Doc, script: undefined | (() => ScriptField), doublescript: undefined | (() => ScriptField), x: number, y: number, width: number, height: number, annotationKey: string) {
        const anchor = observable({ view: undefined as any });
        return {
            anchor, view: <DocumentView key="view" {...OmitKeys(this.props, ["NativeWidth", "NativeHeight"]).omit} ref={action((r: DocumentView | null) => anchor.view = r)}
                Document={mark}
                DataDoc={undefined}
                PanelWidth={() => width}
                PanelHeight={() => height}
                renderDepth={this.props.renderDepth + 1}
                focus={() => this.playLink(mark)}
                rootSelected={returnFalse}
                LayoutTemplate={undefined}
                LayoutTemplateString={LabelBox.LayoutString("data")}
                ContainingCollectionDoc={this.props.Document}
                removeDocument={(doc: Doc | Doc[]) => this.removeDocument(doc, annotationKey)}
                ScreenToLocalTransform={() => this.props.ScreenToLocalTransform().scale(this.scaling()).translate(-x, -y)}
                parentActive={(out) => this.props.isSelected(out) || this._isChildActive}
                whenActiveChanged={action((isActive: boolean) => this.props.whenActiveChanged(this._isChildActive = isActive))}
                onClick={script}
                onDoubleClick={doublescript}
                ignoreAutoHeight={false}
                bringToFront={emptyFunction}
                scriptContext={this} />
        };
    });

    renderAnchor = computedFn(function (this: VideoBox, mark: Doc, script: undefined | (() => ScriptField), doublescript: undefined | (() => ScriptField), x: number, y: number, width: number, height: number, annotationKey: string) {
        const inner = this.renderInner(mark, script, doublescript, x, y, width, height, annotationKey);
        return <>
            {inner.view}
            {!inner.anchor.view || !SelectionManager.IsSelected(inner.anchor.view) ? (null) :
                <>
                    <div key="left" className="left-resizer" onPointerDown={e => this.onPointerDown(e, mark, true)} />
                    <div key="right" className="resizer" onPointerDown={e => this.onPointerDown(e, mark, false)} />
                </>}
        </>;
    });

    // returns the timeline
    @computed get renderTimeline() {
        const timelineContentWidth = this.props.PanelWidth();
        const timelineContentHeight = this.props.PanelHeight() * (100 - this.heightPercent) / 100;
        const overlaps: { anchorStartTime: number, videoEnd: number, level: number }[] = [];
        const drawAnchors: { level: number, anchor: Doc }[] = this.anchorDocs.map(anchor => ({ level: this.getLevel(anchor, overlaps), anchor }));
        const maxLevel = overlaps.reduce((m, o) => Math.max(m, o.level), 0) + 2;
        return !this.layoutDoc._timelineShow ? (null) :
            <div className="audiobox-timeline" ref={this.timelineRef} style={{ height: `${100 - this.heightPercent}%` }}
                onClick={e => {
                    if (this._isChildActive || this.props.isSelected()) {
                        e.stopPropagation(); e.preventDefault();
                    }
                }}
                onPointerDown={e => {
                    if (this._isChildActive || this.props.isSelected()) {
                        e.button === 0 && !e.ctrlKey && this.onPointerDownTimeline(e);
                    }
                }}>
                {drawAnchors.map(d => {
                    const m = d.anchor;
                    const start = this.anchorStart(m);
                    const end = this.anchorEnd(m, start + 10 / timelineContentWidth * this.duration);
                    const left = start / this.duration * timelineContentWidth;
                    const top = d.level / maxLevel * timelineContentHeight;
                    const timespan = end - start;
                    return this.layoutDoc.hideAnchors ? (null) :
                        <div className={`audiobox-marker-${this.props.PanelHeight() < 32 ? "mini" : ""}timeline`} key={m[Id]}
                            style={{ left, top, width: `${timespan / this.duration * 100}%`, height: `${1 / maxLevel * 100}%` }}
                            onClick={e => { this.playFrom(start, this.anchorEnd(m)); e.stopPropagation(); }} >
                            {this.renderAnchor(m, this.rangeClickScript, this.rangePlayScript,
                                left,
                                top + (this.props.PanelHeight() - timelineContentHeight),
                                timelineContentWidth * timespan / this.duration,
                                timelineContentHeight / maxLevel, this.annotationKey + (m.anchorStartTime !== undefined ? "-timeline" : ""))}
                        </div>;
                })}
                {this.selectionContainer}
                <div className="audiobox-current" ref={this._audioRef} onClick={e => { e.stopPropagation(); e.preventDefault(); }}
                    style={{ left: `${NumCast(this.layoutDoc._currentTimecode) / this.duration * 100}%`, pointerEvents: "none" }}
                />
            </div>;
    }

    // updates the anchor with the new time
    @action
    changeAnchor = (anchor: Opt<Doc>, time: number) => {
        if (anchor) {
            const timelineOnly = Cast(anchor.anchorStartTime, "number", null) !== undefined;
            if (timelineOnly) this._left ? anchor.anchorStartTime = time : anchor.anchorEndTime = time;
            else this._left ? anchor._timecodeToShow = time : anchor._timecodeToHide = time;
        }
    }

    // checks if the two anchors are the same with start and end time
    isSame = (m1: any, m2: any) => {
        return m1.anchorStartTime === m2.anchorStartTime && m1.anchorEndTime === m2.anchorEndTime && m1._timecodeToShow === m2._timecodeToShow && m1._timecodeToHide === m2._timecodeToHide;
    }

    // returns the blue container when dragging
    @computed get selectionContainer() {
        return VideoBox.SelectingRegion !== this ? (null) : <div className="audiobox-container" style={{
            left: `${Math.min(NumCast(this._markerStart), NumCast(this._markerEnd)) / this.duration * 100}%`,
            width: `${Math.abs(this._markerStart - this._markerEnd) / this.duration * 100}%`, height: "100%", top: "0%"
        }} />;
    }

    static keyEventsWrapper = (e: KeyboardEvent) => {
        VideoBox.Instance.keyEvents(e);
    }

    // for creating key anchors with key events
    @action
    keyEvents = (e: KeyboardEvent) => {
        if (e.target instanceof HTMLInputElement) return;
        if (!this._playing) return; // can't create if video is not playing
        switch (e.key) {
            case "x": // currently set to x, but can be a different key
                const currTime = this.player!.currentTime;
                if (this._start) {
                    this._markerStart = this.player!.currentTime;
                    this._start = false;
                    this._visible = true;
                } else {
                    this.createAnchor(this._markerStart, currTime);
                    this._start = true;
                    this._visible = false;
                }
        }
    }

    rangeClickScript = () => VideoBox.RangeScript;
    labelClickScript = () => VideoBox.LabelScript;
    rangePlayScript = () => VideoBox.RangePlayScript;
    labelPlayScript = () => VideoBox.LabelPlayScript;

    contentFunc = () => [this.youtubeVideoId ? this.youtubeContent : this.content];

    @computed get annotationLayer() {
        return <div className="imageBox-annotationLayer" style={{ height: "100%" }} ref={this._annotationLayer} />;
    }

    marqueeDown = action((e: React.PointerEvent) => {
        if (!e.altKey && e.button === 0 && this.active(true)) this._marqueeing = [e.clientX, e.clientY];
    });

    finishMarquee = action(() => {
        this._marqueeing = undefined;
        this.props.select(true);
    });

    scaling = () => this.props.scaling?.() || 1;
    panelWidth = () => this.props.PanelWidth() * this.heightPercent / 100;
    panelHeight = () => this.layoutDoc._fitWidth ? this.panelWidth() / Doc.NativeAspect(this.rootDoc) : this.props.PanelHeight() * this.heightPercent / 100;
    screenToLocalTransform = () => {
        const offset = (this.props.PanelWidth() - this.panelWidth()) / 2 / this.scaling();
        return this.props.ScreenToLocalTransform().translate(-offset, 0).scale(100 / this.heightPercent);
    }

    render() {
        const borderRad = this.props.styleProvider?.(this.layoutDoc, this.props, StyleProp.BorderRounding);
        const borderRadius = borderRad?.includes("px") ? `${Number(borderRad.split("px")[0]) / this.scaling()}px` : borderRad;
        return (<div className="videoBox" onContextMenu={this.specificContextMenu} ref={this._mainCont}
            style={{
                pointerEvents: this.props.layerProvider?.(this.layoutDoc) === false ? "none" : undefined,
                borderRadius
            }} >
            <div className="videoBox-viewer" onPointerDown={this.marqueeDown} >
                <div style={{ position: "absolute", width: this.panelWidth(), height: this.panelHeight(), top: 0, left: `${(100 - this.heightPercent) / 2}%` }}>
                    <CollectionFreeFormView {...OmitKeys(this.props, ["NativeWidth", "NativeHeight", "setContentView"]).omit}
                        fieldKey={this.annotationKey}
                        isAnnotationOverlay={true}
                        forceScaling={true}
                        select={emptyFunction}
                        active={this.annotationsActive}
                        scaling={returnOne}
                        PanelWidth={this.panelWidth}
                        PanelHeight={this.panelHeight}
                        ScreenToLocalTransform={this.screenToLocalTransform}
                        whenActiveChanged={this.whenActiveChanged}
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
                    <MarqueeAnnotator rootDoc={this.rootDoc} down={this._marqueeing} scaling={this.props.scaling} addDocument={this.addDocWithTimecode} finishMarquee={this.finishMarquee} savedAnnotations={this._savedAnnotations} annotationLayer={this._annotationLayer.current} mainCont={this._mainCont.current} />}
            </div>
        </div >);
    }
}

VideoBox._showControls = true;