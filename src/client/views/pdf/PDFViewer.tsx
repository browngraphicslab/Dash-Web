import { action, computed, IReactionDisposer, observable, reaction, runInAction } from "mobx";
import { observer } from "mobx-react";
import * as Pdfjs from "pdfjs-dist";
import "pdfjs-dist/web/pdf_viewer.css";
import * as rp from "request-promise";
import { Dictionary } from "typescript-collections";
import { Doc, DocListCast, HeightSym, Opt, WidthSym } from "../../../new_fields/Doc";
import { Id } from "../../../new_fields/FieldSymbols";
import { List } from "../../../new_fields/List";
import { BoolCast, Cast, NumCast, StrCast, FieldValue } from "../../../new_fields/Types";
import { emptyFunction } from "../../../Utils";
import { DocServer } from "../../DocServer";
import { Docs, DocUtils, DocumentOptions } from "../../documents/Documents";
import { DocumentManager } from "../../util/DocumentManager";
import { DragManager } from "../../util/DragManager";
import { DocumentView } from "../nodes/DocumentView";
import { PDFBox } from "../nodes/PDFBox";
import Page from "./Page";
import "./PDFViewer.scss";
import React = require("react");
import PDFMenu from "./PDFMenu";
import { UndoManager } from "../../util/UndoManager";
import { ScriptField } from "../../../fields/ScriptField";
import { CompileScript, CompiledScript, CompileResult } from "../../util/Scripting";

export const scale = 2;
interface IPDFViewerProps {
    url: string;
    loaded: (nw: number, nh: number, np: number) => void;
    scrollY: number;
    parent: PDFBox;
}

/**
 * Wrapper that loads the PDF and cascades the pdf down
 */
@observer
export class PDFViewer extends React.Component<IPDFViewerProps> {
    @observable _pdf: Opt<Pdfjs.PDFDocumentProxy>;
    private _mainDiv = React.createRef<HTMLDivElement>();

    @action
    componentDidMount() {
        Pdfjs.getDocument(this.props.url).promise.then(pdf => runInAction(() => this._pdf = pdf));
    }

    render() {
        return (
            <div ref={this._mainDiv}>
                {!this._pdf ? (null) :
                    <Viewer pdf={this._pdf} loaded={this.props.loaded} scrollY={this.props.scrollY} parent={this.props.parent} mainCont={this._mainDiv} url={this.props.url} />}
            </div>
        );
    }
}

interface IViewerProps {
    pdf: Pdfjs.PDFDocumentProxy;
    loaded: (nw: number, nh: number, np: number) => void;
    scrollY: number;
    parent: PDFBox;
    mainCont: React.RefObject<HTMLDivElement>;
    url: string;
}

const PinRadius = 25;

/**
 * Handles rendering and virtualization of the pdf
 */
@observer
class Viewer extends React.Component<IViewerProps> {
    // _visibleElements is the array of JSX elements that gets rendered
    @observable.shallow private _visibleElements: JSX.Element[] = [];
    // _isPage is an array that tells us whether or not an index is rendered as a page or as a placeholder
    @observable private _isPage: string[] = [];
    @observable private _pageSizes: { width: number, height: number }[] = [];
    @observable private _annotations: Doc[] = [];
    @observable private _savedAnnotations: Dictionary<number, HTMLDivElement[]> = new Dictionary<number, HTMLDivElement[]>();
    @observable private _script: CompileResult | undefined;

    private _pageBuffer: number = 1;
    private _annotationLayer: React.RefObject<HTMLDivElement> = React.createRef();
    private _reactionDisposer?: IReactionDisposer;
    private _annotationReactionDisposer?: IReactionDisposer;
    private _dropDisposer?: DragManager.DragDropDisposer;
    private _filterReactionDisposer?: IReactionDisposer;

    @action
        constructor(props: IViewerProps) {
            super(props);

            let scriptfield = Cast(this.props.parent.Document.filterScript, ScriptField);
            this._script = scriptfield ? CompileScript(scriptfield.scriptString, { params: { this: Doc.name } }) : CompileScript("return true");;
        }

    componentDidUpdate = (prevProps: IViewerProps) => {
        if (this.scrollY !== prevProps.scrollY) {
            this.renderPages();
        }
    }

