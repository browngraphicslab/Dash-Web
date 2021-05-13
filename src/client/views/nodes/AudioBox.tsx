import React = require("react");
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { action, computed, IReactionDisposer, observable, reaction, runInAction } from "mobx";
import { observer } from "mobx-react";
import { DateField } from "../../../fields/DateField";
import { Doc, DocListCast, Opt } from "../../../fields/Doc";
import { documentSchema } from "../../../fields/documentSchemas";
import { makeInterface } from "../../../fields/Schema";
import { ComputedField } from "../../../fields/ScriptField";
import { Cast, NumCast } from "../../../fields/Types";
import { AudioField, nullAudio } from "../../../fields/URLField";
import { emptyFunction, formatTime, Utils } from "../../../Utils";
import { DocUtils } from "../../documents/Documents";
import { Networking } from "../../Network";
import { CurrentUserUtils } from "../../util/CurrentUserUtils";
import { SnappingManager } from "../../util/SnappingManager";
import { CollectionStackedTimeline } from "../collections/CollectionStackedTimeline";
import { ContextMenu } from "../ContextMenu";
import { ContextMenuProps } from "../ContextMenuItem";
import { ViewBoxAnnotatableComponent, ViewBoxAnnotatableProps } from "../DocComponent";
import "./AudioBox.scss";
import { FieldView, FieldViewProps } from './FieldView';
import { LinkDocPreview } from "./LinkDocPreview";
declare class MediaRecorder {
    constructor(e: any);  // whatever MediaRecorder has
}

type AudioDocument = makeInterface<[typeof documentSchema]>;
const AudioDocument = makeInterface(documentSchema);

@observer
export class AudioBox extends ViewBoxAnnotatableComponent<ViewBoxAnnotatableProps & FieldViewProps, AudioDocument>(AudioDocument) {
    public static LayoutString(fieldKey: string) { return FieldView.LayoutString(AudioBox, fieldKey); }
    public static Enabled = false;
    static playheadWidth = 30; // width of playhead
    static heightPercent = 80; // height of timeline in percent of height of audioBox.
    static Instance: AudioBox;

    _disposers: { [name: string]: IReactionDisposer } = {};
    _ele: HTMLAudioElement | null = null;
    _stackedTimeline = React.createRef<CollectionStackedTimeline>();
    _recorder: any;
    _recordStart = 0;
    _pauseStart = 0;
    _pauseEnd = 0;
    _pausedTime = 0;
    _stream: MediaStream | undefined;
    _start: number = 0;
    _play: any = null;

    @observable static _scrubTime = 0;
    @observable _markerEnd: number = 0;
    @observable _position: number = 0;
    @observable _waveHeight: Opt<number> = this.layoutDoc._height;
    @observable _paused: boolean = false;
    @computed get mediaState(): undefined | "pendingRecording" | "recording" | "paused" | "playing" { return this.dataDoc.mediaState as (undefined | "pendingRecording" | "recording" | "paused" | "playing"); }
    set mediaState(value) { this.dataDoc.mediaState = value; }
    public static SetScrubTime = action((timeInMillisFrom1970: number) => { AudioBox._scrubTime = 0; AudioBox._scrubTime = timeInMillisFrom1970; });
    @computed get recordingStart() { return Cast(this.dataDoc[this.props.fieldKey + "-recordingStart"], DateField)?.date.getTime(); }
    @computed get duration() { return NumCast(this.dataDoc[`${this.fieldKey}-duration`]); }
    @computed get anchorDocs() { return DocListCast(this.dataDoc[this.annotationKey]); }
    @computed get links() { return DocListCast(this.dataDoc.links); }
    @computed get pauseTime() { return this._pauseEnd - this._pauseStart; } // total time paused to update the correct time
    @computed get heightPercent() { return AudioBox.heightPercent; }

