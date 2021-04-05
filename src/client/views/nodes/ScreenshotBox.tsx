import React = require("react");
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { action, computed, observable, reaction } from "mobx";
import { observer } from "mobx-react";
import { DateField } from "../../../fields/DateField";
import { Doc, WidthSym, HeightSym } from "../../../fields/Doc";
import { documentSchema } from "../../../fields/documentSchemas";
import { Id } from "../../../fields/FieldSymbols";
import { InkTool } from "../../../fields/InkField";
import { makeInterface } from "../../../fields/Schema";
import { ComputedField } from "../../../fields/ScriptField";
import { Cast, NumCast } from "../../../fields/Types";
import { AudioField, VideoField } from "../../../fields/URLField";
import { emptyFunction, OmitKeys, returnFalse, returnOne, Utils, numberRange } from "../../../Utils";
import { DocUtils } from "../../documents/Documents";
import { DocumentType } from "../../documents/DocumentTypes";
import { Networking } from "../../Network";
import { CurrentUserUtils } from "../../util/CurrentUserUtils";
import { CollectionFreeFormView } from "../collections/collectionFreeForm/CollectionFreeFormView";
import { CollectionStackedTimeline } from "../collections/CollectionStackedTimeline";
import { ContextMenu } from "../ContextMenu";
import { ViewBoxAnnotatableComponent, ViewBoxAnnotatableProps } from "../DocComponent";
import { FieldView, FieldViewProps } from './FieldView';
import "./ScreenshotBox.scss";
import { VideoBox } from "./VideoBox";
import { TraceMobx } from "../../../fields/util";
import { FormattedTextBox } from "./formattedText/FormattedTextBox";
import { Canvas } from 'react-three-fiber';
import * as THREE from 'three';
import { Vector3, Vector2, Camera } from "three"
declare class MediaRecorder {
    constructor(e: any, options?: any);  // whatever MediaRecorder has
}

type ScreenshotDocument = makeInterface<[typeof documentSchema]>;
const ScreenshotDocument = makeInterface(documentSchema);

interface VideoTileProps {
    raised: { coord: Vector2, off: Vector3 }[];
    setRaised: (r: { coord: Vector2, off: Vector3 }[]) => void;
    x: number;
    y: number;
    rootDoc: Doc;
    color: string;
}

@observer
export class VideoTile extends React.Component<VideoTileProps> {
    @observable _videoRef: HTMLVideoElement | undefined;
    _mesh: any = undefined;

    render() {
        const topLeft = [this.props.x, this.props.y];
        const raised = this.props.raised;
        const find = (raised: { coord: Vector2, off: Vector3 }[], what: Vector2) => raised.find(r => r.coord.x === what.x && r.coord.y === what.y);
        const tl1 = find(raised, new Vector2(topLeft[0], topLeft[1] + 1));
        const tl2 = find(raised, new Vector2(topLeft[0] + 1, topLeft[1] + 1));
        const tl3 = find(raised, new Vector2(topLeft[0] + 1, topLeft[1]));
        const tl4 = find(raised, new Vector2(topLeft[0], topLeft[1]));
        const quad_indices = [0, 2, 1, 0, 3, 2];
        const quad_uvs = [0.0, 1.0, 1.0, 1.0, 1.0, 0.0, 0.0, 0.0];
        const quad_normals = [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1,];
        const quad_vertices =
            [
                topLeft[0] - 0.0 + (tl1?.off.x || 0), topLeft[1] + 1.0 + (tl1?.off.y || 0), 0.0 + (tl1?.off.z || 0),
                topLeft[0] + 1.0 + (tl2?.off.x || 0), topLeft[1] + 1.0 + (tl2?.off.y || 0), 0.0 + (tl2?.off.z || 0),
                topLeft[0] + 1.0 + (tl3?.off.x || 0), topLeft[1] - 0.0 + (tl3?.off.y || 0), 0.0 + (tl3?.off.z || 0),
                topLeft[0] - 0.0 + (tl4?.off.x || 0), topLeft[1] - 0.0 + (tl4?.off.y || 0), 0.0 + (tl4?.off.z || 0)
            ];

        const vertices = new Float32Array(quad_vertices);
        const normals = new Float32Array(quad_normals);
        const uvs = new Float32Array(quad_uvs); // Each vertex has one uv coordinate for texture mapping
        const indices = new Uint32Array(quad_indices);          // Use the four vertices to draw the two triangles that make up the square.
        const popOut = () => NumCast(this.props.rootDoc.popOut);
        const popOff = () => NumCast(this.props.rootDoc.popOff);
        return (
            <mesh key={`mesh${topLeft[0]}${topLeft[1]}`} onClick={action(async e => {
                this.props.setRaised([
                    { coord: new Vector2(topLeft[0], topLeft[1]), off: new Vector3(-popOff(), -popOff(), popOut()) },
                    { coord: new Vector2(topLeft[0] + 1, topLeft[1]), off: new Vector3(popOff(), -popOff(), popOut()) },
                    { coord: new Vector2(topLeft[0], topLeft[1] + 1), off: new Vector3(-popOff(), popOff(), popOut()) },
                    { coord: new Vector2(topLeft[0] + 1, topLeft[1] + 1), off: new Vector3(popOff(), popOff(), popOut()) }
                ]);
                if (!this._videoRef) {
                    (navigator.mediaDevices as any).getDisplayMedia({ video: true }).then(action((stream: any) => {
                        //const videoSettings = stream.getVideoTracks()[0].getSettings();
                        this._videoRef = document.createElement("video");
                        Object.assign(this._videoRef, {
                            srcObject: stream,
                            //height: videoSettings.height,
                            //width: videoSettings.width,
                            autoplay: true
                        });
                    }));
                }
            })} ref={(r: any) => this._mesh = r}>
                <bufferGeometry attach="geometry" ref={(r: any) => {
                    // itemSize = 3 because there are 3 values (components) per vertex
                    r?.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
                    r?.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
                    r?.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
                    r?.setIndex(new THREE.BufferAttribute(indices, 1));
                }} />
                {!this._videoRef ? <meshStandardMaterial color={this.props.color} /> :
                    <meshBasicMaterial >
                        <videoTexture attach="map" args={[this._videoRef]} />
                    </meshBasicMaterial>}
            </mesh>
        )
    };
}

