import React = require("react");
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { action, computed, IReactionDisposer, observable } from "mobx";
import { observer } from "mobx-react";
import { DateField } from "../../../fields/DateField";
import { Doc, WidthSym } from "../../../fields/Doc";
import { documentSchema } from "../../../fields/documentSchemas";
import { Id } from "../../../fields/FieldSymbols";
import { InkTool } from "../../../fields/InkField";
import { makeInterface } from "../../../fields/Schema";
import { ComputedField } from "../../../fields/ScriptField";
import { Cast, NumCast } from "../../../fields/Types";
import { AudioField, VideoField } from "../../../fields/URLField";
import { emptyFunction, OmitKeys, returnFalse, returnOne, Utils } from "../../../Utils";
import { DocUtils } from "../../documents/Documents";
import { DocumentType } from "../../documents/DocumentTypes";
import { Networking } from "../../Network";
import { CurrentUserUtils } from "../../util/CurrentUserUtils";
import { DocumentManager } from "../../util/DocumentManager";
import { CollectionFreeFormView } from "../collections/collectionFreeForm/CollectionFreeFormView";
import { CollectionStackedTimeline } from "../collections/CollectionStackedTimeline";
import { ContextMenu } from "../ContextMenu";
import { ContextMenuProps } from "../ContextMenuItem";
import { ViewBoxAnnotatableComponent } from "../DocComponent";
import { DocumentView } from "./DocumentView";
import { FieldView, FieldViewProps } from './FieldView';
import "./ScreenshotBox.scss";
import { VideoBox } from "./VideoBox";
const path = require('path');
declare class MediaRecorder {
    constructor(e: any, options?: any);  // whatever MediaRecorder has
}

type ScreenshotDocument = makeInterface<[typeof documentSchema]>;
const ScreenshotDocument = makeInterface(documentSchema);

@observer
export class ScreenshotBox extends ViewBoxAnnotatableComponent<FieldViewProps, ScreenshotDocument>(ScreenshotDocument) {
    private _reactionDisposer?: IReactionDisposer;
    private _videoRef: HTMLVideoElement | null = null;
    private _vchunks: any;
    private _achunks: any;
    private _vrecorder: any;
    private _arecorder: any;
    private _dictation: Doc | undefined;
    private _dictationView: DocumentView | undefined;
    public static LayoutString(fieldKey: string) { return FieldView.LayoutString(ScreenshotBox, fieldKey); }
    @computed get recordingStart() { return Cast(this.dataDoc[this.props.fieldKey + "-recordingStart"], DateField)?.date.getTime(); }


    getAnchor = () => {
        const startTime = Cast(this.layoutDoc._currentTimecode, "number", null) || (this._vrecorder ? (Date.now() - (this.recordingStart || 0)) / 1000 : undefined);
        return CollectionStackedTimeline.createAnchor(this.rootDoc, this.dataDoc, this.annotationKey, "_timecodeToShow" /* audioStart */, "_timecodeToHide" /* audioEnd */,
            startTime, startTime === undefined ? undefined : startTime + 3)
            || this.rootDoc;
    }

    videoLoad = () => {
        const aspect = this._videoRef!.videoWidth / this._videoRef!.videoHeight;
        const nativeWidth = Doc.NativeWidth(this.layoutDoc);
        const nativeHeight = Doc.NativeHeight(this.layoutDoc);
        if (!nativeWidth || !nativeHeight) {
            if (!nativeWidth) Doc.SetNativeWidth(this.dataDoc, 1200);
            Doc.SetNativeHeight(this.dataDoc, (nativeWidth || 1200) / aspect);
            this.layoutDoc._height = (this.layoutDoc[WidthSym]() || 0) / aspect;
        }
    }

    componentWillUnmount() {
        this._reactionDisposer?.();
        const ind = DocUtils.ActiveRecordings.indexOf(this);
        ind !== -1 && (DocUtils.ActiveRecordings.splice(ind, 1));
    }

    @action
    setVideoRef = (vref: HTMLVideoElement | null) => this._videoRef = vref;

    @observable _screenCapture = false;
    specificContextMenu = (e: React.MouseEvent): void => {
        const field = Cast(this.dataDoc[this.fieldKey], VideoField);
        if (field) {
            const subitems: ContextMenuProps[] = [];
            subitems.push({ description: "Screen Capture", event: this.toggleRecording, icon: "expand-arrows-alt" });
            ContextMenu.Instance.addItem({ description: "Options...", subitems: subitems, icon: "video" });
        }
    }

    @computed get content() {
        const interactive = CurrentUserUtils.SelectedTool !== InkTool.None || !this.props.isSelected() ? "" : "-interactive";
        const style = "videoBox-content" + interactive;
        return <video className={`${style}`} key="video" autoPlay={this._screenCapture} ref={this.setVideoRef}
            style={{ width: this._screenCapture ? "100%" : undefined, height: this._screenCapture ? "100%" : undefined }}
            onCanPlay={this.videoLoad}
            controls={true}
            onClick={e => e.preventDefault()}>
            <source type="video/mp4" />
            Not supported.
            </video>;
    }

