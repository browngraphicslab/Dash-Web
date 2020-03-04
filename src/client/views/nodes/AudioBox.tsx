import React = require("react");
import { FieldViewProps, FieldView } from './FieldView';
import { observer } from "mobx-react";
import "./AudioBox.scss";
import { Cast, DateCast, NumCast } from "../../../new_fields/Types";
import { AudioField, nullAudio } from "../../../new_fields/URLField";
import { DocExtendableComponent } from "../DocComponent";
import { makeInterface, createSchema } from "../../../new_fields/Schema";
import { documentSchema } from "../../../new_fields/documentSchemas";
import { Utils, returnTrue, emptyFunction, returnOne, returnTransparent } from "../../../Utils";
import { runInAction, observable, reaction, IReactionDisposer, computed, action } from "mobx";
import { DateField } from "../../../new_fields/DateField";
import { SelectionManager } from "../../util/SelectionManager";
import { Doc, DocListCast } from "../../../new_fields/Doc";
import { ContextMenuProps } from "../ContextMenuItem";
import { ContextMenu } from "../ContextMenu";
import { Id } from "../../../new_fields/FieldSymbols";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { DocumentView } from "./DocumentView";
import { Docs } from "../../documents/Documents";
import { ComputedField } from "../../../new_fields/ScriptField";

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
export class AudioBox extends DocExtendableComponent<FieldViewProps, AudioDocument>(AudioDocument) {
    public static LayoutString(fieldKey: string) { return FieldView.LayoutString(AudioBox, fieldKey); }
    public static Enabled = false;

    _linkPlayDisposer: IReactionDisposer | undefined;
    _reactionDisposer: IReactionDisposer | undefined;
    _scrubbingDisposer: IReactionDisposer | undefined;
    _ele: HTMLAudioElement | null = null;
    _recorder: any;
    _recordStart = 0;

