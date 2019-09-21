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
    private _mainCont: React.RefObject<HTMLDivElement> = React.createRef();
    private _reactionDisposer?: IReactionDisposer;
    private _keyValue: string = "";
    private _valueValue: string = "";
    private _scriptValue: string = "";
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

        this.props.Document.curPage = ComputedField.MakeFunction("Math.floor(Number(this.panY) / Number(this.nativeHeight) + 1)");

        const pdfUrl = Cast(this.dataDoc[this.props.fieldKey], PdfField);
        if (pdfUrl instanceof PdfField) {
            Pdfjs.getDocument(pdfUrl.url.pathname).promise.then(pdf => runInAction(() => this._pdf = pdf));
        }
        this._reactionDisposer = reaction(
            () => this.Document.panY,
            () => this._mainCont.current && this._mainCont.current.scrollTo({ top: this.Document.panY || 0, behavior: "auto" })
        );
    }

    componentWillUnmount() {
        this._reactionDisposer && this._reactionDisposer();
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
        this._mainCont.current && this._mainCont.current.scrollTo({ top: Math.max(y - (this._mainCont.current.offsetHeight / 2), 0), behavior: "auto" });
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

    settingsPanel() {
        return !this.props.active() ? (null) :
            (<div className="pdfBox-settingsCont" onPointerDown={(e) => e.stopPropagation()}>
                <button className="pdfBox-settingsButton" onClick={action(() => this._flyout = !this._flyout)} title="Open Annotation Settings"
                    style={{ marginTop: `${this.Document.panY || 0}px` }}>
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
            </div>);
    }

    loaded = (nw: number, nh: number, np: number) => {
        this.dataDoc.numPages = np;
        if (!this.Document.nativeWidth || !this.Document.nativeHeight || !this.Document.scrollHeight) {
            let oldaspect = (this.Document.nativeHeight || 0) / (this.Document.nativeWidth || 1);
            this.Document.nativeWidth = nw;
            this.Document.nativeHeight = this.Document.nativeHeight ? nw * oldaspect : nh;
            this.Document.height = this.Document[WidthSym]() * (nh / nw);
            this.Document.scrollHeight = np * this.Document.nativeHeight;
        }
    }

    @action
    onScroll = (e: React.UIEvent<HTMLDivElement>) => {
        if (e.currentTarget && this.props.ContainingCollectionDoc) {
            this.props.Document.panTransformType = "None";
            this.Document.panY = e.currentTarget.scrollTop;
        }
    }


    render() {
        const pdfUrl = Cast(this.dataDoc[this.props.fieldKey], PdfField);
        let classname = "pdfBox-cont" + (this.props.active() && !InkingControl.Instance.selectedTool && !this._alt ? "-interactive" : "");
        return (!(pdfUrl instanceof PdfField) || !this._pdf ?
            <div>{`pdf, ${this.dataDoc[this.props.fieldKey]}, not found`}</div> :
            <div className={classname}
                onScroll={this.onScroll}
                style={{ marginTop: `${(this.Document.panY || 0)}px` }}
                ref={this._mainCont}>
                <div className="pdfBox-scrollHack" style={{ height: NumCast(this.props.Document.scrollHeight) + ((this.Document.nativeHeight || 0) - (this.Document.nativeHeight || 0) / (this.Document.scale || 1)) }} />
                <PDFViewer pdf={this._pdf} url={pdfUrl.url.pathname} active={this.props.active} scrollTo={this.scrollTo} loaded={this.loaded} panY={this.Document.panY || 0}
                    Document={this.props.Document} DataDoc={this.dataDoc}
                    addDocTab={this.props.addDocTab} setPanY={this.setPanY} GoToPage={this.GotoPage}
                    pinToPres={this.props.pinToPres} addDocument={this.props.addDocument}
                    fieldKey={this.props.fieldKey} fieldExtensionDoc={this.extensionDoc} />
                {this.settingsPanel()}
            </div>);
    }
}