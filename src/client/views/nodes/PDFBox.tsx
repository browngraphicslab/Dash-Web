import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { action, computed, IReactionDisposer, observable, reaction, runInAction, untracked, trace } from 'mobx';
import { observer } from "mobx-react";
import * as Pdfjs from "pdfjs-dist";
import "pdfjs-dist/web/pdf_viewer.css";
import 'react-image-lightbox/style.css';
import { Doc, Opt, WidthSym } from "../../../new_fields/Doc";
import { makeInterface } from "../../../new_fields/Schema";
import { ScriptField } from '../../../new_fields/ScriptField';
import { Cast, NumCast } from "../../../new_fields/Types";
import { PdfField } from "../../../new_fields/URLField";
import { KeyCodes } from '../../northstar/utils/KeyCodes';
import { panZoomSchema } from '../collections/collectionFreeForm/CollectionFreeFormView';
import { DocComponent } from "../DocComponent";
import { InkingControl } from "../InkingControl";
import { PDFViewer } from "../pdf/PDFViewer";
import { documentSchema } from "./DocumentView";
import { FieldView, FieldViewProps } from './FieldView';
import { pageSchema } from "./ImageBox";
import "./PDFBox.scss";
import React = require("react");
import { undoBatch } from '../../util/UndoManager';
import { ContextMenuProps } from '../ContextMenuItem';
import { ContextMenu } from '../ContextMenu';
import { Utils } from '../../../Utils';

type PdfDocument = makeInterface<[typeof documentSchema, typeof panZoomSchema, typeof pageSchema]>;
const PdfDocument = makeInterface(documentSchema, panZoomSchema, pageSchema);

@observer
export class PDFBox extends DocComponent<FieldViewProps, PdfDocument>(PdfDocument) {
    public static LayoutString(fieldExt?: string) { return FieldView.LayoutString(PDFBox, "data", fieldExt); }
    private _keyValue: string = "";
    private _valueValue: string = "";
    private _scriptValue: string = "";
    private _searchString: string = "";
    private _isChildActive = false;
    private _everActive = false; // has this box ever had its contents activated -- if so, stop drawing the overlay title
    private _pdfViewer: PDFViewer | undefined;
    private _keyRef: React.RefObject<HTMLInputElement> = React.createRef();
    private _valueRef: React.RefObject<HTMLInputElement> = React.createRef();
    private _scriptRef: React.RefObject<HTMLInputElement> = React.createRef();

    @observable private _searching: boolean = false;
    @observable private _flyout: boolean = false;
    @observable private _pdf: Opt<Pdfjs.PDFDocumentProxy>;
    @observable private _pageControls = false;

    @computed get extensionDoc() { return Doc.fieldExtensionDoc(this.dataDoc, this.props.fieldKey); }
    @computed get dataDoc() { return this.props.DataDoc && this.props.Document.isTemplate ? this.props.DataDoc : Doc.GetProto(this.props.Document); }

    componentDidMount() {
        const pdfUrl = Cast(this.dataDoc[this.props.fieldKey], PdfField);
        if (pdfUrl instanceof PdfField) {
            Pdfjs.getDocument(pdfUrl.url.pathname).promise.then(pdf => runInAction(() => this._pdf = pdf));
        }
    }
    loaded = (nw: number, nh: number, np: number) => {
        this.dataDoc.numPages = np;
        this.Document.nativeWidth = nw * 96 / 72;
        this.Document.nativeHeight = nh * 96 / 72;
        !this.Document.fitWidth && !this.Document.ignoreAspect && (this.Document.height = this.Document[WidthSym]() * (nh / nw));
    }

    public search(string: string, fwd: boolean) { this._pdfViewer && this._pdfViewer.search(string, fwd); }
    public prevAnnotation() { this._pdfViewer && this._pdfViewer.prevAnnotation(); }
    public nextAnnotation() { this._pdfViewer && this._pdfViewer.nextAnnotation(); }
    public backPage() { this._pdfViewer!.gotoPage(NumCast(this.props.Document.curPage) - 1); }
    public gotoPage = (p: number) => { this._pdfViewer!.gotoPage(p); };
    public forwardPage() { this._pdfViewer!.gotoPage(NumCast(this.props.Document.curPage) + 1); }

