import React = require("react");
import { FieldViewProps, FieldView } from './FieldView';
import { observer } from "mobx-react";
import "./AudioBox.scss";
import { Cast, DateCast } from "../../../new_fields/Types";
import { AudioField, nullAudio } from "../../../new_fields/URLField";
import { DocExtendableComponent } from "../DocComponent";
import { makeInterface, createSchema } from "../../../new_fields/Schema";
import { documentSchema } from "../../../new_fields/documentSchemas";
import { Utils } from "../../../Utils";
import { RouteStore } from "../../../server/RouteStore";
import { runInAction, observable, reaction, IReactionDisposer, computed, action } from "mobx";
import { DateField } from "../../../new_fields/DateField";
import { SelectionManager } from "../../util/SelectionManager";
import { Doc, DocListCast } from "../../../new_fields/Doc";
import { ContextMenuProps } from "../ContextMenuItem";
import { ContextMenu } from "../ContextMenu";
import { Id } from "../../../new_fields/FieldSymbols";

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

    _linkPlayDisposer: IReactionDisposer | undefined;
    _reactionDisposer: IReactionDisposer | undefined;
    _scrubbingDisposer: IReactionDisposer | undefined;
    _ele: HTMLAudioElement | null = null;
    _recorder: any;
    _lastUpdate = 0;

    @observable private _audioState = 0;
    @observable public static ScrubTime = 0;
    public static ActiveRecordings: Doc[] = [];

    componentDidMount() {
        runInAction(() => this._audioState = this.path ? 2 : 0);
        this._linkPlayDisposer = reaction(() => this.layoutDoc.scrollToLinkID,
            scrollLinkId => {
                scrollLinkId && DocListCast(this.dataDoc.links).map(l => {
                    const la1 = l.anchor1 as Doc;
                    const la2 = l.anchor2 as Doc;
                    if (l[Id] === scrollLinkId && la1 && la2) {
                        let doc = Doc.AreProtosEqual(la1, this.dataDoc) ? la2 : la1;
                        let seek = DateCast(la1.creationTime);
                        setTimeout(() => this.playFrom(seek.date.getTime()), 250);
                    }
                });
                scrollLinkId && (this.layoutDoc.scrollLinkID = undefined);
            }, { fireImmediately: true });
        this._reactionDisposer = reaction(() => SelectionManager.SelectedDocuments(),
            selected => {
                let sel = selected.length ? selected[0].props.Document : undefined;
                this.Document.playOnSelect && sel && !Doc.AreProtosEqual(sel, this.props.Document) && this.playFrom(DateCast(sel.creationTime).date.getTime());
            });
        this._scrubbingDisposer = reaction(() => AudioBox.ScrubTime, time => this.Document.playOnSelect && this.playFrom(time));
    }

    updateHighlights = () => {
        const extensionDoc = this.extensionDoc;
        const htmlEle = this._ele;
        const start = extensionDoc && DateCast(extensionDoc.recordingStart);
        if (htmlEle && !htmlEle.paused && start) {
            setTimeout(this.updateHighlights, 30);
            DocListCast(this.dataDoc.links).map(l => {
                let la1 = l.anchor1 as Doc;
                if (Doc.AreProtosEqual(la1, this.dataDoc)) {
                    la1 = l.anchor2 as Doc;
                }
                let date = DateCast(la1.creationDate);
                let offset = (date!.date.getTime() - start.date.getTime()) / 1000;
                if (offset > this._lastUpdate && offset < htmlEle.currentTime) {
                    Doc.linkFollowHighlight(la1);
                }
            });
            this._lastUpdate = htmlEle.currentTime;
        }
    }

    playFrom = (seek: number) => {
        const extensionDoc = this.extensionDoc;
        let start = extensionDoc && DateCast(extensionDoc.recordingStart);
        if (this._ele && start) {
            if (seek) {
                let delta = (seek - start.date.getTime()) / 1000;
                if (start && delta > 0 && delta < this._ele.duration) {
                    this._ele.currentTime = delta;
                    this._ele.play();
                    this._lastUpdate = delta;
                    setTimeout(this.updateHighlights, 0);
                } else {
                    this._ele.pause();
                }
            } else {
                this._ele.pause();
            }
        }
    }

    componentWillUnmount() {
        this._reactionDisposer && this._reactionDisposer();
        this._linkPlayDisposer && this._linkPlayDisposer();
        this._scrubbingDisposer && this._scrubbingDisposer();
    }

    recordAudioAnnotation = () => {
        let gumStream: any;
        let self = this;
        const extensionDoc = this.extensionDoc;
        extensionDoc && navigator.mediaDevices.getUserMedia({
            audio: true
        }).then(function (stream) {
            gumStream = stream;
            self._recorder = new MediaRecorder(stream);
            extensionDoc.recordingStart = new DateField(new Date());
            AudioBox.ActiveRecordings.push(self.props.Document);
            self._recorder.ondataavailable = async function (e: any) {
                const formData = new FormData();
                formData.append("file", e.data);
                const res = await fetch(Utils.prepend(RouteStore.upload), {
                    method: 'POST',
                    body: formData
                });
                const files = await res.json();
                const url = Utils.prepend(files[0].path);
                // upload to server with known URL 
                self.props.Document[self.props.fieldKey] = new AudioField(url);
            };
            runInAction(() => self._audioState = 1);
            self._recorder.start();
            setTimeout(() => {
                self.stopRecording();
                gumStream.getAudioTracks()[0].stop();
            }, 60 * 60 * 1000); // stop after an hour?
        });
    }

    specificContextMenu = (e: React.MouseEvent): void => {
        let funcs: ContextMenuProps[] = [];
        funcs.push({ description: (this.Document.playOnSelect ? "Don't play" : "Play") + " when document selected", event: () => this.Document.playOnSelect = !this.Document.playOnSelect, icon: "expand-arrows-alt" });

        ContextMenu.Instance.addItem({ description: "Audio Funcs...", subitems: funcs, icon: "asterisk" });
    }

    stopRecording = action(() => {
        this._recorder.stop();
        this._audioState = 2;
        let ind = AudioBox.ActiveRecordings.indexOf(this.props.Document);
        ind !== -1 && (AudioBox.ActiveRecordings.splice(ind, 1));
    });

    recordClick = (e: React.MouseEvent) => {
        if (e.button === 0 && !e.ctrlKey) {
            this._recorder ? this.stopRecording() : this.recordAudioAnnotation();
            e.stopPropagation();
        }
    }

    playClick = (e: any) => setTimeout(this.updateHighlights, 30);

    setRef = (e: HTMLAudioElement | null) => {
        e && e.addEventListener("play", this.playClick as any);
        this._ele = e;
    }

    @computed get path() {
        let field = Cast(this.props.Document[this.props.fieldKey], AudioField);
        let path = (field instanceof AudioField) ? field.url.href : "";
        return path === nullAudio ? "" : path;
    }

    @computed get audio() {
        let interactive = this.active() ? "-interactive" : "";
        return <audio controls ref={this.setRef} className={`audiobox-control${interactive}`}>
            <source src={this.path} type="audio/mpeg" />
            Not supported.
        </audio>;
    }

    render() {
        let interactive = this.active() ? "-interactive" : "";
        return (!this.extensionDoc ? (null) :
            <div className={`audiobox-container`} onContextMenu={this.specificContextMenu} onClick={!this.path ? this.recordClick : undefined}>
                <div className="audiobox-handle"></div>
                {!this.path ?
                    <button className={`audiobox-record${interactive}`} style={{ backgroundColor: ["black", "red", "blue"][this._audioState] }}>
                        {this._audioState === 1 ? "STOP" : "RECORD"}
                    </button> :
                    this.audio
                }
            </div>
        );
    }
}