    constructor(props: Readonly<ViewBoxAnnotatableProps & FieldViewProps>) {
        super(props);
        AudioBox.Instance = this;

        if (this.duration === undefined) {
            runInAction(() => this.Document[this.fieldKey + "-duration"] = this.Document.duration);
        }
    }

    getLinkData(l: Doc) {
        let la1 = l.anchor1 as Doc;
        let la2 = l.anchor2 as Doc;
        const linkTime = this._stackedTimeline.current?.anchorStart(la2) || this._stackedTimeline.current?.anchorStart(la1) || 0;
        if (Doc.AreProtosEqual(la1, this.dataDoc)) {
            la1 = l.anchor2 as Doc;
            la2 = l.anchor1 as Doc;
        }
        return { la1, la2, linkTime };
    }

    getAnchor = () => {
        return CollectionStackedTimeline.createAnchor(this.rootDoc, this.dataDoc, this.annotationKey,
            "_timecodeToShow" /* audioStart */, "_timecodeToHide" /* audioEnd */, this._ele?.currentTime ||
            Cast(this.props.Document._currentTimecode, "number", null) || (this.mediaState === "recording" ? (Date.now() - (this.recordingStart || 0)) / 1000 : undefined))
            || this.rootDoc;
    }

    componentWillUnmount() {
        Object.values(this._disposers).forEach(disposer => disposer?.());
        const ind = DocUtils.ActiveRecordings.indexOf(this);
        ind !== -1 && (DocUtils.ActiveRecordings.splice(ind, 1));
    }

    @action
    componentDidMount() {
        this.props.setContentView?.(this); // this tells the DocumentView that this AudioBox is the "content" of the document.  this allows the DocumentView to indirectly call getAnchor() on the AudioBox when making a link.

        this.mediaState = this.path ? "paused" : undefined;

        this._disposers.triggerAudio = reaction(
            () => !LinkDocPreview.LinkInfo && this.props.renderDepth !== -1 ? NumCast(this.Document._triggerAudio, null) : undefined,
            start => start !== undefined && setTimeout(() => {
                this.playFrom(start);
                setTimeout(() => {
                    this.Document._currentTimecode = start;
                    this.Document._triggerAudio = undefined;
                }, 10);
            }), // wait for mainCont and try again to play
            { fireImmediately: true }
        );

        this._disposers.audioStop = reaction(
            () => this.props.renderDepth !== -1 && !LinkDocPreview.LinkInfo ? Cast(this.Document._audioStop, "number", null) : undefined,
            audioStop => audioStop !== undefined && setTimeout(() => {
                this.Pause();
                setTimeout(() => this.Document._audioStop = undefined, 10);
            }), // wait for mainCont and try again to play
            { fireImmediately: true }
        );
    }

    // for updating the timecode
    timecodeChanged = () => {
        const htmlEle = this._ele;
        if (this.mediaState !== "recording" && htmlEle) {
            htmlEle.duration && htmlEle.duration !== Infinity && runInAction(() => this.dataDoc[this.fieldKey + "-duration"] = htmlEle.duration);
            this.links.map(l => this.getLinkData(l)).forEach(({ la1, la2, linkTime }) => {
                if (linkTime > NumCast(this.layoutDoc._currentTimecode) && linkTime < htmlEle.currentTime) {
                    Doc.linkFollowHighlight(la1);
                }
            });
            this.layoutDoc._currentTimecode = htmlEle.currentTime;
        }
    }

    // pause play back
    Pause = action(() => {
        this._ele!.pause();
        this.mediaState = "paused";
    });

    // play audio for documents created during recording
    playFromTime = (absoluteTime: number) => {
        this.recordingStart && this.playFrom((absoluteTime - this.recordingStart) / 1000);
    }

