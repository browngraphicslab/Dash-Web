import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { action, computed, IReactionDisposer, observable, reaction, runInAction } from 'mobx';
import { observer } from "mobx-react";
import * as Pdfjs from "pdfjs-dist";
import "pdfjs-dist/web/pdf_viewer.css";
import { Doc, Opt, WidthSym, HeightSym, DocListCast, StrListCast } from "../../../fields/Doc";
import { documentSchema } from '../../../fields/documentSchemas';
import { makeInterface } from "../../../fields/Schema";
import { Cast, NumCast, StrCast } from '../../../fields/Types';
import { PdfField } from "../../../fields/URLField";
import { TraceMobx } from '../../../fields/util';
import { Utils, returnOne, OmitKeys, emptyFunction, returnZero, returnTrue } from '../../../Utils';
import { KeyCodes } from '../../util/KeyCodes';
import { undoBatch } from '../../util/UndoManager';
import { panZoomSchema } from '../collections/collectionFreeForm/CollectionFreeFormView';
import { CollectionViewType } from '../collections/CollectionView';
import { ContextMenu } from '../ContextMenu';
import { ContextMenuProps } from '../ContextMenuItem';
import { ViewBoxAnnotatableComponent } from "../DocComponent";
import { PDFViewer } from "../pdf/PDFViewer";
import { FieldView, FieldViewProps } from './FieldView';
import { pageSchema } from "./ImageBox";
import "./PDFBox.scss";
import React = require("react");
import { DocAfterFocusFunc } from './DocumentView';
import { Docs, DocUtils } from '../../documents/Documents';
import { CollectionStackingView } from '../collections/CollectionStackingView';
import { StyleProp } from '../StyleProvider';
import { SearchBox } from '../search/SearchBox';
import { CurrentUserUtils } from '../../util/CurrentUserUtils';
import { Id } from '../../../fields/FieldSymbols';
import { FormattedTextBox } from './formattedText/FormattedTextBox';

type PdfDocument = makeInterface<[typeof documentSchema, typeof panZoomSchema, typeof pageSchema]>;
const PdfDocument = makeInterface(documentSchema, panZoomSchema, pageSchema);

@observer
export class PDFBox extends ViewBoxAnnotatableComponent<FieldViewProps, PdfDocument>(PdfDocument) {
    public static LayoutString(fieldKey: string) { return FieldView.LayoutString(PDFBox, fieldKey); }
    private _searchString: string = "";
    private _initialScale: number = 0;  // the initial scale of the PDF when first rendered which determines whether the document will be live on startup or not.  Getting bigger after startup won't make it automatically be live.
    private _displayPdfLive = false; // has this box ever had its contents activated -- if so, stop drawing the overlay title
    private _pdfViewer: PDFViewer | undefined;
    private _searchRef = React.createRef<HTMLInputElement>();
    private _selectReactionDisposer: IReactionDisposer | undefined;

    @observable private _searching: boolean = false;
    @observable private _pdf: Opt<Pdfjs.PDFDocumentProxy>;
    @observable private _pageControls = false;

