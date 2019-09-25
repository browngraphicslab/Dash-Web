import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { action, computed, IReactionDisposer, observable, reaction, runInAction } from 'mobx';
import { observer } from "mobx-react";
import * as Pdfjs from "pdfjs-dist";
import "pdfjs-dist/web/pdf_viewer.css";
import 'react-image-lightbox/style.css';
import { Doc, Opt, WidthSym } from "../../../new_fields/Doc";
import { makeInterface } from "../../../new_fields/Schema";
import { ComputedField, ScriptField } from '../../../new_fields/ScriptField';
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

type PdfDocument = makeInterface<[typeof documentSchema, typeof panZoomSchema, typeof pageSchema]>;
const PdfDocument = makeInterface(documentSchema, panZoomSchema, pageSchema);

@observer
export class PDFBox extends DocComponent<FieldViewProps, PdfDocument>(PdfDocument) {
    public static LayoutString() { return FieldView.LayoutString(PDFBox); }
    private _reactionDisposer?: IReactionDisposer;
    private _keyValue: string = "";
    private _valueValue: string = "";
    private _scriptValue: string = "";
    @observable private _searching: boolean = false;
    private _pdfViewer: PDFViewer | undefined;
    private _keyRef: React.RefObject<HTMLInputElement> = React.createRef();
    private _valueRef: React.RefObject<HTMLInputElement> = React.createRef();
    private _scriptRef: React.RefObject<HTMLInputElement> = React.createRef();

    @observable private _flyout: boolean = false;
    @observable private _alt = false;
    @observable private _pdf: Opt<Pdfjs.PDFDocumentProxy>;

    @computed get extensionDoc() { return Doc.fieldExtensionDoc(this.dataDoc, this.props.fieldKey); }

    @computed get dataDoc() { return this.props.DataDoc && this.props.Document.isTemplate ? this.props.DataDoc : Doc.GetProto(this.props.Document); }

    componentDidMount() {
        this.props.setPdfBox && this.props.setPdfBox(this);

        this.props.Document.curPage = 1; //  ComputedField.MakeFunction("Math.floor(Number(this.panY) / Number(this.nativeHeight) + 1)");

        const pdfUrl = Cast(this.dataDoc[this.props.fieldKey], PdfField);
        if (pdfUrl instanceof PdfField) {
            Pdfjs.getDocument(pdfUrl.url.pathname).promise.then(pdf => runInAction(() => this._pdf = pdf));
        }
    }

    componentWillUnmount() {
        this._reactionDisposer && this._reactionDisposer();
    }

    public search(string: string) {
        this._pdfViewer && this._pdfViewer.search(string);
    }
    public prevAnnotation() {
        this._pdfViewer && this._pdfViewer.prevAnnotation();
    }
    public nextAnnotation() {
        this._pdfViewer && this._pdfViewer.nextAnnotation();
    }

    setPdfViewer = (pdfViewer: PDFViewer) => {
        this._pdfViewer = pdfViewer;
    }

    public GetPage() {
        return Math.floor((this.Document.panY || 0) / (this.Document.nativeHeight || 0)) + 1;
    }

    @action
    public BackPage() {
        let cp = Math.ceil((this.Document.panY || 0) / (this.Document.nativeHeight || 0)) + 1;
        cp = cp - 1;
        if (cp > 0) {
            this.Document.panY = (cp - 1) * (this.Document.nativeHeight || 0);
        }
    }

    @action
    public GotoPage = (p: number) => {
        if (p > 0 && p <= NumCast(this.dataDoc.numPages)) {
            this.Document.panY = (p - 1) * (this.Document.nativeHeight || 0);
        }
    }

    @action
    public ForwardPage() {
        let cp = this.GetPage() + 1;
        if (cp <= NumCast(this.dataDoc.numPages)) {
            this.Document.panY = (cp - 1) * (this.Document.nativeHeight || 0);
        }
    }

    @action
    setPanY = (y: number) => {
        this.Document.panY = y;
    }

    @action
    private applyFilter = () => {
        let scriptText = this._scriptValue ? this._scriptValue :
            this._keyValue && this._valueValue ? `this.${this._keyValue} === ${this._valueValue}` : "true";
        this.props.Document.filterScript = ScriptField.MakeFunction(scriptText);
    }

