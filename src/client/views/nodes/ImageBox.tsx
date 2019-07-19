import { library } from '@fortawesome/fontawesome-svg-core';
import { faImage } from '@fortawesome/free-solid-svg-icons';
import { action, observable, computed, runInAction } from 'mobx';
import { observer } from "mobx-react";
import Lightbox from 'react-image-lightbox';
import 'react-image-lightbox/style.css'; // This only needs to be imported once in your app
import { Doc, HeightSym, WidthSym, DocListCast, DocListCastAsync } from '../../../new_fields/Doc';
import { List } from '../../../new_fields/List';
import { createSchema, listSpec, makeInterface } from '../../../new_fields/Schema';
import { Cast, FieldValue, NumCast, StrCast, BoolCast } from '../../../new_fields/Types';
import { ImageField } from '../../../new_fields/URLField';
import { Utils } from '../../../Utils';
import { DragManager } from '../../util/DragManager';
import { undoBatch } from '../../util/UndoManager';
import { ContextMenu } from "../../views/ContextMenu";
import { ContextMenuProps } from '../ContextMenuItem';
import { DocComponent } from '../DocComponent';
import { InkingControl } from '../InkingControl';
import { positionSchema } from './DocumentView';
import { FieldView, FieldViewProps } from './FieldView';
import "./ImageBox.scss";
import React = require("react");
import { RouteStore } from '../../../server/RouteStore';
import { Docs } from '../../documents/Documents';
import { DocServer } from '../../DocServer';
import { CognitiveServices, Face } from '../../cognitive_services/CognitiveServices';
import { number } from 'prop-types';
var requestImageSize = require('../../util/request-image-size');
var path = require('path');


library.add(faImage);


export const pageSchema = createSchema({
    curPage: "number",
});

interface Window {
    MediaRecorder: MediaRecorder;
}

declare class MediaRecorder {
    // whatever MediaRecorder has
    constructor(e: any);
}

type ImageDocument = makeInterface<[typeof pageSchema, typeof positionSchema]>;
const ImageDocument = makeInterface(pageSchema, positionSchema);
interface FaceTemplate {
    id: string;
    top: number;
    left: number;
    width: number;
    height: number;
}

@observer
export class ImageBox extends DocComponent<FieldViewProps, ImageDocument>(ImageDocument) {

    public static LayoutString(fieldKey?: string) { return FieldView.LayoutString(ImageBox, fieldKey); }
    private _imgRef: React.RefObject<HTMLImageElement> = React.createRef();
    private _downX: number = 0;
    private _downY: number = 0;
    private _lastTap: number = 0;
    @observable private _isOpen: boolean = false;
    private dropDisposer?: DragManager.DragDropDisposer;
    @observable private faceRectangles: FaceTemplate[] = [];

    @computed get dataDoc() { return BoolCast(this.props.Document.isTemplate) && this.props.DataDoc ? this.props.DataDoc : this.props.Document; }

    componentWillMount() {
        this.generateFaceRectangles();
    }

    generateFaceRectangles = async () => {
        let foundFaces = Doc.GetProto(this.props.Document).faces;
        if (!foundFaces) {
            return;
        }
        let faceDocs = await DocListCastAsync(foundFaces);
        if (!faceDocs) {
            return;
        }
        for (let faceDoc of faceDocs) {
            let rectangle = await Cast(faceDoc.faceRectangle, Doc);
            if (!rectangle) {
                continue;
            }
            let top = NumCast(rectangle.top);
            let left = NumCast(rectangle.left);
            let width = NumCast(rectangle.width);
            let height = NumCast(rectangle.height);
            runInAction(() => this.faceRectangles.push({
                id: StrCast(faceDoc.faceId),
                top: top,
                left: left,
                width: width,
                height: height
            }));
        }
    }

