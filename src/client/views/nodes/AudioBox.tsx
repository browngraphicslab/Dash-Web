import React = require("react");
import { FieldViewProps, FieldView } from './FieldView';
import { observer } from "mobx-react";
import "./AudioBox.scss";
import { Cast, DateCast, NumCast, FieldValue, ScriptCast } from "../../../fields/Types";
import { AudioField, nullAudio } from "../../../fields/URLField";
import { ViewBoxAnnotatableComponent } from "../DocComponent";
import { makeInterface, createSchema } from "../../../fields/Schema";
import { documentSchema } from "../../../fields/documentSchemas";
import { Utils, returnTrue, emptyFunction, returnOne, returnTransparent, returnFalse, returnZero, formatTime, setupMoveUpEvents } from "../../../Utils";
import { runInAction, observable, reaction, IReactionDisposer, computed, action, trace, toJS } from "mobx";
import { DateField } from "../../../fields/DateField";
import { SelectionManager } from "../../util/SelectionManager";
import { Doc, DocListCast, Opt } from "../../../fields/Doc";
import { ContextMenuProps } from "../ContextMenuItem";
import { ContextMenu } from "../ContextMenu";
import { Id } from "../../../fields/FieldSymbols";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { DocumentView } from "./DocumentView";
import { Docs, DocUtils } from "../../documents/Documents";
import { ComputedField, ScriptField } from "../../../fields/ScriptField";
import { Networking } from "../../Network";
import { LinkAnchorBox } from "./LinkAnchorBox";
import { List } from "../../../fields/List";
import { Scripting } from "../../util/Scripting";
import Waveform from "react-audio-waveform";
import axios from "axios";
import { SnappingManager } from "../../util/SnappingManager";
const _global = (window /* browser */ || global /* node */) as any;

declare class MediaRecorder {
    // whatever MediaRecorder has
    constructor(e: any);
}
export const audioSchema = createSchema({ playOnSelect: "boolean" });

type AudioDocument = makeInterface<[typeof documentSchema, typeof audioSchema]>;
const AudioDocument = makeInterface(documentSchema, audioSchema);

@observer
export class AudioBox extends ViewBoxAnnotatableComponent<FieldViewProps, AudioDocument>(AudioDocument) {
    public static LayoutString(fieldKey: string) { return FieldView.LayoutString(AudioBox, fieldKey); }
    public static Enabled = false;

    static Instance: AudioBox;
    static RangeScript: ScriptField;
    static LabelScript: ScriptField;

    _linkPlayDisposer: IReactionDisposer | undefined;
    _reactionDisposer: IReactionDisposer | undefined;
    _scrubbingDisposer: IReactionDisposer | undefined;
    _ele: HTMLAudioElement | null = null;
    _recorder: any;
    _recordStart = 0;
    _pauseStart = 0;
    _pauseEnd = 0;
    _pausedTime = 0;
    _stream: MediaStream | undefined;
    _start: number = 0;
    _hold: boolean = false;
    _left: boolean = false;
    _first: boolean = false;
    _dragging = false;

    _count: Array<any> = [];
    _audioRef = React.createRef<HTMLDivElement>();
    _timeline: Opt<HTMLDivElement>;
    _duration = 0;
    _markerStart: number = 0;
    private _currMarker: any;

    @observable _visible: boolean = false;
    @observable _markerEnd: number = 0;
    @observable _position: number = 0;
    @observable _buckets: Array<number> = new Array<number>();
    @observable _waveHeight: Opt<number> = this.layoutDoc._height;
    @observable private _paused: boolean = false;
    @observable private static _scrubTime = 0;
    @computed get audioState(): undefined | "recording" | "paused" | "playing" { return this.dataDoc.audioState as (undefined | "recording" | "paused" | "playing"); }
    set audioState(value) { this.dataDoc.audioState = value; }
    public static SetScrubTime = action((timeInMillisFrom1970: number) => { AudioBox._scrubTime = 0; AudioBox._scrubTime = timeInMillisFrom1970; });
    @computed get recordingStart() { return Cast(this.dataDoc[this.props.fieldKey + "-recordingStart"], DateField)?.date.getTime(); }
    @computed get audioDuration() { return NumCast(this.dataDoc.duration); }
    async slideTemplate() { return (await Cast((await Cast(Doc.UserDoc().slidesBtn, Doc) as Doc).dragFactory, Doc) as Doc); }