    public static START = 0;
    @observable private static _scrubTime = 0;
    @computed get audioState(): undefined | "recording" | "paused" | "playing" { return this.dataDoc.audioState as (undefined | "recording" | "paused" | "playing"); }
    set audioState(value) { this.dataDoc.audioState = value; }
    public static SetScrubTime = (timeInMillisFrom1970: number) => { runInAction(() => AudioBox._scrubTime = 0); runInAction(() => AudioBox._scrubTime = timeInMillisFrom1970); };
    public static ActiveRecordings: Doc[] = [];

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
                        const linkTime = Doc.AreProtosEqual(l.anchor1 as Doc, this.dataDoc) ? NumCast(l.anchor1Timecode) : NumCast(l.anchor2Timecode);
                        setTimeout(() => { this.playFromTime(linkTime); Doc.linkFollowHighlight(l); }, 250);
                    });
                    Doc.SetInPlace(this.layoutDoc, "scrollToLinkID", undefined, false);
                }
            }, { fireImmediately: true });
        this._reactionDisposer = reaction(() => SelectionManager.SelectedDocuments(),
            selected => {
                const sel = selected.length ? selected[0].props.Document : undefined;
                this.Document.playOnSelect && this.recordingStart && sel && !Doc.AreProtosEqual(sel, this.props.Document) && this.playFromTime(DateCast(sel.creationDate).date.getTime());
                this.Document.playOnSelect && this.recordingStart && !sel && this.pause();
            });
        this._scrubbingDisposer = reaction(() => AudioBox._scrubTime, (time) => this.Document.playOnSelect && this.playFromTime(AudioBox._scrubTime));
    }

    timecodeChanged = () => {
        const htmlEle = this._ele;
        if (this.audioState !== "recording" && htmlEle) {
            htmlEle.duration && htmlEle.duration !== Infinity && runInAction(() => this.dataDoc.duration = htmlEle.duration);
            DocListCast(this.dataDoc.links).map(l => {
                let la1 = l.anchor1 as Doc;
                let linkTime = NumCast(l.anchor2Timecode);
                if (Doc.AreProtosEqual(la1, this.dataDoc)) {
                    la1 = l.anchor2 as Doc;
                    linkTime = NumCast(l.anchor1Timecode);
                }
                if (linkTime > NumCast(this.Document.currentTimecode) && linkTime < htmlEle.currentTime) {
                    Doc.linkFollowHighlight(la1);
                }
            });
            this.Document.currentTimecode = htmlEle.currentTime;
        }
    }

    pause = action(() => {
        this._ele!.pause();
        this.audioState = "paused";
    });

    playFromTime = (absoluteTime: number) => {
        this.recordingStart && this.playFrom((absoluteTime - this.recordingStart) / 1000);
    }
    playFrom = (seekTimeInSeconds: number) => {
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
            } else {
                this.pause();
            }
        }
    }


    updateRecordTime = () => {
        if (this.audioState === "recording") {
            setTimeout(this.updateRecordTime, 30);
            this.Document.currentTimecode = (new Date().getTime() - this._recordStart) / 1000;
        }
    }

    recordAudioAnnotation = () => {
        let gumStream: any;
        const self = this;
        navigator.mediaDevices.getUserMedia({
            audio: true
        }).then(function (stream) {
            gumStream = stream;
            self._recorder = new MediaRecorder(stream);
            self.dataDoc[self.props.fieldKey + "-recordingStart"] = new DateField(new Date());
            AudioBox.START = new DateField(new Date()).date.getTime();
            AudioBox.ActiveRecordings.push(self.props.Document);
            self._recorder.ondataavailable = async function (e: any) {
                const formData = new FormData();
                formData.append("file", e.data);
                const res = await fetch(Utils.prepend("/uploadFormData"), {
                    method: 'POST',
                    body: formData
                });
                const json = await res.json();
                json.map(async (file: any) => {
                    const path = file.result.accessPaths.agnostic.client;
                    const url = Utils.prepend(path);
                    // upload to server with known URL 
                    self.props.Document[self.props.fieldKey] = new AudioField(url);
                });
            };
            self._recordStart = new Date().getTime();
            console.log("RECORD START = " + self._recordStart);
            runInAction(() => self.audioState = "recording");
            setTimeout(self.updateRecordTime, 0);
            self._recorder.start();
            setTimeout(() => {
                self.stopRecording();
                gumStream.getAudioTracks()[0].stop();
            }, 60 * 60 * 1000); // stop after an hour?
        });
    }

    specificContextMenu = (e: React.MouseEvent): void => {
        const funcs: ContextMenuProps[] = [];
        funcs.push({ description: (this.Document.playOnSelect ? "Don't play" : "Play") + " when document selected", event: () => this.Document.playOnSelect = !this.Document.playOnSelect, icon: "expand-arrows-alt" });

        ContextMenu.Instance.addItem({ description: "Audio Funcs...", subitems: funcs, icon: "asterisk" });
    }

    stopRecording = action(() => {
        this._recorder.stop();
        this.dataDoc.duration = (new Date().getTime() - this._recordStart) / 1000;
        this.audioState = "paused";
        const ind = AudioBox.ActiveRecordings.indexOf(this.props.Document);
        ind !== -1 && (AudioBox.ActiveRecordings.splice(ind, 1));
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
        this.Document.playOnSelect = !this.Document.playOnSelect;
        e.stopPropagation();
    }
    onFile = (e: any) => {
        const newDoc = Docs.Create.TextDocument("", {
            title: "", _chromeStatus: "disabled",
            x: NumCast(this.props.Document.x), y: NumCast(this.props.Document.y) + NumCast(this.props.Document._height) + 10,
            _width: NumCast(this.props.Document._width), _height: 3 * NumCast(this.props.Document._height)
        });
        Doc.GetProto(newDoc).recordingSource = this.dataDoc;
        Doc.GetProto(newDoc).recordingStart = 0;
        Doc.GetProto(newDoc).audioState = ComputedField.MakeFunction("this.recordingSource.audioState");
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

    render() {
        const interactive = this.active() ? "-interactive" : "";
        return <div className={`audiobox-container`} onContextMenu={this.specificContextMenu}
            onClick={!this.path ? this.recordClick : undefined}>
            {!this.path ?
                <div style={{ display: "flex", width: "100%", alignItems: "center" }}>
                    <div className="audiobox-playhead" style={{ alignItems: "center", display: "inherit", background: "dimgray" }} onClick={this.onFile}>
                        <FontAwesomeIcon style={{ width: "30px", background: this.Document.playOnSelect ? "yellow" : "dimGray" }} icon="file-alt" size={this.props.PanelHeight() < 36 ? "1x" : "2x"} />
                    </div>
                    <button className={`audiobox-record${interactive}`} style={{ position: "relative", backgroundColor: this.audioState === "recording" ? "red" : "black" }}>
                        {this.audioState === "recording" ? "STOP" : "RECORD"}
                    </button>
                </div> :
                <div className="audiobox-controls">
                    <div className="audiobox-player" onClick={this.onPlay}>
                        <div className="audiobox-playhead"> <FontAwesomeIcon style={{ width: "100%" }} icon={this.audioState === "paused" ? "play" : "pause"} size={this.props.PanelHeight() < 36 ? "1x" : "2x"} /></div>
                        <div className="audiobox-playhead" onClick={this.onStop}><FontAwesomeIcon style={{ width: "100%", background: this.Document.playOnSelect ? "yellow" : "dimGray" }} icon="hand-point-left" size={this.props.PanelHeight() < 36 ? "1x" : "2x"} /></div>
                        <div className="audiobox-timeline" onClick={e => e.stopPropagation()}
                            onPointerDown={e => {
                                if (e.button === 0 && !e.ctrlKey) {
                                    const rect = (e.target as any).getBoundingClientRect();
                                    const wasPaused = this.audioState === "paused";
                                    this._ele!.currentTime = this.Document.currentTimecode = (e.clientX - rect.x) / rect.width * NumCast(this.dataDoc.duration);
                                    wasPaused && this.pause();
                                    e.stopPropagation();
                                }
                            }} >
                            {DocListCast(this.dataDoc.links).map((l, i) => {
                                let la1 = l.anchor1 as Doc;
                                let la2 = l.anchor2 as Doc;
                                let linkTime = NumCast(l.anchor2Timecode);
                                if (Doc.AreProtosEqual(la1, this.dataDoc)) {
                                    la1 = l.anchor2 as Doc;
                                    la2 = l.anchor1 as Doc;
                                    linkTime = NumCast(l.anchor1Timecode);
                                }
                                return !linkTime ? (null) :
                                    <div className={this.props.PanelHeight() < 32 ? "audiobox-marker-minicontainer" : "audiobox-marker-container"} key={l[Id]} style={{ left: `${linkTime / NumCast(this.dataDoc.duration, 1) * 100}%` }}>
                                        <div className={this.props.PanelHeight() < 32 ? "audioBox-linker-mini" : "audioBox-linker"} key={"linker" + i}>
                                            <DocumentView {...this.props} Document={l} layoutKey={Doc.LinkEndpoint(l, la2)}
                                                ContainingCollectionDoc={this.props.Document}
                                                parentActive={returnTrue} bringToFront={emptyFunction} zoomToScale={emptyFunction} getScale={returnOne}
                                                backgroundColor={returnTransparent} />
                                        </div>
                                        <div key={i} className="audiobox-marker" onPointerEnter={() => Doc.linkFollowHighlight(la1)}
                                            onPointerDown={e => { if (e.button === 0 && !e.ctrlKey) { const wasPaused = this.audioState === "paused"; this.playFrom(linkTime); wasPaused && this.pause(); e.stopPropagation(); } }} />
                                    </div>;
                            })}
                            <div className="audiobox-current" style={{ left: `${NumCast(this.Document.currentTimecode) / NumCast(this.dataDoc.duration, 1) * 100}%` }} />
                            {this.audio}
                        </div>
                    </div>
                </div>
            }
        </div>;
    }
}