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
const path = require('path');

export const timeSchema = createSchema({
    _currentTimecode: "number",  // the current time of a video or other linear, time-based document.  Note, should really get set on an extension field, but that's more complicated when it needs to be set since the extension doc needs to be found first
});
type VideoDocument = makeInterface<[typeof documentSchema, typeof timeSchema]>;
const VideoDocument = makeInterface(documentSchema, timeSchema);

@observer
export class VideoBox extends ViewBoxAnnotatableComponent<FieldViewProps, VideoDocument>(VideoDocument) {
    static _youtubeIframeCounter: number = 0;
    static Instance: VideoBox;
    static RangeScript: ScriptField;
    static LabelScript: ScriptField;
    private _reactionDisposer?: IReactionDisposer;
    private _youtubeReactionDisposer?: IReactionDisposer;
    // private _reactionDisposer?: IReactionDisposer;
    // private _youtubeReactionDisposer?: IReactionDisposer;
    private _disposers: { [name: string]: IReactionDisposer } = {};
    private _youtubePlayer: YT.Player | undefined = undefined;
    private _videoRef: HTMLVideoElement | null = null;
    private _youtubeIframeId: number = -1;
    private _youtubeContentCreated = false;
    private _isResetClick = 0;
    _play: any = null;
    _timeline: Opt<HTMLDivElement>;
    _audioRef = React.createRef<HTMLDivElement>();
    _markerStart: number = 0;
    _left: boolean = false;
    _first: boolean = false;
    _count: Array<any> = [];
    _duration = 0;
    private _currMarker: any;
    @observable _visible: boolean = false;
    @observable _markerEnd: number = 0;
    @observable _forceCreateYouTubeIFrame = false;
    @observable _playTimer?: NodeJS.Timeout = undefined;
    @observable _fullScreen = false;
    @observable _playing = false;
    @observable static _showControls: boolean;
    @computed get videoDuration() { return NumCast(this.dataDoc[this.fieldKey + "-duration"]); }
    public static LayoutString(fieldKey: string) { return FieldView.LayoutString(VideoBox, fieldKey); }

    public get player(): HTMLVideoElement | null {
        return this._videoRef;
    }

    constructor(props: Readonly<FieldViewProps>) {
        super(props);
        VideoBox.Instance = this;

        // onClick play scripts
        VideoBox.RangeScript = VideoBox.RangeScript || ScriptField.MakeScript(`scriptContext.playFrom((this.audioStart), (this.audioEnd))`, { scriptContext: "any" })!;
        VideoBox.LabelScript = VideoBox.LabelScript || ScriptField.MakeScript(`scriptContext.playFrom((this.audioStart))`, { scriptContext: "any" })!;
    }

    videoLoad = () => {
        const aspect = this.player!.videoWidth / this.player!.videoHeight;
        Doc.SetNativeWidth(this.dataDoc, this.player!.videoWidth);
        Doc.SetNativeHeight(this.dataDoc, this.player!.videoHeight);
        this.layoutDoc._height = (this.layoutDoc._width || 0) / aspect;
        this.dataDoc[this.fieldKey + "-duration"] = this.player!.duration;
    }

