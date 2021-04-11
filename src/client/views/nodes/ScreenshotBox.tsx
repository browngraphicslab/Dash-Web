import React = require("react");
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { action, computed, observable } from "mobx";
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
import { TraceMobx } from "../../../fields/util";
import { emptyFunction, OmitKeys, returnFalse, returnOne, Utils } from "../../../Utils";
import { DocUtils } from "../../documents/Documents";
import { DocumentType } from "../../documents/DocumentTypes";
import { Networking } from "../../Network";
import { CaptureManager } from "../../util/CaptureManager";
import { CurrentUserUtils } from "../../util/CurrentUserUtils";
import { CollectionFreeFormView } from "../collections/collectionFreeForm/CollectionFreeFormView";
import { CollectionStackedTimeline } from "../collections/CollectionStackedTimeline";
import { ContextMenu } from "../ContextMenu";
import { ViewBoxAnnotatableComponent, ViewBoxAnnotatableProps } from "../DocComponent";
import { FieldView, FieldViewProps } from './FieldView';
import { FormattedTextBox } from "./formattedText/FormattedTextBox";
import "./ScreenshotBox.scss";
import { VideoBox } from "./VideoBox";
declare class MediaRecorder {
    constructor(e: any, options?: any);  // whatever MediaRecorder has
}

type ScreenshotDocument = makeInterface<[typeof documentSchema]>;
const ScreenshotDocument = makeInterface(documentSchema);

@observer
export class ScreenshotBox extends ViewBoxAnnotatableComponent<ViewBoxAnnotatableProps & FieldViewProps, ScreenshotDocument>(ScreenshotDocument) {
    public static LayoutString(fieldKey: string) { return FieldView.LayoutString(ScreenshotBox, fieldKey); }
    private _videoRef: HTMLVideoElement | null = null;
    private _audioRec: any;
    private _videoRec: any;
    @observable _screenCapture = false;
    @computed get recordingStart() { return Cast(this.dataDoc[this.props.fieldKey + "-recordingStart"], DateField)?.date.getTime(); }

    constructor(props: any) {
        super(props);
        this.setupDictation();
    }
    getAnchor = () => {
        const startTime = Cast(this.layoutDoc._currentTimecode, "number", null) || (this._videoRec ? (Date.now() - (this.recordingStart || 0)) / 1000 : undefined);
        return CollectionStackedTimeline.createAnchor(this.rootDoc, this.dataDoc, this.annotationKey, "_timecodeToShow", "_timecodeToHide",
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

    componentDidMount() {
        this.dataDoc.nativeWidth = this.dataDoc.nativeHeight = 0;
        this.props.setContentView?.(this); // this tells the DocumentView that this ScreenshotBox is the "content" of the document.  this allows the DocumentView to indirectly call getAnchor() on the AudioBox when making a link.
    }
    componentWillUnmount() {
        const ind = DocUtils.ActiveRecordings.indexOf(this);
        ind !== -1 && (DocUtils.ActiveRecordings.splice(ind, 1));
    }

    specificContextMenu = (e: React.MouseEvent): void => {
        const subitems = [{ description: "Screen Capture", event: this.toggleRecording, icon: "expand-arrows-alt" as any }];
        ContextMenu.Instance.addItem({ description: "Options...", subitems, icon: "video" });
    }

    @computed get content() {
        const interactive = CurrentUserUtils.SelectedTool !== InkTool.None || !this.props.isSelected() ? "" : "-interactive";
        return <video className={"videoBox-content" + interactive} key="video"
            ref={r => {
                this._videoRef = r;
                setTimeout(() => {
                    if (this.rootDoc.startRec && this._videoRef) { // TODO glr: use mediaState
                        this.toggleRecording();
                        this.rootDoc.startRec = undefined;
                    }
                }, 1000);
            }}
            autoPlay={true}
            style={{ width: "100%", height: "100%" }}
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
            this._audioRec = new MediaRecorder(await navigator.mediaDevices.getUserMedia({ audio: true }));
            const aud_chunks: any = [];
            this._audioRec.ondataavailable = (e: any) => aud_chunks.push(e.data);
            this._audioRec.onstop = async (e: any) => {
                const [{ result }] = await Networking.UploadFilesToServer(aud_chunks);
                if (!(result instanceof Error)) {
                    this.dataDoc[this.props.fieldKey + "-audio"] = new AudioField(Utils.prepend(result.accessPaths.agnostic.client));
                }
            };
            this._videoRef!.srcObject = await (navigator.mediaDevices as any).getDisplayMedia({ video: true });
            this._videoRec = new MediaRecorder(this._videoRef!.srcObject);
            const vid_chunks: any = [];
            this._videoRec.onstart = () => this.dataDoc[this.props.fieldKey + "-recordingStart"] = new DateField(new Date());
            this._videoRec.ondataavailable = (e: any) => vid_chunks.push(e.data);
            this._videoRec.onstop = async (e: any) => {
                const file = new File(vid_chunks, `${this.rootDoc[Id]}.mkv`, { type: vid_chunks[0].type, lastModified: Date.now() });
                const [{ result }] = await Networking.UploadFilesToServer(file);
                this.dataDoc[this.fieldKey + "-duration"] = (new Date().getTime() - this.recordingStart!) / 1000;
                if (!(result instanceof Error)) { // convert this screenshotBox into normal videoBox
                    this.dataDoc.type = DocumentType.VID;
                    this.layoutDoc.layout = VideoBox.LayoutString(this.fieldKey);
                    this.dataDoc.nativeWidth = this.dataDoc.nativeHeight = undefined;
                    this.layoutDoc._fitWidth = undefined;
                    this.dataDoc[this.props.fieldKey] = new VideoField(Utils.prepend(result.accessPaths.agnostic.client));
                } else alert("video conversion failed");
            };
            this._audioRec.start();
            this._videoRec.start();
            this.dataDoc.mediaState = "recording";
            DocUtils.ActiveRecordings.push(this);
        } else {
            this._audioRec.stop();
            this._videoRec.stop();
            this.dataDoc.mediaState = "paused";
            const ind = DocUtils.ActiveRecordings.indexOf(this);
            ind !== -1 && (DocUtils.ActiveRecordings.splice(ind, 1));

            CaptureManager.Instance.open(this.rootDoc);
        }
    });