    toggleRecording = action(async () => {
        this._screenCapture = !this._screenCapture;
        if (this._screenCapture) {
            this._arecorder = new MediaRecorder(await navigator.mediaDevices.getUserMedia({ audio: true }));
            this._achunks = [];
            this._arecorder.ondataavailable = (e: any) => this._achunks.push(e.data);
            this._arecorder.onstop = async (e: any) => {
                const [{ result }] = await Networking.UploadFilesToServer(this._achunks);
                if (!(result instanceof Error)) {
                    this.dataDoc[this.props.fieldKey + "-audio"] = new AudioField(Utils.prepend(result.accessPaths.agnostic.client));
                }
            };
            const vstream = await (navigator.mediaDevices as any).getDisplayMedia({ video: true });
            this._videoRef!.srcObject = vstream;
            this._vrecorder = new MediaRecorder(vstream);
            this._vchunks = [];
            this._vrecorder.onstart = action(() => this.dataDoc[this.props.fieldKey + "-recordingStart"] = new DateField(new Date()));
            this._vrecorder.ondataavailable = (e: any) => this._vchunks.push(e.data);
            this._vrecorder.onstop = async (e: any) => {
                const file = new File(this._vchunks, `${this.rootDoc[Id]}.mkv`, { type: this._vchunks[0].type, lastModified: Date.now() });
                const [{ result }] = await Networking.UploadFilesToServer(file);
                this.dataDoc[this.fieldKey + "-duration"] = (new Date().getTime() - this.recordingStart!) / 1000;
                if (!(result instanceof Error)) {
                    this.dataDoc.type = DocumentType.VID;
                    this.layoutDoc.layout = VideoBox.LayoutString(this.fieldKey);
                    this.dataDoc[this.props.fieldKey] = new VideoField(Utils.prepend(result.accessPaths.agnostic.client));
                } else alert("video conversion failed");
            };
            this._dictation = this.setupDictation();
            setTimeout(() => this._dictationView = DocumentManager.Instance.getDocumentView(this._dictation!));
            this._arecorder.start();
            this._vrecorder.start();
            this.dataDoc.mediaState = "recording";
            DocUtils.ActiveRecordings.push(this);
        } else {
            this._arecorder.stop();
            this._vrecorder.stop();
            this.dataDoc.mediaState = "paused";
            const ind = DocUtils.ActiveRecordings.indexOf(this);
            ind !== -1 && (DocUtils.ActiveRecordings.splice(ind, 1));
        }
    });

    setupDictation = () => {
        const dictationText = CurrentUserUtils.GetNewTextDoc("",
            NumCast(this.rootDoc.x), NumCast(this.rootDoc.y) + NumCast(this.layoutDoc._height) + 10,
            NumCast(this.layoutDoc._width), 2 * NumCast(this.layoutDoc._height));
        const dictationTextProto = Doc.GetProto(dictationText);
        dictationTextProto.recordingSource = this.dataDoc;
        dictationTextProto.recordingStart = ComputedField.MakeFunction(`self.recordingSource["${this.props.fieldKey}-recordingStart"]`);
        dictationTextProto.mediaState = ComputedField.MakeFunction("self.recordingSource.mediaState");
        this.props.addDocument?.(dictationText) || this.props.addDocTab(dictationText, "add:bottom");
        return dictationText;
    }

    private get uIButtons() {
        return (<div className="screenshotBox-uiButtons">
            <div className="screenshotBox-recorder" key="snap" onPointerDown={this.toggleRecording} >
                <FontAwesomeIcon icon="file" size="lg" />
            </div>
        </div>);
    }

    contentFunc = () => [this.content];
    render() {
        return (<div className="videoBox" onContextMenu={this.specificContextMenu}
            style={{ width: `${100}%`, height: `${100}%` }} >
            <div className="videoBox-viewer" >
                <CollectionFreeFormView {...OmitKeys(this.props, ["NativeWidth", "NativeHeight"]).omit}
                    PanelHeight={this.props.PanelHeight}
                    PanelWidth={this.props.PanelWidth}
                    focus={this.props.focus}
                    isSelected={this.props.isSelected}
                    isAnnotationOverlay={true}
                    select={emptyFunction}
                    active={returnFalse}
                    scaling={returnOne}
                    whenActiveChanged={emptyFunction}
                    removeDocument={returnFalse}
                    moveDocument={returnFalse}
                    addDocument={returnFalse}
                    CollectionView={undefined}
                    ScreenToLocalTransform={this.props.ScreenToLocalTransform}
                    renderDepth={this.props.renderDepth + 1}
                    ContainingCollectionDoc={this.props.ContainingCollectionDoc}>
                    {this.contentFunc}
                </CollectionFreeFormView>
            </div>
            {this.props.isSelected() ? this.uIButtons : (null)}
        </div >);
    }
}