import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { action, observable, runInAction, reaction, IReactionDisposer, trace, untracked, computed } from 'mobx';
import { observer } from "mobx-react";
import * as Pdfjs from "pdfjs-dist";
import "pdfjs-dist/web/pdf_viewer.css";
import { Opt, WidthSym, Doc, HeightSym } from "../../../fields/Doc";
import { makeInterface } from "../../../fields/Schema";
import { ScriptField } from '../../../fields/ScriptField';
import { Cast, NumCast, StrCast } from "../../../fields/Types";
import { PdfField, URLField } from "../../../fields/URLField";
import { Utils } from '../../../Utils';
import { undoBatch } from '../../util/UndoManager';
import { panZoomSchema } from '../collections/collectionFreeForm/CollectionFreeFormView';
import { ContextMenu } from '../ContextMenu';
import { ContextMenuProps } from '../ContextMenuItem';
import { ViewBoxAnnotatableComponent } from "../DocComponent";
import { PDFViewer } from "../pdf/PDFViewer";
import { FieldView, FieldViewProps } from './FieldView';
import { pageSchema } from "./ImageBox";
import { KeyCodes } from '../../util/KeyCodes';
import "./PDFBox.scss";
import React = require("react");
import { documentSchema } from '../../../fields/documentSchemas';

type PdfDocument = makeInterface<[typeof documentSchema, typeof panZoomSchema, typeof pageSchema]>;
const PdfDocument = makeInterface(documentSchema, panZoomSchema, pageSchema);

@observer
export class PDFBox extends ViewBoxAnnotatableComponent<FieldViewProps, PdfDocument>(PdfDocument) {
    public static LayoutString(fieldKey: string) { return FieldView.LayoutString(PDFBox, fieldKey); }
    private _keyValue: string = "";
    private _valueValue: string = "";
    private _scriptValue: string = "";
    private _searchString: string = "";
    private _initialScale: number = 0;  // the initial scale of the PDF when first rendered which determines whether the document will be live on startup or not.  Getting bigger after startup won't make it automatically be live.
    private _everActive = false; // has this box ever had its contents activated -- if so, stop drawing the overlay title
    private _pdfViewer: PDFViewer | undefined;
    private _searchRef = React.createRef<HTMLInputElement>();
    private _keyRef = React.createRef<HTMLInputElement>();
    private _valueRef = React.createRef<HTMLInputElement>();
    private _scriptRef = React.createRef<HTMLInputElement>();
    private _selectReactionDisposer: IReactionDisposer | undefined;

    @observable private _searching: boolean = false;
    @observable private _flyout: boolean = false;
    @observable private _pdf: Opt<Pdfjs.PDFDocumentProxy>;
    @observable private _pageControls = false;

    constructor(props: any) {
        super(props);
        this._initialScale = this.props.ScreenToLocalTransform().Scale;
        const nw = this.Document._nativeWidth = NumCast(this.dataDoc[this.props.fieldKey + "-nativeWidth"], NumCast(this.Document._nativeWidth, 927));
        const nh = this.Document._nativeHeight = NumCast(this.dataDoc[this.props.fieldKey + "-nativeHeight"], NumCast(this.Document._nativeHeight, 1200));
        !this.Document._fitWidth && (this.Document._height = this.Document[WidthSym]() * (nh / nw));

        const backup = "oldPath";
        const { Document } = this.props;
        const { url: { href } } = Cast(this.dataDoc[this.props.fieldKey], PdfField)!;
        const pathCorrectionTest = /upload\_[a-z0-9]{32}.(.*)/g;
        const matches = pathCorrectionTest.exec(href);
        console.log("\nHere's the { url } being fed into the outer regex:");
        console.log(href);
        console.log("And here's the 'properPath' build from the captured filename:\n");
        if (matches !== null && href.startsWith(window.location.origin)) {
            const properPath = Utils.prepend(`/files/pdfs/${matches[0]}`);
            console.log(properPath);
            if (!properPath.includes(href)) {
                console.log(`The two (url and proper path) were not equal`);
                const proto = Doc.GetProto(Document);
                proto[this.props.fieldKey] = new PdfField(properPath);
                proto[backup] = href;
            } else {
                console.log(`The two (url and proper path) were equal`);
            }
        } else {
            console.log("Outer matches was null!");
        }
    }