    setupDictation = () => {
        if (this.dataDoc[this.fieldKey + "-dictation"]) return;
        const dictationText = CurrentUserUtils.GetNewTextDoc("dictation",
            NumCast(this.rootDoc.x), NumCast(this.rootDoc.y) + NumCast(this.layoutDoc._height) + 10,
            NumCast(this.layoutDoc._width), 2 * NumCast(this.layoutDoc._height));
        dictationText._autoHeight = false;
        const dictationTextProto = Doc.GetProto(dictationText);
        dictationTextProto.recordingSource = this.dataDoc;
        dictationTextProto.recordingStart = ComputedField.MakeFunction(`self.recordingSource["${this.props.fieldKey}-recordingStart"]`);
        dictationTextProto.mediaState = ComputedField.MakeFunction("self.recordingSource.mediaState");
        this.dataDoc[this.fieldKey + "-dictation"] = dictationText;
    }
    contentFunc = () => [this.content];
    videoPanelHeight = () => NumCast(this.dataDoc[this.fieldKey + "-nativeHeight"], 1) / NumCast(this.dataDoc[this.fieldKey + "-nativeWidth"], 1) * this.props.PanelWidth();
    formattedPanelHeight = () => Math.max(0, this.props.PanelHeight() - this.videoPanelHeight());
    render() {
        TraceMobx();
        return <div className="videoBox" onContextMenu={this.specificContextMenu} style={{ width: "100%", height: "100%" }} >
            <div className="videoBox-viewer" >
                <div style={{ position: "relative", height: this.videoPanelHeight() }}>
                    <CollectionFreeFormView {...OmitKeys(this.props, ["NativeWidth", "NativeHeight"]).omit}
                        PanelHeight={this.videoPanelHeight}
                        PanelWidth={this.props.PanelWidth}
                        focus={this.props.focus}
                        isSelected={this.props.isSelected}
                        isAnnotationOverlay={true}
                        select={emptyFunction}
                        isContentActive={returnFalse}
                        scaling={returnOne}
                        whenChildContentsActiveChanged={emptyFunction}
                        removeDocument={returnFalse}
                        moveDocument={returnFalse}
                        addDocument={returnFalse}
                        CollectionView={undefined}
                        ScreenToLocalTransform={this.props.ScreenToLocalTransform}
                        renderDepth={this.props.renderDepth + 1}
                        ContainingCollectionDoc={this.props.ContainingCollectionDoc}>
                        {this.contentFunc}
                    </CollectionFreeFormView></div>
                <div style={{ position: "relative", height: this.formattedPanelHeight() }}>
                    <FormattedTextBox {...OmitKeys(this.props, ["NativeWidth", "NativeHeight"]).omit}
                        Document={this.dataDoc[this.fieldKey + "-dictation"]}
                        fieldKey={"text"}
                        PanelHeight={this.formattedPanelHeight}
                        PanelWidth={this.props.PanelWidth}
                        focus={this.props.focus}
                        isSelected={this.props.isSelected}
                        isAnnotationOverlay={true}
                        select={emptyFunction}
                        isContentActive={returnFalse}
                        scaling={returnOne}
                        xMargin={25}
                        yMargin={10}
                        whenChildContentsActiveChanged={emptyFunction}
                        removeDocument={returnFalse}
                        moveDocument={returnFalse}
                        addDocument={returnFalse}
                        CollectionView={undefined}
                        ScreenToLocalTransform={this.props.ScreenToLocalTransform}
                        renderDepth={this.props.renderDepth + 1}
                        ContainingCollectionDoc={this.props.ContainingCollectionDoc}>
                    </FormattedTextBox></div>
            </div>
            {!this.props.isSelected() ? (null) : <div className="screenshotBox-uiButtons">
                <div className="screenshotBox-recorder" key="snap" onPointerDown={this.toggleRecording} >
                    <FontAwesomeIcon icon="file" size="lg" />
                </div>
            </div>}
        </div >;
    }
}