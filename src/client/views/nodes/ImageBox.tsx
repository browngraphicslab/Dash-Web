import { library } from '@fortawesome/fontawesome-svg-core';
import { faEye } from '@fortawesome/free-regular-svg-icons';
import { faAsterisk, faFileAudio, faImage, faPaintBrush } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { action, computed, observable, runInAction, trace } from 'mobx';
import { observer } from "mobx-react";
import { Doc, DocListCast, HeightSym, WidthSym } from '../../../new_fields/Doc';
import { List } from '../../../new_fields/List';
import { createSchema, listSpec, makeInterface } from '../../../new_fields/Schema';
import { ComputedField } from '../../../new_fields/ScriptField';
import { BoolCast, Cast, FieldValue, NumCast, StrCast } from '../../../new_fields/Types';
import { AudioField, ImageField } from '../../../new_fields/URLField';
import { RouteStore } from '../../../server/RouteStore';
import { Utils, returnOne, emptyFunction, OmitKeys } from '../../../Utils';
import { CognitiveServices, Confidence, Service, Tag } from '../../cognitive_services/CognitiveServices';
import { Docs } from '../../documents/Documents';
import { DragManager } from '../../util/DragManager';
import { undoBatch } from '../../util/UndoManager';
import { ContextMenu } from "../../views/ContextMenu";
import { ContextMenuProps } from '../ContextMenuItem';
import { DocAnnotatableComponent } from '../DocComponent';
import { InkingControl } from '../InkingControl';
import FaceRectangles from './FaceRectangles';
import { FieldView, FieldViewProps } from './FieldView';
import "./ImageBox.scss";
import React = require("react");
import { CollectionFreeFormView } from '../collections/collectionFreeForm/CollectionFreeFormView';
import { documentSchema } from '../../../new_fields/documentSchemas';
import { Id } from '../../../new_fields/FieldSymbols';
import { TraceMobx } from '../../../new_fields/util';
var requestImageSize = require('../../util/request-image-size');
var path = require('path');
const { Howl } = require('howler');


library.add(faImage, faEye as any, faPaintBrush);
library.add(faFileAudio, faAsterisk);


export const pageSchema = createSchema({
    curPage: "number",
    fitWidth: "boolean",
    rotation: "number",
    googlePhotosUrl: "string",
    googlePhotosTags: "string"
});

interface Window {
    MediaRecorder: MediaRecorder;
}

declare class MediaRecorder {
    // whatever MediaRecorder has
    constructor(e: any);
}

type ImageDocument = makeInterface<[typeof pageSchema, typeof documentSchema]>;
const ImageDocument = makeInterface(pageSchema, documentSchema);

@observer
export class ImageBox extends DocAnnotatableComponent<FieldViewProps, ImageDocument>(ImageDocument) {
    public static LayoutString(fieldKey: string) { return FieldView.LayoutString(ImageBox, fieldKey); }
    private _imgRef: React.RefObject<HTMLImageElement> = React.createRef();
    private _dropDisposer?: DragManager.DragDropDisposer;
    @observable private _audioState = 0;
    @observable static _showControls: boolean;

    protected createDropTarget = (ele: HTMLDivElement) => {
        this._dropDisposer && this._dropDisposer();
        ele && (this._dropDisposer = DragManager.MakeDropTarget(ele, { handlers: { drop: this.drop.bind(this) } }));
    }

    @undoBatch
    @action
    drop = (e: Event, de: DragManager.DropEvent) => {
        if (de.data instanceof DragManager.DocumentDragData) {
            if (de.mods === "AltKey" && de.data.draggedDocuments.length && de.data.draggedDocuments[0].data instanceof ImageField) {
                Doc.GetProto(this.dataDoc)[this.props.fieldKey] = new ImageField(de.data.draggedDocuments[0].data.url);
                e.stopPropagation();
            }
            de.mods === "MetaKey" && de.data.droppedDocuments.forEach(action((drop: Doc) => {
                this.extensionDoc && Doc.AddDocToList(Doc.GetProto(this.extensionDoc), "Alternates", drop);
                e.stopPropagation();
            }));
        }
    }

