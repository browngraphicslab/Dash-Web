import { action, computed, observable, reaction, runInAction } from "mobx";
import { observer } from "mobx-react";
import { Document } from "../../../fields/Document";
import { FieldWaiting, Field, Opt } from "../../../fields/Field";
import { KeyStore } from "../../../fields/KeyStore";
import { ListField } from "../../../fields/ListField";
import { TextField } from "../../../fields/TextField";
import { DragManager } from "../../util/DragManager";
import { Transform } from "../../util/Transform";
import { undoBatch } from "../../util/UndoManager";
import { InkingCanvas } from "../InkingCanvas";
import { CollectionFreeFormDocumentView } from "../nodes/CollectionFreeFormDocumentView";
import { DocumentContentsView } from "../nodes/DocumentContentsView";
import { DocumentViewProps, DocumentView } from "../nodes/DocumentView";
import "./CollectionFreeFormView.scss";
import { COLLECTION_BORDER_WIDTH } from "./CollectionView";
import { CollectionViewBase, CollectionViewProps } from "./CollectionViewBase";
import { MarqueeView } from "./MarqueeView";
import { PreviewCursor } from "./PreviewCursor";
import React = require("react");
import v5 = require("uuid/v5");
import { DocumentManager } from "../../util/DocumentManager";
import { Utils } from "../../../Utils";
import { Server } from "../../Server";
import { AverageAggregateParameters } from "../../northstar/model/idea/idea";

@observer
export class CollectionFreeFormView extends CollectionViewBase {
    public _canvasRef = React.createRef<HTMLDivElement>();
    private _selectOnLoaded: string = ""; // id of document that should be selected once it's loaded (used for click-to-type)

    public addLiveTextBox = (newBox: Document) => {
        // mark this collection so that when the text box is created we can send it the SelectOnLoad prop to focus itself
        this._selectOnLoaded = newBox.Id;
        //set text to be the typed key and get focus on text box
        this.props.addDocument(newBox, false);
        //remove cursor from screen
        this.PreviewCursorVisible = false;
    }

    public selectDocuments = (docs: Document[]) => {
        this.props.CollectionView.SelectedDocs.length = 0;
        docs.map(d => this.props.CollectionView.SelectedDocs.push(d.Id));
    }

    public getActiveDocuments = () => {
        var curPage = this.props.Document.GetNumber(KeyStore.CurPage, -1);
        const lvalue = this.props.Document.GetT<ListField<Document>>(this.props.fieldKey, ListField);
        let active: Document[] = [];
        if (lvalue && lvalue != FieldWaiting) {
            lvalue.Data.map(doc => {
                var page = doc.GetNumber(KeyStore.Page, -1);
                if (page == curPage || page == -1) {
                    active.push(doc);
                }
            })
        }

        return active;
    }

    //determines whether the blinking cursor for indicating whether a text will be made on key down is visible
    @observable public PreviewCursorVisible: boolean = false;
    @observable public MarqueeVisible = false;
    @observable public DownX: number = 0;
    @observable public DownY: number = 0;
    @observable private _lastX: number = 0;
    @observable private _lastY: number = 0;

    @computed get panX(): number { return this.props.Document.GetNumber(KeyStore.PanX, 0) }
    @computed get panY(): number { return this.props.Document.GetNumber(KeyStore.PanY, 0) }
    @computed get scale(): number { return this.props.Document.GetNumber(KeyStore.Scale, 1); }
    @computed get isAnnotationOverlay() { return this.props.fieldKey.Id === KeyStore.Annotations.Id; } // bcz: ? Why do we need to compare Id's?
    @computed get nativeWidth() { return this.props.Document.GetNumber(KeyStore.NativeWidth, 0); }
    @computed get nativeHeight() { return this.props.Document.GetNumber(KeyStore.NativeHeight, 0); }
    @computed get zoomScaling() { return this.props.Document.GetNumber(KeyStore.Scale, 1); }
    @computed get centeringShiftX() { return !this.props.Document.GetNumber(KeyStore.NativeWidth, 0) ? this.props.panelWidth() / 2 : 0; }  // shift so pan position is at center of window for non-overlay collections
    @computed get centeringShiftY() { return !this.props.Document.GetNumber(KeyStore.NativeHeight, 0) ? this.props.panelHeight() / 2 : 0; }// shift so pan position is at center of window for non-overlay collections

