import { action, computed, IReactionDisposer, observable, reaction, runInAction, ObservableMap } from 'mobx';
import { observer } from "mobx-react";
import { Dictionary } from 'typescript-collections';
import { DataSym, Doc, DocListCast, WidthSym } from '../../../fields/Doc';
import { documentSchema } from '../../../fields/documentSchemas';
import { Id } from '../../../fields/FieldSymbols';
import { List } from '../../../fields/List';
import { ObjectField } from '../../../fields/ObjectField';
import { createSchema, listSpec, makeInterface } from '../../../fields/Schema';
import { ComputedField } from '../../../fields/ScriptField';
import { Cast, NumCast, StrCast } from '../../../fields/Types';
import { ImageField } from '../../../fields/URLField';
import { TraceMobx } from '../../../fields/util';
import { emptyFunction, OmitKeys, returnOne, Utils } from '../../../Utils';
import { GooglePhotos } from '../../apis/google_docs/GooglePhotosClientUtils';
import { CognitiveServices, Confidence, Service, Tag } from '../../cognitive_services/CognitiveServices';
import { Networking } from '../../Network';
import { DragManager } from '../../util/DragManager';
import { undoBatch } from '../../util/UndoManager';
import { ContextMenu } from "../../views/ContextMenu";
import { CollectionFreeFormView } from '../collections/collectionFreeForm/CollectionFreeFormView';
import { ContextMenuProps } from '../ContextMenuItem';
import { ViewBoxAnnotatableComponent } from '../DocComponent';
import { MarqueeAnnotator } from '../MarqueeAnnotator';
import { StyleProp } from '../StyleProvider';
import { FaceRectangles } from './FaceRectangles';
import { FieldView, FieldViewProps } from './FieldView';
import "./ImageBox.scss";
import React = require("react");
const path = require('path');

export const pageSchema = createSchema({
    _curPage: "number",
    fitWidth: "boolean",
    googlePhotosUrl: "string",
    googlePhotosTags: "string"
});
type ImageDocument = makeInterface<[typeof pageSchema, typeof documentSchema]>;
const ImageDocument = makeInterface(pageSchema, documentSchema);

const uploadIcons = {
    idle: "downarrow.png",
    loading: "loading.gif",
    success: "greencheck.png",
    failure: "redx.png"
};

@observer
export class ImageBox extends ViewBoxAnnotatableComponent<FieldViewProps, ImageDocument>(ImageDocument) {
    protected _multiTouchDisposer?: import("../../util/InteractionUtils").InteractionUtils.MultiTouchEventDisposer | undefined;
    public static LayoutString(fieldKey: string) { return FieldView.LayoutString(ImageBox, fieldKey); }
    private _imgRef: React.RefObject<HTMLImageElement> = React.createRef();
    private _curSuffix = "_m";
    private _dropDisposer?: DragManager.DragDropDisposer;
    private _disposers: { [name: string]: IReactionDisposer } = {};
    @observable uploadIcon = uploadIcons.idle;

    protected createDropTarget = (ele: HTMLDivElement) => {
        this._dropDisposer?.();
        ele && (this._dropDisposer = DragManager.MakeDropTarget(ele, this.drop.bind(this), this.props.Document));
    }

    componentDidMount() {
        this._disposers.selection = reaction(() => this.props.isSelected(),
            selected => !selected && setTimeout(() => {
                Array.from(this._savedAnnotations.values()).forEach(v => v.forEach(a => a.remove()));
                this._savedAnnotations.clear();
            }));
        this._disposers.path = reaction(() => ({ nativeSize: this.nativeSize, width: this.layoutDoc[WidthSym]() }),
            action(({ nativeSize, width }) => {
                if (!this.layoutDoc._height) {
                    this.layoutDoc._height = width * nativeSize.nativeHeight / nativeSize.nativeWidth;
                }
            }),
            { fireImmediately: true });
    }

