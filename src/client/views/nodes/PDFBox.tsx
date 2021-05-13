import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { action, computed, IReactionDisposer, observable, reaction, runInAction } from 'mobx';
import { observer } from "mobx-react";
import * as Pdfjs from "pdfjs-dist";
import "pdfjs-dist/web/pdf_viewer.css";
import { Doc, Opt, WidthSym } from "../../../fields/Doc";
import { documentSchema } from '../../../fields/documentSchemas';
import { makeInterface } from "../../../fields/Schema";
import { Cast, NumCast, StrCast } from '../../../fields/Types';
import { PdfField } from "../../../fields/URLField";
import { TraceMobx } from '../../../fields/util';
import { Utils, setupMoveUpEvents, emptyFunction } from '../../../Utils';
import { Docs } from '../../documents/Documents';
import { KeyCodes } from '../../util/KeyCodes';
import { undoBatch } from '../../util/UndoManager';
import { panZoomSchema } from '../collections/collectionFreeForm/CollectionFreeFormView';
import { ContextMenu } from '../ContextMenu';
import { ContextMenuProps } from '../ContextMenuItem';
import { ViewBoxAnnotatableComponent, ViewBoxAnnotatableProps } from "../DocComponent";
import { PDFViewer } from "../pdf/PDFViewer";
import { SidebarAnnos } from '../SidebarAnnos';
import { FieldView, FieldViewProps } from './FieldView';
import { pageSchema } from "./ImageBox";
import "./PDFBox.scss";
import React = require("react");

type PdfDocument = makeInterface<[typeof documentSchema, typeof panZoomSchema, typeof pageSchema]>;
const PdfDocument = makeInterface(documentSchema, panZoomSchema, pageSchema);

@observer
export class PDFBox extends ViewBoxAnnotatableComponent<ViewBoxAnnotatableProps & FieldViewProps, PdfDocument>(PdfDocument) {
    public static LayoutString(fieldKey: string) { return FieldView.LayoutString(PDFBox, fieldKey); }
    private _searchString: string = "";
    private _initialScrollTarget: Opt<Doc>;
    private _pdfViewer: PDFViewer | undefined;
    private _searchRef = React.createRef<HTMLInputElement>();
    private _selectReactionDisposer: IReactionDisposer | undefined;
    private _sidebarRef = React.createRef<SidebarAnnos>();

    @observable private _searching: boolean = false;
    @observable private _pdf: Opt<Pdfjs.PDFDocumentProxy>;
    @observable private _pageControls = false;

    @computed get pdfUrl() { return Cast(this.dataDoc[this.props.fieldKey], PdfField); }

    constructor(props: any) {
        super(props);
        const nw = Doc.NativeWidth(this.Document, this.dataDoc) || 927;
        const nh = Doc.NativeHeight(this.Document, this.dataDoc) || 1200;
        !this.Document._fitWidth && (this.Document._height = this.Document[WidthSym]() * (nh / nw));
        if (this.pdfUrl) {
            if (PDFBox.pdfcache.get(this.pdfUrl.url.href)) runInAction(() => this._pdf = PDFBox.pdfcache.get(this.pdfUrl!.url.href));
            else if (PDFBox.pdfpromise.get(this.pdfUrl.url.href)) PDFBox.pdfpromise.get(this.pdfUrl.url.href)?.then(action(pdf => this._pdf = pdf));
        }

        const backup = "oldPath";
        const href = this.pdfUrl?.url.href;
        if (href) {
            const pathCorrectionTest = /upload\_[a-z0-9]{32}.(.*)/g;
            const matches = pathCorrectionTest.exec(href);
            // console.log("\nHere's the { url } being fed into the outer regex:");
            // console.log(href);
            // console.log("And here's the 'properPath' build from the captured filename:\n");
            if (matches !== null && href.startsWith(window.location.origin)) {
                const properPath = Utils.prepend(`/files/pdfs/${matches[0]}`);
                //console.log(properPath);
                if (!properPath.includes(href)) {
                    console.log(`The two (url and proper path) were not equal`);
                    const proto = Doc.GetProto(this.props.Document);
                    proto[this.props.fieldKey] = new PdfField(properPath);
                    proto[backup] = href;
                } else {
                    //console.log(`The two (url and proper path) were equal`);
                }
            } else {
                console.log("Outer matches was null!");
            }
        }
    }