    @action public Play = (update: boolean = true) => {
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
        if (this.props.setVideoBox) this.props.setVideoBox(this);
        this._disposers.videoStart = reaction(
            () => this.Document._videoStart,
            (videoStart) => {
                if (videoStart !== undefined) {
                    if (this.props.renderDepth !== -1 && !LinkDocPreview.TargetDoc && !FormattedTextBoxComment.linkDoc) {
                        const delay = this.player ? 0 : 250; // wait for mainCont and try again to play
                        setTimeout(() => this.player && this.Play(), delay);
                        setTimeout(() => { this.Document._videoStart = undefined; }, 10 + delay);
                    }
                }
            },
            { fireImmediately: true }
        );
        this._disposers.videoStop = reaction(
            () => this.Document._videoStop,
            (videoStop) => {
                if (videoStop !== undefined) {
                    if (this.props.renderDepth !== -1 && !LinkDocPreview.TargetDoc && !FormattedTextBoxComment.linkDoc) {
                        const delay = this.player ? 0 : 250; // wait for mainCont and try again to play
                        setTimeout(() => this.player && this.Pause(), delay);
                        setTimeout(() => { this.Document._videoStop = undefined; }, 10 + delay);
                    }
                }
            },
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

        if (!this.dataDoc.markerAmount) {
            this.dataDoc.markerAmount = 0;
        }
    }

    componentWillUnmount() {
        this.Pause();
        this._disposers.reactionDisposer?.();
        this._disposers.youtubeReactionDisposer?.();
        this._disposers.videoStart?.();
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
            subitems.push({ description: (this.layoutDoc.playOnClick ? "Don't play" : "Play") + " markers onClick", event: () => this.layoutDoc.playOnClick = !this.layoutDoc.playOnClick, icon: "expand-arrows-alt" });
            subitems.push({ description: (this.layoutDoc.playOnClick ? "Don't auto play" : "Auto play") + " markers onClick", event: () => this.layoutDoc.autoPlay = !this.layoutDoc.autoPlay, icon: "expand-arrows-alt" });
            ContextMenu.Instance.addItem({ description: "Options...", subitems: subitems, icon: "video" });
        }
    }