    @undoBatch
    @action
    drop = (e: Event, de: DragManager.DropEvent) => {
        if (super.drop(e, de)) {
            if (de.data instanceof DragManager.DocumentDragData) {
                let screenX = de.x - (de.data.xOffset as number || 0);
                let screenY = de.y - (de.data.yOffset as number || 0);
                const [x, y] = this.getTransform().transformPoint(screenX, screenY);
                de.data.droppedDocument.SetNumber(KeyStore.X, x);
                de.data.droppedDocument.SetNumber(KeyStore.Y, y);
                if (!de.data.droppedDocument.GetNumber(KeyStore.Width, 0)) {
                    de.data.droppedDocument.SetNumber(KeyStore.Width, 300);
                    de.data.droppedDocument.SetNumber(KeyStore.Height, 300);
                }
                this.bringToFront(de.data.droppedDocument);
            }
            return true;
        }
        return false;
    }


    @action
    cleanupInteractions = () => {
        document.removeEventListener("pointermove", this.onPointerMove);
        document.removeEventListener("pointerup", this.onPointerUp);
        this.MarqueeVisible = false;
    }

    @action
    onPointerDown = (e: React.PointerEvent): void => {
        this.PreviewCursorVisible = false;
        if ((e.button === 2 && this.props.active() && (!this.isAnnotationOverlay || this.zoomScaling != 1)) || e.button == 0) {
            document.removeEventListener("pointermove", this.onPointerMove);
            document.addEventListener("pointermove", this.onPointerMove);
            document.removeEventListener("pointerup", this.onPointerUp);
            document.addEventListener("pointerup", this.onPointerUp);
            this._lastX = this.DownX = e.pageX;
            this._lastY = this.DownY = e.pageY;
        }
    }

    @action
    onPointerUp = (e: PointerEvent): void => {
        e.stopPropagation();

        if (Math.abs(this.DownX - e.clientX) < 4 && Math.abs(this.DownY - e.clientY) < 4) {
            //show preview text cursor on tap
            this.PreviewCursorVisible = true;
            //select is not already selected
            if (!this.props.isSelected()) {
                this.props.select(false);
            }
        }
        this.cleanupInteractions();
    }

    @action
    onPointerMove = (e: PointerEvent): void => {
        if (!e.cancelBubble && this.props.active()) {
            if (e.buttons == 1 && !e.altKey && !e.metaKey) {
                this.MarqueeVisible = true;
            }
            if (this.MarqueeVisible) {
                e.stopPropagation();
                e.preventDefault();
            }
            else if ((!this.isAnnotationOverlay || this.zoomScaling != 1) && !e.shiftKey) {
                let x = this.props.Document.GetNumber(KeyStore.PanX, 0);
                let y = this.props.Document.GetNumber(KeyStore.PanY, 0);
                let [dx, dy] = this.getTransform().transformDirection(e.clientX - this._lastX, e.clientY - this._lastY);
                this.SetPan(x - dx, y - dy);
                this._lastX = e.pageX;
                this._lastY = e.pageY;
                e.stopPropagation();
                e.preventDefault();
            }
        }
    }

    @action
    onPointerWheel = (e: React.WheelEvent): void => {
        this.props.select(false);
        e.stopPropagation();
        e.preventDefault();
        let coefficient = 1000;

        if (e.ctrlKey) {
            var nativeWidth = this.props.Document.GetNumber(KeyStore.NativeWidth, 0);
            var nativeHeight = this.props.Document.GetNumber(KeyStore.NativeHeight, 0);
            const coefficient = 1000;
            let deltaScale = (1 - (e.deltaY / coefficient));
            this.props.Document.SetNumber(KeyStore.NativeWidth, nativeWidth * deltaScale);
            this.props.Document.SetNumber(KeyStore.NativeHeight, nativeHeight * deltaScale);
            e.stopPropagation();
            e.preventDefault();
        } else {
            // if (modes[e.deltaMode] == 'pixels') coefficient = 50;
            // else if (modes[e.deltaMode] == 'lines') coefficient = 1000; // This should correspond to line-height??
            let transform = this.getTransform();

            let deltaScale = (1 - (e.deltaY / coefficient));
            if (deltaScale * this.zoomScaling < 1 && this.isAnnotationOverlay)
                deltaScale = 1 / this.zoomScaling;
            let [x, y] = transform.transformPoint(e.clientX, e.clientY);

            let localTransform = this.getLocalTransform()
            localTransform = localTransform.inverse().scaleAbout(deltaScale, x, y)
            // console.log(localTransform)

            this.props.Document.SetNumber(KeyStore.Scale, localTransform.Scale);
            this.SetPan(-localTransform.TranslateX / localTransform.Scale, -localTransform.TranslateY / localTransform.Scale);
        }
    }