    componentWillUnmount() { this._selectReactionDisposer?.(); }
    componentDidMount() {
        this.props.setContentView?.(this);
        this._selectReactionDisposer = reaction(() => this.props.isSelected(),
            () => {
                document.removeEventListener("keydown", this.onKeyDown);
                this.props.isSelected(true) && document.addEventListener("keydown", this.onKeyDown);
            }, { fireImmediately: true });
    }

    scrollFocus = (doc: Doc, smooth: boolean) => {
        if (this._sidebarRef?.current?.makeDocUnfiltered(doc)) return 1;
        this._initialScrollTarget = doc;
        return this._pdfViewer?.scrollFocus(doc, smooth);
    }
    getAnchor = () => {
        const anchor = Docs.Create.TextanchorDocument({
            title: StrCast(this.rootDoc.title + " " + this.layoutDoc._scrollTop),
            annotationOn: this.rootDoc,
            y: NumCast(this.layoutDoc._scrollTop),
        });
        this.addDocument(anchor);
        return anchor;
    }

    @action
    loaded = (nw: number, nh: number, np: number) => {
        this.dataDoc[this.props.fieldKey + "-numPages"] = np;
        Doc.SetNativeWidth(this.dataDoc, Math.max(Doc.NativeWidth(this.dataDoc), nw * 96 / 72));
        Doc.SetNativeHeight(this.dataDoc, nh * 96 / 72);
        this.layoutDoc._height = this.layoutDoc[WidthSym]() / (Doc.NativeAspect(this.dataDoc) || 1);
        !this.Document._fitWidth && (this.Document._height = this.Document[WidthSym]() * (nh / nw));
    }

    public search = (string: string, fwd: boolean) => this._pdfViewer?.search(string, fwd);
    public prevAnnotation = () => this._pdfViewer?.prevAnnotation();
    public nextAnnotation = () => this._pdfViewer?.nextAnnotation();
    public backPage = () => { this.Document._curPage = (this.Document._curPage || 1) - 1; return true; };
    public forwardPage = () => { this.Document._curPage = (this.Document._curPage || 1) + 1; return true; };
    public gotoPage = (p: number) => this.Document._curPage = p;

    @undoBatch
    onKeyDown = action((e: KeyboardEvent) => {
        let processed = false;
        switch (e.key) {
            case "f": if (e.ctrlKey) {
                setTimeout(() => this._searchRef.current?.focus(), 100);
                this._searching = processed = true;
            }
                break;
            case "PageDown": processed = this.forwardPage(); break;
            case "PageUp": processed = this.backPage(); break;
        }
        if (processed) {
            e.stopImmediatePropagation();
            e.preventDefault();
        }
    });

    setPdfViewer = (pdfViewer: PDFViewer) => {
        this._pdfViewer = pdfViewer;
        if (this._initialScrollTarget) {
            this.scrollFocus(this._initialScrollTarget, false);
            this._initialScrollTarget = undefined;
        }
    }
    searchStringChanged = (e: React.ChangeEvent<HTMLInputElement>) => this._searchString = e.currentTarget.value;