    // play back the audio from time
    @action
    playFrom = (seekTimeInSeconds: number, endTime: number = this.duration) => {
        clearTimeout(this._play);
        if (Number.isNaN(this._ele?.duration)) {
            setTimeout(() => this.playFrom(seekTimeInSeconds, endTime), 500);
        } else if (this._ele && AudioBox.Enabled) {
            if (seekTimeInSeconds < 0) {
                if (seekTimeInSeconds > -1) {
                    setTimeout(() => this.playFrom(0), -seekTimeInSeconds * 1000);
                } else {
                    this.Pause();
                }
            } else if (seekTimeInSeconds <= this._ele.duration) {
                this._ele.currentTime = seekTimeInSeconds;
                this._ele.play();
                runInAction(() => this.mediaState = "playing");
                if (endTime !== this.duration) {
                    this._play = setTimeout(() => this.Pause(), (endTime - seekTimeInSeconds) * 1000); // use setTimeout to play a specific duration
                }
            } else {
                this.Pause();
            }
        }
    }

    // update the recording time
    updateRecordTime = () => {
        if (this.mediaState === "recording") {
            setTimeout(this.updateRecordTime, 30);
            if (this._paused) {
                this._pausedTime += (new Date().getTime() - this._recordStart) / 1000;
            } else {
                this.layoutDoc._currentTimecode = (new Date().getTime() - this._recordStart - this.pauseTime) / 1000;
            }
        }
    }

    // starts recording
    recordAudioAnnotation = async () => {
        this._stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        this._recorder = new MediaRecorder(this._stream);
        this.dataDoc[this.props.fieldKey + "-recordingStart"] = new DateField(new Date());
        DocUtils.ActiveRecordings.push(this);
        this._recorder.ondataavailable = async (e: any) => {
            const [{ result }] = await Networking.UploadFilesToServer(e.data);
            if (!(result instanceof Error)) {
                this.props.Document[this.props.fieldKey] = new AudioField(Utils.prepend(result.accessPaths.agnostic.client));
            }
        };
        this._recordStart = new Date().getTime();
        runInAction(() => this.mediaState = "recording");
        setTimeout(this.updateRecordTime, 0);
        this._recorder.start();
        setTimeout(() => this._recorder && this.stopRecording(), 60 * 60 * 1000); // stop after an hour
    }

    // context menu
    specificContextMenu = (e: React.MouseEvent): void => {
        const funcs: ContextMenuProps[] = [];
        funcs.push({ description: (this.layoutDoc.hideAnchors ? "Don't hide" : "Hide") + " anchors", event: () => this.layoutDoc.hideAnchors = !this.layoutDoc.hideAnchors, icon: "expand-arrows-alt" });
        funcs.push({ description: (this.layoutDoc.dontAutoPlayFollowedLinks ? "" : "Don't") + " play when link is selected", event: () => this.layoutDoc.dontAutoPlayFollowedLinks = !this.layoutDoc.dontAutoPlayFollowedLinks, icon: "expand-arrows-alt" });
        funcs.push({ description: (this.layoutDoc.autoPlayAnchors ? "Don't auto play" : "Auto play") + " anchors onClick", event: () => this.layoutDoc.autoPlayAnchors = !this.layoutDoc.autoPlayAnchors, icon: "expand-arrows-alt" });
        ContextMenu.Instance?.addItem({ description: "Options...", subitems: funcs, icon: "asterisk" });
    }

    // stops the recording
    stopRecording = action(() => {
        this._recorder.stop();
        this._recorder = undefined;
        this.dataDoc[this.fieldKey + "-duration"] = (new Date().getTime() - this._recordStart - this.pauseTime) / 1000;
        this.mediaState = "paused";
        this._stream?.getAudioTracks()[0].stop();
        const ind = DocUtils.ActiveRecordings.indexOf(this);
        ind !== -1 && (DocUtils.ActiveRecordings.splice(ind, 1));
    });

    // button for starting and stopping the recording
    recordClick = (e: React.MouseEvent) => {
        if (e.button === 0 && !e.ctrlKey) {
            this._recorder ? this.stopRecording() : this.recordAudioAnnotation();
            e.stopPropagation();
        }
    }