    componentWillUnmount() { this._selectReactionDisposer?.(); }
    componentDidMount() {
        this._selectReactionDisposer = reaction(() => this.props.isSelected(),
            () => {
                document.removeEventListener("keydown", this.onKeyDown);
                this.props.isSelected(true) && document.addEventListener("keydown", this.onKeyDown);
            }, { fireImmediately: true });
    }

    loaded = (nw: number, nh: number, np: number) => {
        this.dataDoc[this.props.fieldKey + "-numPages"] = np;
        this.dataDoc[this.props.fieldKey + "-nativeWidth"] = this.Document._nativeWidth = nw * 96 / 72;
        this.dataDoc[this.props.fieldKey + "-nativeHeight"] = this.Document._nativeHeight = nh * 96 / 72;
        !this.Document._fitWidth && (this.Document._height = this.Document[WidthSym]() * (nh / nw));
    }

    public search = (string: string, fwd: boolean) => { this._pdfViewer?.search(string, fwd); };
    public prevAnnotation = () => { this._pdfViewer?.prevAnnotation(); };
    public nextAnnotation = () => { this._pdfViewer?.nextAnnotation(); };
    public backPage = () => { this._pdfViewer!.gotoPage((this.Document.curPage || 1) - 1); };
    public forwardPage = () => { this._pdfViewer!.gotoPage((this.Document.curPage || 1) + 1); };
    public gotoPage = (p: number) => { this._pdfViewer!.gotoPage(p); };

    @undoBatch
    onKeyDown = action((e: KeyboardEvent) => {
        if (e.key === "f" && e.ctrlKey) {
            this._searching = true;
            setTimeout(() => this._searchRef.current && this._searchRef.current.focus(), 100);
            e.stopImmediatePropagation();
            e.preventDefault();
        }
        if (e.key === "PageDown" || e.key === "ArrowDown" || e.key === "ArrowRight") this.forwardPage();
        if (e.key === "PageUp" || e.key === "ArrowUp" || e.key === "ArrowLeft") this.backPage();
    });

    @undoBatch
    @action
    private applyFilter = () => {
        const scriptText = this._scriptValue ? this._scriptValue :
            this._keyValue && this._valueValue ? `this.${this._keyValue} === ${this._valueValue}` : "true";
        this.props.Document.filterScript = ScriptField.MakeFunction(scriptText);
    }

    private resetFilters = () => {
        this._keyValue = this._valueValue = this._scriptValue = "";
        this._keyRef.current && (this._keyRef.current.value = "");
        this._valueRef.current && (this._valueRef.current.value = "");
        this._scriptRef.current && (this._scriptRef.current.value = "");
        this.applyFilter();
    }
    private newKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => this._keyValue = e.currentTarget.value;
    private newValueChange = (e: React.ChangeEvent<HTMLInputElement>) => this._valueValue = e.currentTarget.value;
    private newScriptChange = (e: React.ChangeEvent<HTMLInputElement>) => this._scriptValue = e.currentTarget.value;