    @action
    private SetPan(panX: number, panY: number) {
        var x1 = this.getLocalTransform().inverse().Scale;
        const newPanX = Math.min((1 - 1 / x1) * this.nativeWidth, Math.max(0, panX));
        const newPanY = Math.min((1 - 1 / x1) * this.nativeHeight, Math.max(0, panY));
        this.props.Document.SetNumber(KeyStore.PanX, this.isAnnotationOverlay ? newPanX : panX);
        this.props.Document.SetNumber(KeyStore.PanY, this.isAnnotationOverlay ? newPanY : panY);
    }

    @action
    onDrop = (e: React.DragEvent): void => {
        var pt = this.getTransform().transformPoint(e.pageX, e.pageY);
        super.onDrop(e, { x: pt[0], y: pt[1] });
    }

    onDragOver = (): void => {
    }

    @action
    bringToFront(doc: Document) {
        const { fieldKey: fieldKey, Document: Document } = this.props;

        const value: Document[] = Document.GetList<Document>(fieldKey, []).slice();
        value.sort((doc1, doc2) => {
            if (doc1 === doc) {
                return 1;
            }
            if (doc2 === doc) {
                return -1;
            }
            return doc1.GetNumber(KeyStore.ZIndex, 0) - doc2.GetNumber(KeyStore.ZIndex, 0);
        }).map((doc, index) => {
            doc.SetNumber(KeyStore.ZIndex, index + 1)
        });
    }

    @computed get backgroundLayout(): string | undefined {
        let field = this.props.Document.GetT(KeyStore.BackgroundLayout, TextField);
        if (field && field !== FieldWaiting) {
            return field.Data;
        }
    }
    @computed get overlayLayout(): string | undefined {
        let field = this.props.Document.GetT(KeyStore.OverlayLayout, TextField);
        if (field && field !== FieldWaiting) {
            return field.Data;
        }
    }

    focusDocument = (doc: Document) => {
        let x = doc.GetNumber(KeyStore.X, 0) + doc.GetNumber(KeyStore.Width, 0) / 2;
        let y = doc.GetNumber(KeyStore.Y, 0) + doc.GetNumber(KeyStore.Height, 0) / 2;
        this.SetPan(x, y);
        this.props.focus(this.props.Document);
    }

    getDocumentViewProps(document: Document): DocumentViewProps {
        return {
            Document: document,
            AddDocument: this.props.addDocument,
            RemoveDocument: this.props.removeDocument,
            ScreenToLocalTransform: this.getTransform,
            isTopMost: false,
            SelectOnLoad: document.Id == this._selectOnLoaded,
            PanelWidth: document.Width,
            PanelHeight: document.Height,
            ContentScaling: this.noScaling,
            ContainingCollectionView: this.props.CollectionView,
            focus: this.focusDocument
        }
    }

    @computed
    get views() {
        var curPage = this.props.Document.GetNumber(KeyStore.CurPage, -1);
        const lvalue = this.props.Document.GetT<ListField<Document>>(this.props.fieldKey, ListField);
        if (lvalue && lvalue != FieldWaiting) {
            return lvalue.Data.map(doc => {
                if (!doc) return null;
                var page = doc.GetNumber(KeyStore.Page, 0);
                return (page != curPage && page != 0) ? (null) :
                    (<CollectionFreeFormDocumentView key={doc.Id} {...this.getDocumentViewProps(doc)} />);
            })
        }
        return null;
    }

    @computed
    get backgroundView() {
        return !this.backgroundLayout ? (null) :
            (<DocumentContentsView {...this.getDocumentViewProps(this.props.Document)}
                layoutKey={KeyStore.BackgroundLayout} isTopMost={this.props.isTopMost} isSelected={() => false} select={() => { }} />);
    }
    @computed
    get overlayView() {
        return !this.overlayLayout ? (null) :
            (<DocumentContentsView {...this.getDocumentViewProps(this.props.Document)}
                layoutKey={KeyStore.OverlayLayout} isTopMost={this.props.isTopMost} isSelected={() => false} select={() => { }} />);
    }