    @computed get content() {
        const field = Cast(this.dataDoc[this.fieldKey], VideoField);
        const interactive = Doc.GetSelectedTool() !== InkTool.None || !this.props.isSelected() ? "" : "-interactive";
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
            <span>{"" + Math.round(curTime)}</span>
            <span style={{ fontSize: 8 }}>{" " + Math.round((curTime - Math.trunc(curTime)) * 100)}</span>
        </div>,
        <div className="videoBox-snapshot" key="snap" onPointerDown={this.onSnapshot} >
            <FontAwesomeIcon icon="camera" size="lg" />
        </div>,
        <div className="timeline-button" key="timeline-button" onPointerDown={this.toggleTimeline}>
            <FontAwesomeIcon icon={this.layoutDoc._showTimeline ? "eye-slash" : "eye"} style={{ width: "100%" }} />
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
    addDocumentWithTimestamp(doc: Doc | Doc[]): boolean {
        const docs = doc instanceof Doc ? [doc] : doc;
        const curTime = NumCast(this.layoutDoc._currentTimecode);
        docs.forEach(doc => doc.displayTimecode = curTime);
        return this.addDocument(doc);
    }

    // play back the audio from time
    @action
    playFrom = (seekTimeInSeconds: number, endTime: number = this.videoDuration) => {
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
                if (endTime !== this.videoDuration) {
                    this._play = setTimeout(() => this.Pause(), (this._duration) * 1000); // use setTimeout to play a specific duration
                }
            } else {
                this.Pause();
            }
        }
    }

    @action
    toggleTimeline = (e: React.PointerEvent) => this.layoutDoc._showTimeline = !this.layoutDoc._showTimeline

    // ref for timeline
    timelineRef = (timeline: HTMLDivElement) => {
        this._timeline = timeline;
    }

    // starting the drag event for marker resizing
    @action
    onPointerDownTimeline = (e: React.PointerEvent): void => {
        const rect = (e.target as any).getBoundingClientRect();
        const toTimeline = (screen_delta: number) => screen_delta / rect.width * this.videoDuration;
        this._markerStart = this._markerEnd = toTimeline(e.clientX - rect.x);
        setupMoveUpEvents(this, e,
            action((e: PointerEvent) => {
                this._visible = true;
                this._markerEnd = toTimeline(e.clientX - rect.x);
                if (this._markerEnd < this._markerStart) {
                    const tmp = this._markerStart;
                    this._markerStart = this._markerEnd;
                    this._markerEnd = tmp;
                }
                return false;
            }),
            action((e: PointerEvent, movement: number[]) => {
                (Math.abs(movement[0]) > 15) && this.createMarker(this._markerStart, toTimeline(e.clientX - rect.x));
                this._visible = false;
            }),
            (e: PointerEvent) => e.shiftKey && this.createMarker(this.player!.currentTime)
        );
    }

    @action
    createMarker(audioStart: number, audioEnd?: number) {
        const marker = Docs.Create.LabelDocument({
            title: ComputedField.MakeFunction(`formatToTime(self.audioStart) + "-" + formatToTime(self.audioEnd)`) as any, isLabel: audioEnd === undefined,
            useLinkSmallAnchor: true, hideLinkButton: true, audioStart, audioEnd, _showSidebar: false,
            _autoHeight: true, annotationOn: this.props.Document
        });
        marker.data = ""; // clears out the label's text so that only its border will display
        if (this.dataDoc[this.annotationKey]) {
            this.dataDoc[this.annotationKey].push(marker);
        } else {
            this.dataDoc[this.annotationKey] = new List<Doc>([marker]);
        }
    }

    // starting the drag event for marker resizing
    onPointerDown = (e: React.PointerEvent, m: any, left: boolean): void => {
        this._currMarker = m;
        this._left = left;
        this._timeline?.setPointerCapture(e.pointerId);
        const toTimeline = (screen_delta: number, width: number) => screen_delta / width * this.videoDuration;
        setupMoveUpEvents(this, e,
            (e: PointerEvent) => {
                const rect = (e.target as any).getBoundingClientRect();
                this.changeMarker(this._currMarker, toTimeline(e.clientX - rect.x, rect.width));
                return false;
            },
            (e: PointerEvent) => {
                const rect = (e.target as any).getBoundingClientRect();
                this.player!.currentTime = this.layoutDoc._currentTimecode = toTimeline(e.clientX - rect.x, rect.width);
                this._timeline?.releasePointerCapture(e.pointerId);
            },
            emptyFunction);
    }

    // updates the marker with the new time
    @action
    changeMarker = (m: any, time: any) => {
        DocListCast(this.dataDoc[this.annotationKey]).filter(marker => this.isSame(marker, m)).forEach(marker =>
            this._left ? marker.audioStart = time : marker.audioEnd = time);
    }

    // checks if the two markers are the same with start and end time
    isSame = (m1: any, m2: any) => {
        return m1.audioStart === m2.audioStart && m1.audioEnd === m2.audioEnd;
    }

    // instantiates a new array of size 500 for marker layout
    markers = () => {
        const increment = this.videoDuration / 500;
        this._count = [];
        for (let i = 0; i < 500; i++) {
            this._count.push([increment * i, 0]);
        }
    }

    // makes sure no markers overlaps each other by setting the correct position and width
    isOverlap = (m: any) => {
        if (this._first) {
            this._first = false;
            this.markers();
        }
        let max = 0;

        for (let i = 0; i < 500; i++) {
            if (this._count[i][0] >= m.audioStart && this._count[i][0] <= m.audioEnd) {
                this._count[i][1]++;

                if (this._count[i][1] > max) {
                    max = this._count[i][1];
                }
            }
        }

        for (let i = 0; i < 500; i++) {
            if (this._count[i][0] >= m.audioStart && this._count[i][0] <= m.audioEnd) {
                this._count[i][1] = max;
            }
        }

        if (this.dataDoc.markerAmount < max) {
            this.dataDoc.markerAmount = max;
        }
        return max - 1;
    }

    @computed get selectionContainer() {
        return <div className="audiobox-container" style={{
            left: `${NumCast(this._markerStart) / this.videoDuration * 100}%`,
            width: `${Math.abs(this._markerStart - this._markerEnd) / this.videoDuration * 100}%`, height: "100%", top: "0%"
        }} />;
    }

    rangeScript = () => VideoBox.RangeScript;
    labelScript = () => VideoBox.LabelScript;

    @computed get contentScaling() { return this.props.ContentScaling(); }
    contentFunc = () => [this.youtubeVideoId ? this.youtubeContent : this.content];
    render() {
        const interactive = SnappingManager.GetIsDragging() || this.active() ? "-interactive" : "";
        this._first = true;  // for indicating the first marker that is rendered
        const markerDoc = (mark: Doc, script: undefined | (() => ScriptField)) => {
            return <DocumentView {...this.props}
                Document={mark}
                pointerEvents={"all"}
                rootSelected={returnFalse}
                LayoutTemplate={undefined}
                ContainingCollectionDoc={this.props.Document}
                removeDocument={this.removeDocument}
                parentActive={returnTrue}
                onClick={this.layoutDoc.playOnClick ? script : undefined}
                ignoreAutoHeight={false}
                bringToFront={emptyFunction}
                scriptContext={this} />;
        };
        return (<div className="videoBox" onContextMenu={this.specificContextMenu}
            style={{
                transform: this.props.PanelWidth() ? undefined : `scale(${this.contentScaling})`,
                width: this.props.PanelWidth() ? undefined : `${100 / this.contentScaling}%`,
                height: this.props.PanelWidth() ? undefined : `${100 / this.contentScaling}%`,
                pointerEvents: this.props.layerProvider?.(this.layoutDoc) === false ? "none" : undefined,
                borderRadius: `${Number(StrCast(this.layoutDoc.borderRounding).replace("px", "")) / this.contentScaling}px`
            }} >
            <div className="videoBox-viewer" >
                <CollectionFreeFormView {...OmitKeys(this.props, ["NativeWidth", "NativeHeight"]).omit}
                    forceScaling={true}
                    PanelHeight={this.props.PanelHeight}
                    PanelWidth={this.props.PanelWidth}
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
                    docFilters={this.props.docFilters}
                    docRangeFilters={this.props.docRangeFilters}
                    searchFilterDocs={this.props.searchFilterDocs}
                    ContainingCollectionDoc={this.props.ContainingCollectionDoc}>
                    {this.contentFunc}
                </CollectionFreeFormView>
            </div>
            {this.uIButtons}
            {!this.layoutDoc._showTimeline ? (null) :
                <div className="audiobox-timeline" ref={this.timelineRef} onClick={e => { e.stopPropagation(); e.preventDefault(); }}
                    onPointerDown={e => {
                        if (e.button === 0 && !e.ctrlKey) {
                            const rect = (e.target as any).getBoundingClientRect();

                            if (e.target !== this._audioRef.current) {
                                const wasPaused = !this._playing;
                                this.player!.currentTime = this.layoutDoc._currentTimecode = (e.clientX - rect.x) / rect.width * this.videoDuration;
                                wasPaused && this.Pause();
                            }
                            this.onPointerDownTimeline(e);
                        }
                    }}>
                    {DocListCast(this.dataDoc[this.annotationKey]).map((m, i) =>
                        (!m.isLabel) ?
                            (this.layoutDoc.hideMarkers) ? (null) :
                                <div className={`audiobox-marker-${this.props.PanelHeight() < 32 ? "mini" : ""}container1`} key={i}
                                    title={`${formatTime(Math.round(NumCast(m.audioStart)))}` + " - " + `${formatTime(Math.round(NumCast(m.audioEnd)))}`}
                                    style={{
                                        left: `${NumCast(m.audioStart) / this.videoDuration * 100}%`,
                                        top: `${this.isOverlap(m) * 1 / (this.dataDoc.markerAmount + 1) * 100}%`,
                                        width: `${(NumCast(m.audioEnd) - NumCast(m.audioStart)) / this.videoDuration * 100}%`, height: `${1 / (this.dataDoc.markerAmount + 1) * 100}%`
                                    }}
                                    onClick={e => { this.playFrom(NumCast(m.audioStart), NumCast(m.audioEnd)); e.stopPropagation(); }} >
                                    <div className="left-resizer" onPointerDown={e => this.onPointerDown(e, m, true)}></div>
                                    {markerDoc(m, this.rangeScript)}
                                    <div className="resizer" onPointerDown={e => this.onPointerDown(e, m, false)}></div>
                                </div>
                            :
                            (this.layoutDoc.hideLabels) ? (null) :
                                <div className={`audiobox-marker-${this.props.PanelHeight() < 32 ? "mini" : ""}container`} key={i}
                                    style={{ left: `${NumCast(m.audioStart) / this.videoDuration * 100}%` }}>
                                    {markerDoc(m, this.labelScript)}
                                </div>
                    )}
                    {this._visible ? this.selectionContainer : null}
                    <div className="audiobox-current" ref={this._audioRef} onClick={e => { e.stopPropagation(); e.preventDefault(); }} style={{ left: `${NumCast(this.layoutDoc._currentTimecode) / this.videoDuration * 100}%`, pointerEvents: "none" }} />
                </div>}

        </div >);
    }
}

VideoBox._showControls = true;