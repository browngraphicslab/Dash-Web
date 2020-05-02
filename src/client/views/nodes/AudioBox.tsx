import React = require("react");
import { FieldViewProps, FieldView } from './FieldView';
import { observer } from "mobx-react";
import "./AudioBox.scss";
import { Cast, DateCast, NumCast } from "../../../new_fields/Types";
import { AudioField, nullAudio } from "../../../new_fields/URLField";
import { ViewBoxBaseComponent } from "../DocComponent";
import { makeInterface, createSchema } from "../../../new_fields/Schema";
import { documentSchema } from "../../../new_fields/documentSchemas";
import { Utils, returnTrue, emptyFunction, returnOne, returnTransparent, returnFalse, returnZero } from "../../../Utils";
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
import { Networking } from "../../Network";
import { Upload } from "../../../server/SharedMediaTypes";
import { LinkAnchorBox } from "./LinkAnchorBox";

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
    _stream: MediaStream | undefined;

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
            this.layoutDoc.currentTimecode = (new Date().getTime() - this._recordStart) / 1000;
        }
    }

    recordAudioAnnotation = async () => {
        this._stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        this._recorder = new MediaRecorder(this._stream);
        this.dataDoc[this.props.fieldKey + "-recordingStart"] = new DateField(new Date());
        AudioBox.ActiveRecordings.push(this.props.Document);
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

        ContextMenu.Instance.addItem({ description: "Options...", subitems: funcs, icon: "asterisk" });
    }

    stopRecording = action(() => {
        this._recorder.stop();
        this._recorder = undefined;
        this.dataDoc.duration = (new Date().getTime() - this._recordStart) / 1000;
        this.audioState = "paused";
        this._stream?.getAudioTracks()[0].stop();
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
        this.layoutDoc.playOnSelect = !this.layoutDoc.playOnSelect;
        e.stopPropagation();
    }
    onFile = (e: any) => {
        const newDoc = Docs.Create.TextDocument("", {
            title: "", _chromeStatus: "disabled",
            x: NumCast(this.props.Document.x), y: NumCast(this.props.Document.y) + NumCast(this.props.Document._height) + 10,
            _width: NumCast(this.props.Document._width), _height: 3 * NumCast(this.props.Document._height)
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

    render() {
        const interactive = this.active() ? "-interactive" : "";
        return <div className={`audiobox-container`} onContextMenu={this.specificContextMenu} onClick={!this.path ? this.recordClick : undefined}>
            {!this.path ?
                <div className="audiobox-buttons">
                    <div className="audiobox-dictation" onClick={this.onFile}>
                        <FontAwesomeIcon style={{ width: "30px", background: this.layoutDoc.playOnSelect ? "yellow" : "dimGray" }} icon="file-alt" size={this.props.PanelHeight() < 36 ? "1x" : "2x"} />
                    </div>
                    <button className={`audiobox-record${interactive}`} style={{ backgroundColor: this.audioState === "recording" ? "red" : "black" }}>
                        {this.audioState === "recording" ? "STOP" : "RECORD"}
                    </button>
                </div> :
                <div className="audiobox-controls">
                    <div className="audiobox-player" onClick={this.onPlay}>
                        <div className="audiobox-playhead"> <FontAwesomeIcon style={{ width: "100%" }} icon={this.audioState === "paused" ? "play" : "pause"} size={this.props.PanelHeight() < 36 ? "1x" : "2x"} /></div>
                        <div className="audiobox-playhead" onClick={this.onStop}><FontAwesomeIcon style={{ width: "100%", background: this.layoutDoc.playOnSelect ? "yellow" : "dimGray" }} icon="hand-point-left" size={this.props.PanelHeight() < 36 ? "1x" : "2x"} /></div>
                        <div className="audiobox-timeline" onClick={e => e.stopPropagation()}
                            onPointerDown={e => {
                                if (e.button === 0 && !e.ctrlKey) {
                                    const rect = (e.target as any).getBoundingClientRect();
                                    const wasPaused = this.audioState === "paused";
                                    this._ele!.currentTime = this.layoutDoc.currentTimecode = (e.clientX - rect.x) / rect.width * NumCast(this.dataDoc.duration);
                                    wasPaused && this.pause();
                                    e.stopPropagation();
                                }
                            }} >
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
                                    <div className={this.props.PanelHeight() < 32 ? "audiobox-marker-minicontainer" : "audiobox-marker-container"} key={l[Id]} style={{ left: `${linkTime / NumCast(this.dataDoc.duration, 1) * 100}%` }}>
                                        <div className={this.props.PanelHeight() < 32 ? "audioBox-linker-mini" : "audioBox-linker"} key={"linker" + i}>
                                            <DocumentView {...this.props}
                                                Document={l}
                                                NativeHeight={returnZero}
                                                NativeWidth={returnZero}
                                                rootSelected={returnFalse}
                                                LayoutTemplate={undefined}
                                                LayoutTemplateString={LinkAnchorBox.LayoutString(`anchor${Doc.LinkEndpoint(l, la2)}`)}
                                                ContainingCollectionDoc={this.props.Document}
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
                    </div>
                </div>
            }
        </div>;
    }
}