    recordAudioAnnotation = () => {
        let gumStream: any;
        let recorder: any;
        let self = this;
        const extensionDoc = this.extensionDoc;
        extensionDoc && navigator.mediaDevices.getUserMedia({
            audio: true
        }).then(function (stream) {
            gumStream = stream;
            recorder = new MediaRecorder(stream);
            recorder.ondataavailable = async function (e: any) {
                const formData = new FormData();
                formData.append("file", e.data);
                const res = await fetch(Utils.prepend(RouteStore.upload), {
                    method: 'POST',
                    body: formData
                });
                const files = await res.json();
                const url = Utils.prepend(files[0].path);
                // upload to server with known URL 
                let audioDoc = Docs.Create.AudioDocument(url, { title: "audio test", width: 200, height: 32 });
                audioDoc.treeViewExpandedView = "layout";
                let audioAnnos = Cast(extensionDoc.audioAnnotations, listSpec(Doc));
                if (audioAnnos === undefined) {
                    extensionDoc.audioAnnotations = new List([audioDoc]);
                } else {
                    audioAnnos.push(audioDoc);
                }
            };
            runInAction(() => self._audioState = 2);
            recorder.start();
            setTimeout(() => {
                recorder.stop();
                runInAction(() => self._audioState = 0);
                gumStream.getAudioTracks()[0].stop();
            }, 5000);
        });
    }

    @undoBatch
    rotate = action(() => {
        let nw = this.Document.nativeWidth;
        let nh = this.Document.nativeHeight;
        let w = this.Document.width;
        let h = this.Document.height;
        this.Document.rotation = ((this.Document.rotation || 0) + 90) % 360;
        this.Document.nativeWidth = nh;
        this.Document.nativeHeight = nw;
        this.Document.width = h;
        this.Document.height = w;
    });

    specificContextMenu = (e: React.MouseEvent): void => {
        const field = Cast(this.Document[this.props.fieldKey], ImageField);
        if (field) {
            let funcs: ContextMenuProps[] = [];
            funcs.push({ description: "Copy path", event: () => Utils.CopyText(field.url.href), icon: "expand-arrows-alt" });
            funcs.push({ description: "Rotate", event: this.rotate, icon: "expand-arrows-alt" });

            let existingAnalyze = ContextMenu.Instance.findByDescription("Analyzers...");
            let modes: ContextMenuProps[] = existingAnalyze && "subitems" in existingAnalyze ? existingAnalyze.subitems : [];
            modes.push({ description: "Generate Tags", event: this.generateMetadata, icon: "tag" });
            modes.push({ description: "Find Faces", event: this.extractFaces, icon: "camera" });
            !existingAnalyze && ContextMenu.Instance.addItem({ description: "Analyzers...", subitems: modes, icon: "hand-point-right" });

            ContextMenu.Instance.addItem({ description: "Image Funcs...", subitems: funcs, icon: "asterisk" });
        }
    }

    extractFaces = () => {
        let converter = (results: any) => {
            let faceDocs = new List<Doc>();
            results.reduce((face: CognitiveServices.Image.Face, faceDocs: List<Doc>) => faceDocs.push(Docs.Get.DocumentHierarchyFromJson(face, `Face: ${face.faceId}`)!), new List<Doc>());
            return faceDocs;
        };
        this.url && this.extensionDoc && CognitiveServices.Image.Appliers.ProcessImage(this.extensionDoc, ["faces"], this.url, Service.Face, converter);
    }

    generateMetadata = (threshold: Confidence = Confidence.Excellent) => {
        let converter = (results: any) => {
            let tagDoc = new Doc;
            let tagsList = new List();
            results.tags.map((tag: Tag) => {
                tagsList.push(tag.name);
                let sanitized = tag.name.replace(" ", "_");
                tagDoc[sanitized] = ComputedField.MakeFunction(`(${tag.confidence} >= this.confidence) ? ${tag.confidence} : "${ComputedField.undefined}"`);
            });
            this.extensionDoc && (this.extensionDoc.generatedTags = tagsList);
            tagDoc.title = "Generated Tags Doc";
            tagDoc.confidence = threshold;
            return tagDoc;
        };
        this.url && this.extensionDoc && CognitiveServices.Image.Appliers.ProcessImage(this.extensionDoc, ["generatedTagsDoc"], this.url, Service.ComputerVision, converter);
    }

    @computed private get url() {
        let data = Cast(this.dataDoc[this.props.fieldKey], ImageField);
        return data ? data.url.href : undefined;
    }

