import { library } from '@fortawesome/fontawesome-svg-core';
import { faEye } from '@fortawesome/free-regular-svg-icons';
import { faAsterisk, faFileAudio, faImage, faPaintBrush } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { action, computed, observable, runInAction, trace } from 'mobx';
import { observer } from "mobx-react";
import { Doc, DocListCast, HeightSym, WidthSym, DataSym } from '../../../new_fields/Doc';
import { List } from '../../../new_fields/List';
import { createSchema, listSpec, makeInterface } from '../../../new_fields/Schema';
import { ComputedField } from '../../../new_fields/ScriptField';
import { Cast, NumCast, StrCast } from '../../../new_fields/Types';
import { AudioField, ImageField } from '../../../new_fields/URLField';
import { Utils, returnOne, emptyFunction } from '../../../Utils';
import { CognitiveServices, Confidence, Service, Tag } from '../../cognitive_services/CognitiveServices';
import { Docs } from '../../documents/Documents';
import { DragManager } from '../../util/DragManager';
import { undoBatch } from '../../util/UndoManager';
import { ContextMenu } from "../../views/ContextMenu";
import { ContextMenuProps } from '../ContextMenuItem';
import { DocAnnotatableComponent } from '../DocComponent';
import FaceRectangles from './FaceRectangles';
import { FieldView, FieldViewProps } from './FieldView';
import "./ImageBox.scss";
import React = require("react");
import { CollectionFreeFormView } from '../collections/collectionFreeForm/CollectionFreeFormView';
import { documentSchema } from '../../../new_fields/documentSchemas';
import { Id, Copy } from '../../../new_fields/FieldSymbols';
import { TraceMobx } from '../../../new_fields/util';
import { SelectionManager } from '../../util/SelectionManager';
import { cache } from 'sharp';
import { ObjectField } from '../../../new_fields/ObjectField';
import { Networking } from '../../Network';
const requestImageSize = require('../../util/request-image-size');
const path = require('path');
const { Howl } = require('howler');


library.add(faImage, faEye as any, faPaintBrush);
library.add(faFileAudio, faAsterisk);