    // for play button
    Play = (e?: any) => {
        this.playFrom(this._ele!.paused ? this._ele!.currentTime : -1);
        e?.stopPropagation?.();
    }

    // creates a text document for dictation
    onFile = (e: any) => {
        const newDoc = CurrentUserUtils.GetNewTextDoc("", NumCast(this.props.Document.x), NumCast(this.props.Document.y) + NumCast(this.props.Document._height) + 10,
            NumCast(this.props.Document._width), 2 * NumCast(this.props.Document._height));
        Doc.GetProto(newDoc).recordingSource = this.dataDoc;
        Doc.GetProto(newDoc).recordingStart = ComputedField.MakeFunction(`self.recordingSource["${this.props.fieldKey}-recordingStart"]`);
        Doc.GetProto(newDoc).mediaState = ComputedField.MakeFunction("self.recordingSource.mediaState");
        this.props.addDocument?.(newDoc);
        e.stopPropagation();
    }

    // ref for updating time
    setRef = (e: HTMLAudioElement | null) => {
        e?.addEventListener("timeupdate", this.timecodeChanged);
        e?.addEventListener("ended", this.Pause);
        this._ele = e;
    }

    // returns the path of the audio file
    @computed get path() {
        const field = Cast(this.props.Document[this.props.fieldKey], AudioField);
        const path = (field instanceof AudioField) ? field.url.href : "";
        return path === nullAudio ? "" : path;
    }

    // returns the html audio element
    @computed get audio() {
        return <audio ref={this.setRef} className={`audiobox-control${this.isContentActive() ? "-interactive" : ""}`}>
            <source src={this.path} type="audio/mpeg" />
            Not supported.
        </audio>;
    }

    // pause the time during recording phase
    @action
    recordPause = (e: React.MouseEvent) => {
        this._pauseStart = new Date().getTime();
        this._paused = true;
        this._recorder.pause();
        e.stopPropagation();
    }

    // continue the recording
    @action
    recordPlay = (e: React.MouseEvent) => {
        this._pauseEnd = new Date().getTime();
        this._paused = false;
        this._recorder.resume();
        e.stopPropagation();
    }

    playing = () => this.mediaState === "playing";
    playLink = (link: Doc) => {
        const stack = this._stackedTimeline.current;
        if (link.annotationOn === this.rootDoc) {
            if (!this.layoutDoc.dontAutoPlayFollowedLinks) this.playFrom(stack?.anchorStart(link) || 0, stack?.anchorEnd(link));
            else this._ele!.currentTime = this.layoutDoc._currentTimecode = (stack?.anchorStart(link) || 0);
        }
        else {
            this.links.filter(l => l.anchor1 === link || l.anchor2 === link).forEach(l => {
                const { la1, la2 } = this.getLinkData(l);
                const startTime = stack?.anchorStart(la1) || stack?.anchorStart(la2);
                const endTime = stack?.anchorEnd(la1) || stack?.anchorEnd(la2);
                if (startTime !== undefined) {
                    if (!this.layoutDoc.dontAutoPlayFollowedLinks) endTime ? this.playFrom(startTime, endTime) : this.playFrom(startTime);
                    else this._ele!.currentTime = this.layoutDoc._currentTimecode = startTime;
                }
            });
        }
    }