    constructor(props: Readonly<FieldViewProps>) {
        super(props);
        AudioBox.Instance = this;

        // onClick play scripts
        AudioBox.RangeScript = AudioBox.RangeScript || ScriptField.MakeScript(`scriptContext.playFrom((this.audioStart), (this.audioEnd))`, { scriptContext: "any" })!;
        AudioBox.LabelScript = AudioBox.LabelScript || ScriptField.MakeScript(`scriptContext.playFrom((this.audioStart))`, { scriptContext: "any" })!;
    }

    getLinkData(l: Doc) {
        let la1 = l.anchor1 as Doc;
        let la2 = l.anchor2 as Doc;
        let linkTime = NumCast(l.anchor2_timecode);
        if (Doc.AreProtosEqual(la1, this.dataDoc)) {
            la1 = l.anchor2 as Doc;
            la2 = l.anchor1 as Doc;
            linkTime = NumCast(l.anchor1_timecode);
        }
        return { la1, la2, linkTime };
    }

    componentWillUnmount() {
        this._reactionDisposer?.();
        this._linkPlayDisposer?.();
        this._scrubbingDisposer?.();
    }
    componentDidMount() {
        if (!this.dataDoc.markerAmount) {
            this.dataDoc.markerAmount = 0;
        }

        runInAction(() => this.audioState = this.path ? "paused" : undefined);
        this._linkPlayDisposer = reaction(() => this.layoutDoc.scrollToLinkID,
            scrollLinkId => {
                if (scrollLinkId) {
                    DocListCast(this.dataDoc.links).filter(l => l[Id] === scrollLinkId).map(l => {
                        const { linkTime } = this.getLinkData(l);
                        setTimeout(() => { this.playFromTime(linkTime); Doc.linkFollowHighlight(l); }, 250);
                    });
                    Doc.SetInPlace(this.layoutDoc, "scrollToLinkID", undefined, false);
                }
            }, { fireImmediately: true });

        // for play when link is selected
        this._reactionDisposer = reaction(() => SelectionManager.SelectedDocuments(),
            selected => {
                const sel = selected.length ? selected[0].props.Document : undefined;
                const link = sel && DocListCast(this.dataDoc.links).forEach(l => (l.anchor1 === sel || l.anchor2 === sel) && this.playLink(sel), false);
                // for links created during recording 
                if (!link) {
                    this.layoutDoc.playOnSelect && this.recordingStart && sel && sel.creationDate && !Doc.AreProtosEqual(sel, this.props.Document) && this.playFromTime(DateCast(sel.creationDate).date.getTime());
                    this.layoutDoc.playOnSelect && this.recordingStart && !sel && this.pause();
                }
            });
        this._scrubbingDisposer = reaction(() => AudioBox._scrubTime, (time) => this.layoutDoc.playOnSelect && this.playFromTime(AudioBox._scrubTime));
    }

    playLink = (doc: Doc) => {
        let link = false;
        !Doc.AreProtosEqual(doc, this.props.Document) && DocListCast(this.props.Document.links).forEach(l => {
            if (l.anchor1 === doc || l.anchor2 === doc) {
                const { la1, la2, linkTime } = this.getLinkData(l);
                let startTime = linkTime;
                if (la2.audioStart) startTime = NumCast(la2.audioStart);
                if (la1.audioStart) startTime = NumCast(la1.audioStart);

                let endTime;
                if (la1.audioEnd) endTime = NumCast(la1.audioEnd);
                if (la2.audioEnd) endTime = NumCast(la2.audioEnd);

                if (startTime) {
                    link = true;
                    this.recordingStart && (endTime ? this.playFrom(startTime, endTime) : this.playFrom(startTime));
                }
            }
        });
        return link;
    }