    choosePath(url: URL) {
        const lower = url.href.toLowerCase();
        if (url.protocol === "data") {
            return url.href;
        } else if (url.href.indexOf(window.location.origin) === -1) {
            return Utils.CorsProxy(url.href);
        } else if (!(lower.endsWith(".png") || lower.endsWith(".jpg") || lower.endsWith(".jpeg"))) {
            return url.href;//Why is this here
        }
        let ext = path.extname(url.href);
        const suffix = this.props.renderDepth < 1 ? "_o" : this._curSuffix;
        return url.href.replace(ext, suffix + ext);
    }

    @observable _smallRetryCount = 1;
    @observable _mediumRetryCount = 1;
    @observable _largeRetryCount = 1;
    @action retryPath = () => {
        if (this._curSuffix === "_s") this._smallRetryCount++;
        if (this._curSuffix === "_m") this._mediumRetryCount++;
        if (this._curSuffix === "_l") this._largeRetryCount++;
    }
    @action onError = () => {
        let timeout = this._curSuffix === "_s" ? this._smallRetryCount : this._curSuffix === "_m" ? this._mediumRetryCount : this._largeRetryCount;
        if (timeout < 10) {
            setTimeout(this.retryPath, Math.min(10000, timeout * 5));
        }
    }
    _curSuffix = "_m";

    resize = (srcpath: string) => {
        requestImageSize(srcpath)
            .then((size: any) => {
                let rotation = NumCast(this.dataDoc.rotation) % 180;
                let realsize = rotation === 90 || rotation === 270 ? { height: size.width, width: size.height } : size;
                let aspect = realsize.height / realsize.width;
                if (this.Document.width && (Math.abs(1 - NumCast(this.Document.height) / NumCast(this.Document.width) / (realsize.height / realsize.width)) > 0.1)) {
                    setTimeout(action(() => {
                        this.Document.height = this.Document[WidthSym]() * aspect;
                        this.Document.nativeHeight = realsize.height;
                        this.Document.nativeWidth = realsize.width;
                    }), 0);
                }
            })
            .catch((err: any) => console.log(err));
    }

    @action
    onPointerEnter = () => {
        let self = this;
        let audioAnnos = this.extensionDoc && DocListCast(this.extensionDoc.audioAnnotations);
        if (audioAnnos && audioAnnos.length && this._audioState === 0) {
            let anno = audioAnnos[Math.floor(Math.random() * audioAnnos.length)];
            anno.data instanceof AudioField && new Howl({
                src: [anno.data.url.href],
                format: ["mp3"],
                autoplay: true,
                loop: false,
                volume: 0.5,
                onend: function () {
                    runInAction(() => self._audioState = 0);
                }
            });
            this._audioState = 1;
        }
    }

    audioDown = () => this.recordAudioAnnotation();

    considerGooglePhotosLink = () => {
        const remoteUrl = this.Document.googlePhotosUrl;
        return !remoteUrl ? (null) : (<img
            id={"google-photos"}
            src={"/assets/google_photos.png"}
            onClick={() => window.open(remoteUrl)}
        />);
    }

    considerGooglePhotosTags = () => {
        const tags = this.Document.googlePhotosTags;
        return !tags ? (null) : (<img id={"google-tags"} src={"/assets/google_tags.png"} />);
    }

