import React = require("react");
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import axios from "axios";
import { action, computed, IReactionDisposer, observable, reaction, runInAction } from "mobx";
import { observer } from "mobx-react";
import { computedFn } from "mobx-utils";
import Waveform from "react-audio-waveform";
import { DateField } from "../../../fields/DateField";
import { Doc, DocListCast, Opt } from "../../../fields/Doc";
import { documentSchema } from "../../../fields/documentSchemas";
import { List } from "../../../fields/List";
import { createSchema, listSpec, makeInterface } from "../../../fields/Schema";
import { ComputedField, ScriptField } from "../../../fields/ScriptField";
import { Cast, NumCast } from "../../../fields/Types";
import { AudioField, nullAudio } from "../../../fields/URLField";
import { emptyFunction, formatTime, numberRange, returnFalse, setupMoveUpEvents, Utils } from "../../../Utils";
import { Docs, DocUtils } from "../../documents/Documents";
import { Networking } from "../../Network";
import { CurrentUserUtils } from "../../util/CurrentUserUtils";
import { DocumentManager } from "../../util/DocumentManager";
import { Scripting } from "../../util/Scripting";
import { SelectionManager } from "../../util/SelectionManager";
import { SnappingManager } from "../../util/SnappingManager";
import { ContextMenu } from "../ContextMenu";
import { ContextMenuProps } from "../ContextMenuItem";
import { ViewBoxAnnotatableComponent } from "../DocComponent";
import { DocumentView } from "./DocumentView";
import { FieldView, FieldViewProps } from './FieldView';
import { FormattedTextBoxComment } from "./formattedText/FormattedTextBoxComment";
import { LinkDocPreview } from "./LinkDocPreview";
import "./AudioBox.scss";
import { Id } from "../../../fields/FieldSymbols";

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
    public static NUMBER_OF_BUCKETS = 100;
    static playheadWidth = 30; // width of playhead
    static heightPercent = 80; // height of timeline in percent of height of audioBox.
    static Instance: AudioBox;
    static RangeScript: ScriptField;
    static LabelScript: ScriptField;
    static RangePlayScript: ScriptField;
    static LabelPlayScript: ScriptField;

    _disposers: { [name: string]: IReactionDisposer } = {};
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
    _dragging = false;
    _play: any = null;
    _audioRef = React.createRef<HTMLDivElement>();
    _timeline: Opt<HTMLDivElement>;
    _markerStart: number = 0;
    _currMarker: any;

    @observable static SelectingRegion: AudioBox | undefined = undefined;
    @observable static _scrubTime = 0;
    @observable _markerEnd: number = 0;
    @observable _position: number = 0;
    @observable _waveHeight: Opt<number> = this.layoutDoc._height;
    @observable _paused: boolean = false;
    @computed get audioState(): undefined | "recording" | "paused" | "playing" { return this.dataDoc.audioState as (undefined | "recording" | "paused" | "playing"); }
    set audioState(value) { this.dataDoc.audioState = value; }
    public static SetScrubTime = action((timeInMillisFrom1970: number) => { AudioBox._scrubTime = 0; AudioBox._scrubTime = timeInMillisFrom1970; });
    @computed get recordingStart() { return Cast(this.dataDoc[this.props.fieldKey + "-recordingStart"], DateField)?.date.getTime(); }
    @computed get audioDuration() { return NumCast(this.dataDoc.duration); }
    @computed get markerDocs() { return DocListCast(this.dataDoc[this.annotationKey]); }
    @computed get links() { return DocListCast(this.dataDoc.links); }
    @computed get pauseTime() { return this._pauseEnd - this._pauseStart; } // total time paused to update the correct time

    constructor(props: Readonly<FieldViewProps>) {
        super(props);
        AudioBox.Instance = this;

        // onClick play scripts
        AudioBox.RangeScript = AudioBox.RangeScript || ScriptField.MakeFunction(`scriptContext.clickMarker(self, this.audioStart, this.audioEnd)`, { self: Doc.name, scriptContext: "any" })!;
        AudioBox.LabelScript = AudioBox.LabelScript || ScriptField.MakeFunction(`scriptContext.clickMarker(self, this.audioStart)`, { self: Doc.name, scriptContext: "any" })!;
        AudioBox.RangePlayScript = AudioBox.RangePlayScript || ScriptField.MakeFunction(`scriptContext.playOnClick(self, this.audioStart, this.audioEnd)`, { self: Doc.name, scriptContext: "any" })!;
        AudioBox.LabelPlayScript = AudioBox.LabelPlayScript || ScriptField.MakeFunction(`scriptContext.playOnClick(self, this.audioStart)`, { self: Doc.name, scriptContext: "any" })!;
    }

    getLinkData(l: Doc) {
        let la1 = l.anchor1 as Doc;
        let la2 = l.anchor2 as Doc;
        const linkTime = NumCast(la2.audioStart, NumCast(la1.audioStart));
        if (Doc.AreProtosEqual(la1, this.dataDoc)) {
            la1 = l.anchor2 as Doc;
            la2 = l.anchor1 as Doc;
        }
        return { la1, la2, linkTime };
    }

    getAnchor = () => {
        return this.createMarker(this._ele?.currentTime || Cast(this.props.Document._currentTimecode, "number", null) || (this.audioState === "recording" ? (Date.now() - (this.recordingStart || 0)) / 1000 : undefined));
    }

    componentWillUnmount() {
        Object.values(this._disposers).forEach(disposer => disposer?.());
        const ind = DocUtils.ActiveRecordings.indexOf(this);
        ind !== -1 && (DocUtils.ActiveRecordings.splice(ind, 1));
    }

    @action
    componentDidMount() {
        this.props.setContentView?.(this); // this tells the DocumentView that this AudioBox is the "content" of the document.  this allows the DocumentView to indirectly call getAnchor() on the AudioBox when making a link.

        this.audioState = this.path ? "paused" : undefined;

        this._disposers.scrubbing = reaction(() => AudioBox._scrubTime, (time) => this.layoutDoc.playOnSelect && this.playFromTime(AudioBox._scrubTime));

        this._disposers.audioStart = reaction(
            () => !LinkDocPreview.TargetDoc && !FormattedTextBoxComment.linkDoc && this.props.renderDepth !== -1 ? Cast(this.Document._audioStart, "number", null) : undefined,
            audioStart => audioStart !== undefined && setTimeout(() => {
                this._audioRef.current && this.playFrom(audioStart);
                setTimeout(() => {
                    this.Document._currentTimecode = audioStart;
                    this.Document._audioStart = undefined;
                }, 10);
            }, this._audioRef.current ? 0 : 250), // wait for mainCont and try again to play
            { fireImmediately: true }
        );

        this._disposers.audioStop = reaction(
            () => this.props.renderDepth !== -1 && !LinkDocPreview.TargetDoc && !FormattedTextBoxComment.linkDoc ? Cast(this.Document._audioStop, "number", null) : undefined,
            audioStop => audioStop !== undefined && setTimeout(() => {
                this._audioRef.current && this.pause();
                setTimeout(() => this.Document._audioStop = undefined, 10);
            }, this._audioRef.current ? 0 : 250), // wait for mainCont and try again to play
            { fireImmediately: true }
        );
    }

    playLink = (doc: Doc) => {
        this.links.filter(l => l.anchor1 === doc || l.anchor2 === doc).forEach(l => {
            const { la1, la2 } = this.getLinkData(l);
            const startTime = NumCast(la1.audioStart, NumCast(la2.audioStart, null));
            const endTime = NumCast(la1.audioEnd, NumCast(la2.audioEnd, null));
            if (startTime !== undefined) {
                this.layoutDoc.playOnSelect && (endTime ? this.playFrom(startTime, endTime) : this.playFrom(startTime));
            }
        });
        doc.annotationOn === this.rootDoc && this.playFrom(NumCast(doc.audioStart), Cast(doc.audioEnd, "number", null));
    }

    // for updating the timecode
    timecodeChanged = () => {
        const htmlEle = this._ele;
        if (this.audioState !== "recording" && htmlEle) {
            htmlEle.duration && htmlEle.duration !== Infinity && runInAction(() => this.dataDoc.duration = htmlEle.duration);
            this.links.map(l => {
                const { la1, linkTime } = this.getLinkData(l);
                if (linkTime > NumCast(this.layoutDoc._currentTimecode) && linkTime < htmlEle.currentTime) {
                    Doc.linkFollowHighlight(la1);
                }
            });
            this.layoutDoc._currentTimecode = htmlEle.currentTime;
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
    playOnClick = (anchorDoc: Doc, seekTimeInSeconds: number, endTime: number = this.audioDuration) => {
        this.playFrom(seekTimeInSeconds, endTime);
        return true;
    }

    // play back the audio from time
    @action
    clickMarker = (anchorDoc: Doc, seekTimeInSeconds: number, endTime: number = this.audioDuration) => {
        if (this.layoutDoc.playOnClick) return this.playOnClick(anchorDoc, seekTimeInSeconds, endTime);
        this._ele && (this._ele.currentTime = this.layoutDoc._currentTimecode = seekTimeInSeconds);
        return true;
    }
    // play back the audio from time
    @action
    playFrom = (seekTimeInSeconds: number, endTime: number = this.audioDuration) => {
        clearTimeout(this._play);
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
                    this._play = setTimeout(() => this.pause(), (endTime - seekTimeInSeconds) * 1000); // use setTimeout to play a specific duration
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
        runInAction(() => this.audioState = "recording");
        setTimeout(this.updateRecordTime, 0);
        this._recorder.start();
        setTimeout(() => this._recorder && this.stopRecording(), 60 * 60 * 1000); // stop after an hour
    }

    // context menu
    specificContextMenu = (e: React.MouseEvent): void => {
        const funcs: ContextMenuProps[] = [];
        funcs.push({ description: (this.layoutDoc.playOnSelect ? "Don't play" : "Play") + " when link is selected", event: () => this.layoutDoc.playOnSelect = !this.layoutDoc.playOnSelect, icon: "expand-arrows-alt" });
        funcs.push({ description: (this.layoutDoc.hideMarkers ? "Don't hide" : "Hide") + " range markers", event: () => this.layoutDoc.hideMarkers = !this.layoutDoc.hideMarkers, icon: "expand-arrows-alt" });
        funcs.push({ description: (this.layoutDoc.playOnClick ? "Don't play" : "Play") + " markers onClick", event: () => this.layoutDoc.playOnClick = !this.layoutDoc.playOnClick, icon: "expand-arrows-alt" });
        funcs.push({ description: (this.layoutDoc.autoPlay ? "Don't auto play" : "Auto play") + " markers onClick", event: () => this.layoutDoc.autoPlay = !this.layoutDoc.autoPlay, icon: "expand-arrows-alt" });
        ContextMenu.Instance?.addItem({ description: "Options...", subitems: funcs, icon: "asterisk" });
    }

    // stops the recording
    stopRecording = action(() => {
        this._recorder.stop();
        this._recorder = undefined;
        this.dataDoc.duration = (new Date().getTime() - this._recordStart - this.pauseTime) / 1000;
        this.audioState = "paused";
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
    onPlay = (e: any) => {
        this.playFrom(this._ele!.paused ? this._ele!.currentTime : -1);
        e.stopPropagation();
    }

    // creates a text document for dictation
    onFile = (e: any) => {
        const newDoc = CurrentUserUtils.GetNewTextDoc("", NumCast(this.props.Document.x), NumCast(this.props.Document.y) + NumCast(this.props.Document._height) + 10,
            NumCast(this.props.Document._width), 2 * NumCast(this.props.Document._height));
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

    // ref for timeline
    timelineRef = (timeline: HTMLDivElement) => {
        this._timeline = timeline;
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

    // starting the drag event for marker resizing
    @action
    onPointerDownTimeline = (e: React.PointerEvent): void => {
        const rect = this._timeline?.getBoundingClientRect();// (e.target as any).getBoundingClientRect();
        if (rect && e.target !== this._audioRef.current && this.active()) {
            const wasPaused = this.audioState === "paused";
            this._ele!.currentTime = this.layoutDoc._currentTimecode = (e.clientX - rect.x) / rect.width * this.audioDuration;
            wasPaused && this.pause();

            const toTimeline = (screen_delta: number) => screen_delta / rect.width * this.audioDuration;
            this._markerStart = this._markerEnd = toTimeline(e.clientX - rect.x);
            AudioBox.SelectingRegion = this;
            setupMoveUpEvents(this, e,
                action(e => {
                    this._markerEnd = toTimeline(e.clientX - rect.x);
                    return false;
                }),
                action((e, movement) => {
                    this._markerEnd = toTimeline(e.clientX - rect.x);
                    if (this._markerEnd < this._markerStart) {
                        const tmp = this._markerStart;
                        this._markerStart = this._markerEnd;
                        this._markerEnd = tmp;
                    }
                    AudioBox.SelectingRegion === this && (Math.abs(movement[0]) > 15) && this.createMarker(this._markerStart, this._markerEnd);
                    AudioBox.SelectingRegion = undefined;
                }),
                e => {
                    this.props.select(false);
                    e.shiftKey && this.createMarker(this._ele!.currentTime);
                }
                , this.props.isSelected(true) || this._isChildActive);
        }
    }

    @action
    createMarker(audioStart?: number, audioEnd?: number) {
        if (audioStart === undefined) return this.rootDoc;
        const marker = Docs.Create.LabelDocument({
            title: ComputedField.MakeFunction(`"#" + formatToTime(self.audioStart) + "-" + formatToTime(self.audioEnd)`) as any,
            useLinkSmallAnchor: true,
            hideLinkButton: true,
            audioStart,
            audioEnd,
            annotationOn: this.props.Document
        });
        if (this.dataDoc[this.annotationKey]) {
            this.dataDoc[this.annotationKey].push(marker);
        } else {
            this.dataDoc[this.annotationKey] = new List<Doc>([marker]);
        }
        return marker;
    }

    // starting the drag event for marker resizing
    onPointerDown = (e: React.PointerEvent, m: any, left: boolean): void => {
        this._currMarker = m;
        this._left = left;
        this._timeline?.setPointerCapture(e.pointerId);
        const toTimeline = (screen_delta: number, width: number) => screen_delta / width * this.audioDuration;
        setupMoveUpEvents(this, e,
            (e) => {
                const rect = (e.target as any).getBoundingClientRect();
                this.changeMarker(this._currMarker, toTimeline(e.clientX - rect.x, rect.width));
                return false;
            },
            (e) => {
                const rect = (e.target as any).getBoundingClientRect();
                this._ele!.currentTime = this.layoutDoc._currentTimecode = toTimeline(e.clientX - rect.x, rect.width);
                this._timeline?.releasePointerCapture(e.pointerId);
            },
            emptyFunction);
    }

    // updates the marker with the new time
    @action
    changeMarker = (m: any, time: any) => {
        this.markerDocs.filter(marker => this.isSame(marker, m)).forEach(marker =>
            this._left ? marker.audioStart = time : marker.audioEnd = time);
    }

    // checks if the two markers are the same with start and end time
    isSame = (m1: any, m2: any) => {
        return m1.audioStart === m2.audioStart && m1.audioEnd === m2.audioEnd;
    }

    // makes sure no markers overlaps each other by setting the correct position and width
    getLevel = (m: any, placed: { audioStart: number, audioEnd: number, level: number }[]) => {
        const timelineContentWidth = this.props.PanelWidth() - AudioBox.playheadWidth;
        const x1 = m.audioStart;
        const x2 = m.audioEnd === undefined ? m.audioStart + 10 / timelineContentWidth * this.audioDuration : m.audioEnd;
        let max = 0;
        const overlappedLevels = new Set(placed.map(p => {
            const y1 = p.audioStart;
            const y2 = p.audioEnd;
            if ((x1 >= y1 && x1 <= y2) || (x2 >= y1 && x2 <= y2) ||
                (y1 >= x1 && y1 <= x2) || (y2 >= x1 && y2 <= x2)) {
                max = Math.max(max, p.level);
                return p.level;
            }
        }));
        let level = max + 1;
        for (let j = max; j >= 0; j--) !overlappedLevels.has(j) && (level = j);

        placed.push({ audioStart: x1, audioEnd: x2, level });
        return level;
    }

    @computed get selectionContainer() {
        return AudioBox.SelectingRegion !== this ? (null) : <div className="audiobox-container" style={{
            left: `${Math.min(NumCast(this._markerStart), NumCast(this._markerEnd)) / this.audioDuration * 100}%`,
            width: `${Math.abs(this._markerStart - this._markerEnd) / this.audioDuration * 100}%`, height: "100%", top: "0%"
        }} />;
    }

    // returns the audio waveform
    @computed get waveform() {
        const audioBuckets = Cast(this.dataDoc.audioBuckets, listSpec("number"), []);
        !audioBuckets.length && setTimeout(() => this.createWaveformBuckets());
        return <Waveform
            color={"darkblue"}
            height={this._waveHeight}
            barWidth={0.1}
            pos={this.audioDuration}
            duration={this.audioDuration}
            peaks={audioBuckets.length === AudioBox.NUMBER_OF_BUCKETS ? audioBuckets : undefined}
            progressColor={"blue"} />;
    }

    // decodes the audio file into peaks for generating the waveform
    createWaveformBuckets = async () => {
        axios({ url: this.path, responseType: "arraybuffer" })
            .then(response => (new (window.AudioContext)()).decodeAudioData(response.data,
                action(buffer => {
                    const decodedAudioData = buffer.getChannelData(0);
                    const bucketDataSize = Math.floor(decodedAudioData.length / AudioBox.NUMBER_OF_BUCKETS);
                    const brange = Array.from(Array(bucketDataSize));
                    this.dataDoc.audioBuckets = new List<number>(
                        numberRange(AudioBox.NUMBER_OF_BUCKETS).map(i =>
                            brange.reduce((p, x, j) => Math.abs(Math.max(p, decodedAudioData[i * bucketDataSize + j])), 0) / 2));
                }))
            );
    }

    rangeClickScript = () => AudioBox.RangeScript;
    labelClickScript = () => AudioBox.LabelScript;
    rangePlayScript = () => AudioBox.RangePlayScript;
    labelPlayScript = () => AudioBox.LabelPlayScript;
    renderInner = computedFn(function (this: AudioBox, mark: Doc, script: undefined | (() => ScriptField), doublescript: undefined | (() => ScriptField), x: number, y: number, width: number, height: number) {
        const marker = observable({ view: undefined as any });
        return {
            marker, view: <DocumentView key="view" {...this.props} ref={action((r: DocumentView | null) => marker.view = r)}
                Document={mark}
                PanelWidth={() => width}
                PanelHeight={() => height}
                renderDepth={this.props.renderDepth + 1}
                focus={() => this.playLink(mark)}
                rootSelected={returnFalse}
                LayoutTemplate={undefined}
                ContainingCollectionDoc={this.props.Document}
                removeDocument={this.removeDocument}
                ScreenToLocalTransform={() => this.props.ScreenToLocalTransform().translate(-x - 4, -y - 3)}
                parentActive={(out) => this.props.isSelected(out) || this._isChildActive}
                whenActiveChanged={action((isActive: boolean) => this.props.whenActiveChanged(this._isChildActive = isActive))}
                onClick={script}
                onDoubleClick={this.layoutDoc.playOnClick ? undefined : doublescript}
                ignoreAutoHeight={false}
                bringToFront={emptyFunction}
                scriptContext={this} />
        };
    });
    renderMarker = computedFn(function (this: AudioBox, mark: Doc, script: undefined | (() => ScriptField), doublescript: undefined | (() => ScriptField), x: number, y: number, width: number, height: number) {
        const inner = this.renderInner(mark, script, doublescript, x, y, width, height);
        return <>
            {inner.view}
            {!inner.marker.view || !SelectionManager.IsSelected(inner.marker.view) ? (null) :
                <>
                    <div key="left" className="left-resizer" onPointerDown={e => this.onPointerDown(e, mark, true)} />
                    <div key="right" className="resizer" onPointerDown={e => this.onPointerDown(e, mark, false)} />
                </>}
        </>;
    });

    render() {
        const interactive = SnappingManager.GetIsDragging() || this.active() ? "-interactive" : "";
        const timelineContentWidth = this.props.PanelWidth() - AudioBox.playheadWidth;
        const timelineContentHeight = (this.props.PanelHeight() * AudioBox.heightPercent / 100) * AudioBox.heightPercent / 100; // panelHeight * heightPercent is player height.   * heightPercent is timeline height (as per css inline)
        const overlaps: { audioStart: number, audioEnd: number, level: number }[] = [];
        const drawMarkers = this.markerDocs.map((m, i) => ({ level: this.getLevel(m, overlaps), marker: m }));
        const maxLevel = overlaps.reduce((m, o) => Math.max(m, o.level), 0) + 2;
        return <div className="audiobox-container"
            onContextMenu={this.specificContextMenu}
            onClick={!this.path && !this._recorder ? this.recordAudioAnnotation : undefined}
            style={{ pointerEvents: this.props.layerProvider?.(this.layoutDoc) === false ? "none" : undefined }}>
            {!this.path ?
                <div className="audiobox-buttons">
                    <div className="audiobox-dictation" onClick={this.onFile}>
                        <FontAwesomeIcon style={{ width: "30px", background: this.layoutDoc.playOnSelect ? "yellow" : "rgba(0,0,0,0)" }} icon="file-alt" size={this.props.PanelHeight() < 36 ? "1x" : "2x"} />
                    </div>
                    {this.audioState === "recording" || this.audioState === "paused" ?
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
                <div className="audiobox-controls" style={{ pointerEvents: this._isChildActive || this.active() ? "all" : "none" }} >
                    <div className="audiobox-dictation" />
                    <div className="audiobox-player" style={{ height: `${AudioBox.heightPercent}%` }} >
                        <div className="audiobox-playhead" style={{ width: AudioBox.playheadWidth }} title={this.audioState === "paused" ? "play" : "pause"} onClick={this.onPlay}> <FontAwesomeIcon style={{ width: "100%", position: "absolute", left: "0px", top: "5px", borderWidth: "thin", borderColor: "white" }} icon={this.audioState === "paused" ? "play" : "pause"} size={"1x"} /></div>
                        <div className="audiobox-timeline" style={{ height: `${AudioBox.heightPercent}%` }} ref={this.timelineRef}
                            onClick={e => { e.stopPropagation(); e.preventDefault(); }}
                            onPointerDown={e => e.button === 0 && !e.ctrlKey && this.onPointerDownTimeline(e)}>
                            <div className="waveform">
                                {this.waveform}
                            </div>
                            {drawMarkers.map(d => {
                                const m = d.marker;
                                const left = NumCast(m.audioStart) / this.audioDuration * timelineContentWidth;
                                const top = d.level / maxLevel * timelineContentHeight;
                                const timespan = m.audioEnd === undefined ? 10 / timelineContentWidth * this.audioDuration : NumCast(m.audioEnd) - NumCast(m.audioStart);
                                return this.layoutDoc.hideMarkers ? (null) :
                                    <div className={`audiobox-marker-${this.props.PanelHeight() < 32 ? "mini" : ""}timeline`} key={m[Id]}
                                        style={{ left, top, width: `${timespan / this.audioDuration * 100}%`, height: `${1 / maxLevel * 100}%` }}
                                        onClick={e => { this.playFrom(NumCast(m.audioStart), Cast(m.audioEnd, "number", null)); e.stopPropagation(); }} >
                                        {this.renderMarker(m, this.rangeClickScript, this.rangePlayScript,
                                            left + AudioBox.playheadWidth,
                                            (1 - AudioBox.heightPercent / 100) / 2 * this.props.PanelHeight() + top,
                                            timelineContentWidth * timespan / this.audioDuration,
                                            timelineContentHeight / maxLevel)}
                                    </div>;
                            })}
                            {this.selectionContainer}
                            <div className="audiobox-current" ref={this._audioRef} onClick={e => { e.stopPropagation(); e.preventDefault(); }} style={{ left: `${NumCast(this.layoutDoc._currentTimecode) / this.audioDuration * 100}%`, pointerEvents: "none" }} />
                            {this.audio}
                        </div>
                        <div className="current-time">
                            {formatTime(Math.round(NumCast(this.layoutDoc._currentTimecode)))}
                        </div>
                        <div className="total-time">
                            {formatTime(Math.round(this.audioDuration))}
                        </div>
                    </div>
                </div>
            }
        </div>;
    }
}
Scripting.addGlobal(function formatToTime(time: number): any { return formatTime(time); });