    @action
    componentDidMount = () => {
        this._reactionDisposer = reaction(

            () => [this.props.parent.props.active(), this.startIndex, this._pageSizes.length ? this.endIndex : 0],
            async () => {
                await this.initialLoad();
                this.renderPages();
            }, { fireImmediately: true });

        this._annotationReactionDisposer = reaction(
            () => this.props.parent.Document && DocListCast(this.props.parent.Document.annotations),
            (annotations: Doc[]) =>
                annotations && annotations.length && this.renderAnnotations(annotations, true),
            { fireImmediately: true });

        if (this.props.parent.props.ContainingCollectionView) {
            this._filterReactionDisposer = reaction(
                () => this.props.parent.Document.filterScript || this.props.parent.props.ContainingCollectionView!.props.Document.filterScript,
                () => {
                    runInAction(() => {
                        let scriptfield = Cast(this.props.parent.Document.filterScript, ScriptField);
                        this._script = scriptfield ? CompileScript(scriptfield.scriptString, { params: { this: Doc.name } }) : CompileScript("return true");;
                    });
                }
            );
        }
    }

    componentWillUnmount = () => {
        this._reactionDisposer && this._reactionDisposer();
        this._annotationReactionDisposer && this._annotationReactionDisposer();
        this._filterReactionDisposer && this._filterReactionDisposer();
    }

    @action
    initialLoad = async () => {
        if (this._pageSizes.length === 0) {
            let pageSizes = Array<{ width: number, height: number }>(this.props.pdf.numPages);
            this._isPage = Array<string>(this.props.pdf.numPages);
            for (let i = 0; i < this.props.pdf.numPages; i++) {
                await this.props.pdf.getPage(i + 1).then(page => runInAction(() => {
                    // pageSizes[i] = { width: page.view[2] * scale, height: page.view[3] * scale };
                    let x = page.getViewport(scale);
                    pageSizes[i] = { width: x.width, height: x.height };
                }));
            }
            runInAction(() =>
                Array.from(Array((this._pageSizes = pageSizes).length).keys()).map(this.getPlaceholderPage));
            this.props.loaded(Math.max(...pageSizes.map(i => i.width)), pageSizes[0].height, this.props.pdf.numPages);
            // this.props.loaded(Math.max(...pageSizes.map(i => i.width)), pageSizes[0].height, this.props.pdf.numPages);

            let startY = NumCast(this.props.parent.Document.startY);
            let ccv = this.props.parent.props.ContainingCollectionView;
            if (ccv) {
                ccv.props.Document.panY = startY;
            }
            this.props.parent.Document.scrollY = 0;
            this.props.parent.Document.scrollY = startY + 1;
        }
    }

    private mainCont = (div: HTMLDivElement | null) => {
        this._dropDisposer && this._dropDisposer();
        if (div) {
            this._dropDisposer = div && DragManager.MakeDropTarget(div, { handlers: { drop: this.drop.bind(this) } });
        }
    }

    makeAnnotationDocument = (sourceDoc: Doc | undefined, s: number, color: string): Doc => {
        let annoDocs: Doc[] = [];
        let mainAnnoDoc = Docs.CreateInstance(new Doc(), "", {});

        mainAnnoDoc.page = Math.round(Math.random());
        this._savedAnnotations.forEach((key: number, value: HTMLDivElement[]) => {
            for (let anno of value) {
                let annoDoc = new Doc();
                if (anno.style.left) annoDoc.x = parseInt(anno.style.left) / scale;
                if (anno.style.top) annoDoc.y = parseInt(anno.style.top) / scale;
                if (anno.style.height) annoDoc.height = parseInt(anno.style.height) / scale;
                if (anno.style.width) annoDoc.width = parseInt(anno.style.width) / scale;
                annoDoc.page = key;
                annoDoc.target = sourceDoc;
                annoDoc.group = mainAnnoDoc;
                annoDoc.color = color;
                annoDoc.type = AnnotationTypes.Region;
                annoDocs.push(annoDoc);
                anno.remove();
            }
        });

        mainAnnoDoc.annotations = new List<Doc>(annoDocs);
        if (sourceDoc) {
            DocUtils.MakeLink(sourceDoc, mainAnnoDoc, undefined, `Annotation from ${StrCast(this.props.parent.Document.title)}`, "", StrCast(this.props.parent.Document.title));
        }
        this._savedAnnotations.clear();
        return mainAnnoDoc;
    }