    getTransform = (): Transform => this.props.ScreenToLocalTransform().translate(-COLLECTION_BORDER_WIDTH, -COLLECTION_BORDER_WIDTH).translate(-this.centeringShiftX, -this.centeringShiftY).transform(this.getLocalTransform())
    getMarqueeTransform = (): Transform => this.props.ScreenToLocalTransform().translate(-COLLECTION_BORDER_WIDTH, -COLLECTION_BORDER_WIDTH)
    getLocalTransform = (): Transform => Transform.Identity.scale(1 / this.scale).translate(this.panX, this.panY);
    noScaling = () => 1;

    //when focus is lost, this will remove the preview cursor
    @action
    onBlur = (): void => {
        this.PreviewCursorVisible = false;
    }

    private crosshairs?: HTMLCanvasElement;
    drawCrosshairs = (backgroundColor: string) => {
        if (this.crosshairs) {
            let c = this.crosshairs;
            let ctx = c.getContext('2d');
            if (ctx) {
                ctx.fillStyle = backgroundColor;
                ctx.fillRect(0, 0, 20, 20);

                ctx.fillStyle = "black";
                ctx.lineWidth = 0.5;

                ctx.beginPath();

                ctx.moveTo(10, 0);
                ctx.lineTo(10, 8);

                ctx.moveTo(10, 20);
                ctx.lineTo(10, 12);

                ctx.moveTo(0, 10);
                ctx.lineTo(8, 10);

                ctx.moveTo(20, 10);
                ctx.lineTo(12, 10);

                ctx.stroke();

                // ctx.font = "10px Arial";
                // ctx.fillText(CurrentUserUtils.email[0].toUpperCase(), 10, 10);
            }
        }
    }

    render() {
        let [dx, dy] = [this.centeringShiftX, this.centeringShiftY];

        const panx: number = -this.props.Document.GetNumber(KeyStore.PanX, 0);
        const pany: number = -this.props.Document.GetNumber(KeyStore.PanY, 0);
        // const panx: number = this.props.Document.GetNumber(KeyStore.PanX, 0) + this.centeringShiftX;
        // const pany: number = this.props.Document.GetNumber(KeyStore.PanY, 0) + this.centeringShiftY;
        // console.log("center:", this.getLocalTransform().transformPoint(this.centeringShiftX, this.centeringShiftY));

        return (
            <div className={`collectionfreeformview${this.isAnnotationOverlay ? "-overlay" : "-container"}`}
                onPointerDown={this.onPointerDown}
                onPointerMove={(e) => super.setCursorPosition(this.getTransform().transformPoint(e.clientX, e.clientY))}
                onWheel={this.onPointerWheel}
                onDrop={this.onDrop.bind(this)}
                onDragOver={this.onDragOver}
                onBlur={this.onBlur}
                style={{ borderWidth: `${COLLECTION_BORDER_WIDTH}px` }}// , zIndex: !this.props.isTopMost ? -1 : undefined }}
                tabIndex={0}
                ref={this.createDropTarget}>
                <div className="collectionfreeformview"
                    style={{ transformOrigin: "left top", transform: `translate(${dx}px, ${dy}px) scale(${this.zoomScaling}, ${this.zoomScaling}) translate(${panx}px, ${pany}px)` }}
                    ref={this._canvasRef}>
                    {this.backgroundView}
                    <InkingCanvas getScreenTransform={this.getTransform} Document={this.props.Document} />
                    <PreviewCursor container={this} addLiveTextDocument={this.addLiveTextBox} getTransform={this.getTransform} />
                    {this.views}
                    <LinksView {...this.props} />
                    {super.getCursors().map(entry => {
                        if (entry.Data.length > 0) {
                            let id = entry.Data[0][0];
                            let email = entry.Data[0][1];
                            let point = entry.Data[1];
                            this.drawCrosshairs("#" + v5(id, v5.URL).substring(0, 6).toUpperCase() + "22")
                            return (
                                <div
                                    key={id}
                                    style={{
                                        position: "absolute",
                                        transform: `translate(${point[0] - 10}px, ${point[1] - 10}px)`,
                                        zIndex: 10000,
                                        transformOrigin: 'center center',
                                    }}
                                >
                                    <canvas
                                        ref={(el) => { if (el) this.crosshairs = el }}
                                        width={20}
                                        height={20}
                                        style={{
                                            position: 'absolute',
                                            width: "20px",
                                            height: "20px",
                                            opacity: 0.5,
                                            borderRadius: "50%",
                                            border: "2px solid black"
                                        }}
                                    />
                                    <p
                                        style={{
                                            fontSize: 14,
                                            color: "black",
                                            // fontStyle: "italic",
                                            marginLeft: -12,
                                            marginTop: 4
                                        }}
                                    >{email[0].toUpperCase()}</p>
                                </div>
                            );
                        }
                    })}
                </div>
                <MarqueeView container={this} activeDocuments={this.getActiveDocuments} selectDocuments={this.selectDocuments}
                    addDocument={this.props.addDocument} removeDocument={this.props.removeDocument}
                    getMarqueeTransform={this.getMarqueeTransform} getTransform={this.getTransform} />
                {this.overlayView}

            </div>
        );
    }
}

