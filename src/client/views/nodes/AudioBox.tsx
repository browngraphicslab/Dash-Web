import React = require("react");
import { FieldViewProps, FieldView } from './FieldView';
import { observer } from "mobx-react";
import "./AudioBox.scss";
import { Cast, DateCast, NumCast, FieldValue } from "../../../fields/Types";
import { AudioField, nullAudio } from "../../../fields/URLField";
import { ViewBoxBaseComponent } from "../DocComponent";
import { makeInterface, createSchema } from "../../../fields/Schema";
import { documentSchema } from "../../../fields/documentSchemas";
import { Utils, returnTrue, emptyFunction, returnOne, returnTransparent, returnFalse, returnZero } from "../../../Utils";
import { runInAction, observable, reaction, IReactionDisposer, computed, action, trace } from "mobx";
import { DateField } from "../../../fields/DateField";
import { SelectionManager } from "../../util/SelectionManager";
import { Doc, DocListCast } from "../../../fields/Doc";
import { ContextMenuProps } from "../ContextMenuItem";
import { ContextMenu } from "../ContextMenu";
import { Id } from "../../../fields/FieldSymbols";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { DocumentView } from "./DocumentView";
import { Docs, DocUtils } from "../../documents/Documents";
import { ComputedField } from "../../../fields/ScriptField";
import { Networking } from "../../Network";
import { LinkAnchorBox } from "./LinkAnchorBox";
import { FormattedTextBox } from "./formattedText/FormattedTextBox";
import { RichTextField } from "../../../fields/RichTextField";
import { AudioResizer } from "./AudioResizer";


// testing testing 

interface Window {
    MediaRecorder: MediaRecorder;
}

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
export class AudioBox extends ViewBoxBaseComponent<FieldViewProps, AudioDocument>(AudioDocument) {
    public static LayoutString(fieldKey: string) { return FieldView.LayoutString(AudioBox, fieldKey); }
    public static Enabled = false;

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

    private _isPointerDown = false;
    private _currMarker: any;

    @observable private _duration = 0;
    @observable private _rect: Array<any> = []
    @observable private _markers: Array<any> = [];
    @observable private _paused: boolean = false;
    @observable private static _scrubTime = 0;
    @observable private _repeat: boolean = false;
    @computed get audioState(): undefined | "recording" | "paused" | "playing" { return this.dataDoc.audioState as (undefined | "recording" | "paused" | "playing"); }
    set audioState(value) { this.dataDoc.audioState = value; }
    public static SetScrubTime = (timeInMillisFrom1970: number) => { runInAction(() => AudioBox._scrubTime = 0); runInAction(() => AudioBox._scrubTime = timeInMillisFrom1970); };

    @computed get recordingStart() { return Cast(this.dataDoc[this.props.fieldKey + "-recordingStart"], DateField)?.date.getTime(); }
    async slideTemplate() { return (await Cast((await Cast(Doc.UserDoc().slidesBtn, Doc) as Doc).dragFactory, Doc) as Doc); }