    sidebarAddDocument = (doc: Doc | Doc[], sidebarKey?: string) => {
        if (!this.layoutDoc._showSidebar) this.toggleSidebar();
        return this.addDocument(doc, sidebarKey);
    }
    sidebarBtnDown = (e: React.PointerEvent) => {
        setupMoveUpEvents(this, e, (e, down, delta) => {
            const localDelta = this.props.ScreenToLocalTransform().scale(this.props.scaling?.() || 1).transformDirection(delta[0], delta[1]);
            const nativeWidth = NumCast(this.layoutDoc[this.fieldKey + "-nativeWidth"]);
            const curNativeWidth = NumCast(this.layoutDoc.nativeWidth, nativeWidth);
            const ratio = (curNativeWidth + localDelta[0] / (this.props.scaling?.() || 1)) / nativeWidth;
            if (ratio >= 1) {
                this.layoutDoc.nativeWidth = nativeWidth * ratio;
                this.layoutDoc._width = this.layoutDoc[WidthSym]() + localDelta[0];
                this.layoutDoc._showSidebar = nativeWidth !== this.layoutDoc._nativeWidth;
            }
            return false;
        }, emptyFunction, this.toggleSidebar);
    }
    toggleSidebar = action(() => {
        const nativeWidth = NumCast(this.layoutDoc[this.fieldKey + "-nativeWidth"]);
        const ratio = ((!this.layoutDoc.nativeWidth || this.layoutDoc.nativeWidth === nativeWidth ? 250 : 0) + nativeWidth) / nativeWidth;
        const curNativeWidth = NumCast(this.layoutDoc.nativeWidth, nativeWidth);
        this.layoutDoc.nativeWidth = nativeWidth * ratio;
        this.layoutDoc._width = this.layoutDoc[WidthSym]() * nativeWidth * ratio / curNativeWidth;
        this.layoutDoc._showSidebar = nativeWidth !== this.layoutDoc._nativeWidth;
    });
    settingsPanel() {
        const pageBtns = <>
            <button className="pdfBox-backBtn" key="back" title="Page Back"
                onPointerDown={e => e.stopPropagation()} onClick={this.backPage} >
                <FontAwesomeIcon style={{ color: "white" }} icon={"arrow-left"} size="sm" />
            </button>
            <button className="pdfBox-fwdBtn" key="fwd" title="Page Forward"
                onPointerDown={e => e.stopPropagation()} onClick={this.forwardPage} >
                <FontAwesomeIcon style={{ color: "white" }} icon={"arrow-right"} size="sm" />
            </button>
        </>;
        const searchTitle = `${!this._searching ? "Open" : "Close"} Search Bar`;
        const curPage = this.Document._curPage || 1;
        return !this.isContentActive() ? (null) :
            <div className="pdfBox-ui" onKeyDown={e => [KeyCodes.BACKSPACE, KeyCodes.DELETE].includes(e.keyCode) ? e.stopPropagation() : true}
                onPointerDown={e => e.stopPropagation()} style={{ display: this.isContentActive() ? "flex" : "none" }}>
                <div className="pdfBox-overlayCont" onPointerDown={(e) => e.stopPropagation()} style={{ left: `${this._searching ? 0 : 100}%` }}>
                    <button className="pdfBox-overlayButton" title={searchTitle} />
                    <input className="pdfBox-searchBar" placeholder="Search" ref={this._searchRef} onChange={this.searchStringChanged}
                        onKeyDown={e => e.keyCode === KeyCodes.ENTER && this.search(this._searchString, !e.shiftKey)} />
                    <button className="pdfBox-search" title="Search" onClick={e => this.search(this._searchString, !e.shiftKey)}>
                        <FontAwesomeIcon icon="search" size="sm" />
                    </button>
                    <button className="pdfBox-prevIcon" title="Previous Annotation" onClick={this.prevAnnotation} >
                        <FontAwesomeIcon icon={"arrow-up"} size="lg" />
                    </button>
                    <button className="pdfBox-nextIcon" title="Next Annotation" onClick={this.nextAnnotation} >
                        <FontAwesomeIcon icon={"arrow-down"} size="lg" />
                    </button>
                </div>
                <button className="pdfBox-overlayButton" title={searchTitle}
                    onClick={action(() => { this._searching = !this._searching; this.search("mxytzlaf", true); })} >
                    <div className="pdfBox-overlayButton-arrow" onPointerDown={(e) => e.stopPropagation()} />
                    <div className="pdfBox-overlayButton-iconCont" onPointerDown={(e) => e.stopPropagation()}>
                        <FontAwesomeIcon icon={this._searching ? "times" : "search"} size="lg" />
                    </div>
                </button>

                <div className="pdfBox-pageNums">
                    <input value={curPage} style={{ width: `${curPage > 99 ? 4 : 3}ch`, pointerEvents: "all" }}
                        onChange={e => this.Document._curPage = Number(e.currentTarget.value)}
                        onClick={action(() => this._pageControls = !this._pageControls)} />
                    {this._pageControls ? pageBtns : (null)}
                </div>
                <button className="pdfBox-sidebarBtn" title="Toggle Sidebar"
                    style={{ display: !this.isContentActive() ? "none" : undefined }}
                    onPointerDown={this.sidebarBtnDown} >
                    <FontAwesomeIcon icon={"chevron-left"} size="sm" />
                </button>
            </div>;
    }
    sidebarWidth = () => !this.layoutDoc._showSidebar ? 0 : (NumCast(this.layoutDoc.nativeWidth) - Doc.NativeWidth(this.dataDoc)) * this.props.PanelWidth() / NumCast(this.layoutDoc.nativeWidth);