    protected createDropTarget = (ele: HTMLDivElement) => {
        if (this.dropDisposer) {
            this.dropDisposer();
        }
        if (ele) {
            this.dropDisposer = DragManager.MakeDropTarget(ele, { handlers: { drop: this.drop.bind(this) } });
        }
    }
    onDrop = (e: React.DragEvent) => {
        e.stopPropagation();
        e.preventDefault();
        console.log("IMPLEMENT ME PLEASE");
    }

    @computed get extensionDoc() { return Doc.resolvedFieldDataDoc(this.dataDoc, this.props.fieldKey, "Alternates"); }

    @undoBatch
    drop = (e: Event, de: DragManager.DropEvent) => {
        if (de.data instanceof DragManager.DocumentDragData) {
            de.data.droppedDocuments.forEach(action((drop: Doc) => {
                if (de.mods === "AltKey" && /*this.dataDoc !== this.props.Document &&*/ drop.data instanceof ImageField) {
                    Doc.GetProto(this.dataDoc)[this.props.fieldKey] = new ImageField(drop.data.url);
                    e.stopPropagation();
                } else if (de.mods === "CtrlKey") {
                    if (this.extensionDoc !== this.dataDoc) {
                        let layout = StrCast(drop.backgroundLayout);
                        if (layout.indexOf(ImageBox.name) !== -1) {
                            let imgData = this.extensionDoc.Alternates;
                            if (!imgData) {
                                Doc.GetProto(this.extensionDoc).Alternates = new List([]);
                            }
                            let imgList = Cast(this.extensionDoc.Alternates, listSpec(Doc), [] as any[]);
                            imgList && imgList.push(drop);
                            e.stopPropagation();
                        }
                    }
                } else if (!this.props.isSelected()) {
                    e.stopPropagation();
                }
            }));
            // de.data.removeDocument()  bcz: need to implement
        }
    }

    onPointerDown = (e: React.PointerEvent): void => {
        if (e.shiftKey && e.ctrlKey) {
            e.stopPropagation(); // allows default system drag drop of images with shift+ctrl only
        }
        // if (Date.now() - this._lastTap < 300) {
        //     if (e.buttons === 1) {
        //         this._downX = e.clientX;
        //         this._downY = e.clientY;
        //         document.removeEventListener("pointerup", this.onPointerUp);
        //         document.addEventListener("pointerup", this.onPointerUp);
        //     }
        // } else {
        //     this._lastTap = Date.now();
        // }
    }
    @action
    onPointerUp = (e: PointerEvent): void => {
        document.removeEventListener("pointerup", this.onPointerUp);
        if (Math.abs(e.clientX - this._downX) < 2 && Math.abs(e.clientY - this._downY) < 2) {
            this._isOpen = true;
        }
        e.stopPropagation();
    }

    @action
    lightbox = (images: string[]) => {
        if (this._isOpen) {
            return (<Lightbox
                mainSrc={images[this.Document.curPage || 0]}
                nextSrc={images[((this.Document.curPage || 0) + 1) % images.length]}
                prevSrc={images[((this.Document.curPage || 0) + images.length - 1) % images.length]}
                onCloseRequest={action(() =>
                    this._isOpen = false
                )}
                onMovePrevRequest={action(() =>
                    this.Document.curPage = ((this.Document.curPage || 0) + images.length - 1) % images.length
                )}
                onMoveNextRequest={action(() =>
                    this.Document.curPage = ((this.Document.curPage || 0) + 1) % images.length
                )}
            />);
        }
    }

    recordAudioAnnotation = () => {
        let gumStream: any;
        let recorder: any;
        let self = this;
        navigator.mediaDevices.getUserMedia({
            audio: true
        }).then(function (stream) {
            gumStream = stream;
            recorder = new MediaRecorder(stream);
            recorder.ondataavailable = async function (e: any) {
                const formData = new FormData();
                formData.append("file", e.data);
                const res = await fetch(DocServer.prepend(RouteStore.upload), {
                    method: 'POST',
                    body: formData
                });
                const files = await res.json();
                const url = DocServer.prepend(files[0]);
                // upload to server with known URL 
                let audioDoc = Docs.Create.AudioDocument(url, { title: "audio test", x: NumCast(self.props.Document.x), y: NumCast(self.props.Document.y), width: 200, height: 32 });
                audioDoc.embed = true;
                let audioAnnos = Cast(self.extensionDoc.audioAnnotations, listSpec(Doc));
                if (audioAnnos === undefined) {
                    self.extensionDoc.audioAnnotations = new List([audioDoc]);
                } else {
                    audioAnnos.push(audioDoc);
                }
            };
            recorder.start();
            setTimeout(() => {
                recorder.stop();

                gumStream.getAudioTracks()[0].stop();
            }, 5000);
        });
    }

