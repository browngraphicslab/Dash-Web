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
const _global = (window /* browser */ || global /* node */) as any;

declare class MediaRecorder {
    // whatever MediaRecorder has
    constructor(e: any);
}
export const audioSchema = createSchema({
    playOnSelect: "boolean"
});

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
    _timeline: Opt<HTMLDivElement>;
    _duration = 0;
    _containerX: number = 0;
    _invertedX: boolean = false;
    private _isPointerDown = false;
    private _currMarker: any;

    @observable _visible: boolean = false;
    @observable _currX: number = 0;
    @observable _position: number = 0;
    @observable _buckets: Array<number> = new Array<number>();
    @observable _waveHeight: number | undefined = this.layoutDoc._height;
    @observable private _paused: boolean = false;
    @observable private static _scrubTime = 0;
    @computed get audioState(): undefined | "recording" | "paused" | "playing" { return this.dataDoc.audioState as (undefined | "recording" | "paused" | "playing"); }
    set audioState(value) { this.dataDoc.audioState = value; }
    public static SetScrubTime = (timeInMillisFrom1970: number) => { runInAction(() => AudioBox._scrubTime = 0); runInAction(() => AudioBox._scrubTime = timeInMillisFrom1970); };
    @computed get recordingStart() { return Cast(this.dataDoc[this.props.fieldKey + "-recordingStart"], DateField)?.date.getTime(); }
    async slideTemplate() { return (await Cast((await Cast(Doc.UserDoc().slidesBtn, Doc) as Doc).dragFactory, Doc) as Doc); }

    constructor(props: Readonly<FieldViewProps>) {
        super(props);

        // onClick play script
        if (!AudioBox.RangeScript) {
            AudioBox.RangeScript = ScriptField.MakeScript(`scriptContext.playFrom((this.audioStart), (this.audioEnd))`, { scriptContext: "any" })!;
        }

        if (!AudioBox.LabelScript) {
            AudioBox.LabelScript = ScriptField.MakeScript(`scriptContext.playFrom((this.audioStart))`, { scriptContext: "any" })!;
        }
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
                        const linkTime = Doc.AreProtosEqual(l.anchor1 as Doc, this.dataDoc) ? NumCast(l.anchor1_timecode) : NumCast(l.anchor2_timecode);
                        setTimeout(() => { this.playFromTime(linkTime); Doc.linkFollowHighlight(l); }, 250);
                    });
                    Doc.SetInPlace(this.layoutDoc, "scrollToLinkID", undefined, false);
                }
            }, { fireImmediately: true });

        // for play when link is selected
        this._reactionDisposer = reaction(() => SelectionManager.SelectedDocuments(),
            selected => {
                const sel = selected.length ? selected[0].props.Document : undefined;
                let link;
                if (sel) {
                    // for determining if the link is created after recording (since it will use linkTime rather than creation date)
                    DocListCast(this.dataDoc.links).map((l, i) => {
                        let la1 = l.anchor1 as Doc;
                        let la2 = l.anchor2 as Doc;
                        if (la1 === sel || la2 === sel) { // if the selected document is linked to this audio 
                            let linkTime = NumCast(l.anchor2_timecode);
                            let endTime;
                            if (Doc.AreProtosEqual(la1, this.dataDoc)) {
                                la1 = l.anchor2 as Doc;
                                la2 = l.anchor1 as Doc;
                                linkTime = NumCast(l.anchor1_timecode);
                            }
                            if (la2.audioStart) {
                                linkTime = NumCast(la2.audioStart);
                            }

                            if (la1.audioStart) {
                                linkTime = NumCast(la1.audioStart);
                            }

                            if (la1.audioEnd) {
                                endTime = NumCast(la1.audioEnd);
                            }

                            if (la2.audioEnd) {
                                endTime = NumCast(la2.audioEnd);
                            }

                            if (linkTime) {
                                link = true;
                                this.layoutDoc.playOnSelect && this.recordingStart && sel && !Doc.AreProtosEqual(sel, this.props.Document) && (endTime ? this.playFrom(linkTime, endTime) : this.playFrom(linkTime));
                            }
                        }
                    });
                }

                // for links created during recording 
                if (!link) {
                    this.layoutDoc.playOnSelect && this.recordingStart && sel && sel.creationDate && !Doc.AreProtosEqual(sel, this.props.Document) && this.playFromTime(DateCast(sel.creationDate).date.getTime());
                    this.layoutDoc.playOnSelect && this.recordingStart && !sel && this.pause();
                }
            });
        this._scrubbingDisposer = reaction(() => AudioBox._scrubTime, (time) => this.layoutDoc.playOnSelect && this.playFromTime(AudioBox._scrubTime));
    }

    // for updating the timecode
    timecodeChanged = () => {
        const htmlEle = this._ele;
        if (this.audioState !== "recording" && htmlEle) {
            htmlEle.duration && htmlEle.duration !== Infinity && runInAction(() => this.dataDoc.duration = htmlEle.duration);
            DocListCast(this.dataDoc.links).map(l => {
                let la1 = l.anchor1 as Doc;
                let linkTime = NumCast(l.anchor2_timecode);
                if (Doc.AreProtosEqual(la1, this.dataDoc)) {
                    linkTime = NumCast(l.anchor1_timecode);
                    la1 = l.anchor2 as Doc;
                }
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
    playFrom = (seekTimeInSeconds: number, endTime: number = this.dataDoc.duration) => {
        let play;
        clearTimeout(play);
        this._duration = endTime - seekTimeInSeconds;
        if (this._ele && AudioBox.Enabled) {
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
                if (endTime !== this.dataDoc.duration) {
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
            if (this._paused) {
                setTimeout(this.updateRecordTime, 30);
                this._pausedTime += (new Date().getTime() - this._recordStart) / 1000;
            } else {
                setTimeout(this.updateRecordTime, 30);
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
        return (this._pauseEnd - this._pauseStart);
    }

    // starting the drag event for marker resizing
    @action
    onPointerDownTimeline = (e: React.PointerEvent): void => {
        e.stopPropagation();
        e.preventDefault();
        this._isPointerDown = true;
        this._timeline?.setPointerCapture(e.pointerId);

        this.start(this._ele!.currentTime);

        const rect = (e.target as any).getBoundingClientRect();
        this._containerX = this._currX = (e.clientX - rect.x) / rect.width * NumCast(this.dataDoc.duration);

        document.removeEventListener("pointermove", this.onPointerMoveTimeline);
        document.addEventListener("pointermove", this.onPointerMoveTimeline);
        document.removeEventListener("pointerup", this.onPointerUpTimeline);
        document.addEventListener("pointerup", this.onPointerUpTimeline);
    }

    // ending the drag event for marker resizing
    @action
    onPointerUpTimeline = (e: PointerEvent): void => {
        e.stopPropagation();
        e.preventDefault();
        this._isPointerDown = false;

        const rect = (e.target as any).getBoundingClientRect();
        const time = (e.clientX - rect.x) / rect.width * NumCast(this.dataDoc.duration);

        // if drag is greater than 15px (didn't use setupMoveEvent)
        (this._visible && Math.abs(this._currX - this._containerX) * rect.width / NumCast(this.dataDoc.duration) > 15) ? this.end(time) : this._start = 0;
        this._visible = false;

        this._containerX = 0;
        this._timeline?.releasePointerCapture(e.pointerId);

        document.removeEventListener("pointermove", this.onPointerMoveTimeline);
        document.removeEventListener("pointerup", this.onPointerUpTimeline);
    }

    // resizes the marker while dragging
    @action
    onPointerMoveTimeline = (e: PointerEvent) => {
        e.stopPropagation();
        e.preventDefault();

        if (!this._isPointerDown) {
            return;
        }
        this._visible = true;
        const rect = (e.target as any).getBoundingClientRect();

        this._currX = (e.clientX - rect.x) / rect.width * NumCast(this.dataDoc.duration);

        (this._currX - this._containerX < 0) ? this._invertedX = true : this._invertedX = false;
    }

    // returns the selection container 
    @computed get container() {
        return <div className="audiobox-container" style={{ left: !this._invertedX ? `${NumCast(this._containerX) / NumCast(this.dataDoc.duration, 1) * 100}%` : `${this._currX / NumCast(this.dataDoc.duration, 1) * 100}%`, width: `${Math.abs(this._containerX - this._currX) / NumCast(this.dataDoc.duration, 1) * 100}%`, height: "100%", top: "0%" }}></div>
    }

    // creates a new label 
    @action
    newMarker(marker: Doc) {
        marker.data = "";
        if (this.dataDoc[this.annotationKey]) {
            this.dataDoc[this.annotationKey].push(marker);
        } else {
            this.dataDoc[this.annotationKey] = new List<Doc>([marker]);
        }
    }

    // the starting time of the marker
    start(startingPoint: number) {
        this._hold = true;
        this._start = startingPoint;
    }

    // creates a new marker
    @action
    end(marker: number) {
        this._hold = false;
        const newMarker = this._invertedX ?
            Docs.Create.LabelDocument({ title: ComputedField.MakeFunction(`formatToTime(self.audioStart) + "-" + formatToTime(self.audioEnd)`) as any, isLabel: false, useLinkSmallAnchor: true, hideLinkButton: true, audioStart: marker, audioEnd: this._start, _showSidebar: false, _autoHeight: true, annotationOn: this.props.Document })
            :
            Docs.Create.LabelDocument({ title: ComputedField.MakeFunction(`formatToTime(self.audioStart) + "-" + formatToTime(self.audioEnd)`) as any, isLabel: false, useLinkSmallAnchor: true, hideLinkButton: true, audioStart: this._start, audioEnd: marker, _showSidebar: false, _autoHeight: true, annotationOn: this.props.Document });
        newMarker.data = "";
        if (this.dataDoc[this.annotationKey]) {
            this.dataDoc[this.annotationKey].push(newMarker);
        } else {
            this.dataDoc[this.annotationKey] = new List<Doc>([newMarker]);
        }

        this._start = 0;
    }

    // starting the drag event for marker resizing
    onPointerDown = (e: React.PointerEvent, m: any, left: boolean): void => {
        e.stopPropagation();
        e.preventDefault();
        this._isPointerDown = true;
        this._currMarker = m;
        this._timeline?.setPointerCapture(e.pointerId);
        this._left = left;

        document.removeEventListener("pointermove", this.onPointerMove);
        document.addEventListener("pointermove", this.onPointerMove);
        document.removeEventListener("pointerup", this.onPointerUp);
        document.addEventListener("pointerup", this.onPointerUp);
    }

    // ending the drag event for marker resizing
    @action
    onPointerUp = (e: PointerEvent): void => {
        e.stopPropagation();
        e.preventDefault();
        this._isPointerDown = false;
        this._dragging = false;

        const rect = (e.target as any).getBoundingClientRect();
        this._ele!.currentTime = this.layoutDoc.currentTimecode = (e.clientX - rect.x) / rect.width * NumCast(this.dataDoc.duration);

        this._timeline?.releasePointerCapture(e.pointerId);

        document.removeEventListener("pointermove", this.onPointerMove);
        document.removeEventListener("pointerup", this.onPointerUp);
    }

    // resizes the marker while dragging
    onPointerMove = async (e: PointerEvent) => {
        e.stopPropagation();
        e.preventDefault();

        if (!this._isPointerDown) {
            return;
        }

        const rect = await (e.target as any).getBoundingClientRect();

        const newTime = (e.clientX - rect.x) / rect.width * NumCast(this.dataDoc.duration);

        this.changeMarker(this._currMarker, newTime);
    }

    // updates the marker with the new time
    @action
    changeMarker = (m: any, time: any) => {
        DocListCast(this.dataDoc[this.annotationKey]).forEach((marker: Doc) => {
            if (this.isSame(marker, m)) {
                this._left ? marker.audioStart = time : marker.audioEnd = time;
            }
        });
    }

    // checks if the two markers are the same with start and end time
    isSame = (m1: any, m2: any) => {
        if (m1.audioStart === m2.audioStart && m1.audioEnd === m2.audioEnd) {
            return true;
        }
        return false;
    }

    // instantiates a new array of size 500 for marker layout
    markers = () => {
        const increment = NumCast(this.layoutDoc.duration) / 500;
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

    // returns the audio waveform
    @computed get waveform() {
        return <Waveform
            color={"darkblue"}
            height={this._waveHeight}
            barWidth={0.1}
            // pos={this.layoutDoc.currentTimecode} need to correctly resize parent to make this work (not very necessary for function)
            pos={this.dataDoc.duration}
            duration={this.dataDoc.duration}
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

    // for updating the width and height of the waveform with timeline ref
    timelineRef = (timeline: HTMLDivElement) => {
        const observer = new _global.ResizeObserver(action((entries: any) => {
            for (const entry of entries) {
                this.update(entry.contentRect.width, entry.contentRect.height);
                this._position = entry.contentRect.width;
            }
        }));
        timeline && observer.observe(timeline);

        this._timeline = timeline;
    }

    // update the width and height of the audio waveform
    @action
    update = (width: number, height: number) => {
        if (height) {
            const height = 0.8 * NumCast(this.layoutDoc._height);
            let canvas2 = document.getElementsByTagName("canvas")[0];
            if (canvas2) {
                let oldWidth = canvas2.width;
                let oldHeight = canvas2.height;
                canvas2.style.height = `${height}`;
                canvas2.style.width = `${width}`;

                const ratio1 = oldWidth / window.innerWidth;
                const ratio2 = oldHeight / window.innerHeight;
                const context = canvas2.getContext('2d');
                if (context) {
                    context.scale(ratio1, ratio2);
                }
            }

            const canvas1 = document.getElementsByTagName("canvas")[1];
            if (canvas1) {
                const oldWidth = canvas1.width;
                const oldHeight = canvas1.height;
                canvas1.style.height = `${height}`;
                canvas1.style.width = `${width}`;

                const ratio1 = oldWidth / window.innerWidth;
                const ratio2 = oldHeight / window.innerHeight;
                const context = canvas1.getContext('2d');
                if (context) {
                    context.scale(ratio1, ratio2);
                }

                const parent = canvas1.parentElement;
                if (parent) {
                    parent.style.width = `${width}`;
                    parent.style.height = `${height}`;
                }
            }
        }
    }

    rangeScript = () => AudioBox.RangeScript;

    labelScript = () => AudioBox.LabelScript;

    // for indicating the first marker that is rendered
    reset = () => this._first = true;

    render() {
        const interactive = this.active() ? "-interactive" : "";
        this.reset();
        this.path && this._buckets.length !== 100 ? this.peaks : null; // render waveform if audio is done recording
        return <div className={`audiobox-container`} onContextMenu={this.specificContextMenu} onClick={!this.path ? this.recordClick : undefined}>
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
                        <div className="audiobox-timeline" ref={this.timelineRef} onClick={e => { e.stopPropagation(); e.preventDefault(); }}
                            onPointerDown={e => {
                                e.stopPropagation();
                                e.preventDefault();
                                if (e.button === 0 && !e.ctrlKey) {
                                    const rect = (e.target as any).getBoundingClientRect();


                                    if (e.target as HTMLElement !== document.getElementById("current")) {
                                        const wasPaused = this.audioState === "paused";
                                        this._ele!.currentTime = this.layoutDoc.currentTimecode = (e.clientX - rect.x) / rect.width * NumCast(this.dataDoc.duration);
                                        wasPaused && this.pause();
                                    }

                                    this.onPointerDownTimeline(e);
                                }
                                if (e.button === 0 && e.shiftKey) {
                                    this.newMarker(Docs.Create.LabelDocument({ title: ComputedField.MakeFunction(`formatToTime(self.audioStart)`) as any, useLinkSmallAnchor: true, hideLinkButton: true, isLabel: true, audioStart: this._ele!.currentTime, _showSidebar: false, _autoHeight: true, annotationOn: this.props.Document }));
                                }

                                // if (e.button === 0 && e.shiftKey) {
                                //     const rect = (e.target as any).getBoundingClientRect();
                                //     this._ele!.currentTime = this.layoutDoc.currentTimecode = (e.clientX - rect.x) / rect.width * NumCast(this.dataDoc.duration);
                                //     this._hold ? this.end(this._ele!.currentTime) : this.start(this._ele!.currentTime);
                                // }
                            }}>
                            <div className="waveform" id="waveform" style={{ height: `${100}%`, width: "100%", bottom: "0px", pointerEvents: "none" }}>
                                {this.waveform}
                            </div>
                            {DocListCast(this.dataDoc[this.annotationKey]).map((m, i) => {
                                let rect;
                                (!m.isLabel) ?
                                    (this.layoutDoc.hideMarkers) ? (null) :
                                        rect =
                                        <div key={i} id={"audiobox-marker-container1"} className={this.props.PanelHeight() < 32 ? "audiobox-marker-minicontainer" : "audiobox-marker-container1"}
                                            title={`${formatTime(Math.round(NumCast(m.audioStart)))}` + " - " + `${formatTime(Math.round(NumCast(m.audioEnd)))}`}
                                            style={{
                                                left: `${NumCast(m.audioStart) / NumCast(this.dataDoc.duration, 1) * 100}%`,
                                                width: `${(NumCast(m.audioEnd) - NumCast(m.audioStart)) / NumCast(this.dataDoc.duration, 1) * 100}%`, height: `${1 / (this.dataDoc.markerAmount + 1) * 100}%`,
                                                top: `${this.isOverlap(m) * 1 / (this.dataDoc.markerAmount + 1) * 100}%`
                                            }}
                                            onClick={e => { this.playFrom(NumCast(m.audioStart), NumCast(m.audioEnd)); e.stopPropagation(); }} >
                                            <div className="left-resizer" onPointerDown={e => this.onPointerDown(e, m, true)}></div>
                                            <DocumentView {...this.props}
                                                Document={m}
                                                pointerEvents={true}
                                                NativeHeight={returnZero}
                                                NativeWidth={returnZero}
                                                rootSelected={returnFalse}
                                                LayoutTemplate={undefined}
                                                ContainingCollectionDoc={this.props.Document}
                                                removeDocument={this.removeDocument}
                                                parentActive={returnTrue}
                                                onClick={this.layoutDoc.playOnClick ? this.rangeScript : undefined}
                                                ignoreAutoHeight={false}
                                                bringToFront={emptyFunction}
                                                scriptContext={this} />
                                            <div className="resizer" onPointerDown={e => this.onPointerDown(e, m, false)}></div>
                                        </div>
                                    :
                                    (this.layoutDoc.hideLabels) ? (null) :
                                        rect =
                                        <div className={this.props.PanelHeight() < 32 ? "audiobox-marker-minicontainer" : "audiobox-marker-container"} key={i} style={{ left: `${NumCast(m.audioStart) / NumCast(this.dataDoc.duration, 1) * 100}%` }}>
                                            <DocumentView {...this.props}
                                                Document={m}
                                                pointerEvents={true}
                                                NativeHeight={returnZero}
                                                NativeWidth={returnZero}
                                                rootSelected={returnFalse}
                                                LayoutTemplate={undefined}
                                                ContainingCollectionDoc={this.props.Document}
                                                removeDocument={this.removeDocument}
                                                parentActive={returnTrue}
                                                onClick={this.layoutDoc.playOnClick ? this.labelScript : undefined}
                                                ignoreAutoHeight={false}
                                                bringToFront={emptyFunction}
                                                scriptContext={this} />
                                        </div>;
                                return rect;
                            })}
                            {DocListCast(this.dataDoc.links).map((l, i) => {

                                let la1 = l.anchor1 as Doc;
                                let la2 = l.anchor2 as Doc;
                                let linkTime = NumCast(l.anchor2_timecode);
                                if (Doc.AreProtosEqual(la1, this.dataDoc)) {
                                    la1 = l.anchor2 as Doc;
                                    la2 = l.anchor1 as Doc;
                                    linkTime = NumCast(l.anchor1_timecode);
                                }

                                if (la2.audioStart && !la2.audioEnd) {
                                    linkTime = NumCast(la2.audioStart);
                                }

                                return !linkTime ? (null) :
                                    <div className={this.props.PanelHeight() < 32 ? "audiobox-marker-minicontainer" : "audiobox-marker-container"} key={l[Id]} style={{ left: `${linkTime / NumCast(this.dataDoc.duration, 1) * 100}%` }} onClick={e => e.stopPropagation()}>
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
                                            onPointerDown={e => { if (e.button === 0 && !e.ctrlKey) { const wasPaused = this.audioState === "paused"; this.playFrom(linkTime); e.stopPropagation(); e.preventDefault(); } }} />
                                    </div>;
                            })}
                            {this._visible ? this.container : null}

                            <div className="audiobox-current" id="current" onClick={e => { e.stopPropagation(); e.preventDefault(); }} style={{ left: `${NumCast(this.layoutDoc.currentTimecode) / NumCast(this.dataDoc.duration, 1) * 100}%`, pointerEvents: "none" }} />
                            {this.audio}
                        </div>
                        <div className="current-time">
                            {formatTime(Math.round(NumCast(this.layoutDoc.currentTimecode)))}
                        </div>
                        <div className="total-time">
                            {formatTime(Math.round(NumCast(this.dataDoc.duration)))}
                        </div>
                    </div>
                </div>
            }
        </div>;
    }
}
Scripting.addGlobal(function formatToTime(time: number): any { return formatTime(time); });