    drop = async (e: Event, de: DragManager.DropEvent) => {
        if (de.data instanceof DragManager.LinkDragData) {
            let sourceDoc = de.data.linkSourceDocument;
            let destDoc = this.makeAnnotationDocument(sourceDoc, 1, "red");
            let targetAnnotations = DocListCast(this.props.parent.Document.annotations);
            if (targetAnnotations) {
                targetAnnotations.push(destDoc);
                this.props.parent.Document.annotations = new List<Doc>(targetAnnotations);
            }
            else {
                this.props.parent.Document.annotations = new List<Doc>([destDoc]);
            }
            e.stopPropagation();
        }
    }
    /**
     * Called by the Page class when it gets rendered, initializes the lists and
     * puts a placeholder with all of the correct page sizes when all of the pages have been loaded.
     */
    @action
    pageLoaded = (index: number, page: Pdfjs.PDFPageViewport): void => {
        this.props.loaded(page.width, page.height, this.props.pdf.numPages);
    }
    @action
    getPlaceholderPage = (page: number) => {
        if (this._isPage[page] !== "none") {
            this._isPage[page] = "none";
            this._visibleElements[page] = (
                <div key={`${this.props.url}-placeholder-${page + 1}`} className="pdfviewer-placeholder"
                    style={{ width: this._pageSizes[page].width, height: this._pageSizes[page].height }} />
            );
        }
    }
    @action
    getRenderedPage = (page: number) => {
        if (this._isPage[page] !== "page") {
            this._isPage[page] = "page";
            this._visibleElements[page] = (
                <Page
                    size={this._pageSizes[page]}
                    pdf={this.props.pdf}
                    page={page}
                    numPages={this.props.pdf.numPages}
                    key={`${this.props.url}-rendered-${page + 1}`}
                    name={`${this.props.pdf.fingerprint + `-page${page + 1}`}`}
                    pageLoaded={this.pageLoaded}
                    parent={this.props.parent}
                    makePin={emptyFunction}
                    renderAnnotations={this.renderAnnotations}
                    createAnnotation={this.createAnnotation}
                    sendAnnotations={this.receiveAnnotations}
                    makeAnnotationDocuments={this.makeAnnotationDocument}
                    getScrollFromPage={this.getScrollFromPage}
                    {...this.props} />
            );
        }
    }

    // change the address to be the file address of the PNG version of each page
    // file address of the pdf
    @action
    getPageImage = async (page: number) => {
        let handleError = () => this.getRenderedPage(page);
        if (this._isPage[page] !== "image") {
            this._isPage[page] = "image";
            const address = this.props.url;
            let res = JSON.parse(await rp.get(DocServer.prepend(`/thumbnail${address.substring("files/".length, address.length - ".pdf".length)}-${page + 1}.PNG`)));
            runInAction(() => this._visibleElements[page] =
                <img key={res.path} src={res.path} onError={handleError}
                    style={{ width: `${parseInt(res.width) * scale}px`, height: `${parseInt(res.height) * scale}px` }} />);
        }
    }

    @computed get scrollY(): number { return this.props.scrollY; }

    // startIndex: where to start rendering pages
    @computed get startIndex(): number { return Math.max(0, this.getPageFromScroll(this.scrollY) - this._pageBuffer); }

    // endIndex: where to end rendering pages
    @computed get endIndex(): number {
        return Math.min(this.props.pdf.numPages - 1, this.getPageFromScroll(this.scrollY + this._pageSizes[0].height) + this._pageBuffer);
    }

    @action
    renderPages = () => {
        for (let i = 0; i < this.props.pdf.numPages; i++) {
            if (i < this.startIndex || i > this.endIndex) {
                this.getPlaceholderPage(i);  // pages outside of the pdf use empty stand-in divs
            } else {
                if (this.props.parent.props.active()) {
                    this.getRenderedPage(i);
                } else {
                    this.getPageImage(i);
                }
            }
        }
    }

    @action
    private renderAnnotations = (annotations: Doc[], removeOldAnnotations: boolean): void => {
        if (removeOldAnnotations) {
            this._annotations = annotations;
        }
        else {
            this._annotations.push(...annotations);
            this._annotations = new Array<Doc>(...this._annotations);
        }
    }

    @action
    receiveAnnotations = (annotations: HTMLDivElement[], page: number) => {
        if (page === -1) {
            this._savedAnnotations.values().forEach(v => v.forEach(a => a.remove()));
            this._savedAnnotations.keys().forEach(k => this._savedAnnotations.setValue(k, annotations));
        }
        else {
            this._savedAnnotations.setValue(page, annotations);
        }
    }

    sendAnnotations = (page: number): HTMLDivElement[] | undefined => {
        return this._savedAnnotations.getValue(page);
    }

    // get the page index that the vertical offset passed in is on
    getPageFromScroll = (vOffset: number) => {
        let index = 0;
        let currOffset = vOffset;
        while (index < this._pageSizes.length && currOffset - this._pageSizes[index].height > 0) {
            currOffset -= this._pageSizes[index++].height;
        }
        return index;
    }

    getScrollFromPage = (index: number): number => {
        let counter = 0;
        for (let i = 0; i < Math.min(this.props.pdf.numPages, index); i++) {
            counter += this._pageSizes[i].height;
        }
        return counter;
    }