    specificContextMenu = (e: React.MouseEvent): void => {
        let field = Cast(this.Document[this.props.fieldKey], ImageField);
        if (field) {
            let url = field.url.href;
            let funcs: ContextMenuProps[] = [];
            funcs.push({ description: "Copy path", event: () => Utils.CopyText(url), icon: "expand-arrows-alt" });
            funcs.push({ description: "Record 1sec audio", event: this.recordAudioAnnotation, icon: "expand-arrows-alt" });
            funcs.push({
                description: "Rotate", event: action(() => {
                    let proto = Doc.GetProto(this.props.Document);
                    let nw = this.props.Document.nativeWidth;
                    let nh = this.props.Document.nativeHeight;
                    let w = this.props.Document.width;
                    let h = this.props.Document.height;
                    proto.rotation = (NumCast(this.props.Document.rotation) + 90) % 360;
                    proto.nativeWidth = nh;
                    proto.nativeHeight = nw;
                    this.props.Document.width = h;
                    this.props.Document.height = w;
                }), icon: "expand-arrows-alt"
            });

            let modes: ContextMenuProps[] = [];
            modes.push({ description: "Generate Tags", event: () => CognitiveServices.Image.generateMetadata(this.Document), icon: "tag" });
            modes.push({
                description: "Find Faces", event: () => {
                    CognitiveServices.Image.extractFaces(this.Document).then(results => {
                        results.map(action((face: Face) => {
                            let rectangle = face.faceRectangle;
                            this.faceRectangles.push({
                                id: face.faceId,
                                top: rectangle.top,
                                left: rectangle.left,
                                width: rectangle.width,
                                height: rectangle.height
                            });
                        }));
                    });
                }, icon: "camera"
            });

            ContextMenu.Instance.addItem({ description: "Image Funcs...", subitems: funcs });
            ContextMenu.Instance.addItem({ description: "Analyze...", subitems: modes });
        }
    }

    @action
    onDotDown(index: number) {
        this.Document.curPage = index;
    }

    dots(paths: string[]) {
        let nativeWidth = FieldValue(this.Document.nativeWidth, 1);
        let dist = Math.min(nativeWidth / paths.length, 40);
        let left = (nativeWidth - paths.length * dist) / 2;
        return paths.map((p, i) =>
            <div className="imageBox-placer" key={i} >
                <div className="imageBox-dot" style={{ background: (i === this.Document.curPage ? "black" : "gray"), transform: `translate(${i * dist + left}px, 0px)` }} onPointerDown={(e: React.PointerEvent) => { e.stopPropagation(); this.onDotDown(i); }} />
            </div>
        );
    }