export const pageSchema = createSchema({
    curPage: "number",
    fitWidth: "boolean",
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

const defaultUploadIcon = "downarrow.png";

@observer
export class ImageBox extends DocAnnotatableComponent<FieldViewProps, ImageDocument>(ImageDocument) {
    public static LayoutString(fieldKey: string) { return FieldView.LayoutString(ImageBox, fieldKey); }
    private _imgRef: React.RefObject<HTMLImageElement> = React.createRef();
    private _dropDisposer?: DragManager.DragDropDisposer;
    @observable private _audioState = 0;
    @observable static _showControls: boolean;
    @observable uploadIcon = defaultUploadIcon;

    protected createDropTarget = (ele: HTMLDivElement) => {
        this._dropDisposer && this._dropDisposer();
        ele && (this._dropDisposer = DragManager.MakeDropTarget(ele, this.drop.bind(this)));
    }

    @undoBatch
    @action
    drop = (e: Event, de: DragManager.DropEvent) => {
        if (de.complete.docDragData) {
            if (de.metaKey) {
                de.complete.docDragData.droppedDocuments.forEach(action((drop: Doc) => {
                    Doc.AddDocToList(this.dataDoc, this.props.fieldKey + "-alternates", drop);
                    e.stopPropagation();
                }));
            } else if (de.altKey || !this.dataDoc[this.props.fieldKey]) {
                const layoutDoc = de.complete.docDragData?.draggedDocuments[0];
                const targetField = Doc.LayoutFieldKey(layoutDoc);
                if (layoutDoc?.[DataSym][targetField] instanceof ImageField) {
                    this.dataDoc[this.props.fieldKey] = ObjectField.MakeCopy(layoutDoc[DataSym][targetField] as ImageField);
                    this.dataDoc[this.props.fieldKey + "-nativeWidth"] = NumCast(layoutDoc[DataSym][targetField + "-nativeWidth"]);
                    this.dataDoc[this.props.fieldKey + "-nativeHeight"] = NumCast(layoutDoc[DataSym][targetField + "-nativeHeight"]);
                    e.stopPropagation();
                }
            }
        }
    }

    recordAudioAnnotation = () => {
        let gumStream: any;
        let recorder: any;
        const self = this;
        navigator.mediaDevices.getUserMedia({
            audio: true
        }).then(function (stream) {
            gumStream = stream;
            recorder = new MediaRecorder(stream);
            recorder.ondataavailable = async function (e: any) {
                const formData = new FormData();
                formData.append("file", e.data);
                const res = await fetch(Utils.prepend("/uploadFormData"), {
                    method: 'POST',
                    body: formData
                });
                const files = await res.json();
                const url = Utils.prepend(files[0].path);
                // upload to server with known URL 
                const audioDoc = Docs.Create.AudioDocument(url, { title: "audio test", _width: 200, _height: 32 });
                audioDoc.treeViewExpandedView = "layout";
                const audioAnnos = Cast(this.dataDoc[this.props.fieldKey + "-audioAnnotations"], listSpec(Doc));
                if (audioAnnos === undefined) {
                    this.dataDoc[this.props.fieldKey + "-audioAnnotations"] = new List([audioDoc]);
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
        const nw = NumCast(this.Document[this.props.fieldKey + "-nativeWidth"]);
        const nh = NumCast(this.Document[this.props.fieldKey + "-nativeHeight"]);
        const w = this.Document._width;
        const h = this.Document._height;
        this.dataDoc[this.props.fieldKey + "-rotation"] = (NumCast(this.dataDoc[this.props.fieldKey + "-rotation"]) + 90) % 360;
        this.dataDoc[this.props.fieldKey + "-nativeWidth"] = nh;
        this.dataDoc[this.props.fieldKey + "-nativeHeight"] = nw;
        this.Document._width = h;
        this.Document._height = w;
    });

    specificContextMenu = (e: React.MouseEvent): void => {
        const field = Cast(this.Document[this.props.fieldKey], ImageField);
        if (field) {
            const funcs: ContextMenuProps[] = [];
            funcs.push({ description: "Copy path", event: () => Utils.CopyText(field.url.href), icon: "expand-arrows-alt" });
            funcs.push({ description: "Rotate", event: this.rotate, icon: "expand-arrows-alt" });

            const existingAnalyze = ContextMenu.Instance.findByDescription("Analyzers...");
            const modes: ContextMenuProps[] = existingAnalyze && "subitems" in existingAnalyze ? existingAnalyze.subitems : [];
            modes.push({ description: "Generate Tags", event: this.generateMetadata, icon: "tag" });
            modes.push({ description: "Find Faces", event: this.extractFaces, icon: "camera" });
            !existingAnalyze && ContextMenu.Instance.addItem({ description: "Analyzers...", subitems: modes, icon: "hand-point-right" });

            ContextMenu.Instance.addItem({ description: "Image Funcs...", subitems: funcs, icon: "asterisk" });
        }
    }

    extractFaces = () => {
        const converter = (results: any) => {
            const faceDocs = new List<Doc>();
            results.reduce((face: CognitiveServices.Image.Face, faceDocs: List<Doc>) => faceDocs.push(Docs.Get.DocumentHierarchyFromJson(face, `Face: ${face.faceId}`)!), new List<Doc>());
            return faceDocs;
        };
        this.url && CognitiveServices.Image.Appliers.ProcessImage(this.dataDoc, [this.props.fieldKey + "-faces"], this.url, Service.Face, converter);
    }

    generateMetadata = (threshold: Confidence = Confidence.Excellent) => {
        const converter = (results: any) => {
            const tagDoc = new Doc;
            const tagsList = new List();
            results.tags.map((tag: Tag) => {
                tagsList.push(tag.name);
                const sanitized = tag.name.replace(" ", "_");
                tagDoc[sanitized] = ComputedField.MakeFunction(`(${tag.confidence} >= this.confidence) ? ${tag.confidence} : "${ComputedField.undefined}"`);
            });
            this.dataDoc[this.props.fieldKey + "-generatedTags"] = tagsList;
            tagDoc.title = "Generated Tags Doc";
            tagDoc.confidence = threshold;
            return tagDoc;
        };
        this.url && CognitiveServices.Image.Appliers.ProcessImage(this.dataDoc, [this.props.fieldKey + "-generatedTagsDoc"], this.url, Service.ComputerVision, converter);
    }

    @computed private get url() {
        const data = Cast(this.dataDoc[this.props.fieldKey], ImageField);
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
        const ext = path.extname(url.href);
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
    @action onError = (error: any) => {
        const timeout = this._curSuffix === "_s" ? this._smallRetryCount : this._curSuffix === "_m" ? this._mediumRetryCount : this._largeRetryCount;
        if (timeout < 10) {
            // setTimeout(this.retryPath, 500);
        }
        const original = StrCast(this.dataDoc.originalUrl);
        if (error.type === "error" && original) {
            this.dataDoc[this.props.fieldKey] = new ImageField(original);
        }
    }
    _curSuffix = "_m";

    resize = (imgPath: string) => {
        const cachedNativeSize = {
            width: NumCast(this.dataDoc[this.props.fieldKey + "-nativeWidth"]),
            height: NumCast(this.dataDoc[this.props.fieldKey + "-nativeHeight"])
        };
        const cachedImgPath = this.dataDoc[this.props.fieldKey + "-imgPath"];
        if (!cachedNativeSize.width || !cachedNativeSize.height || imgPath !== cachedImgPath) {
            (!this.layoutDoc.isTemplateDoc || this.dataDoc !== this.layoutDoc) && requestImageSize(imgPath).then((inquiredSize: any) => {
                const rotation = NumCast(this.dataDoc[this.props.fieldKey + "-rotation"]) % 180;
                const rotatedNativeSize = rotation === 90 || rotation === 270 ? { height: inquiredSize.width, width: inquiredSize.height } : inquiredSize;
                const rotatedAspect = rotatedNativeSize.height / rotatedNativeSize.width;
                const docAspect = this.Document[HeightSym]() / this.Document[WidthSym]();
                setTimeout(action(() => {
                    if (this.Document[WidthSym]() && (!cachedNativeSize.width || !cachedNativeSize.height || Math.abs(1 - docAspect / rotatedAspect) > 0.1)) {
                        this.Document._height = this.Document[WidthSym]() * rotatedAspect;
                        this.dataDoc[this.props.fieldKey + "-nativeWidth"] = this.Document._nativeWidth = rotatedNativeSize.width;
                        this.dataDoc[this.props.fieldKey + "-nativeHeight"] = this.Document._nativeHeight = rotatedNativeSize.height;
                    }
                    this.dataDoc[this.props.fieldKey + "-imgPath"] = imgPath;
                }), 0);
            })
                .catch((err: any) => console.log(err));
        } else if (this.Document._nativeHeight !== cachedNativeSize.width || this.Document._nativeWidth !== cachedNativeSize.height) {
            setTimeout(() => {
                this.Document._nativeWidth = cachedNativeSize.width;
                this.Document._nativeHeight = cachedNativeSize.height;
            }, 0);
        }
    }

    @action
    onPointerEnter = () => {
        const self = this;
        const audioAnnos = DocListCast(this.dataDoc[this.props.fieldKey + "-audioAnnotations"]);
        if (audioAnnos && audioAnnos.length && this._audioState === 0) {
            const anno = audioAnnos[Math.floor(Math.random() * audioAnnos.length)];
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

    @computed
    private get considerDownloadIcon() {
        const data = this.dataDoc[this.props.fieldKey];
        if (!(data instanceof ImageField)) {
            return (null);
        }
        const primary = data.url.href;
        if (primary.includes(window.location.origin)) {
            return (null);
        }
        return (
            <img
                id={"upload-icon"}
                src={`/assets/${this.uploadIcon}`}
                onClick={async () => {
                    const { dataDoc } = this;
                    runInAction(() => this.uploadIcon = "loading.gif");
                    const [{ clientAccessPath }] = await Networking.PostToServer("/uploadRemoteImage", { sources: [primary] });
                    dataDoc.originalUrl = primary;
                    let success = true;
                    let data: ImageField | undefined;
                    try {
                        data = new ImageField(clientAccessPath);
                    } catch {
                        success = false;
                    }
                    runInAction(() => this.uploadIcon = success ? "greencheck.png" : "redx.png");
                    setTimeout(action(() => {
                        this.uploadIcon = defaultUploadIcon;
                        if (data) {
                            dataDoc[this.props.fieldKey] = data;
                        }
                    }), 2000);
                }}
            />
        );
    }

    @computed get nativeSize() {
        const pw = typeof this.props.PanelWidth === "function" ? this.props.PanelWidth() : typeof this.props.PanelWidth === "number" ? (this.props.PanelWidth as any) as number : 50;
        const nativeWidth = NumCast(this.dataDoc[this.props.fieldKey + "-nativeWidth"], pw);
        const nativeHeight = NumCast(this.dataDoc[this.props.fieldKey + "-nativeHeight"], 1);
        return { nativeWidth, nativeHeight };
    }

    @computed get paths() {
        let paths = [Utils.CorsProxy("http://www.cs.brown.edu/~bcz/noImage.png")];
        // this._curSuffix = "";
        // if (w > 20) {
        const alts = DocListCast(this.dataDoc[this.props.fieldKey + "-alternates"]);
        const altpaths = alts.filter(doc => doc.data instanceof ImageField).map(doc => this.choosePath((doc.data as ImageField).url));
        const field = this.dataDoc[this.props.fieldKey];
        // if (w < 100 && this._smallRetryCount < 10) this._curSuffix = "_s";
        // else if (w < 600 && this._mediumRetryCount < 10) this._curSuffix = "_m";
        // else if (this._largeRetryCount < 10) this._curSuffix = "_l";
        if (field instanceof ImageField) paths = [this.choosePath(field.url)];
        paths.push(...altpaths);
        return paths;
    }

    @computed get content() {
        TraceMobx();

        const srcpath = this.paths[NumCast(this.props.Document.curPage, 0)];
        const fadepath = this.paths[Math.min(1, this.paths.length - 1)];
        const { nativeWidth, nativeHeight } = this.nativeSize;
        const rotation = NumCast(this.dataDoc[this.props.fieldKey + "-rotation"]);
        const aspect = (rotation % 180) ? this.Document[HeightSym]() / this.Document[WidthSym]() : 1;
        const shift = (rotation % 180) ? (nativeHeight - nativeWidth / aspect) / 2 : 0;

        !this.Document.ignoreAspect && this.resize(srcpath);

        return <div className="imageBox-cont" key={this.props.Document[Id]} ref={this.createDropTarget} onContextMenu={this.specificContextMenu}>
            <div className="imageBox-fader" >
                <img key={this._smallRetryCount + (this._mediumRetryCount << 4) + (this._largeRetryCount << 8)} // force cache to update on retrys
                    src={srcpath}
                    style={{ transform: `translate(0px, ${shift}px) rotate(${rotation}deg) scale(${aspect})` }}
                    width={nativeWidth}
                    ref={this._imgRef}
                    onError={this.onError} />
                {fadepath === srcpath ? (null) : <div className="imageBox-fadeBlocker">
                    <img className="imageBox-fadeaway"
                        key={"fadeaway" + this._smallRetryCount + (this._mediumRetryCount << 4) + (this._largeRetryCount << 8)} // force cache to update on retrys
                        src={fadepath}
                        style={{ transform: `translate(0px, ${shift}px) rotate(${rotation}deg) scale(${aspect})`, }}
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
                    style={{ color: [DocListCast(this.dataDoc[this.props.fieldKey + "-audioAnnotations"]).length ? "blue" : "gray", "green", "red"][this._audioState] }}
                    icon={!DocListCast(this.dataDoc[this.props.fieldKey + "-audioAnnotations"]).length ? "microphone" : faFileAudio} size="sm" />
            </div>
            {this.considerDownloadIcon}
            {this.considerGooglePhotosLink()}
            <FaceRectangles document={this.dataDoc} color={"#0000FF"} backgroundColor={"#0000FF"} />
        </div>;
    }

    contentFunc = () => [this.content];
    render() {
        TraceMobx();
        const dragging = !SelectionManager.GetIsDragging() ? "" : "-dragging";
        return (<div className={`imageBox${dragging}`} onContextMenu={this.specificContextMenu}
            style={{
                transform: `scale(${this.props.ContentScaling()})`,
                width: `${100 / this.props.ContentScaling()}%`,
                height: `${100 / this.props.ContentScaling()}%`
            }} >
            <CollectionFreeFormView {...this.props}
                PanelHeight={this.props.PanelHeight}
                PanelWidth={this.props.PanelWidth}
                annotationsKey={this.annotationKey}
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
                renderDepth={this.props.renderDepth + 1}
                ContainingCollectionDoc={this.props.ContainingCollectionDoc}
                chromeCollapsed={true}>
                {this.contentFunc}
            </CollectionFreeFormView>
        </div >);
    }
}