    // for updating the timecode
    timecodeChanged = () => {
        const htmlEle = this._ele;
        if (this.audioState !== "recording" && htmlEle) {
            htmlEle.duration && htmlEle.duration !== Infinity && runInAction(() => this.dataDoc.duration = htmlEle.duration);
            DocListCast(this.dataDoc.links).map(l => {
                const { la1, linkTime } = this.getLinkData(l);
                if (linkTime > NumCast(this.layoutDoc.currentTimecode) && linkTime < htmlEle.currentTime) {
                    Doc.linkFollowHighlight(la1);
                }
            });
            this.layoutDoc.currentTimecode = htmlEle.currentTime;
        }
    }

    // pause play back
    pause = action(() => {
        this._ele!.pause();
        this.audioState = "paused";
    });

    // play audio for documents created during recording 
    playFromTime = (absoluteTime: number) => {
        this.recordingStart && this.playFrom((absoluteTime - this.recordingStart) / 1000);
    }

    // play back the audio from time
    @action
    playFrom = (seekTimeInSeconds: number, endTime: number = this.audioDuration) => {
        let play;
        clearTimeout(play);
        this._duration = endTime - seekTimeInSeconds;
        if (Number.isNaN(this._ele?.duration)) {
            setTimeout(() => this.playFrom(seekTimeInSeconds, endTime), 500);
        } else if (this._ele && AudioBox.Enabled) {
            if (seekTimeInSeconds < 0) {
                if (seekTimeInSeconds > -1) {
                    setTimeout(() => this.playFrom(0), -seekTimeInSeconds * 1000);
                } else {
                    this.pause();
                }
            } else if (seekTimeInSeconds <= this._ele.duration) {
                this._ele.currentTime = seekTimeInSeconds;
                this._ele.play();
                runInAction(() => this.audioState = "playing");
                if (endTime !== this.audioDuration) {
                    play = setTimeout(() => this.pause(), (this._duration) * 1000); // use setTimeout to play a specific duration
                }
            } else {
                this.pause();
            }
        }
    }

    // update the recording time
    updateRecordTime = () => {
        if (this.audioState === "recording") {
            setTimeout(this.updateRecordTime, 30);
            if (this._paused) {
                this._pausedTime += (new Date().getTime() - this._recordStart) / 1000;
            } else {
                this.layoutDoc.currentTimecode = (new Date().getTime() - this._recordStart - this.pauseTime) / 1000;
            }
        }
    }

    // starts recording
    recordAudioAnnotation = async () => {
        this._stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        this._recorder = new MediaRecorder(this._stream);
        this.dataDoc[this.props.fieldKey + "-recordingStart"] = new DateField(new Date());
        DocUtils.ActiveRecordings.push(this.props.Document);
        this._recorder.ondataavailable = async (e: any) => {
            const [{ result }] = await Networking.UploadFilesToServer(e.data);
            if (!(result instanceof Error)) {
                this.props.Document[this.props.fieldKey] = new AudioField(Utils.prepend(result.accessPaths.agnostic.client));
            }
        };
        this._recordStart = new Date().getTime();
        runInAction(() => this.audioState = "recording");
        setTimeout(this.updateRecordTime, 0);
        this._recorder.start();
        setTimeout(() => this._recorder && this.stopRecording(), 60 * 60 * 1000); // stop after an hour
    }

    // context menu
    specificContextMenu = (e: React.MouseEvent): void => {
        const funcs: ContextMenuProps[] = [];
        funcs.push({ description: (this.layoutDoc.playOnSelect ? "Don't play" : "Play") + " when link is selected", event: () => this.layoutDoc.playOnSelect = !this.layoutDoc.playOnSelect, icon: "expand-arrows-alt" });
        funcs.push({ description: (this.layoutDoc.hideMarkers ? "Don't hide" : "Hide") + " markers", event: () => this.layoutDoc.hideMarkers = !this.layoutDoc.hideMarkers, icon: "expand-arrows-alt" });
        funcs.push({ description: (this.layoutDoc.hideLabels ? "Don't hide" : "Hide") + " labels", event: () => this.layoutDoc.hideLabels = !this.layoutDoc.hideLabels, icon: "expand-arrows-alt" });
        funcs.push({ description: (this.layoutDoc.playOnClick ? "Don't play" : "Play") + " markers onClick", event: () => this.layoutDoc.playOnClick = !this.layoutDoc.playOnClick, icon: "expand-arrows-alt" });
        ContextMenu.Instance?.addItem({ description: "Options...", subitems: funcs, icon: "asterisk" });
    }