    constructor(props: any) {
        super(props);
        this._initialScale = this.props.ScreenToLocalTransform().Scale;
        const nw = Doc.NativeWidth(this.Document, this.dataDoc) || 927;
        const nh = Doc.NativeHeight(this.Document, this.dataDoc) || 1200;
        !this.Document._fitWidth && (this.Document._height = this.Document[WidthSym]() * (nh / nw));
        const pdfUrl = Cast(this.dataDoc[this.props.fieldKey], PdfField);
        if (pdfUrl) {
            if (PDFBox.pdfcache.get(pdfUrl.url.href)) runInAction(() => this._pdf = PDFBox.pdfcache.get(pdfUrl.url.href));
            else if (PDFBox.pdfpromise.get(pdfUrl.url.href)) PDFBox.pdfpromise.get(pdfUrl.url.href)?.then(action(pdf => this._pdf = pdf));
        }

        const backup = "oldPath";
        const { Document } = this.props;
        const pdf = Cast(this.dataDoc[this.props.fieldKey], PdfField);
        const href = pdf?.url?.href;
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
                    const proto = Doc.GetProto(Document);
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

    initialScrollTarget: Opt<Doc>;
    scrollFocus = (doc: Doc, smooth: boolean) => {
        this.initialScrollTarget = doc;
        return this._pdfViewer?.scrollFocus(doc, smooth);
    }
    getAnchor = () => {
        const anchor = Docs.Create.TextanchorDocument({
            title: StrCast(this.rootDoc.title + " " + this.layoutDoc._scrollTop),
            useLinkSmallAnchor: true,
            hideLinkButton: true,
            annotationOn: this.rootDoc,
            y: NumCast(this.layoutDoc._scrollTop),
        });
        this.addDocument(anchor);
        return anchor;
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

    @action
    loaded = (nw: number, nh: number, np: number) => {
        this.dataDoc[this.props.fieldKey + "-numPages"] = np;
        Doc.SetNativeWidth(this.dataDoc, Math.max(Doc.NativeWidth(this.dataDoc), nw * 96 / 72));
        Doc.SetNativeHeight(this.dataDoc, nh * 96 / 72);
        this.layoutDoc._height = this.layoutDoc[WidthSym]() / (Doc.NativeAspect(this.dataDoc) || 1);
        !this.Document._fitWidth && (this.Document._height = this.Document[WidthSym]() * (nh / nw));
    }
    sidebarKey = () => this.fieldKey + "-sidebar";
    sidebarFiltersHeight = () => 50;
    sidebarTransform = () => this.props.ScreenToLocalTransform().translate(Doc.NativeWidth(this.dataDoc), 0).scale(this.props.scaling?.() || 1);
    sidebarWidth = () => !this.layoutDoc._showSidebar ? 0 : (NumCast(this.layoutDoc.nativeWidth) - Doc.NativeWidth(this.dataDoc)) * this.props.PanelWidth() / NumCast(this.layoutDoc.nativeWidth);
    sidebarHeight = () => this.props.PanelHeight() - this.sidebarFiltersHeight() - 20;
    sidebarAddDocument = (doc: Doc | Doc[]) => this.addDocument(doc, this.sidebarKey());
    sidebarMoveDocument = (doc: Doc | Doc[], targetCollection: Doc | undefined, addDocument: (doc: Doc | Doc[]) => boolean) => this.moveDocument(doc, targetCollection, addDocument, this.sidebarKey());
    sidebarRemDocument = (doc: Doc | Doc[]) => this.removeDocument(doc, this.sidebarKey());
    @computed get allTags() {
        const keys = new Set<string>();
        DocListCast(this.rootDoc[this.sidebarKey()]).forEach(doc => SearchBox.documentKeys(doc).forEach(key => keys.add(key)));
        return Array.from(keys.keys()).filter(key => key[0]).filter(key => !key.startsWith("_") && (key[0] === "#" || key[0] === key[0].toUpperCase())).sort();
    }
    renderTag = (tag: string) => {
        const active = StrListCast(this.rootDoc.docFilters).includes(`${tag}:${tag}:check`);
        return <div className={`pdfbox-filterTag${active ? "-active" : ""}`}
            onClick={e => Doc.setDocFilter(this.rootDoc, tag, tag, "check", true)}>
            {tag}
        </div>;
    }
    @computed get sidebarOverlay() {
        return !this.layoutDoc._showSidebar ? (null) :
            <div style={{
                position: "absolute", pointerEvents: this.active() ? "all" : undefined, top: 0, right: 0,
                background: this.props.styleProvider?.(this.rootDoc, this.props, StyleProp.WidgetColor),
                width: `${this.sidebarWidth()}px`,
                height: "100%"
            }}>
                <div className="pdfBox-tagList" style={{ height: this.sidebarFiltersHeight(), width: this.sidebarWidth() }}>
                    {this.allTags.map(tag => this.renderTag(tag))}
                </div>
                <div style={{ width: "100%", height: this.sidebarHeight(), position: "relative" }}>
                    <CollectionStackingView {...OmitKeys(this.props, ["NativeWidth", "NativeHeight", "setContentView"]).omit}
                        NativeWidth={returnZero}
                        NativeHeight={returnZero}
                        PanelHeight={this.sidebarHeight}
                        PanelWidth={this.sidebarWidth}
                        xMargin={0}
                        yMargin={0}
                        chromeStatus={"enabled"}
                        scaleField={this.sidebarKey() + "-scale"}
                        isAnnotationOverlay={false}
                        select={emptyFunction}
                        active={this.annotationsActive}
                        scaling={returnOne}
                        whenActiveChanged={this.whenActiveChanged}
                        childHideDecorationTitle={returnTrue}
                        removeDocument={this.sidebarRemDocument}
                        moveDocument={this.sidebarMoveDocument}
                        addDocument={this.sidebarAddDocument}
                        CollectionView={undefined}
                        ScreenToLocalTransform={this.sidebarTransform}
                        renderDepth={this.props.renderDepth + 1}
                        fieldKey={this.sidebarKey()}
                        pointerEvents={"all"}
                    /></div>
            </div>;
    }

    public search = (string: string, fwd: boolean) => { this._pdfViewer?.search(string, fwd); };
    public prevAnnotation = () => { this._pdfViewer?.prevAnnotation(); };
    public nextAnnotation = () => { this._pdfViewer?.nextAnnotation(); };
    public backPage = () => { this.Document._curPage = (this.Document._curPage || 1) - 1; return true; };
    public forwardPage = () => { this.Document._curPage = (this.Document._curPage || 1) + 1; return true; };
    public gotoPage = (p: number) => { this.Document._curPage = p; };

    @undoBatch
    onKeyDown = action((e: KeyboardEvent) => {
        let processed = false;
        if (e.key === "f" && e.ctrlKey) {
            this._searching = true;
            setTimeout(() => this._searchRef.current && this._searchRef.current.focus(), 100);
            processed = true;
        }
        if (e.key === "PageDown") processed = this.forwardPage();
        if (e.key === "PageUp") processed = this.backPage();
        if (e.target instanceof HTMLInputElement || this.props.ContainingCollectionDoc?._viewType !== CollectionViewType.Freeform) {
            if (e.key === "ArrowDown" || e.key === "ArrowRight") processed = this.forwardPage();
            if (e.key === "ArrowUp" || e.key === "ArrowLeft") processed = this.backPage();
        }
        if (processed) {
            e.stopImmediatePropagation();
            e.preventDefault();
        }
    });

    whenActiveChanged = action((isActive: boolean) => this.props.whenActiveChanged(this._isChildActive = isActive));
    setPdfViewer = (pdfViewer: PDFViewer) => {
        this._pdfViewer = pdfViewer;
        if (this.initialScrollTarget) {
            this.scrollFocus(this.initialScrollTarget, false);
            this.initialScrollTarget = undefined;
        }
    }
    searchStringChanged = (e: React.ChangeEvent<HTMLInputElement>) => this._searchString = e.currentTarget.value;

    settingsPanel() {
        const pageBtns = <>
            <button className="pdfBox-overlayButton-back" key="back" title="Page Back"
                onPointerDown={e => e.stopPropagation()} onClick={e => this.backPage()} >
                <FontAwesomeIcon style={{ color: "white" }} icon={"arrow-left"} size="sm" />
            </button>
            <button className="pdfBox-overlayButton-fwd" key="fwd" title="Page Forward"
                onPointerDown={e => e.stopPropagation()} onClick={e => this.forwardPage()} >
                <FontAwesomeIcon style={{ color: "white" }} icon={"arrow-right"} size="sm" />
            </button>
        </>;
        const searchTitle = `${!this._searching ? "Open" : "Close"} Search Bar`;
        const curPage = this.Document._curPage || 1;
        return !this.active() ? (null) :
            (<div className="pdfBox-ui" onKeyDown={e => e.keyCode === KeyCodes.BACKSPACE || e.keyCode === KeyCodes.DELETE ? e.stopPropagation() : true}
                onPointerDown={e => e.stopPropagation()} style={{ display: this.active() ? "flex" : "none" }}>
                <div className="pdfBox-overlayCont" key="cont" onPointerDown={(e) => e.stopPropagation()} style={{ left: `${this._searching ? 0 : 100}%` }}>
                    <button className="pdfBox-overlayButton" title={searchTitle} />
                    <input className="pdfBox-searchBar" placeholder="Search" ref={this._searchRef} onChange={this.searchStringChanged} onKeyDown={e => e.keyCode === KeyCodes.ENTER && this.search(this._searchString, !e.shiftKey)} />
                    <button className="pdfBox-search" title="Search" onClick={e => this.search(this._searchString, !e.shiftKey)}>
                        <FontAwesomeIcon icon="search" size="sm" color="white" /></button>
                    <button className="pdfBox-prevIcon " title="Previous Annotation" onClick={this.prevAnnotation} >
                        <FontAwesomeIcon style={{ color: "white" }} icon={"arrow-up"} size="lg" />
                    </button>
                    <button className="pdfBox-nextIcon" title="Next Annotation" onClick={this.nextAnnotation} >
                        <FontAwesomeIcon style={{ color: "white" }} icon={"arrow-down"} size="lg" />
                    </button>
                </div>
                <button className="pdfBox-overlayButton" key="search" onClick={action(() => {
                    this._searching = !this._searching;
                    this.search("mxytzlaf", true);
                })} title={searchTitle} style={{ bottom: 0, right: 0 }}>
                    <div className="pdfBox-overlayButton-arrow" onPointerDown={(e) => e.stopPropagation()}></div>
                    <div className="pdfBox-overlayButton-iconCont" onPointerDown={(e) => e.stopPropagation()}>
                        <FontAwesomeIcon style={{ color: "white" }} icon={this._searching ? "times" : "search"} size="lg" /></div>
                </button>

                <div className="pdfBox-pageNums">
                    <input value={curPage}
                        onChange={e => this.Document._curPage = Number(e.currentTarget.value)}
                        style={{ width: `${curPage > 99 ? 4 : 3}ch`, pointerEvents: "all" }}
                        onClick={action(() => this._pageControls = !this._pageControls)} />
                    {this._pageControls ? pageBtns : (null)}
                </div>
            </div>);
    }

    specificContextMenu = (e: React.MouseEvent): void => {
        const pdfUrl = Cast(this.dataDoc[this.props.fieldKey], PdfField);
        const funcs: ContextMenuProps[] = [];
        pdfUrl && funcs.push({ description: "Copy path", event: () => Utils.CopyText(pdfUrl.url.pathname), icon: "expand-arrows-alt" });
        funcs.push({ description: "Toggle Fit Width " + (this.Document._fitWidth ? "Off" : "On"), event: () => this.Document._fitWidth = !this.Document._fitWidth, icon: "expand-arrows-alt" });
        !Doc.UserDoc().noviceMode && funcs.push({ description: "Toggle Sidebar mode ", event: () => this.Document._showSidebar = !this.Document._showSidebar, icon: "expand-arrows-alt" });

        ContextMenu.Instance.addItem({ description: "Options...", subitems: funcs, icon: "asterisk" });
    }

    anchorMenuClick = (anchor: Doc) => {
        this.Document._showSidebar = true;
        const startup = StrListCast(this.rootDoc.docFilters).map(filter => filter.split(":")[0]).join(" ");
        const target = Docs.Create.TextDocument(startup, {
            title: "anno",
            annotationOn: this.rootDoc, _width: 200, _height: 50, _fitWidth: true, _autoHeight: true, _fontSize: StrCast(Doc.UserDoc().fontSize),
            _fontFamily: StrCast(Doc.UserDoc().fontFamily)
        });
        FormattedTextBox.SelectOnLoad = target[Id];
        FormattedTextBox.DontSelectInitialText = true;
        this.allTags.map(tag => target[tag] = tag);
        DocUtils.MakeLink({ doc: anchor }, { doc: target }, "inline markup", "annotation");
        this.sidebarAddDocument(target);
    }

    @computed get renderTitleBox() {
        const classname = "pdfBox" + (this.active() ? "-interactive" : "");
        return <div className={classname} >
            <div className="pdfBox-title-outer">
                <strong className="pdfBox-title" >{this.props.Document.title}</strong>
            </div>
        </div>;
    }

    isChildActive = (outsideReaction?: boolean) => this._isChildActive;
    @computed get renderPdfView() {
        TraceMobx();
        const pdfUrl = Cast(this.dataDoc[this.props.fieldKey], PdfField);
        return <div className={"pdfBox"} onContextMenu={this.specificContextMenu}
            style={{ height: this.props.Document._scrollTop && !this.Document._fitWidth && (window.screen.width > 600) ? NumCast(this.Document._height) * this.props.PanelWidth() / NumCast(this.Document._width) : undefined }}>
            <div className="pdfBox-background" />
            <PDFViewer {...this.props}
                pdf={this._pdf!}
                url={pdfUrl!.url.pathname}
                anchorMenuClick={this.anchorMenuClick}
                loaded={!Doc.NativeAspect(this.dataDoc) ? this.loaded : undefined}
                setPdfViewer={this.setPdfViewer}
                addDocument={this.addDocument}
                whenActiveChanged={this.whenActiveChanged}
                isChildActive={this.isChildActive}
                startupLive={true}
                ContentScaling={this.props.scaling}
                sidebarWidth={this.sidebarWidth}
            />
            {this.sidebarOverlay}
            {this.settingsPanel()}
        </div>;
    }

    static pdfcache = new Map<string, Pdfjs.PDFDocumentProxy>();
    static pdfpromise = new Map<string, Pdfjs.PDFPromise<Pdfjs.PDFDocumentProxy>>();
    render() {
        TraceMobx();
        if (true) {//this.props.isSelected() || (this.props.active() && this.props.renderDepth === 0)) {
            this._displayPdfLive = true;
        }
        if (this._displayPdfLive) {
            if (this._pdf) return this.renderPdfView;

            const href = Cast(this.dataDoc[this.props.fieldKey], PdfField, null)?.url.href;
            if (href) {
                if (PDFBox.pdfcache.get(href)) setTimeout(action(() => this._pdf = PDFBox.pdfcache.get(href)));
                else {
                    if (!PDFBox.pdfpromise.get(href)) PDFBox.pdfpromise.set(href, Pdfjs.getDocument(href).promise);
                    PDFBox.pdfpromise.get(href)?.then(action(pdf => PDFBox.pdfcache.set(href, this._pdf = pdf)));
                }
            }
        }
        return this.renderTitleBox;
    }
}