@observer
export class ScreenshotBox extends ViewBoxAnnotatableComponent<ViewBoxAnnotatableProps & FieldViewProps, ScreenshotDocument>(ScreenshotDocument) {
    public static LayoutString(fieldKey: string) { return FieldView.LayoutString(ScreenshotBox, fieldKey); }
    private _audioRec: any;
    private _videoRec: any;
    @observable private _videoRef: HTMLVideoElement | undefined;
    @observable _screenCapture = false;
    @computed get recordingStart() { return Cast(this.dataDoc[this.props.fieldKey + "-recordingStart"], DateField)?.date.getTime(); }

    constructor(props: any) {
        super(props);
        if (!this.rootDoc.videoWall) this.setupDictation();
        else {
            this.rootDoc.nativeWidth = undefined;
            this.rootDoc.nativeHeight = undefined;
            this.layoutDoc.popOff = 0;
            this.layoutDoc.popOut = 1;
        }
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
        this.rootDoc.videoWall && reaction(() => ({ width: this.props.PanelWidth(), height: this.props.PanelHeight() }),
            ({ width, height }) => {
                if (this._camera) {
                    const angle = -Math.abs(1 - width / height);
                    const xz = [0, (this._numScreens - 2) / Math.abs(1 + angle)];
                    this._camera.position.set(this._numScreens / 2 + xz[1] * Math.sin(angle), this._numScreens / 2, xz[1] * Math.cos(angle));
                    this._camera.lookAt(this._numScreens / 2, this._numScreens / 2, 0);
                    (this._camera as any).updateProjectionMatrix();
                }
            });
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
        return <video className={"videoBox-content" + interactive} key="video" ref={action((r: any) => this._videoRef = r)}
            autoPlay={this._screenCapture}
            style={{ width: this._screenCapture ? "100%" : undefined, height: this._screenCapture ? "100%" : undefined }}
            onCanPlay={this.videoLoad}
            controls={true}
            onClick={e => e.preventDefault()}>
            <source type="video/mp4" />
            Not supported.
            </video>;
    }

    _numScreens = 5;
    _camera: Camera | undefined;
    @observable _raised = [] as { coord: Vector2, off: Vector3 }[];
    @action setRaised = (r: { coord: Vector2, off: Vector3 }[]) => this._raised = r;
    @computed get threed() {
        if (!this.rootDoc.videoWall) return (null);
        const screens: any[] = [];
        const colors = ["yellow", "red", "orange", "brown", "maroon", "gray"];
        let count = 0;
        numberRange(this._numScreens).forEach(x => numberRange(this._numScreens).forEach(y => screens.push(
            <VideoTile rootDoc={this.rootDoc} color={colors[count++ % colors.length]} x={x} y={y} raised={this._raised} setRaised={this.setRaised} />)));
        return <Canvas key="canvas" id="CANCAN" style={{ width: this.props.PanelWidth(), height: this.props.PanelHeight() }} gl={{ antialias: false }} colorManagement={false} onCreated={props => {
            this._camera = props.camera;
            props.camera.position.set(this._numScreens / 2, this._numScreens / 2, this._numScreens - 2);
            props.camera.lookAt(this._numScreens / 2, this._numScreens / 2, 0);
        }}>
            {/* <ambientLight />*/}
            <pointLight position={[10, 10, 10]} intensity={1} />
            {screens}
        </ Canvas>
    };
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
    contentFunc = () => [this.threed, this.content];
    videoPanelHeight = () => NumCast(this.dataDoc[this.fieldKey + "-nativeHeight"], 1) / NumCast(this.dataDoc[this.fieldKey + "-nativeWidth"], 1) * this.props.PanelWidth();
    formattedPanelHeight = () => Math.max(0, this.props.PanelHeight() - this.videoPanelHeight());
    render() {
        TraceMobx();
        return <div className="videoBox" onContextMenu={this.specificContextMenu} style={{ width: "100%", height: "100%" }} >
            <div className="videoBox-viewer" >
                <div style={{ position: "relative", height: "100%" }}>
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
                {!(this.dataDoc[this.fieldKey + "-dictation"] instanceof Doc) ? (null) :
                    <div className="videoBox-dictation" style={{ position: "relative", height: this.formattedPanelHeight() }}>
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
                        </FormattedTextBox>
                    </div>}
            </div>
            {!this.props.isSelected() ? (null) : <div className="screenshotBox-uiButtons">
                <div className="screenshotBox-recorder" key="snap" onPointerDown={this.toggleRecording} >
                    <FontAwesomeIcon icon="file" size="lg" />
                </div>
            </div>}
        </div >;
    }
}