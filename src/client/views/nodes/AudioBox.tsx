import React = require("react");
import { FieldViewProps, FieldView } from './FieldView';
import { observer } from "mobx-react";
import "./AudioBox.scss";
import { Cast, DateCast, NumCast, FieldValue, ScriptCast } from "../../../fields/Types";
import { AudioField, nullAudio } from "../../../fields/URLField";
import { ViewBoxAnnotatableComponent } from "../DocComponent";
import { makeInterface, createSchema } from "../../../fields/Schema";
import { documentSchema } from "../../../fields/documentSchemas";
import { Utils, returnTrue, emptyFunction, returnOne, returnTransparent, returnFalse, returnZero, formatTime } from "../../../Utils";
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
import Waveform from "react-audio-waveform"
import axios from "axios"
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
    _amount: number = 1;
    _markers: Array<any> = [];
    _first: boolean = false;
    _dragging = false;

    _count: Array<any> = [];
    _timeline: Opt<HTMLDivElement>;
    _duration = 0;

    private _isPointerDown = false;
    private _currMarker: any;

    @observable _position: number = 0;
    @observable _buckets: Array<number> = new Array<number>();
    @observable private _height: number = NumCast(this.layoutDoc.height);
    @observable private _paused: boolean = false;
    @observable private static _scrubTime = 0;
    @observable private _repeat: boolean = false;
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
                    // for determining if the link is created after recording (since it will use linkTIme rather than creation date)
                    DocListCast(sel.links).map((l, i) => {
                        let la1 = l.anchor1 as Doc;
                        let la2 = l.anchor2 as Doc;
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
                            this.layoutDoc.playOnSelect && this.recordingStart && sel && !Doc.AreProtosEqual(sel, this.props.Document) && endTime ? this.playFrom(linkTime, endTime) : this.playFrom(linkTime);
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

    pause = action(() => {
        if (this._repeat) {
            this.playFrom(0);
        } else {
            this._ele!.pause();
            this.audioState = "paused";
        }
    });

    playFromTime = (absoluteTime: number) => {
        this.recordingStart && this.playFrom((absoluteTime - this.recordingStart) / 1000);
    }

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
                console.log("playing");
                this._ele.currentTime = seekTimeInSeconds;
                this._ele.play();
                runInAction(() => this.audioState = "playing");
                if (endTime !== this.dataDoc.duration) {
                    play = setTimeout(() => this.pause(), (this._duration) * 1000);
                }
            } else { // this is getting called because time is greater than duration
                this.pause();
            }
        }
    }


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

    specificContextMenu = (e: React.MouseEvent): void => {
        const funcs: ContextMenuProps[] = [];
        funcs.push({ description: (this.layoutDoc.playOnSelect ? "Don't play" : "Play") + " when link is selected", event: () => this.layoutDoc.playOnSelect = !this.layoutDoc.playOnSelect, icon: "expand-arrows-alt" });
        funcs.push({ description: (this.layoutDoc.hideMarkers ? "Don't hide" : "Hide") + " markers", event: () => this.layoutDoc.hideMarkers = !this.layoutDoc.hideMarkers, icon: "expand-arrows-alt" });
        funcs.push({ description: (this.layoutDoc.hideLabels ? "Don't hide" : "Hide") + " labels", event: () => this.layoutDoc.hideLabels = !this.layoutDoc.hideLabels, icon: "expand-arrows-alt" });
        funcs.push({ description: (this.layoutDoc.playOnClick ? "Don't play" : "Play") + " markers onClick", event: () => this.layoutDoc.playOnClick = !this.layoutDoc.playOnClick, icon: "expand-arrows-alt" });
        ContextMenu.Instance?.addItem({ description: "Options...", subitems: funcs, icon: "asterisk" });
    }

    stopRecording = action(() => {
        this._recorder.stop();
        this._recorder = undefined;
        this.dataDoc.duration = (new Date().getTime() - this._recordStart - this.pauseTime) / 1000;
        this.audioState = "paused";
        this._stream?.getAudioTracks()[0].stop();
        const ind = DocUtils.ActiveRecordings.indexOf(this.props.Document);
        ind !== -1 && (DocUtils.ActiveRecordings.splice(ind, 1));
    });

    recordClick = (e: React.MouseEvent) => {
        if (e.button === 0 && !e.ctrlKey) {
            this._recorder ? this.stopRecording() : this.recordAudioAnnotation();
            e.stopPropagation();
        }
    }

    onPlay = (e: any) => {
        this.playFrom(this._ele!.paused ? this._ele!.currentTime : -1);
        e.stopPropagation();
    }
    onStop = (e: any) => {
        this.layoutDoc.playOnSelect = !this.layoutDoc.playOnSelect;
        e.stopPropagation();
    }
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

    setRef = (e: HTMLAudioElement | null) => {
        e?.addEventListener("timeupdate", this.timecodeChanged);
        e?.addEventListener("ended", this.pause);
        this._ele = e;
    }

    @computed get path() {
        const field = Cast(this.props.Document[this.props.fieldKey], AudioField);
        const path = (field instanceof AudioField) ? field.url.href : "";
        return path === nullAudio ? "" : path;
    }

    // @action
    // buckets = () => {
    //     let audioCtx = new (window.AudioContext)();
    //     const buckets: number[] = [];

    //     axios({ url: this.path, responseType: "arraybuffer" })
    //         .then(response => runInAction(() => {
    //             let audioData = response.data;

    //             audioCtx.decodeAudioData(audioData, buffer => {
    //                 let decodedAudioData = buffer.getChannelData(0);
    //                 const NUMBER_OF_BUCKETS = 100;
    //                 let bucketDataSize = Math.floor(decodedAudioData.length / NUMBER_OF_BUCKETS);

    //                 for (let i = 0; i < NUMBER_OF_BUCKETS; i++) {
    //                     let startingPoint = i * bucketDataSize;
    //                     let endingPoint = i * bucketDataSize + bucketDataSize;
    //                     let max = 0;
    //                     for (let j = startingPoint; j < endingPoint; j++) {
    //                         if (decodedAudioData[j] > max) {
    //                             max = decodedAudioData[j];
    //                         }
    //                     }
    //                     let size = Math.abs(max);
    //                     buckets.push(size / 2);
    //                 }

    //             });
    //             return buckets
    //         }));
    // }

    @action
    buckets = async () => {
        let audioCtx = new (window.AudioContext)();
        const buckets: number[] = [];

        axios({ url: this.path, responseType: "arraybuffer" })
            .then(response => {
                let audioData = response.data;

                audioCtx.decodeAudioData(audioData, action(buffer => {
                    let decodedAudioData = buffer.getChannelData(0);
                    const NUMBER_OF_BUCKETS = 100;
                    let bucketDataSize = Math.floor(decodedAudioData.length / NUMBER_OF_BUCKETS);

                    for (let i = 0; i < NUMBER_OF_BUCKETS; i++) {
                        let startingPoint = i * bucketDataSize;
                        let endingPoint = i * bucketDataSize + bucketDataSize;
                        let max = 0;
                        for (let j = startingPoint; j < endingPoint; j++) {
                            if (decodedAudioData[j] > max) {
                                max = decodedAudioData[j];
                            }
                        }
                        let size = Math.abs(max);
                        buckets.push(size / 2);
                        this._buckets.push(size / 2);
                    }

                }));
                return buckets;
            });
    }

    @computed get peaks() {
        // let audioCtx = new (window.AudioContext)();
        // let buckets: number[] = [];

        // return (async () => {
        //     await axios({ url: this.path, responseType: "arraybuffer" })
        //         .then(response => {
        //             let audioData = response.data;

        //             audioCtx.decodeAudioData(audioData, buffer => {
        //                 let decodedAudioData = buffer.getChannelData(0);
        //                 const NUMBER_OF_BUCKETS = 100;
        //                 let bucketDataSize = Math.floor(decodedAudioData.length / NUMBER_OF_BUCKETS);



        //                 for (let i = 0; i < NUMBER_OF_BUCKETS; i++) {
        //                     let startingPoint = i * bucketDataSize;
        //                     let endingPoint = i * bucketDataSize + bucketDataSize;
        //                     let max = 0;
        //                     for (let j = startingPoint; j < endingPoint; j++) {
        //                         if (decodedAudioData[j] > max) {
        //                             max = decodedAudioData[j];
        //                         }
        //                     }
        //                     let size = Math.abs(max);
        //                     console.log(size);
        //                     buckets.push(size / 2);
        //                     console.log(buckets);
        //                 }
        //             });
        //             console.log(buckets);
        //             return buckets;
        //         });
        //     console.log(buckets.length);
        //     return buckets;
        // })();


        return this.buckets();
    }

    @computed get audio() {
        const interactive = this.active() ? "-interactive" : "";
        return <audio ref={this.setRef} className={`audiobox-control${interactive}`}>
            <source src={this.path} type="audio/mpeg" />
            Not supported.
        </audio>;
    }

    @action
    onRepeat = (e: React.MouseEvent) => {
        this._repeat = !this._repeat;
        e.stopPropagation();
    }

    @action
    recordPause = (e: React.MouseEvent) => {
        this._pauseStart = new Date().getTime();
        this._paused = true;
        this._recorder.pause();
        e.stopPropagation();

    }

    @action
    recordPlay = (e: React.MouseEvent) => {
        this._pauseEnd = new Date().getTime();
        this._paused = false;
        this._recorder.resume();
        e.stopPropagation();

    }

    @computed get pauseTime() {
        return (this._pauseEnd - this._pauseStart);
    }

    @action
    newMarker(marker: Doc) {
        if (this.dataDoc[this.annotationKey]) {
            this.dataDoc[this.annotationKey].push(marker);
        } else {
            this.dataDoc[this.annotationKey] = new List<Doc>([marker]);
        }
    }

    start(marker: number) {
        console.log("start!");
        this._hold = true;
        this._start = marker;
    }

    @action
    end(marker: number) {
        console.log("end!");
        this._hold = false;
        //this._markers.push(Docs.Create.LabelDocument({ isLabel: false, audioStart: this._start, audioEnd: marker, _showSidebar: false, _autoHeight: true, annotationOn: this.props.Document }))
        let newMarker = Docs.Create.LabelDocument({ title: ComputedField.MakeFunction(`formatToTime(self.audioStart) + "-" + formatToTime(self.audioEnd)`) as any, isLabel: false, useLinkSmallAnchor: true, hideLinkButton: true, audioStart: this._start, audioEnd: marker, _showSidebar: false, _autoHeight: true, annotationOn: this.props.Document });
        newMarker.data = "";
        if (this.dataDoc[this.annotationKey]) {
            this.dataDoc[this.annotationKey].push(newMarker); // onClick: ScriptField.MakeScript(`playFrom(${NumCast(this._start)}, ${NumCast(marker)})`)
        } else {
            this.dataDoc[this.annotationKey] = new List<Doc>([newMarker]);
        }


        this._start = 0;
        this._amount++;
    }

    onPointerDown = (e: React.PointerEvent, m: any, left: boolean): void => {
        e.stopPropagation();
        e.preventDefault();
        this._isPointerDown = true;
        console.log("click");
        this._currMarker = m;
        this._timeline?.setPointerCapture(e.pointerId);
        this._left = left;


        document.removeEventListener("pointermove", this.onPointerMove);
        document.addEventListener("pointermove", this.onPointerMove);
        document.removeEventListener("pointerup", this.onPointerUp);
        document.addEventListener("pointerup", this.onPointerUp);
    }

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

    onPointerMove = async (e: PointerEvent) => {
        e.stopPropagation();
        e.preventDefault();
        console.log("drag");

        if (!this._isPointerDown) {
            return;
        }

        const rect = await (e.target as any).getBoundingClientRect();

        // if (e.target as HTMLElement === document.getElementById("timeline")) {

        let newTime = (e.clientX - rect.x) / rect.width * NumCast(this.dataDoc.duration);

        this.changeMarker(this._currMarker, newTime);
        // }
    }

    @action
    changeMarker = (m: any, time: any) => {
        for (let i = 0; i < this.dataDoc[this.annotationKey].length; i++) {
            if (this.isSame(this.dataDoc[this.annotationKey][i], m)) {
                // this._left ? this._markers[i][0] = time : this._markers[i][1] = time;
                this._left ? this.dataDoc[this.annotationKey][i].audioStart = time : this.dataDoc[this.annotationKey][i].audioEnd = time;
            }
        }
    }

    isSame = (m1: any, m2: any) => {
        if (m1.audioStart === m2.audioStart && m1.audioEnd === m2.audioEnd) {
            return true;
        }
        return false;
    }

    markers = () => {
        const increment = NumCast(this.layoutDoc.duration) / 500;
        this._count = [];
        for (let i = 0; i < 500; i++) {
            this._count.push([increment * i, 0])
        }

    }

    // Probably need a better way to format
    // isOverlap = (m: any, i: number) => {
    //     console.log("called");
    //     let counter = 0;

    //     if (this._first) {
    //         this._markers = [];
    //         this._first = false;
    //     }
    //     for (let i = 0; i < this._markers.length; i++) {
    //         if ((m.audioEnd > this._markers[i].audioStart && m.audioStart < this._markers[i].audioEnd)) {
    //             counter++;
    //             console.log(counter);
    //         }
    //     }

    //     if (this.dataDoc.markerAmount < counter) {
    //         this.dataDoc.markerAmount = counter;
    //     }

    //     this._markers.push(m);

    //     return counter;
    // }

    isOverlap = (m: any) => {
        if (this._first) {
            this._first = false;
            this.markers();
        }


        let max = 0

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
        return max - 1
    }


    @action
    onHover = () => {
        this._dragging = true;
    }

    @action
    onLeave = () => {
        this._dragging = false;
    }
    // onMouseOver={this.onHover} onMouseLeave={this.onLeave}

    change = (e: React.PointerEvent) => {
        e.stopPropagation();
        e.preventDefault();
        const rect = (e.target as any).getBoundingClientRect();

        const wasPaused = this.audioState === "paused";
        this._ele!.currentTime = this.layoutDoc.currentTimecode = (e.clientX - rect.x) / rect.width * NumCast(this.dataDoc.duration);
        wasPaused && this.pause();
        console.log("double!");
    }

    rangeScript = () => AudioBox.RangeScript;

    labelScript = () => AudioBox.LabelScript;

    // see if time is encapsulated by comparing time on both sides (for moving onto a new row in the timeline for the markers)
    check = (e: React.PointerEvent) => {
        if (e.target as HTMLElement === document.getElementById("timeline")) {
            return true;
        }
    }

    reset = () => {
        this._first = true;
    }

    @computed get height() {
        console.log(this.layoutDoc._height);
        if (this.layoutDoc._height) {
            return 0.8 * NumCast(this.layoutDoc._height)
        }
    }

    // waveform() {
    //     let wavesurfer: any;
    //     if (WaveSurfer) {
    //         this.path ?
    //             wavesurfer = WaveSurfer.create({
    //                 container: 'waveform',
    //                 waveColor: "grey",
    //                 progressColor: "blue"
    //             })
    //             :
    //             wavesurfer = (null);
    //     } else {
    //         console.log("hi");
    //     }

    //     if (wavesurfer) {
    //         wavesurfer.on('ready', function () {
    //             wavesurfer.play();
    //         });

    //         wavesurfer.load(this.path);
    //         console.log("hi");
    //     }
    // }

    @computed get waveform() {
        return <Waveform
            color={"darkblue"}
            height={this._height}
            barWidth={0.1}
            // pos={this.layoutDoc.currentTimecode}
            pos={this.dataDoc.duration}
            duration={this.dataDoc.duration}
            peaks={this._buckets.length === 100 ? this._buckets : undefined}
            progressColor={"blue"} />;
    }

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

    @action
    update = (width: number, height: number) => {
        if (height) {
            this._height = 0.8 * NumCast(this.layoutDoc._height);
            let canvas2 = document.getElementsByTagName("canvas")[0];
            if (canvas2) {
                let oldWidth = canvas2.width;
                let oldHeight = canvas2.height;
                canvas2.style.height = `${this._height}`;
                canvas2.style.width = `${width}`;

                let ratio1 = oldWidth / window.innerWidth;
                let ratio2 = oldHeight / window.innerHeight;
                let context = canvas2.getContext('2d');
                if (context) {
                    context.scale(ratio1, ratio2)
                }


            }

            let canvas1 = document.getElementsByTagName("canvas")[1];
            if (canvas1) {
                let oldWidth = canvas1.width;
                let oldHeight = canvas1.height;
                canvas1.style.height = `${this._height}`;
                canvas1.style.width = `${width}`;

                let ratio1 = oldWidth / window.innerWidth;
                let ratio2 = oldHeight / window.innerHeight;
                let context = canvas1.getContext('2d');
                if (context) {
                    context.scale(ratio1, ratio2)
                }

                // let parent = canvas1.parentElement;
                // if (parent) {
                //     parent.style.width = `${NumCast(this.layoutDoc.currentTimecode) / NumCast(this.dataDoc.duration) * width}`;
                //     parent.style.height = `${this._height}`;
                // }
            }
        }
    }


    render() {
        trace();
        const interactive = this.active() ? "-interactive" : "";
        this.reset();
        // this.waveform();
        this.path && this._buckets.length !== 100 ? this.buckets() : null;
        return <div className={`audiobox-container`} onContextMenu={this.specificContextMenu} onClick={!this.path ? this.recordClick : undefined}>
            {!this.path ?
                <div className="audiobox-buttons">
                    <div className="audiobox-dictation" onClick={this.onFile}>
                        <FontAwesomeIcon style={{ width: "30px", background: this.layoutDoc.playOnSelect ? "yellow" : "rgba(0,0,0,0)" }} icon="file-alt" size={this.props.PanelHeight() < 36 ? "1x" : "2x"} />
                    </div>
                    {/* <button className={`audiobox-record${interactive}`} style={{ backgroundColor: this.audioState === "recording" ? "lightgrey" : "black" }}>
                        {this.audioState === "recording" ?
                            <div className="recording" style={{}}>
                                10:00
                                    <FontAwesomeIcon style={{ width: "100%" }} icon={"stop-circle"} size={this.props.PanelHeight() < 36 ? "1x" : "2x"} />
                                <FontAwesomeIcon style={{ width: "100%" }} icon={"pause"} size={this.props.PanelHeight() < 36 ? "1x" : "2x"} /> </div> : "RECORD"}
                    </button> */}
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
                <div className="audiobox-controls" > {/*onClick={this.layoutDoc.playOnSelect ? this.onPlay : undefined}*/}
                    <div className="audiobox-dictation"></div>
                    <div className="audiobox-player" >
                        <div className="audiobox-playhead" title={this.audioState === "paused" ? "play" : "pause"} onClick={this.onPlay}> <FontAwesomeIcon style={{ width: "100%", position: "absolute", left: "0px", top: "5px", borderWidth: "thin", borderColor: "white" }} icon={this.audioState === "paused" ? "play" : "pause"} size={"1x"} /></div>
                        {/* <div className="audiobox-playhead" onClick={this.onStop}><FontAwesomeIcon style={{ width: "100%", background: this.layoutDoc.playOnSelect ? "darkgrey" : "" }} icon="hand-point-left" size={this.props.PanelHeight() < 36 ? "1x" : "2x"} /></div>
                        <div className="audiobox-playhead" onClick={this.onRepeat}><FontAwesomeIcon style={{ width: "100%", background: this._repeat ? "darkgrey" : "" }} icon="redo-alt" size={this.props.PanelHeight() < 36 ? "1x" : "2x"} /></div> */}
                        <div className="audiobox-timeline" ref={this.timelineRef} onClick={e => { e.stopPropagation(); e.preventDefault(); }} onDoubleClick={e => this.change}
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
                                }
                                if (e.button === 0 && e.altKey) {
                                    this.newMarker(Docs.Create.LabelDocument({ title: ComputedField.MakeFunction(`formatToTime(self.audioStart)`) as any, useLinkSmallAnchor: true, hideLinkButton: true, isLabel: true, audioStart: this._ele!.currentTime, _showSidebar: false, _autoHeight: true, annotationOn: this.props.Document }));
                                }

                                if (e.button === 0 && e.shiftKey) {
                                    const rect = (e.target as any).getBoundingClientRect();
                                    this._ele!.currentTime = this.layoutDoc.currentTimecode = (e.clientX - rect.x) / rect.width * NumCast(this.dataDoc.duration);
                                    this._hold ? this.end(this._ele!.currentTime) : this.start(this._ele!.currentTime);
                                }
                            }}>
                            <div className="waveform" id="waveform" style={{ height: `${100}%`, width: "100%", bottom: "0px" }}>
                                {/* {console.log(this.peaks)} */}
                                {/* <Waveform
                                    color={"#000000"}
                                    height={this._height}
                                    barWidth={0.1}
                                    pos={this.layoutDoc.currentTimecode}
                                    duration={this.dataDoc.duration}
                                    peaks={this._buckets.length === 100 ? this._buckets : undefined}

                                    progressColor={"#0000ff"} /> */}
                                {this.waveform}
                                {/* {this.waveform} */}
                            </div>
                            {DocListCast(this.dataDoc[this.annotationKey]).map((m, i) => {
                                // let text = Docs.Create.TextDocument("hello", { title: "label", _showSidebar: false, _autoHeight: false });
                                let rect;
                                (!m.isLabel) ?
                                    (this.layoutDoc.hideMarkers) ? (null) :
                                        rect =
                                        <div className={this.props.PanelHeight() < 32 ? "audiobox-marker-minicontainer" : "audiobox-marker-container1"} title={`${formatTime(Math.round(NumCast(m.audioStart)))}` + " - " + `${formatTime(Math.round(NumCast(m.audioEnd)))}`} key={i} id={"audiobox-marker-container1"} style={{ left: `${NumCast(m.audioStart) / NumCast(this.dataDoc.duration, 1) * 100}%`, width: `${(NumCast(m.audioEnd) - NumCast(m.audioStart)) / NumCast(this.dataDoc.duration, 1) * 100}%`, height: `${1 / (this.dataDoc.markerAmount + 1) * 100}%`, top: `${this.isOverlap(m) * 1 / (this.dataDoc.markerAmount + 1) * 100}%` }} onClick={e => { this.playFrom(NumCast(m.audioStart), NumCast(m.audioEnd)); e.stopPropagation() }} >
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
                                            {/* <LabelBox {... this.props} Document={m} /> */}
                                            {/* <div className="click" onClick={e => { this.playFrom(NumCast(m.audioStart), NumCast(m.audioEnd)) }}></div> */}
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

                                if (la2.audioStart) {
                                    linkTime = NumCast(la2.audioStart);
                                }

                                return !linkTime ? (null) :
                                    <div className={this.props.PanelHeight() < 32 ? "audiobox-marker-minicontainer" : "audiobox-marker-container"} key={l[Id]} style={{ left: `${linkTime / NumCast(this.dataDoc.duration, 1) * 100}%` }} onClick={e => e.stopPropagation()}>
                                        {/* <div className={this.props.PanelHeight() < 32 ? "audioBox-linker-mini" : "audioBox-linker"} key={"linker" + i}> */}
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