    @undoBatch
    @action
    private applyFilter = () => {
        let scriptText = this._scriptValue ? this._scriptValue :
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

    whenActiveChanged = (isActive: boolean) => this.props.whenActiveChanged(this._isChildActive = isActive);
    active = () => this.props.isSelected() || this._isChildActive || this.props.renderDepth === 0;
    setPdfViewer = (pdfViewer: PDFViewer) => { this._pdfViewer = pdfViewer; };
    searchStringChanged = (e: React.ChangeEvent<HTMLInputElement>) => this._searchString = e.currentTarget.value;

    settingsPanel() {
        let pageBtns = <>
            <button className="pdfBox-overlayButton-iconCont" key="back" title="Page Back"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => this.backPage()}
                style={{ left: 50, top: 5, height: "30px", position: "absolute", pointerEvents: "all" }}>
                <FontAwesomeIcon style={{ color: "white" }} icon={"arrow-left"} size="sm" />
            </button>
            <button className="pdfBox-overlayButton-iconCont" key="fwd" title="Page Forward"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => this.forwardPage()}
                style={{ left: 80, top: 5, height: "30px", position: "absolute", pointerEvents: "all" }}>
                <FontAwesomeIcon style={{ color: "white" }} icon={"arrow-right"} size="sm" />
            </button>
        </>;
        return !this.props.active() ? (null) :
            (<div className="pdfBox-ui" onKeyDown={e => e.keyCode === KeyCodes.BACKSPACE || e.keyCode === KeyCodes.DELETE ? e.stopPropagation() : true}
                onPointerDown={e => e.stopPropagation()} style={{ display: this.active() ? "flex" : "none", position: "absolute", width: "100%", height: "100%", zIndex: 1, pointerEvents: "none" }}>
                <div className="pdfBox-overlayCont" key="cont" onPointerDown={(e) => e.stopPropagation()} style={{ left: `${this._searching ? 0 : 100}%` }}>
                    <button className="pdfBox-overlayButton" title="Open Search Bar" />
                    <input className="pdfBox-searchBar" placeholder="Search" onChange={this.searchStringChanged} onKeyDown={e => e.keyCode === KeyCodes.ENTER && this.search(this._searchString, !e.shiftKey)} />
                    <button title="Search" onClick={e => this.search(this._searchString, !e.shiftKey)}>
                        <FontAwesomeIcon icon="search" size="sm" color="white" /></button>
                    <button className="pdfBox-prevIcon " title="Previous Annotation" onClick={e => this.prevAnnotation()} >
                        <FontAwesomeIcon style={{ color: "white" }} icon={"arrow-up"} size="sm" />
                    </button>
                    <button className="pdfBox-nextIcon" title="Next Annotation" onClick={e => this.nextAnnotation()} >
                        <FontAwesomeIcon style={{ color: "white" }} icon={"arrow-down"} size="sm" />
                    </button>
                </div>
                <button className="pdfBox-overlayButton" key="search" onClick={action(() => this._searching = !this._searching)} title="Open Search Bar" style={{ bottom: 8, right: 0 }}>
                    <div className="pdfBox-overlayButton-arrow" onPointerDown={(e) => e.stopPropagation()}></div>
                    <div className="pdfBox-overlayButton-iconCont" onPointerDown={(e) => e.stopPropagation()}>
                        <FontAwesomeIcon style={{ color: "white", padding: 5 }} icon={this._searching ? "times" : "search"} size="3x" /></div>
                </button>
                <input value={`${NumCast(this.props.Document.curPage)}`}
                    onChange={e => this.gotoPage(Number(e.currentTarget.value))}
                    style={{ left: 20, top: 5, height: "30px", width: "30px", position: "absolute", pointerEvents: "all" }}
                    onClick={action(() => this._pageControls = !this._pageControls)} />
                {this._pageControls ? pageBtns : (null)}
                <div className="pdfBox-settingsCont" key="settings" onPointerDown={(e) => e.stopPropagation()}>
                    <button className="pdfBox-settingsButton" onClick={action(() => this._flyout = !this._flyout)} title="Open Annotation Settings" >
                        <div className="pdfBox-settingsButton-arrow" style={{ transform: `scaleX(${this._flyout ? -1 : 1})` }} />
                        <div className="pdfBox-settingsButton-iconCont">
                            <FontAwesomeIcon style={{ color: "white", padding: 5 }} icon="cog" size="3x" />
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
        let funcs: ContextMenuProps[] = [];
        pdfUrl && funcs.push({ description: "Copy path", event: () => Utils.CopyText(pdfUrl.url.pathname), icon: "expand-arrows-alt" });
        funcs.push({ description: "Toggle Fit Width " + (this.Document.fitWidth ? "Off" : "On"), event: () => this.Document.fitWidth = !this.Document.fitWidth, icon: "expand-arrows-alt" });

        ContextMenu.Instance.addItem({ description: "Pdf Funcs...", subitems: funcs, icon: "asterisk" });
    }
    _initialScale: number | undefined;
    render() {
        const pdfUrl = Cast(this.dataDoc[this.props.fieldKey], PdfField);
        let classname = "pdfBox-cont" + (InkingControl.Instance.selectedTool || !this.active ? "" : "-interactive");
        let noPdf = !(pdfUrl instanceof PdfField) || !this._pdf;
        if (this._initialScale === undefined) this._initialScale = this.props.ScreenToLocalTransform().Scale;
        if (this.props.isSelected() || this.props.Document.scrollY !== undefined) this._everActive = true;
        return (noPdf || (!this._everActive && this.props.ScreenToLocalTransform().Scale > 2.5) ?
            <div className="pdfBox-title-outer" >
                <div className={classname} >
                    <strong className="pdfBox-title" >{` ${this.props.Document.title}`}</strong>
                </div>
            </div> :
            <div className={classname} style={{
                transformOrigin: "top left",
                width: this.props.Document.fitWidth ? `${100 / this.props.ContentScaling()}%` : undefined,
                height: this.props.Document.fitWidth ? `${100 / this.props.ContentScaling()}%` : undefined,
                transform: `scale(${this.props.Document.fitWidth ? this.props.ContentScaling() : 1})`
            }} onContextMenu={this.specificContextMenu} onPointerDown={(e: React.PointerEvent) => {
                let hit = document.elementFromPoint(e.clientX, e.clientY);
                if (hit && hit.localName === "span" && this.props.isSelected()) {  // drag selecting text stops propagation
                    e.button === 0 && e.stopPropagation();
                }
            }}>
                <PDFViewer {...this.props} pdf={this._pdf!} url={pdfUrl!.url.pathname} active={this.props.active} loaded={this.loaded}
                    setPdfViewer={this.setPdfViewer} ContainingCollectionView={this.props.ContainingCollectionView}
                    renderDepth={this.props.renderDepth} PanelHeight={this.props.PanelHeight} PanelWidth={this.props.PanelWidth}
                    Document={this.props.Document} DataDoc={this.dataDoc} ContentScaling={this.props.ContentScaling}
                    addDocTab={this.props.addDocTab} GoToPage={this.gotoPage} focus={this.props.focus}
                    pinToPres={this.props.pinToPres} addDocument={this.props.addDocument}
                    ScreenToLocalTransform={this.props.ScreenToLocalTransform} select={this.props.select}
                    isSelected={this.props.isSelected} whenActiveChanged={this.whenActiveChanged}
                    fieldKey={this.props.fieldKey} fieldExtensionDoc={this.extensionDoc} startupLive={this._initialScale < 2.5 ? true : false} />
                {this.settingsPanel()}
            </div>);
    }
}