    componentWillUnmount() {
        Object.values(this._disposers).forEach(disposer => disposer?.());
    }

    @undoBatch
    @action
    drop = (e: Event, de: DragManager.DropEvent) => {
        if (de.complete.docDragData) {
            if (de.metaKey) {
                de.complete.docDragData.droppedDocuments.forEach(action((drop: Doc) => {
                    Doc.AddDocToList(this.dataDoc, this.fieldKey + "-alternates", drop);
                    e.stopPropagation();
                }));
            } else if (de.altKey || !this.dataDoc[this.fieldKey]) {
                const layoutDoc = de.complete.docDragData?.draggedDocuments[0];
                const targetField = Doc.LayoutFieldKey(layoutDoc);
                const targetDoc = layoutDoc[DataSym];
                if (targetDoc[targetField] instanceof ImageField) {
                    this.dataDoc[this.fieldKey] = ObjectField.MakeCopy(targetDoc[targetField] as ImageField);
                    Doc.SetNativeWidth(this.dataDoc, Doc.NativeWidth(targetDoc));
                    Doc.SetNativeWidth(this.dataDoc, Doc.NativeHeight(targetDoc));
                    e.stopPropagation();
                }
            }
        }
    }

    @undoBatch
    resolution = () => this.layoutDoc._showFullRes = !this.layoutDoc._showFullRes

    @undoBatch
    rotate = action(() => {
        const nw = NumCast(this.dataDoc[this.fieldKey + "-nativeWidth"]);
        const nh = NumCast(this.dataDoc[this.fieldKey + "-nativeHeight"]);
        const w = this.layoutDoc._width;
        const h = this.layoutDoc._height;
        this.dataDoc[this.fieldKey + "-rotation"] = (NumCast(this.dataDoc[this.fieldKey + "-rotation"]) + 90) % 360;
        this.dataDoc[this.fieldKey + "-nativeWidth"] = nh;
        this.dataDoc[this.fieldKey + "-nativeHeight"] = nw;
        this.layoutDoc._width = h;
        this.layoutDoc._height = w;
    });

    specificContextMenu = (e: React.MouseEvent): void => {
        const field = Cast(this.dataDoc[this.fieldKey], ImageField);
        if (field) {
            const funcs: ContextMenuProps[] = [];
            funcs.push({ description: "Rotate Clockwise 90", event: this.rotate, icon: "expand-arrows-alt" });
            funcs.push({ description: `Show ${this.layoutDoc._showFullRes ? "Dynamic Res" : "Full Res"}`, event: this.resolution, icon: "expand-arrows-alt" });
            if (!Doc.UserDoc().noviceMode) {
                funcs.push({ description: "Export to Google Photos", event: () => GooglePhotos.Transactions.UploadImages([this.props.Document]), icon: "caret-square-right" });
                funcs.push({ description: "Copy path", event: () => Utils.CopyText(field.url.href), icon: "expand-arrows-alt" });

                const existingAnalyze = ContextMenu.Instance?.findByDescription("Analyzers...");
                const modes: ContextMenuProps[] = existingAnalyze && "subitems" in existingAnalyze ? existingAnalyze.subitems : [];
                modes.push({ description: "Generate Tags", event: this.generateMetadata, icon: "tag" });
                modes.push({ description: "Find Faces", event: this.extractFaces, icon: "camera" });
                //modes.push({ description: "Recommend", event: this.extractText, icon: "brain" });
                !existingAnalyze && ContextMenu.Instance?.addItem({ description: "Analyzers...", subitems: modes, icon: "hand-point-right" });
            }

            ContextMenu.Instance?.addItem({ description: "Options...", subitems: funcs, icon: "asterisk" });
        }
    }

