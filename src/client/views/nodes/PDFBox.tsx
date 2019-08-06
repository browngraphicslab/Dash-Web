import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { action, computed, IReactionDisposer, observable, reaction, runInAction } from 'mobx';
import { observer } from "mobx-react";
import * as Pdfjs from "pdfjs-dist";
import "pdfjs-dist/web/pdf_viewer.css";
import 'react-image-lightbox/style.css';
import { Doc, WidthSym, Opt } from "../../../new_fields/Doc";
import { makeInterface } from "../../../new_fields/Schema";
import { ScriptField } from '../../../new_fields/ScriptField';
import { BoolCast, Cast, NumCast } from "../../../new_fields/Types";
import { PdfField } from "../../../new_fields/URLField";
import { KeyCodes } from '../../northstar/utils/KeyCodes';
import { CompileScript } from '../../util/Scripting';
import { DocComponent } from "../DocComponent";
import { InkingControl } from "../InkingControl";
import { PDFViewer } from "../pdf/PDFViewer";
import { positionSchema } from "./DocumentView";
import { FieldView, FieldViewProps } from './FieldView';
import { pageSchema } from "./ImageBox";
import "./PDFBox.scss";
import React = require("react");

type PdfDocument = makeInterface<[typeof positionSchema, typeof pageSchema]>;
const PdfDocument = makeInterface(positionSchema, pageSchema);
export const handleBackspace = (e: React.KeyboardEvent) => { if (e.keyCode === KeyCodes.BACKSPACE) e.stopPropagation(); };

@observer
export class PDFBox extends DocComponent<FieldViewProps, PdfDocument>(PdfDocument) {
    public static LayoutString() { return FieldView.LayoutString(PDFBox); }

    @observable private _flyout: boolean = false;
    @observable private _alt = false;
    @observable private _scrollY: number = 0;
    @observable private _pdf: Opt<Pdfjs.PDFDocumentProxy>;
    @computed get containingCollectionDocument() { return this.props.ContainingCollectionView && this.props.ContainingCollectionView.props.Document; }
    @computed get dataDoc() { return BoolCast(this.props.Document.isTemplate) && this.props.DataDoc ? this.props.DataDoc : this.props.Document; }

    private _mainCont: React.RefObject<HTMLDivElement> = React.createRef();
    private _reactionDisposer?: IReactionDisposer;
    private _keyValue: string = "";
    private _valueValue: string = "";
    private _scriptValue: string = "";
    private _keyRef: React.RefObject<HTMLInputElement> = React.createRef();
    private _valueRef: React.RefObject<HTMLInputElement> = React.createRef();
    private _scriptRef: React.RefObject<HTMLInputElement> = React.createRef();

    componentDidMount() {
        this.props.setPdfBox && this.props.setPdfBox(this);

        const pdfUrl = Cast(this.props.Document.data, PdfField);
        if (pdfUrl instanceof PdfField) {
            Pdfjs.getDocument(pdfUrl.url.pathname).promise.then(pdf => runInAction(() => this._pdf = pdf));
        }
        this._reactionDisposer = reaction(
            () => this.props.Document.scrollY,
            () => this._mainCont.current && this._mainCont.current.scrollTo({ top: NumCast(this.Document.scrollY), behavior: "auto" })
        );
    }

    componentWillUnmount() {
        this._reactionDisposer && this._reactionDisposer();
    }

    public GetPage() {
        return Math.floor(NumCast(this.props.Document.scrollY) / NumCast(this.dataDoc.pdfHeight)) + 1;
    }

    @action
    public BackPage() {
        let cp = Math.ceil(NumCast(this.props.Document.scrollY) / NumCast(this.dataDoc.pdfHeight)) + 1;
        cp = cp - 1;
        if (cp > 0) {
            this.props.Document.curPage = cp;
            this.props.Document.scrollY = (cp - 1) * NumCast(this.dataDoc.pdfHeight);
        }
    }

    @action
    public GotoPage(p: number) {
        if (p > 0 && p <= NumCast(this.props.Document.numPages)) {
            this.props.Document.curPage = p;
            this.props.Document.scrollY = (p - 1) * NumCast(this.dataDoc.pdfHeight);
        }
    }

    @action
    public ForwardPage() {
        let cp = this.GetPage() + 1;
        if (cp <= NumCast(this.props.Document.numPages)) {
            this.props.Document.curPage = cp;
            this.props.Document.scrollY = (cp - 1) * NumCast(this.dataDoc.pdfHeight);
        }
    }

    scrollTo = (y: number) => {
        this._mainCont.current && this._mainCont.current.scrollTo({ top: Math.max(y - (this._mainCont.current.offsetHeight / 2), 0), behavior: "auto" });
    }