@observer
export class LinksView extends React.Component<CollectionViewProps> {
    private _mainCont = React.createRef<HTMLDivElement>();

    constructor(props: CollectionViewProps) {
        super(props);
    }

    @observable _triples: { a: Document, b: Document, l: Document }[] = [];

    findPairs() {
        return DocumentManager.Instance.DocumentViews.filter(dv => dv.props.ContainingCollectionView && dv.props.ContainingCollectionView.props.Document === this.props.Document).reduce((pairs, dv) => {

        return DocumentManager.Instance.DocumentViews.reduce((pairs, dv) => {
            let srcViews = [dv];
            let srcAnnot = dv.props.Document.GetT(KeyStore.AnnotationOn, Document);
            if (srcAnnot && srcAnnot != FieldWaiting && srcAnnot instanceof Document) {
                srcViews = DocumentManager.Instance.getDocumentViews(srcAnnot.GetPrototype() as Document)
            }
            srcViews = srcViews.filter(sv =>
                sv.props.ContainingCollectionView && sv.props.ContainingCollectionView.props.Document == self
            );
            let linksList = dv.props.Document.GetT(KeyStore.LinkedToDocs, ListField);
            if (linksList && linksList != FieldWaiting && linksList.Data.length) {
                pairs.push(...linksList.Data.reduce((pairs, link) => {
                    if (link instanceof Document) {
                        let linkToDoc = link.GetT(KeyStore.LinkedToDocs, Document);
                        if (linkToDoc && linkToDoc != FieldWaiting) {
                            DocumentManager.Instance.getDocumentViews(linkToDoc).map(docView1 => {

                                let targetViews = [docView1];
                                let docAnnot = docView1.props.Document.GetT(KeyStore.AnnotationOn, Document);
                                if (docAnnot && docAnnot != FieldWaiting && docAnnot instanceof Document) {
                                    targetViews = DocumentManager.Instance.getDocumentViews(docAnnot.GetPrototype() as Document)
                                }
                                targetViews.filter(tv =>
                                    tv.props.ContainingCollectionView && tv.props.ContainingCollectionView.props.Document == self
                                ).map(tv => srcViews.map(sv =>
                                    pairs.push({ a: sv.props.Document, b: tv.props.Document, l: link })))
                            })
                        }
                    }
                    return pairs;
                }, [] as { a: Document, b: Document, l: Document }[]));
            }
            return pairs;
        }, [] as { a: Document, b: Document, l: Document }[]);
    }
    componentDidMount() {
        reaction(() => this.findPairs(), (pairs) => runInAction(() => this._triples = pairs));
    }

    onPointerDown(e: React.PointerEvent) {
        let line = (e.nativeEvent as any).path[0];
        line.style.stroke = "red";
        Server.GetField(line.id, action((f: Opt<Field>) => {
            if (f instanceof Document) {
                console.log(f.Title);
            }
        }));
    }

    render() {
        if (!this._triples.length)
            return (null);
        return <svg className="collectionfreeformview-svgCanvas">
            {this._triples.map(pair => {
                let x1 = pair.a.GetNumber(KeyStore.X, 0) + pair.a.GetNumber(KeyStore.Width, 0) / 2;
                let y1 = pair.a.GetNumber(KeyStore.Y, 0) + pair.a.GetNumber(KeyStore.Height, 0) / 2;
                let x2 = pair.b.GetNumber(KeyStore.X, 0) + pair.b.GetNumber(KeyStore.Width, 0) / 2;
                let y2 = pair.b.GetNumber(KeyStore.Y, 0) + pair.b.GetNumber(KeyStore.Height, 0) / 2;
                return (
                    <line key={Utils.GenerateGuid()} id={pair.l.Id} className="collectionfreeformview-linkLine" onPointerDown={this.onPointerDown}
                        x1={`${x1}`} y1={`${y1}`}
                        x2={`${x2}`} y2={`${y2}`} />
                )
            })}
        </svg>
    }
}