    extractFaces = () => {
        const converter = (results: any) => {
            return results.map((face: CognitiveServices.Image.Face) => Doc.Get.FromJson({ data: face, title: `Face: ${face.faceId}` })!);
        };
        this.url && CognitiveServices.Image.Appliers.ProcessImage(this.dataDoc, [this.fieldKey + "-faces"], this.url, Service.Face, converter);
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
            this.dataDoc[this.fieldKey + "-generatedTags"] = tagsList;
            tagDoc.title = "Generated Tags Doc";
            tagDoc.confidence = threshold;
            return tagDoc;
        };
        this.url && CognitiveServices.Image.Appliers.ProcessImage(this.dataDoc, [this.fieldKey + "-generatedTagsDoc"], this.url, Service.ComputerVision, converter);
    }

    @computed private get url() {
        const data = Cast(this.dataDoc[this.fieldKey], ImageField);
        return data ? data.url.href : undefined;
    }

    choosePath(url: URL) {
        const lower = url.href.toLowerCase();
        if (url.protocol === "data") return url.href;
        if (url.href.indexOf(window.location.origin) === -1) return Utils.CorsProxy(url.href);
        if (!/\.(png|jpg|jpeg|gif|webp)$/.test(lower)) return url.href;  //Why is this here

        const ext = path.extname(url.href);
        const scrSize = this.props.ScreenToLocalTransform().inverse().transformDirection(this.nativeSize.nativeWidth, this.nativeSize.nativeHeight);
        this._curSuffix = this.props.renderDepth < 1 || this.layoutDoc._showFullRes ? "_o" : scrSize[0] < 100 ? "_s" : scrSize[0] < 400 ? "_m" : scrSize[0] < 800 || !this.props.isSelected() ? "_l" : "_o";
        return url.href.replace(ext, this._curSuffix + ext);
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
        if (timeout < 5) {
            setTimeout(this.retryPath, 500);
        } else {
            const original = StrCast(this.dataDoc[this.fieldKey + "-originalUrl"]);
            if (error.type === "error" && original) {
                this.dataDoc[this.fieldKey] = new ImageField(original);
            }
        }
    }

    considerGooglePhotosLink = () => {
        const remoteUrl = this.dataDoc.googlePhotosUrl;
        return !remoteUrl ? (null) : (<img draggable={false}
            style={{ transformOrigin: "bottom right" }}
            id={"google-photos"}
            src={"/assets/google_photos.png"}
            onClick={() => window.open(remoteUrl)}
        />);
    }

    considerGooglePhotosTags = () => {
        const tags = this.dataDoc.googlePhotosTags;
        return !tags ? (null) : (<img id={"google-tags"} src={"/assets/google_tags.png"} />);
    }

    @computed
    private get considerDownloadIcon() {
        const data = this.dataDoc[this.fieldKey];
        if (!(data instanceof ImageField)) {
            return (null);
        }
        const primary = data.url.href;
        if (primary.includes(window.location.origin)) {
            return (null);
        }
        return (
            <img
                id={"upload-icon"} draggable={false}
                style={{ transformOrigin: "bottom right" }}
                src={`/assets/${this.uploadIcon}`}
                onClick={async () => {
                    const { dataDoc } = this;
                    const { success, failure, idle, loading } = uploadIcons;
                    runInAction(() => this.uploadIcon = loading);
                    const [{ accessPaths }] = await Networking.PostToServer("/uploadRemoteImage", { sources: [primary] });
                    dataDoc[this.props.fieldKey + "-originalUrl"] = primary;
                    let succeeded = true;
                    let data: ImageField | undefined;
                    try {
                        data = new ImageField(Utils.prepend(accessPaths.agnostic.client));
                    } catch {
                        succeeded = false;
                    }
                    runInAction(() => this.uploadIcon = succeeded ? success : failure);
                    setTimeout(action(() => {
                        this.uploadIcon = idle;
                        if (data) {
                            dataDoc[this.fieldKey] = data;
                        }
                    }), 2000);
                }}
            />
        );
    }

    @computed get nativeSize() {
        TraceMobx();
        const nativeWidth = NumCast(this.dataDoc[this.fieldKey + "-nativeWidth"], 500);
        const nativeHeight = NumCast(this.dataDoc[this.fieldKey + "-nativeHeight"], 1);
        const nativeOrientation = NumCast(this.dataDoc[this.fieldKey + "-nativeOrientation"], 1);
        return { nativeWidth, nativeHeight, nativeOrientation };
    }

    // this._curSuffix = "";
    // if (w > 20) {
    // if (w < 100 && this._smallRetryCount < 10) this._curSuffix = "_s";
    // else if (w < 600 && this._mediumRetryCount < 10) this._curSuffix = "_m";
    // else if (this._largeRetryCount < 10) this._curSuffix = "_l";
    @computed get paths() {
        const field = Cast(this.dataDoc[this.fieldKey], ImageField, null); // retrieve the primary image URL that is being rendered from the data doc
        const alts = DocListCast(this.dataDoc[this.fieldKey + "-alternates"]); // retrieve alternate documents that may be rendered as alternate images
        const altpaths = alts.map(doc => Cast(doc[Doc.LayoutFieldKey(doc)], ImageField, null)?.url).filter(url => url).map(url => this.choosePath(url)); // access the primary layout data of the alternate documents
        const paths = field ? [this.choosePath(field.url), ...altpaths] : altpaths;
        return paths.length ? paths : [Utils.CorsProxy("http://www.cs.brown.edu/~bcz/noImage.png")];
    }

    @computed get content() {
        TraceMobx();

        const srcpath = this.paths[0];
        const fadepath = this.paths[Math.min(1, this.paths.length - 1)];
        const { nativeWidth, nativeHeight, nativeOrientation } = this.nativeSize;
        const rotation = NumCast(this.dataDoc[this.fieldKey + "-rotation"]);
        const aspect = rotation % 180 ? nativeHeight / nativeWidth : 1;
        let transformOrigin = "center center";
        let transform = `translate(0%, 0%) rotate(${rotation}deg) scale(${aspect})`;
        if (rotation === 90 || rotation === -270) {
            transformOrigin = "top left";
            transform = `translate(100%, 0%) rotate(${rotation}deg) scale(${aspect})`;
        } else if (rotation === 180) {
            transform = `rotate(${rotation}deg) scale(${aspect})`;
        } else if (rotation === 270 || rotation === -90) {
            transformOrigin = "right top";
            transform = `translate(-100%, 0%) rotate(${rotation}deg) scale(${aspect})`;
        }

        return <div className="imageBox-cont" key={this.layoutDoc[Id]} ref={this.createDropTarget} onPointerDown={this.marqueeDown}>
            <div className="imageBox-fader" >
                <img key={this._smallRetryCount + (this._mediumRetryCount << 4) + (this._largeRetryCount << 8)} // force cache to update on retrys
                    src={srcpath}
                    style={{ transform, transformOrigin }} draggable={false}
                    width={nativeWidth}
                    ref={this._imgRef}
                    onError={this.onError} />
                {fadepath === srcpath ? (null) : <div className="imageBox-fadeBlocker">
                    <img className="imageBox-fadeaway"
                        key={"fadeaway" + this._smallRetryCount + (this._mediumRetryCount << 4) + (this._largeRetryCount << 8)} // force cache to update on retrys
                        src={fadepath}
                        style={{ transform, transformOrigin }} draggable={false}
                        width={nativeWidth}
                        ref={this._imgRef}
                        onError={this.onError} /></div>}
            </div>
            {this.considerDownloadIcon}
            {this.considerGooglePhotosLink()}
            <FaceRectangles document={this.dataDoc} color={"#0000FF"} backgroundColor={"#0000FF"} />
        </div>;
    }

    // adjust y position to center image in panel aspect is bigger than image aspect.
    // bcz :note, this is broken for rotated images
    get ycenter() {
        const { nativeWidth, nativeHeight } = this.nativeSize;
        const rotation = NumCast(this.dataDoc[this.fieldKey + "-rotation"]);
        const aspect = (rotation % 180) ? nativeWidth / nativeHeight : nativeHeight / nativeWidth;
        return this.props.PanelHeight() / this.props.PanelWidth() > aspect ?
            (this.props.PanelHeight() - this.props.PanelWidth() * aspect) / 2 : 0;
    }

    screenToLocalTransform = () => this.props.ScreenToLocalTransform().translate(0, -this.ycenter);
    contentFunc = () => [this.content];

    private _mainCont: React.RefObject<HTMLDivElement> = React.createRef();
    private _annotationLayer: React.RefObject<HTMLDivElement> = React.createRef();
    @observable _marqueeing: number[] | undefined;
    @observable _savedAnnotations = new ObservableMap<number, HTMLDivElement[]>();
    @computed get annotationLayer() {
        return <div className="imageBox-annotationLayer" style={{ height: this.props.PanelHeight() }} ref={this._annotationLayer} />;
    }
    @action
    marqueeDown = (e: React.PointerEvent) => {
        if (!e.altKey && e.button === 0 && this.layoutDoc._viewScale === 1 && this.active(true)) this._marqueeing = [e.clientX, e.clientY];
    }
    @action
    finishMarquee = () => {
        this._marqueeing = undefined;
        this.props.select(true);
    }

    render() {
        TraceMobx();
        const borderRad = this.props.styleProvider?.(this.layoutDoc, this.props, StyleProp.BorderRounding);
        const borderRadius = borderRad?.includes("px") ? `${Number(borderRad.split("px")[0]) / (this.props.scaling?.() || 1)}px` : borderRad;
        return (<div className={`imageBox`} onContextMenu={this.specificContextMenu} ref={this._mainCont}
            style={{
                width: this.props.PanelWidth() ? undefined : `100%`,
                height: this.props.PanelWidth() ? undefined : `100%`,
                pointerEvents: this.props.layerProvider?.(this.layoutDoc) === false ? "none" : undefined,
                borderRadius
            }} >
            <CollectionFreeFormView {...OmitKeys(this.props, ["NativeWidth", "NativeHeight", "setContentView"]).omit}
                renderDepth={this.props.renderDepth + 1}
                ContainingCollectionDoc={this.props.ContainingCollectionDoc}
                CollectionView={undefined}
                PanelHeight={this.props.PanelHeight}
                scaling={returnOne}
                ScreenToLocalTransform={this.screenToLocalTransform}
                PanelWidth={this.props.PanelWidth}
                fieldKey={this.annotationKey}
                isAnnotationOverlay={true}
                docFilters={this.props.docFilters}
                docRangeFilters={this.props.docRangeFilters}
                searchFilterDocs={this.props.searchFilterDocs}
                removeDocument={this.removeDocument}
                moveDocument={this.moveDocument}
                addDocument={this.addDocument}
                annotationLayerHostsContent={true}
                focus={this.props.focus}
                isSelected={this.props.isSelected}
                select={emptyFunction}
                active={this.annotationsActive}
                whenActiveChanged={this.whenActiveChanged}>
                {this.contentFunc}
            </CollectionFreeFormView>
            {this.annotationLayer}
            {!this._marqueeing || !this._mainCont.current || !this._annotationLayer.current ? (null) :
                <MarqueeAnnotator rootDoc={this.rootDoc}
                    scrollTop={0} down={this._marqueeing}
                    scaling={this.props.scaling}
                    docView={this.props.docViewPath().lastElement()}
                    addDocument={this.addDocument}
                    finishMarquee={this.finishMarquee}
                    savedAnnotations={this._savedAnnotations}
                    annotationLayer={this._annotationLayer.current}
                    mainCont={this._mainCont.current}
                />}
        </div >);
    }

}