    @action
    setPanY = (y: number) => {
        this.containingCollectionDocument && (this.containingCollectionDocument.panY = y);
    }

    private newKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        this._keyValue = e.currentTarget.value;
    }

    private newValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        this._valueValue = e.currentTarget.value;
    }

    private newScriptChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        this._scriptValue = e.currentTarget.value;
    }

    private applyFilter = () => {
        let scriptText = this._scriptValue.length > 0 ? this._scriptValue :
            this._keyValue.length > 0 && this._valueValue.length > 0 ?
                `return this.${this._keyValue} === ${this._valueValue}` : "return true";
        let script = CompileScript(scriptText, { params: { this: Doc.name } });
        script.compiled && (this.props.Document.filterScript = new ScriptField(script));
    }

    @action
    private resetFilters = () => {
        this._keyValue = this._valueValue = "";
        this._scriptValue = "return true";
        this._keyRef.current && (this._keyRef.current.value = "");
        this._valueRef.current && (this._valueRef.current.value = "");
        this._scriptRef.current && (this._scriptRef.current.value = "");
        this.applyFilter();
    }

    settingsPanel() {
        return !this.props.active() ? (null) :
            (<div className="pdfBox-settingsCont" onPointerDown={(e) => e.stopPropagation()}>
                <button className="pdfBox-settingsButton" onClick={action(() => this._flyout = !this._flyout)} title="Open Annotation Settings"
                    style={{ marginTop: `${this.containingCollectionDocument ? NumCast(this.containingCollectionDocument.panY) : 0}px` }}>
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
                        <input placeholder="Key" className="pdfBox-settingsFlyout-input" onKeyDown={handleBackspace} onChange={this.newKeyChange}
                            style={{ gridColumn: 1 }} ref={this._keyRef} />
                        <input placeholder="Value" className="pdfBox-settingsFlyout-input" onKeyDown={handleBackspace} onChange={this.newValueChange}
                            style={{ gridColumn: 3 }} ref={this._valueRef} />
                    </div>
                    <div className="pdfBox-settingsFlyout-kvpInput">
                        <input placeholder="Custom Script" onChange={this.newScriptChange} onKeyDown={handleBackspace} style={{ gridColumn: "1 / 4" }} ref={this._scriptRef} />
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
        if (!this.dataDoc.nativeWidth || !this.dataDoc.nativeHeight) {
            let oldaspect = NumCast(this.dataDoc.nativeHeight) / NumCast(this.dataDoc.nativeWidth, 1);
            this.dataDoc.nativeWidth = nw;
            this.dataDoc.nativeHeight = this.dataDoc.nativeHeight ? nw * oldaspect : nh;
            this.containingCollectionDocument && (this.containingCollectionDocument.pdfHeight = nh);
            this.dataDoc.height = nh * (this.dataDoc[WidthSym]() / nw);
        }
    }

    @action
    onScroll = (e: React.UIEvent<HTMLDivElement>) => {
        if (e.currentTarget && this.containingCollectionDocument) {
            this.containingCollectionDocument.panTransformType = "None";
            this.containingCollectionDocument.scrollY = this._scrollY = e.currentTarget.scrollTop;
        }
    }

    @computed get fieldExtensionDoc() {
        return Doc.resolvedFieldDataDoc(this.props.DataDoc ? this.props.DataDoc : this.props.Document, this.props.fieldKey, "true");
    }

    render() {
        const pdfUrl = Cast(this.props.Document.data, PdfField);
        let classname = "pdfBox-cont" + (this.props.active() && !InkingControl.Instance.selectedTool && !this._alt ? "-interactive" : "");
        return (!(pdfUrl instanceof PdfField) || !this._pdf ?
            <div>{`pdf, ${this.props.Document.data}, not found`}</div> :
            <div className={classname}
                onScroll={this.onScroll}
                style={{ marginTop: `${this.containingCollectionDocument ? NumCast(this.containingCollectionDocument.panY) : 0}px` }}
                ref={this._mainCont}
                onWheel={(e: React.WheelEvent) => { e.stopPropagation(); }}>
                <PDFViewer pdf={this._pdf} url={pdfUrl.url.pathname} active={this.props.active} scrollTo={this.scrollTo} loaded={this.loaded} scrollY={this._scrollY}
                    Document={this.props.Document} DataDoc={this.props.DataDoc}
                    addDocTab={this.props.addDocTab} setPanY={this.setPanY}
                    fieldKey={this.props.fieldKey} fieldExtensionDoc={this.fieldExtensionDoc} />
                {this.settingsPanel()}
            </div>
        );
    }
}