    specificContextMenu = (e: React.MouseEvent): void => {
        const funcs: ContextMenuProps[] = [];
        funcs.push({ description: "Copy path", event: () => this.pdfUrl && Utils.CopyText(this.pdfUrl.url.pathname), icon: "expand-arrows-alt" });
        funcs.push({ description: "Toggle Fit Width " + (this.Document._fitWidth ? "Off" : "On"), event: () => this.Document._fitWidth = !this.Document._fitWidth, icon: "expand-arrows-alt" });
        funcs.push({ description: "Toggle Annotation View ", event: () => this.Document._showSidebar = !this.Document._showSidebar, icon: "expand-arrows-alt" });
        funcs.push({ description: "Toggle Sidebar ", event: () => this.toggleSidebar(), icon: "expand-arrows-alt" });
        ContextMenu.Instance.addItem({ description: "Options...", subitems: funcs, icon: "asterisk" });
    }

    @computed get renderTitleBox() {
        const classname = "pdfBox" + (this.isContentActive() ? "-interactive" : "");
        return <div className={classname} >
            <div className="pdfBox-title-outer">
                <strong className="pdfBox-title" >{this.props.Document.title}</strong>
            </div>
        </div>;
    }

    anchorMenuClick = () => this._sidebarRef.current?.anchorMenuClick;

    @computed get renderPdfView() {
        TraceMobx();
        return <div className={"pdfBox"} onContextMenu={this.specificContextMenu}
            style={{
                height: this.props.Document._scrollTop && !this.Document._fitWidth && (window.screen.width > 600) ?
                    NumCast(this.Document._height) * this.props.PanelWidth() / NumCast(this.Document._width) : undefined
            }}>
            <div className="pdfBox-background" />
            <PDFViewer {...this.props}
                rootDoc={this.rootDoc}
                layoutDoc={this.layoutDoc}
                dataDoc={this.dataDoc}
                pdf={this._pdf!}
                url={this.pdfUrl!.url.pathname}
                isContentActive={this.isContentActive}
                anchorMenuClick={this.anchorMenuClick}
                loaded={!Doc.NativeAspect(this.dataDoc) ? this.loaded : undefined}
                setPdfViewer={this.setPdfViewer}
                addDocument={this.addDocument}
                moveDocument={this.moveDocument}
                removeDocument={this.removeDocument}
                whenChildContentsActiveChanged={this.whenChildContentsActiveChanged}
                startupLive={true}
                ContentScaling={this.props.scaling}
                sidebarWidth={this.sidebarWidth}
            />
            <SidebarAnnos ref={this._sidebarRef}
                {...this.props}
                rootDoc={this.rootDoc}
                layoutDoc={this.layoutDoc}
                dataDoc={this.dataDoc}
                whenChildContentsActiveChanged={this.whenChildContentsActiveChanged}
                sidebarAddDocument={this.sidebarAddDocument}
                moveDocument={this.moveDocument}
                removeDocument={this.removeDocument}
                isContentActive={this.isContentActive}
            />
            {this.settingsPanel()}
        </div>;
    }

    static pdfcache = new Map<string, Pdfjs.PDFDocumentProxy>();
    static pdfpromise = new Map<string, Pdfjs.PDFPromise<Pdfjs.PDFDocumentProxy>>();
    render() {
        TraceMobx();
        if (this._pdf) return this.renderPdfView;

        const href = this.pdfUrl?.url.href;
        if (href) {
            if (PDFBox.pdfcache.get(href)) setTimeout(action(() => this._pdf = PDFBox.pdfcache.get(href)));
            else {
                if (!PDFBox.pdfpromise.get(href)) PDFBox.pdfpromise.set(href, Pdfjs.getDocument(href).promise);
                PDFBox.pdfpromise.get(href)?.then(action(pdf => PDFBox.pdfcache.set(href, this._pdf = pdf)));
            }
        }
        return this.renderTitleBox;
    }
}