    componentWillUnmount() {
        this._reactionDisposer?.();
        this._linkPlayDisposer?.();
        this._scrubbingDisposer?.();
    }
    componentDidMount() {
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
        this._reactionDisposer = reaction(() => SelectionManager.SelectedDocuments(),
            selected => {
                const sel = selected.length ? selected[0].props.Document : undefined;
                this.layoutDoc.playOnSelect && this.recordingStart && sel && sel.creationDate && !Doc.AreProtosEqual(sel, this.props.Document) && this.playFromTime(DateCast(sel.creationDate).date.getTime());
                this.layoutDoc.playOnSelect && this.recordingStart && !sel && this.pause();
            });
        this._scrubbingDisposer = reaction(() => AudioBox._scrubTime, (time) => this.layoutDoc.playOnSelect && this.playFromTime(AudioBox._scrubTime));
    }

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
            } else {
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
        setTimeout(() => this._recorder && this.stopRecording(), 60 * 1000); // stop after an hour
    }

    specificContextMenu = (e: React.MouseEvent): void => {
        const funcs: ContextMenuProps[] = [];
        funcs.push({ description: (this.layoutDoc.playOnSelect ? "Don't play" : "Play") + " when document selected", event: () => this.layoutDoc.playOnSelect = !this.layoutDoc.playOnSelect, icon: "expand-arrows-alt" });

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
    newMarker(marker: number) {
        this._markers.push(marker);
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
        this._markers.push([this._start, marker]);
        this._start = 0;
    }

    onPointerDown = (e: React.PointerEvent, m: any): void => {
        e.stopPropagation();
        e.preventDefault();
        this._isPointerDown = true;
        console.log("click");
        this._currMarker = m;

        document.removeEventListener("pointermove", this.onPointerMove);
        document.addEventListener("pointermove", this.onPointerMove);
        document.removeEventListener("pointerup", this.onPointerUp);
        document.addEventListener("pointerup", this.onPointerUp);
    }

    onPointerUp = (e: PointerEvent): void => {
        e.stopPropagation();
        e.preventDefault();
        this._isPointerDown = false;

        const rect = (e.target as any).getBoundingClientRect();
        this._ele!.currentTime = this.layoutDoc.currentTimecode = (e.clientX - rect.x) / rect.width * NumCast(this.dataDoc.duration);

        document.removeEventListener("pointermove", this.onPointerMove);
        document.removeEventListener("pointerup", this.onPointerUp);
    }

    onPointerMove = (e: PointerEvent): void => {
        e.stopPropagation();
        e.preventDefault();
        console.log("drag");

        if (!this._isPointerDown) {
            return;
        }

        // let resize = document.getElementById("audiobox-marker-container1");

        const rect = (e.target as any).getBoundingClientRect();
        // let newWidth = parseFloat(`${(e.clientX - rect.x) / rect.width * NumCast(this.dataDoc.duration)}%`);

        // if (resize) {
        //     console.log(parseFloat(resize.style.width));
        //     console.log(newWidth);
        //     console.log(e.movementX);
        //     if (e.movementX < 0) {
        //         resize.style.width = `${parseFloat(resize.style.width) - (newWidth)}%`;
        //     } else {
        //         resize.style.width = `${parseFloat(resize.style.width) + (newWidth)}%`;
        //     }
        // }

        let newTime = (e.clientX - rect.x) / rect.width * NumCast(this.dataDoc.duration);

        this.changeMarker(this._currMarker, newTime);
    }

    @action
    changeMarker = (m: any, time: any) => {
        for (let i = 0; i < this._markers.length; i++) {
            if (this.isSame(this._markers[i], m)) {
                this._markers[i][1] = time;
            }
        }
    }

    isSame = (m1: any, m2: any) => {
        if (m1[0] == m2[0] && m1[1] == m2[1]) {
            return true;
        }
        return false;
    }

    formatTime = (time: number) => {
        let hours = Math.floor(time / 60 / 60);
        let minutes = Math.floor(time / 60) - (hours * 60);
        let seconds = time % 60;

        return hours.toString().padStart(2, '0') + ':' + minutes.toString().padStart(2, '0') + ':' + seconds.toString().padStart(2, '0');
    }

    render() {
        const interactive = this.active() ? "-interactive" : "";
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
                            <div className="time">{NumCast(this.layoutDoc.currentTimecode).toFixed(1)}</div>
                        </div>

                        :
                        <button className={`audiobox-record${interactive}`} style={{ backgroundColor: "black" }}>
                            RECORD
                            </button>}
                </div> :
                <div className="audiobox-controls" onClick={this.layoutDoc.playOnSelect ? this.onPlay : undefined}>
                    <div className="audiobox-player" >
                        <div className="audiobox-playhead" onClick={this.onPlay}> <FontAwesomeIcon style={{ width: "100%" }} icon={this.audioState === "paused" ? "play" : "pause"} size={this.props.PanelHeight() < 36 ? "1x" : "2x"} /></div>
                        <div className="audiobox-playhead" onClick={this.onStop}><FontAwesomeIcon style={{ width: "100%", background: this.layoutDoc.playOnSelect ? "darkgrey" : "" }} icon="hand-point-left" size={this.props.PanelHeight() < 36 ? "1x" : "2x"} /></div>
                        <div className="audiobox-playhead" onClick={this.onRepeat}><FontAwesomeIcon style={{ width: "100%", background: this._repeat ? "darkgrey" : "" }} icon="redo-alt" size={this.props.PanelHeight() < 36 ? "1x" : "2x"} /></div>
                        <div className="audiobox-timeline" onClick={e => e.stopPropagation()}
                            onPointerDown={e => {
                                if (e.button === 0 && !e.ctrlKey) {
                                    const rect = (e.target as any).getBoundingClientRect();

                                    const wasPaused = this.audioState === "paused";
                                    this._ele!.currentTime = this.layoutDoc.currentTimecode = (e.clientX - rect.x) / rect.width * NumCast(this.dataDoc.duration);
                                    wasPaused && this.pause();

                                }
                                if (e.button === 0 && e.altKey) {
                                    this.newMarker(this._ele!.currentTime);
                                }

                                if (e.button === 0 && e.shiftKey) {
                                    const rect = (e.target as any).getBoundingClientRect();
                                    this._ele!.currentTime = this.layoutDoc.currentTimecode = (e.clientX - rect.x) / rect.width * NumCast(this.dataDoc.duration);
                                    this._hold ? this.end(this._ele!.currentTime) : this.start(this._ele!.currentTime);
                                }
                            }}>
                            {this._markers.map((m, i) => {
                                // let text = Docs.Create.TextDocument("hello", { title: "label", _showSidebar: false, _autoHeight: false });
                                let rect;
                                (m.length > 1) ?

                                    rect =
                                    <div className={this.props.PanelHeight() < 32 ? "audiobox-marker-minicontainer" : "audiobox-marker-container1"} key={i} id={"audiobox-marker-container1"} style={{ left: `${m[0] / NumCast(this.dataDoc.duration, 1) * 100}%`, width: `${(m[1] - m[0]) / NumCast(this.dataDoc.duration, 1) * 100}%` }} onClick={e => { this.playFrom(m[0], m[1]); e.stopPropagation() }} >
                                        {/* <FormattedTextBox {...this.props} key={"label" + i} Document={text} /> */}
                                        <div className="resizer" onPointerDown={e => this.onPointerDown(e, m)}></div>
                                    </div>
                                    :
                                    rect =
                                    <div className={this.props.PanelHeight() < 32 ? "audiobox-marker-minicontainer" : "audiobox-marker-container"} key={i} style={{ left: `${m / NumCast(this.dataDoc.duration, 1) * 100}%` }}>
                                        {/* <DocumentView {...this.props}
                                            Document={text}
                                            parentActive={returnTrue} /> */}
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


                                return !linkTime ? (null) :
                                    <div className={this.props.PanelHeight() < 32 ? "audiobox-marker-minicontainer" : "audiobox-marker-container"} key={l[Id]} style={{ left: `${linkTime / NumCast(this.dataDoc.duration, 1) * 100}%`, width: `${(this.dataDoc.duration - linkTime) / NumCast(this.dataDoc.duration, 1) * 100}%` }}>
                                        <div className={this.props.PanelHeight() < 32 ? "audioBox-linker-mini" : "audioBox-linker"} key={"linker" + i}>
                                            <DocumentView {...this.props}
                                                Document={l}
                                                NativeHeight={returnZero}
                                                NativeWidth={returnZero}
                                                rootSelected={returnFalse}
                                                LayoutTemplate={undefined}
                                                LayoutTemplateString={LinkAnchorBox.LayoutString(`anchor${Doc.LinkEndpoint(l, la2)}`)}
                                                ContainingCollectionDoc={this.props.Document}
                                                dontRegisterView={true}
                                                parentActive={returnTrue}
                                                bringToFront={emptyFunction}
                                                backgroundColor={returnTransparent} />
                                        </div>
                                        <div key={i} className="audiobox-marker" onPointerEnter={() => Doc.linkFollowHighlight(la1)}
                                            onPointerDown={e => { if (e.button === 0 && !e.ctrlKey) { const wasPaused = this.audioState === "paused"; this.playFrom(linkTime); wasPaused && this.pause(); e.stopPropagation(); } }} />
                                    </div>;
                            })}
                            <div className="audiobox-current" style={{ left: `${NumCast(this.layoutDoc.currentTimecode) / NumCast(this.dataDoc.duration, 1) * 100}%` }} />
                            {this.audio}
                        </div>
                        <div className="current-time">
                            {this.formatTime(Math.round(NumCast(this.layoutDoc.currentTimecode)))}
                        </div>
                        <div className="total-time">
                            {this.formatTime(Math.round(NumCast(this.layoutDoc.duration)))}
                        </div>
                    </div>
                </div>
            }
        </div>;
    }
}