    isActiveChild = () => this._isAnyChildContentActive;
    timelineWhenChildContentsActiveChanged = (isActive: boolean) => this.props.whenChildContentsActiveChanged(runInAction(() => this._isAnyChildContentActive = isActive));
    timelineScreenToLocal = () => this.props.ScreenToLocalTransform().translate(-AudioBox.playheadWidth, -(100 - this.heightPercent) / 200 * this.props.PanelHeight());
    setAnchorTime = (time: number) => this._ele!.currentTime = this.layoutDoc._currentTimecode = time;
    timelineHeight = () => this.props.PanelHeight() * this.heightPercent / 100 * this.heightPercent / 100; // panelHeight * heightPercent is player height.  * heightPercent is timeline height (as per css inline)
    timelineWidth = () => this.props.PanelWidth() - AudioBox.playheadWidth;
    @computed get renderTimeline() {
        return <CollectionStackedTimeline ref={this._stackedTimeline} {...this.props}
            fieldKey={this.annotationKey}
            dictationKey={this.fieldKey + "-dictation"}
            mediaPath={this.path}
            renderDepth={this.props.renderDepth + 1}
            startTag={"_timecodeToShow" /* audioStart */}
            endTag={"_timecodeToHide" /* audioEnd */}
            focus={DocUtils.DefaultFocus}
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
            PanelWidth={this.timelineWidth}
            PanelHeight={this.timelineHeight}
        />;
    }

    render() {
        const interactive = SnappingManager.GetIsDragging() || this.isContentActive() ? "-interactive" : "";
        return <div className="audiobox-container"
            onContextMenu={this.specificContextMenu}
            onClick={!this.path && !this._recorder ? this.recordAudioAnnotation : undefined}
            style={{ pointerEvents: this.props.layerProvider?.(this.layoutDoc) === false ? "none" : undefined }}>
            {!this.path ?
                <div className="audiobox-buttons">
                    <div className="audiobox-dictation" onClick={this.onFile}>
                        <FontAwesomeIcon style={{ width: "30px", background: !this.layoutDoc.dontAutoPlayFollowedLinks ? "yellow" : "rgba(0,0,0,0)" }} icon="file-alt" size={this.props.PanelHeight() < 36 ? "1x" : "2x"} />
                    </div>
                    {this.mediaState === "recording" || this.mediaState === "paused" ?
                        <div className="recording" onClick={e => e.stopPropagation()}>
                            <div className="buttons" onClick={this.recordClick}>
                                <FontAwesomeIcon icon={"stop"} size={this.props.PanelHeight() < 36 ? "1x" : "2x"} />
                            </div>
                            <div className="buttons" onClick={this._paused ? this.recordPlay : this.recordPause}>
                                <FontAwesomeIcon icon={this._paused ? "play" : "pause"} size={this.props.PanelHeight() < 36 ? "1x" : "2x"} />
                            </div>
                            <div className="time">{formatTime(Math.round(NumCast(this.layoutDoc._currentTimecode)))}</div>
                        </div>
                        :
                        <button className={`audiobox-record${interactive}`} style={{ backgroundColor: "black" }}>
                            RECORD
                        </button>}
                </div> :
                <div className="audiobox-controls" style={{ pointerEvents: this._isAnyChildContentActive || this.isContentActive() ? "all" : "none" }} >
                    <div className="audiobox-dictation" />
                    <div className="audiobox-player" style={{ height: `${AudioBox.heightPercent}%` }} >
                        <div className="audiobox-playhead" style={{ width: AudioBox.playheadWidth }} title={this.mediaState === "paused" ? "play" : "pause"} onClick={this.Play}> <FontAwesomeIcon style={{ width: "100%", position: "absolute", left: "0px", top: "5px", borderWidth: "thin", borderColor: "white" }} icon={this.mediaState === "paused" ? "play" : "pause"} size={"1x"} /></div>
                        <div className="audiobox-timeline" style={{ top: 0, height: `100%`, left: AudioBox.playheadWidth, width: `calc(100% - ${AudioBox.playheadWidth}px)`, background: "white" }}>
                            {this.renderTimeline}
                        </div>
                        {this.audio}
                        <div className="audioBox-current-time">
                            {formatTime(Math.round(NumCast(this.layoutDoc._currentTimecode)))}
                        </div>
                        <div className="audioBox-total-time">
                            {formatTime(Math.round(this.duration))}
                        </div>
                    </div>
                </div>
            }
        </div>;
    }
}