    createAnnotation = (div: HTMLDivElement, page: number) => {
        if (this._annotationLayer.current) {
            if (div.style.top) {
                div.style.top = (parseInt(div.style.top) + this.getScrollFromPage(page)).toString();
            }
            this._annotationLayer.current.append(div);
            let savedPage = this._savedAnnotations.getValue(page);
            if (savedPage) {
                savedPage.push(div);
                this._savedAnnotations.setValue(page, savedPage);
            }
            else {
                this._savedAnnotations.setValue(page, [div]);
            }
        }
    }

    renderAnnotation = (anno: Doc): JSX.Element[] => {
        let annotationDocs = DocListCast(anno.annotations);
        let res = annotationDocs.map(a => {
            let type = NumCast(a.type);
            switch (type) {
                // case AnnotationTypes.Pin:
                //     return <PinAnnotation parent={this} document={a} x={NumCast(a.x)} y={NumCast(a.y)} width={a[WidthSym]()} height={a[HeightSym]()} key={a[Id]} />;
                case AnnotationTypes.Region:
                    return <RegionAnnotation parent={this} document={a} x={NumCast(a.x)} y={NumCast(a.y)} width={a[WidthSym]()} height={a[HeightSym]()} key={a[Id]} />;
                default:
                    return <div></div>;
            }
        });
        return res;
    }

    render() {
        let compiled = this._script;
        return (
            <div ref={this.mainCont} style={{ pointerEvents: "all" }}>
                <div className="viewer">
                    {this._visibleElements}
                </div>
                <div className="pdfViewer-annotationLayer"
                    style={{
                        height: this.props.parent.Document.nativeHeight, width: `100%`,
                        pointerEvents: this.props.parent.props.active() ? "none" : "all"
                    }}>
                    <div className="pdfViewer-annotationLayer-subCont" ref={this._annotationLayer}>
                        {this._annotations.filter(anno => {
                            if (compiled && compiled.compiled) {
                                let run = compiled.run({ this: anno });
                                if (run.success) {
                                    return run.result;
                                }
                            }
                            return true;
                        }).map(anno => this.renderAnnotation(anno))}
                    </div>
                </div>
            </div >
        );
    }
}

export enum AnnotationTypes {
    Region
}

interface IAnnotationProps {
    x: number;
    y: number;
    width: number;
    height: number;
    parent: Viewer;
    document: Doc;
}

class RegionAnnotation extends React.Component<IAnnotationProps> {
    @observable private _backgroundColor: string = "red";

    private _reactionDisposer?: IReactionDisposer;
    private _mainCont: React.RefObject<HTMLDivElement>;

    constructor(props: IAnnotationProps) {
        super(props);

        this._mainCont = React.createRef();
    }

    componentDidMount() {
        this._reactionDisposer = reaction(
            () => BoolCast(this.props.document.delete),
            () => {
                if (BoolCast(this.props.document.delete)) {
                    if (this._mainCont.current) {
                        this._mainCont.current.style.display = "none";
                    }
                }
            },
            { fireImmediately: true }
        );
    }

    componentWillUnmount() {
        this._reactionDisposer && this._reactionDisposer();
    }

    deleteAnnotation = () => {
        let annotation = DocListCast(this.props.parent.props.parent.Document.annotations);
        let group = FieldValue(Cast(this.props.document.group, Doc));
        if (group && annotation.indexOf(group) !== -1) {
            let newAnnotations = annotation.filter(a => a !== FieldValue(Cast(this.props.document.group, Doc)));
            this.props.parent.props.parent.Document.annotations = new List<Doc>(newAnnotations);
        }

        if (group) {
            let groupAnnotations = DocListCast(group.annotations);
            groupAnnotations.forEach(anno => anno.delete = true);
        }

        PDFMenu.Instance.fadeOut(true);
    }

    @action
    onPointerDown = (e: React.PointerEvent) => {
        if (e.button === 0) {
            let targetDoc = Cast(this.props.document.target, Doc, null);
            if (targetDoc) {
                DocumentManager.Instance.jumpToDocument(targetDoc);
            }
        }
        if (e.button === 2) {
            PDFMenu.Instance.Status = "annotation";
            PDFMenu.Instance.Delete = this.deleteAnnotation;
            PDFMenu.Instance.Pinned = false;
            PDFMenu.Instance.jumpTo(e.clientX, e.clientY, true);
        }
    }

    render() {
        return (
            <div className="pdfViewer-annotationBox" onPointerDown={this.onPointerDown} ref={this._mainCont}
                style={{ top: this.props.y * scale, left: this.props.x * scale, width: this.props.width * scale, height: this.props.height * scale, pointerEvents: "all", backgroundColor: StrCast(this.props.document.color) }}></div>
        );
    }
}