    @computed get content() {
        TraceMobx();
        const extensionDoc = this.extensionDoc;
        if (!extensionDoc) return (null);
        // let transform = this.props.ScreenToLocalTransform().inverse();
        let pw = typeof this.props.PanelWidth === "function" ? this.props.PanelWidth() : typeof this.props.PanelWidth === "number" ? (this.props.PanelWidth as any) as number : 50;
        // var [sptX, sptY] = transform.transformPoint(0, 0);
        // let [bptX, bptY] = transform.transformPoint(pw, this.props.PanelHeight());
        // let w = bptX - sptX;

        let nativeWidth = (this.Document.nativeWidth || pw);
        let nativeHeight = (this.Document.nativeHeight || 0);
        let paths = [Utils.CorsProxy("http://www.cs.brown.edu/~bcz/noImage.png")];
        // this._curSuffix = "";
        // if (w > 20) {
        let alts = DocListCast(extensionDoc.Alternates);
        let altpaths = alts.filter(doc => doc.data instanceof ImageField).map(doc => this.choosePath((doc.data as ImageField).url));
        let field = this.dataDoc[this.props.fieldKey];
        // if (w < 100 && this._smallRetryCount < 10) this._curSuffix = "_s";
        // else if (w < 600 && this._mediumRetryCount < 10) this._curSuffix = "_m";
        // else if (this._largeRetryCount < 10) this._curSuffix = "_l";
        if (field instanceof ImageField) paths = [this.choosePath(field.url)];
        paths.push(...altpaths);
        // }
        let interactive = InkingControl.Instance.selectedTool || !this.props.isSelected() ? "" : "-interactive";
        let rotation = NumCast(this.Document.rotation, 0);
        let aspect = (rotation % 180) ? this.Document[HeightSym]() / this.Document[WidthSym]() : 1;
        let shift = (rotation % 180) ? (nativeHeight - nativeWidth / aspect) / 2 : 0;
        let srcpath = paths[Math.min(paths.length - 1, (this.Document.curPage || 0))];
        let fadepath = paths[Math.min(paths.length - 1, 1)];

        !this.Document.ignoreAspect && this.resize(srcpath);

        return (
            <div className={`imageBox-cont${interactive}`} key={this.props.Document[Id]} ref={this.createDropTarget} onContextMenu={this.specificContextMenu}>
                <div id="cf">
                    <img
                        key={this._smallRetryCount + (this._mediumRetryCount << 4) + (this._largeRetryCount << 8)} // force cache to update on retrys
                        src={srcpath}
                        style={{ transform: `translate(0px, ${shift}px) rotate(${rotation}deg) scale(${aspect})` }}
                        width={nativeWidth}
                        ref={this._imgRef}
                        onError={this.onError} />
                    {fadepath === srcpath ? (null) : <div className="imageBox-fadeBlocker"> <img className="imageBox-fadeaway"
                        key={"fadeaway" + this._smallRetryCount + (this._mediumRetryCount << 4) + (this._largeRetryCount << 8)} // force cache to update on retrys
                        src={fadepath}
                        style={{ transform: `translate(0px, ${shift}px) rotate(${rotation}deg) scale(${aspect})` }}
                        width={nativeWidth}
                        ref={this._imgRef}
                        onError={this.onError} /></div>}
                </div>
                <div className="imageBox-audioBackground"
                    onPointerDown={this.audioDown}
                    onPointerEnter={this.onPointerEnter}
                    style={{ height: `calc(${.1 * nativeHeight / nativeWidth * 100}%)` }}
                >
                    <FontAwesomeIcon className="imageBox-audioFont"
                        style={{ color: [DocListCast(extensionDoc.audioAnnotations).length ? "blue" : "gray", "green", "red"][this._audioState] }} icon={!DocListCast(extensionDoc.audioAnnotations).length ? "microphone" : faFileAudio} size="sm" />
                </div>
                {this.considerGooglePhotosLink()}
                <FaceRectangles document={extensionDoc} color={"#0000FF"} backgroundColor={"#0000FF"} />
            </div>);
    }

    contentFunc = () => [this.content];
    render() {
        return (<div className={"imageBox-container"} onContextMenu={this.specificContextMenu}
            style={{ transform: `scale(${this.props.ContentScaling()})`, width: `${100 / this.props.ContentScaling()}%`, height: `${100 / this.props.ContentScaling()}%` }} >
            <CollectionFreeFormView {...this.props}
                PanelHeight={this.props.PanelHeight}
                PanelWidth={this.props.PanelWidth}
                annotationsKey={this.annotationsKey}
                isAnnotationOverlay={true}
                focus={this.props.focus}
                isSelected={this.props.isSelected}
                select={emptyFunction}
                active={this.annotationsActive}
                ContentScaling={returnOne}
                whenActiveChanged={this.whenActiveChanged}
                removeDocument={this.removeDocument}
                moveDocument={this.moveDocument}
                addDocument={this.addDocument}
                CollectionView={undefined}
                ScreenToLocalTransform={this.props.ScreenToLocalTransform}
                ruleProvider={undefined}
                renderDepth={this.props.renderDepth + 1}
                ContainingCollectionDoc={this.props.ContainingCollectionDoc}
                chromeCollapsed={true}>
                {this.contentFunc}
            </CollectionFreeFormView>
        </div >);
    }
}