    // stops the recording 
    stopRecording = action(() => {
        this._recorder.stop();
        this._recorder = undefined;
        this.dataDoc.duration = (new Date().getTime() - this._recordStart - this.pauseTime) / 1000;
        this.audioState = "paused";
        this._stream?.getAudioTracks()[0].stop();
        const ind = DocUtils.ActiveRecordings.indexOf(this.props.Document);
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
    onPlay = (e: any) => {
        this.playFrom(this._ele!.paused ? this._ele!.currentTime : -1);
        e.stopPropagation();
    }

    // creates a text document for dictation
    onFile = (e: any) => {
        const newDoc = Docs.Create.TextDocument("", {
            title: "", _chromeStatus: "disabled",
            x: NumCast(this.props.Document.x), y: NumCast(this.props.Document.y) + NumCast(this.props.Document._height) + 10,
            _width: NumCast(this.props.Document._width), _height: 2 * NumCast(this.props.Document._height)
        });
        Doc.GetProto(newDoc).recordingSource = this.dataDoc;
        Doc.GetProto(newDoc).recordingStart = ComputedField.MakeFunction(`self.recordingSource["${this.props.fieldKey}-recordingStart"]`);
        Doc.GetProto(newDoc).audioState = ComputedField.MakeFunction("self.recordingSource.audioState");
        this.props.addDocument?.(newDoc);
        e.stopPropagation();
    }

    // ref for updating time
    setRef = (e: HTMLAudioElement | null) => {
        e?.addEventListener("timeupdate", this.timecodeChanged);
        e?.addEventListener("ended", this.pause);
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
        const interactive = this.active() ? "-interactive" : "";
        return <audio ref={this.setRef} className={`audiobox-control${interactive}`}>
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

    // return the total time paused to update the correct time
    @computed get pauseTime() {
        return this._pauseEnd - this._pauseStart;
    }

    // starting the drag event for marker resizing
    @action
    onPointerDownTimeline = (e: React.PointerEvent): void => {
        const rect = (e.target as any).getBoundingClientRect();
        const toTimeline = (screen_delta: number) => screen_delta / rect.width * this.audioDuration;
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
            (e: PointerEvent) => e.shiftKey && this.createMarker(this._ele!.currentTime)
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
        const rect = (e.target as any).getBoundingClientRect();
        const toTimeline = (screen_delta: number) => screen_delta / rect.width * this.audioDuration;
        setupMoveUpEvents(this, e,
            () => {
                this.changeMarker(this._currMarker, toTimeline(e.clientX - rect.x));
                return false;
            },
            () => this._ele!.currentTime = this.layoutDoc.currentTimecode = toTimeline(e.clientX - rect.x),
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
        const increment = this.audioDuration / 500;
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
            left: `${NumCast(this._markerStart) / this.audioDuration * 100}%`,
            width: `${Math.abs(this._markerStart - this._markerEnd) / this.audioDuration * 100}%`, height: "100%", top: "0%"
        }} />;
    }

    // returns the audio waveform
    @computed get waveform() {
        return <Waveform
            color={"darkblue"}
            height={this._waveHeight}
            barWidth={0.1}
            // pos={this.layoutDoc.currentTimecode} need to correctly resize parent to make this work (not very necessary for function)
            pos={this.audioDuration}
            duration={this.audioDuration}
            peaks={this._buckets.length === 100 ? this._buckets : undefined}
            progressColor={"blue"} />;
    }

    // decodes the audio file into peaks for generating the waveform
    @action
    buckets = async () => {
        const audioCtx = new (window.AudioContext)();

        axios({ url: this.path, responseType: "arraybuffer" })
            .then(response => {
                const audioData = response.data;

                audioCtx.decodeAudioData(audioData, action(buffer => {
                    const decodedAudioData = buffer.getChannelData(0);
                    const NUMBER_OF_BUCKETS = 100;
                    const bucketDataSize = Math.floor(decodedAudioData.length / NUMBER_OF_BUCKETS);

                    for (let i = 0; i < NUMBER_OF_BUCKETS; i++) {
                        const startingPoint = i * bucketDataSize;
                        const endingPoint = i * bucketDataSize + bucketDataSize;
                        let max = 0;
                        for (let j = startingPoint; j < endingPoint; j++) {
                            if (decodedAudioData[j] > max) {
                                max = decodedAudioData[j];
                            }
                        }
                        const size = Math.abs(max);
                        this._buckets.push(size / 2);
                    }

                }));
            });
    }

    // Returns the peaks of the audio waveform
    @computed get peaks() {
        return this.buckets();
    }

    rangeScript = () => AudioBox.RangeScript;
    labelScript = () => AudioBox.LabelScript;

    render() {
        const interactive = SnappingManager.GetIsDragging() || this.active() ? "-interactive" : "";
        this._first = true;  // for indicating the first marker that is rendered
        this.path && this._buckets.length !== 100 ? this.peaks : null; // render waveform if audio is done recording
        const markerDoc = (mark: Doc, script: undefined | (() => ScriptField)) => {
            return <DocumentView {...this.props}
                Document={mark}
                focus={() => this.playLink(mark)}
                pointerEvents={true}
                NativeHeight={returnZero}
                NativeWidth={returnZero}
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
        return <div className="audiobox-container" onContextMenu={this.specificContextMenu} onClick={!this.path ? this.recordClick : undefined}>
            <div className="audiobox-inner" style={{ pointerEvents: !interactive ? "none" : undefined }}>
                {!this.path ?
                    <div className="audiobox-buttons">
                        <div className="audiobox-dictation" onClick={this.onFile}>
                            <FontAwesomeIcon style={{ width: "30px", background: this.layoutDoc.playOnSelect ? "yellow" : "rgba(0,0,0,0)" }} icon="file-alt" size={this.props.PanelHeight() < 36 ? "1x" : "2x"} />
                        </div>
                        {this.audioState === "recording" ?
                            <div className="recording" onClick={e => e.stopPropagation()}>
                                <div className="buttons" onClick={this.recordClick}>
                                    <FontAwesomeIcon style={{ width: "100%" }} icon={"stop"} size={this.props.PanelHeight() < 36 ? "1x" : "2x"} />
                                </div>
                                <div className="buttons" onClick={this._paused ? this.recordPlay : this.recordPause}>
                                    <FontAwesomeIcon style={{ width: "100%" }} icon={this._paused ? "play" : "pause"} size={this.props.PanelHeight() < 36 ? "1x" : "2x"} />
                                </div>
                                <div className="time">{formatTime(Math.round(NumCast(this.layoutDoc.currentTimecode)))}</div>
                            </div>
                            :
                            <button className={`audiobox-record${interactive}`} style={{ backgroundColor: "black" }}>
                                RECORD
                            </button>}
                    </div> :
                    <div className="audiobox-controls" >
                        <div className="audiobox-dictation"></div>
                        <div className="audiobox-player" >
                            <div className="audiobox-playhead" title={this.audioState === "paused" ? "play" : "pause"} onClick={this.onPlay}> <FontAwesomeIcon style={{ width: "100%", position: "absolute", left: "0px", top: "5px", borderWidth: "thin", borderColor: "white" }} icon={this.audioState === "paused" ? "play" : "pause"} size={"1x"} /></div>
                            <div className="audiobox-timeline" onClick={e => { e.stopPropagation(); e.preventDefault(); }}
                                onPointerDown={e => {
                                    if (e.button === 0 && !e.ctrlKey) {
                                        const rect = (e.target as any).getBoundingClientRect();

                                        if (e.target !== this._audioRef.current) {
                                            const wasPaused = this.audioState === "paused";
                                            this._ele!.currentTime = this.layoutDoc.currentTimecode = (e.clientX - rect.x) / rect.width * this.audioDuration;
                                            wasPaused && this.pause();
                                        }

                                        this.onPointerDownTimeline(e);
                                    }
                                }}>
                                <div className="waveform">
                                    {this.waveform}
                                </div>
                                {DocListCast(this.dataDoc[this.annotationKey]).map((m, i) =>
                                    (!m.isLabel) ?
                                        (this.layoutDoc.hideMarkers) ? (null) :
                                            <div className={`audiobox-marker-${this.props.PanelHeight() < 32 ? "mini" : ""}container1`} key={i}
                                                title={`${formatTime(Math.round(NumCast(m.audioStart)))}` + " - " + `${formatTime(Math.round(NumCast(m.audioEnd)))}`}
                                                style={{
                                                    left: `${NumCast(m.audioStart) / this.audioDuration * 100}%`,
                                                    top: `${this.isOverlap(m) * 1 / (this.dataDoc.markerAmount + 1) * 100}%`,
                                                    width: `${(NumCast(m.audioEnd) - NumCast(m.audioStart)) / this.audioDuration * 100}%`, height: `${1 / (this.dataDoc.markerAmount + 1) * 100}%`
                                                }}
                                                onClick={e => { this.playFrom(NumCast(m.audioStart), NumCast(m.audioEnd)); e.stopPropagation(); }} >
                                                <div className="left-resizer" onPointerDown={e => this.onPointerDown(e, m, true)}></div>
                                                {markerDoc(m, this.rangeScript)}
                                                <div className="resizer" onPointerDown={e => this.onPointerDown(e, m, false)}></div>
                                            </div>
                                        :
                                        (this.layoutDoc.hideLabels) ? (null) :
                                            <div className={`audiobox-marker-${this.props.PanelHeight() < 32 ? "mini" : ""}container`} key={i}
                                                style={{ left: `${NumCast(m.audioStart) / this.audioDuration * 100}%` }}>
                                                {markerDoc(m, this.labelScript)}
                                            </div>
                                )}
                                {DocListCast(this.dataDoc.links).map((l, i) => {
                                    const { la1, la2, linkTime } = this.getLinkData(l);
                                    let startTime = linkTime;
                                    if (la2.audioStart && !la2.audioEnd) {
                                        startTime = NumCast(la2.audioStart);
                                    }

                                    return !linkTime ? (null) :
                                        <div className={`audiobox-marker-${this.props.PanelHeight() < 32 ? "mini" : ""}container`} key={l[Id]} style={{ left: `${startTime / this.audioDuration * 100}%` }} onClick={e => e.stopPropagation()}>
                                            <DocumentView {...this.props}
                                                Document={l}
                                                NativeHeight={returnZero}
                                                NativeWidth={returnZero}
                                                rootSelected={returnFalse}
                                                ContainingCollectionDoc={this.props.Document}
                                                parentActive={returnTrue}
                                                bringToFront={emptyFunction}
                                                backgroundColor={returnTransparent}
                                                ContentScaling={returnOne}
                                                forcedBackgroundColor={returnTransparent}
                                                pointerEvents={false}
                                                LayoutTemplate={undefined}
                                                LayoutTemplateString={LinkAnchorBox.LayoutString(`anchor${Doc.LinkEndpoint(l, la2)}`)}
                                            />
                                            <div key={i} className={`audiobox-marker`} onPointerEnter={() => Doc.linkFollowHighlight(la1)}
                                                onPointerDown={e => { if (e.button === 0 && !e.ctrlKey) { this.playFrom(startTime); e.stopPropagation(); e.preventDefault(); } }} />
                                        </div>;
                                })}
                                {this._visible ? this.selectionContainer : null}

                                <div className="audiobox-current" ref={this._audioRef} onClick={e => { e.stopPropagation(); e.preventDefault(); }} style={{ left: `${NumCast(this.layoutDoc.currentTimecode) / this.audioDuration * 100}%`, pointerEvents: "none" }} />
                                {this.audio}
                            </div>
                            <div className="current-time">
                                {formatTime(Math.round(NumCast(this.layoutDoc.currentTimecode)))}
                            </div>
                            <div className="total-time">
                                {formatTime(Math.round(this.audioDuration))}
                            </div>
                        </div>
                    </div>
                }</div>
        </div>;
    }
}
Scripting.addGlobal(function formatToTime(time: number): any { return formatTime(time); });