    whenActiveChanged = action((isActive: boolean) => this.props.whenActiveChanged(this._isChildActive = isActive));
    setPdfViewer = (pdfViewer: PDFViewer) => { this._pdfViewer = pdfViewer; };
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
        return !this.active() ? (null) :
            (<div className="pdfBox-ui" onKeyDown={e => e.keyCode === KeyCodes.BACKSPACE || e.keyCode === KeyCodes.DELETE ? e.stopPropagation() : true}
                onPointerDown={e => e.stopPropagation()} style={{ display: this.active() ? "flex" : "none" }}>
                <div className="pdfBox-overlayCont" key="cont" onPointerDown={(e) => e.stopPropagation()} style={{ left: `${this._searching ? 0 : 100}%` }}>
                    <button className="pdfBox-overlayButton" title="Open Search Bar" />
                    <input className="pdfBox-searchBar" placeholder="Search" ref={this._searchRef} onChange={this.searchStringChanged} onKeyDown={e => e.keyCode === KeyCodes.ENTER && this.search(this._searchString, !e.shiftKey)} />
                    <button title="Search" onClick={e => this.search(this._searchString, !e.shiftKey)}>
                        <FontAwesomeIcon icon="search" size="sm" color="white" /></button>
                    <button className="pdfBox-prevIcon " title="Previous Annotation" onClick={this.prevAnnotation} >
                        <FontAwesomeIcon style={{ color: "white" }} icon={"arrow-up"} size="lg" />
                    </button>
                    <button className="pdfBox-nextIcon" title="Next Annotation" onClick={this.nextAnnotation} >
                        <FontAwesomeIcon style={{ color: "white" }} icon={"arrow-down"} size="lg" />
                    </button>
                </div>
                <button className="pdfBox-overlayButton" key="search" onClick={action(() => this._searching = !this._searching)} title="Open Search Bar" style={{ bottom: 0, right: 0 }}>
                    <div className="pdfBox-overlayButton-arrow" onPointerDown={(e) => e.stopPropagation()}></div>
                    <div className="pdfBox-overlayButton-iconCont" onPointerDown={(e) => e.stopPropagation()}>
                        <FontAwesomeIcon style={{ color: "white" }} icon={this._searching ? "times" : "search"} size="lg" /></div>
                </button>
                <input value={`${(this.Document.curPage || 1)}`}
                    onChange={e => this.gotoPage(Number(e.currentTarget.value))}
                    style={{ left: 5, top: 5, height: "20px", width: "20px", position: "absolute", pointerEvents: "all" }}
                    onClick={action(() => this._pageControls = !this._pageControls)} />
                {this._pageControls ? pageBtns : (null)}
                <div className="pdfBox-settingsCont" key="settings" onPointerDown={(e) => e.stopPropagation()}>
                    <button className="pdfBox-settingsButton" onClick={action(() => this._flyout = !this._flyout)} title="Open Annotation Settings" >
                        <div className="pdfBox-settingsButton-arrow" style={{ transform: `scaleX(${this._flyout ? -1 : 1})` }} />
                        <div className="pdfBox-settingsButton-iconCont">
                            <FontAwesomeIcon style={{ color: "white" }} icon="cog" size="lg" />
                        </div>
                    </button>
                    <div className="pdfBox-settingsFlyout" style={{ right: `${this._flyout ? 20 : -600}px` }} >
                        <div className="pdfBox-settingsFlyout-title">
                            Annotation View Settings
                        </div>
                        <div className="pdfBox-settingsFlyout-kvpInput">
                            <input placeholder="Key" className="pdfBox-settingsFlyout-input" onChange={this.newKeyChange} style={{ gridColumn: 1 }} ref={this._keyRef} />
                            <input placeholder="Value" className="pdfBox-settingsFlyout-input" onChange={this.newValueChange} style={{ gridColumn: 3 }} ref={this._valueRef} />
                        </div>
                        <div className="pdfBox-settingsFlyout-kvpInput">
                            <input placeholder="Custom Script" onChange={this.newScriptChange} style={{ gridColumn: "1 / 4" }} ref={this._scriptRef} />
                        </div>
                        <div className="pdfBox-settingsFlyout-kvpInput">
                            <button style={{ gridColumn: 1 }} onClick={this.resetFilters}>
                                <FontAwesomeIcon style={{ color: "white" }} icon="trash" size="lg" />
                                &nbsp; Reset Filters
                            </button>
                            <button style={{ gridColumn: 3 }} onClick={this.applyFilter}>
                                <FontAwesomeIcon style={{ color: "white" }} icon="check" size="lg" />
                                &nbsp; Apply
                            </button>
                        </div>
                    </div>
                </div>
            </div>);
    }

    specificContextMenu = (e: React.MouseEvent): void => {
        const pdfUrl = Cast(this.dataDoc[this.props.fieldKey], PdfField);
        const funcs: ContextMenuProps[] = [];
        pdfUrl && funcs.push({ description: "Copy path", event: () => Utils.CopyText(pdfUrl.url.pathname), icon: "expand-arrows-alt" });
        funcs.push({ description: "Toggle Fit Width " + (this.Document._fitWidth ? "Off" : "On"), event: () => this.Document._fitWidth = !this.Document._fitWidth, icon: "expand-arrows-alt" });

        ContextMenu.Instance.addItem({ description: "Pdf Funcs...", subitems: funcs, icon: "asterisk" });
    }

    @computed get contentScaling() { return this.props.ContentScaling(); }
    @computed get renderTitleBox() {
        const classname = "pdfBox" + (this.active() ? "-interactive" : "");
        return <div className={classname} style={{
            width: !this.props.Document._fitWidth ? this.Document._nativeWidth || 0 : `${100 / this.contentScaling}%`,
            height: !this.props.Document._fitWidth ? this.Document._nativeHeight || 0 : `${100 / this.contentScaling}%`,
            transform: `scale(${this.contentScaling})`
        }}  >
            <div className="pdfBox-title-outer">
                <strong className="pdfBox-title" >{this.props.Document.title}</strong>
            </div>
        </div>;
    }

    isChildActive = (outsideReaction?: boolean) => this._isChildActive;
    @computed get renderPdfView() {
        const pdfUrl = Cast(this.dataDoc[this.props.fieldKey], PdfField);
        return <div className={"pdfBox"} onContextMenu={this.specificContextMenu} style={{ height: this.props.Document._scrollTop && !this.Document._fitWidth ? NumCast(this.Document._height) * this.props.PanelWidth() / NumCast(this.Document._width) : undefined }}>
            <PDFViewer {...this.props} pdf={this._pdf!} url={pdfUrl!.url.pathname} active={this.props.active} loaded={this.loaded}
                setPdfViewer={this.setPdfViewer} ContainingCollectionView={this.props.ContainingCollectionView}
                renderDepth={this.props.renderDepth} PanelHeight={this.props.PanelHeight} PanelWidth={this.props.PanelWidth}
                addDocTab={this.props.addDocTab} focus={this.props.focus}
                pinToPres={this.props.pinToPres} addDocument={this.addDocument}
                Document={this.props.Document} DataDoc={this.dataDoc} ContentScaling={this.props.ContentScaling}
                ScreenToLocalTransform={this.props.ScreenToLocalTransform} select={this.props.select}
                isSelected={this.props.isSelected} whenActiveChanged={this.whenActiveChanged}
                isChildActive={this.isChildActive}
                fieldKey={this.props.fieldKey} startupLive={this._initialScale < 2.5 || this.props.Document._scrollTop ? true : false} />
            {this.settingsPanel()}
        </div>;
    }

    _pdfjsRequested = false;
    render() {
        const pdfUrl = Cast(this.dataDoc[this.props.fieldKey], PdfField, null);
        if (this.props.isSelected() || this.props.renderDepth <= 1 || this.props.Document.scrollY !== undefined) this._everActive = true;
        if (pdfUrl && (this._everActive || this.props.Document._scrollTop || (this.dataDoc[this.props.fieldKey + "-nativeWidth"] && this.props.ScreenToLocalTransform().Scale < 2.5))) {
            if (pdfUrl instanceof PdfField && this._pdf) {
                return this.renderPdfView;
            }
            if (!this._pdfjsRequested) {
                this._pdfjsRequested = true;
                const promise = Pdfjs.getDocument(pdfUrl.url.href).promise;
                promise.then(action(pdf => { this._pdf = pdf; console.log("promise"); }));

            }
        }
        return this.renderTitleBox;
    }
}