    scrollTo = (y: number) => {

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

    searchStringChanged = (e: React.ChangeEvent<HTMLInputElement>) => this._searchString = e.currentTarget.value;
    private _searchString: string = "";
    settingsPanel() {
        return !this.props.active() ? (null) :
            (<>
                <div className="pdfViewer-overlayCont" key="cont" onPointerDown={(e) => e.stopPropagation()}
                    style={{ bottom: 0, left: `${this._searching ? 0 : 100}%` }}>
                    <button className="pdfViewer-overlayButton" title="Open Search Bar" />
                    <input className="pdfViewer-overlaySearchBar" placeholder="Search" onChange={this.searchStringChanged}
                        onKeyDown={(e: React.KeyboardEvent) => e.keyCode === KeyCodes.ENTER ? this.search(this._searchString) : e.keyCode === KeyCodes.BACKSPACE ? e.stopPropagation() : true} />
                    <button title="Search" onClick={() => this.search(this._searchString)}>
                        <FontAwesomeIcon icon="search" size="3x" color="white" /></button>
                </div>
                <button className="pdfViewer-overlayButton" key="search" onClick={action(() => this._searching = !this._searching)} title="Open Search Bar"
                    style={{ bottom: 10, right: 0, display: this.props.active() ? "flex" : "none" }}>
                    <div className="pdfViewer-overlayButton-arrow" onPointerDown={(e) => e.stopPropagation()}></div>
                    <div className="pdfViewer-overlayButton-iconCont" onPointerDown={(e) => e.stopPropagation()}>
                        <FontAwesomeIcon style={{ color: "white" }} icon={this._searching ? "times" : "search"} size="3x" /></div>
                </button>
                <button className="pdfViewer-overlayButton-iconCont" title="Previous Annotation"
                    onClick={e => { e.stopPropagation(); this.prevAnnotation(); }}
                    onPointerDown={(e) => e.stopPropagation()}
                    style={{ left: 110, top: 5, height: "30px", position: "absolute", display: this.props.active() ? "flex" : "none" }}>
                    <FontAwesomeIcon style={{ color: "white" }} icon={"arrow-up"} size="sm" />
                </button>
                <button className="pdfViewer-overlayButton-iconCont" title="Next Annotation"
                    onClick={e => { e.stopPropagation(); this.nextAnnotation(); }}
                    onPointerDown={(e) => e.stopPropagation()}
                    style={{ left: 80, top: 5, height: "30px", position: "absolute", display: this.props.active() ? "flex" : "none" }}>
                    <FontAwesomeIcon style={{ color: "white" }} icon={"arrow-down"} size="sm" />
                </button>
                <button className="pdfViewer-overlayButton-iconCont" key="back" title="Page Back"
                    onPointerDown={(e) => { e.stopPropagation() }}
                    onClick={() => this.BackPage()}
                    style={{ left: 20, top: 5, height: "30px", position: "absolute", pointerEvents: "all", display: this.props.active() ? "flex" : "none" }}>
                    <FontAwesomeIcon style={{ color: "white" }} icon={"arrow-left"} size="sm" />
                </button>
                <button className="pdfViewer-overlayButton-iconCont" key="fwd" title="Page Forward"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => this.ForwardPage()}
                    style={{ left: 50, top: 5, height: "30px", position: "absolute", pointerEvents: "all", display: this.props.active() ? "flex" : "none" }}>
                    <FontAwesomeIcon style={{ color: "white" }} icon={"arrow-right"} size="sm" />
                </button>
                <div className="pdfBox-settingsCont" key="settings" onPointerDown={(e) => e.stopPropagation()}>
                    <button className="pdfBox-settingsButton" onClick={action(() => this._flyout = !this._flyout)} title="Open Annotation Settings" >
                        <div className="pdfBox-settingsButton-arrow"
                            style={{
                                borderTop: `25px solid ${this._flyout ? "#121721" : "transparent"}`,
                                borderBottom: `25px solid ${this._flyout ? "#121721" : "transparent"}`,
                                borderRight: `25px solid ${this._flyout ? "transparent" : "#121721"}`,
                                transform: `scaleX(${this._flyout ? -1 : 1})`
                            }} />
                        <div className="pdfBox-settingsButton-iconCont">
                            <FontAwesomeIcon style={{ color: "white" }} icon="cog" size="3x" />
                        </div>
                    </button>
                    <div className="pdfBox-settingsFlyout" style={{ left: `${this._flyout ? -600 : 100}px` }} >
                        <div className="pdfBox-settingsFlyout-title">
                            Annotation View Settings
                        </div>
                        <div className="pdfBox-settingsFlyout-kvpInput">
                            <input placeholder="Key" className="pdfBox-settingsFlyout-input" onChange={this.newKeyChange}
                                style={{ gridColumn: 1 }} ref={this._keyRef} />
                            <input placeholder="Value" className="pdfBox-settingsFlyout-input" onChange={this.newValueChange}
                                style={{ gridColumn: 3 }} ref={this._valueRef} />
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
            </>);
    }

    loaded = (nw: number, nh: number, np: number) => {
        // nh *= .33.33333;
        // nw *= 1.33333;
        this.dataDoc.numPages = np;
        if (!this.Document.nativeWidth || !this.Document.nativeHeight || !this.Document.scrollHeight) {
            let oldaspect = (this.Document.nativeHeight || 0) / (this.Document.nativeWidth || 1);
            this.Document.nativeWidth = nw;
            this.Document.nativeHeight = this.Document.nativeHeight ? nw * oldaspect : nh;
            this.Document.height = this.Document[WidthSym]() * (nh / nw);
        }
    }

    render() {
        const pdfUrl = Cast(this.dataDoc[this.props.fieldKey], PdfField);
        let classname = "pdfBox-cont" + (this.props.active() && !InkingControl.Instance.selectedTool && !this._alt ? "-interactive" : "");
        return (!(pdfUrl instanceof PdfField) || !this._pdf ?
            <div>{`pdf, ${this.dataDoc[this.props.fieldKey]}, not found`}</div> :
            <div className={classname} onWheel={(e: React.WheelEvent) => e.stopPropagation()} onPointerDown={(e: React.PointerEvent) => {
                let hit = document.elementFromPoint(e.clientX, e.clientY);
                if (hit && hit.localName === "span") {
                    e.button === 0 && e.stopPropagation();
                }
            }}>
                <PDFViewer pdf={this._pdf} url={pdfUrl.url.pathname} active={this.props.active} scrollTo={this.scrollTo} loaded={this.loaded}
                    setPdfViewer={this.setPdfViewer}
                    Document={this.props.Document} DataDoc={this.dataDoc}
                    addDocTab={this.props.addDocTab} GoToPage={this.GotoPage}
                    pinToPres={this.props.pinToPres} addDocument={this.props.addDocument}
                    fieldKey={this.props.fieldKey} fieldExtensionDoc={this.extensionDoc} />
                {this.settingsPanel()}
            </div>);
    }
}