    choosePath(url: URL) {
        const lower = url.href.toLowerCase();
        if (url.protocol === "data" || url.href.indexOf(window.location.origin) === -1 || !(lower.endsWith(".png") || lower.endsWith(".jpg") || lower.endsWith(".jpeg"))) {
            return url.href;
        }
        let ext = path.extname(url.href);
        const suffix = this.props.renderDepth <= 1 ? "_o" : this._curSuffix;
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

    resize(srcpath: string, layoutdoc: Doc) {
        requestImageSize(window.origin + RouteStore.corsProxy + "/" + srcpath)
            .then((size: any) => {
                let aspect = size.height / size.width;
                let rotation = NumCast(this.dataDoc.rotation) % 180;
                if (rotation === 90 || rotation === 270) aspect = 1 / aspect;
                if (Math.abs(layoutdoc[HeightSym]() / layoutdoc[WidthSym]() - aspect) > 0.01) {
                    setTimeout(action(() => {
                        layoutdoc.height = layoutdoc[WidthSym]() * aspect;
                        layoutdoc.nativeHeight = size.height;
                        layoutdoc.nativeWidth = size.width;
                    }), 0);
                }
            })
            .catch((err: any) => {
                console.log(err);
            });
    }

    render() {
        // let transform = this.props.ScreenToLocalTransform().inverse();
        let pw = typeof this.props.PanelWidth === "function" ? this.props.PanelWidth() : typeof this.props.PanelWidth === "number" ? (this.props.PanelWidth as any) as number : 50;
        // var [sptX, sptY] = transform.transformPoint(0, 0);
        // let [bptX, bptY] = transform.transformPoint(pw, this.props.PanelHeight());
        // let w = bptX - sptX;

        let id = (this.props as any).id; // bcz: used to set id = "isExpander" in templates.tsx
        let nativeWidth = FieldValue(this.Document.nativeWidth, pw);
        let nativeHeight = FieldValue(this.Document.nativeHeight, 0);
        let paths: string[] = ["http://www.cs.brown.edu/~bcz/noImage.png"];
        // this._curSuffix = "";
        // if (w > 20) {
        Doc.UpdateDocumentExtensionForField(this.dataDoc, this.props.fieldKey);
        let alts = DocListCast(this.extensionDoc.Alternates);
        let altpaths: string[] = alts.filter(doc => doc.data instanceof ImageField).map(doc => this.choosePath((doc.data as ImageField).url));
        let field = this.dataDoc[this.props.fieldKey];
        // if (w < 100 && this._smallRetryCount < 10) this._curSuffix = "_s";
        // else if (w < 600 && this._mediumRetryCount < 10) this._curSuffix = "_m";
        // else if (this._largeRetryCount < 10) this._curSuffix = "_l";
        if (field instanceof ImageField) paths = [this.choosePath(field.url)];
        paths.push(...altpaths);
        // }
        let interactive = InkingControl.Instance.selectedTool ? "" : "-interactive";
        let rotation = NumCast(this.dataDoc.rotation, 0);
        let aspect = (rotation % 180) ? this.dataDoc[HeightSym]() / this.dataDoc[WidthSym]() : 1;
        let shift = (rotation % 180) ? (nativeHeight - nativeWidth / aspect) / 2 : 0;
        let srcpath = paths[Math.min(paths.length, this.Document.curPage || 0)];

        if (!this.props.Document.ignoreAspect && !this.props.leaveNativeSize) this.resize(srcpath, this.props.Document);
        return (
            <div id={id} className={`imageBox-cont${interactive}`} style={{ background: "transparent" }}
                onPointerDown={this.onPointerDown}
                onDrop={this.onDrop} ref={this.createDropTarget} onContextMenu={this.specificContextMenu}>
                <img id={id}
                    key={this._smallRetryCount + (this._mediumRetryCount << 4) + (this._largeRetryCount << 8)} // force cache to update on retrys
                    src={srcpath}
                    style={{ transform: `translate(0px, ${shift}px) rotate(${rotation}deg) scale(${aspect})` }}
                    // style={{ objectFit: (this.Document.curPage === 0 ? undefined : "contain") }}
                    width={nativeWidth}
                    ref={this._imgRef}
                    onError={this.onError} />
                {paths.length > 1 ? this.dots(paths) : (null)}
                {/* {this.lightbox(paths)} */}
                {this.faceRectangles.map(rectangle => {
                    let style = {
                        position: "absolute",
                        top: rectangle.top,
                        left: rectangle.left,
                        width: rectangle.width,
                        height: rectangle.height,
                        backgroundColor: "#FF000033",
                        border: "solid 2px red",
                        borderRadius: 5
                    } as React.CSSProperties;
                    return <div key={rectangle.id} style={style} />;
                })}
            </div>);
    }
}