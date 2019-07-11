import { action, IReactionDisposer, observable, reaction, trace, untracked, computed } from 'mobx';
import { observer } from "mobx-react";
import 'react-image-lightbox/style.css';
import { WidthSym, Doc } from "../../../new_fields/Doc";
import { makeInterface } from "../../../new_fields/Schema";
import { Cast, NumCast, BoolCast } from "../../../new_fields/Types";
import { PdfField } from "../../../new_fields/URLField";
//@ts-ignore
// import { Document, Page } from "react-pdf";
// import 'react-pdf/dist/Page/AnnotationLayer.css';
import { RouteStore } from "../../../server/RouteStore";
import { DocComponent } from "../DocComponent";
import { InkingControl } from "../InkingControl";
import { FilterBox } from "../search/FilterBox";
import { Annotation } from './Annotation';
import { PDFViewer } from "../pdf/PDFViewer";
import { positionSchema } from "./DocumentView";
import { FieldView, FieldViewProps } from './FieldView';
import { pageSchema } from "./ImageBox";
import "./PDFBox.scss";
import React = require("react");
import { CompileScript } from '../../util/Scripting';
import { Flyout, anchorPoints } from '../DocumentDecorations';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { ScriptField } from '../../../new_fields/ScriptField';
import { KeyCodes } from '../../northstar/utils/KeyCodes';

type PdfDocument = makeInterface<[typeof positionSchema, typeof pageSchema]>;
const PdfDocument = makeInterface(positionSchema, pageSchema);
export const handleBackspace = (e: React.KeyboardEvent) => { if (e.keyCode === KeyCodes.BACKSPACE) e.stopPropagation() }

@observer
export class PDFBox extends DocComponent<FieldViewProps, PdfDocument>(PdfDocument) {
    public static LayoutString() { return FieldView.LayoutString(PDFBox); }

    @observable private _alt = false;
    @observable private _scrollY: number = 0;
    @computed get dataDoc() { return BoolCast(this.props.Document.isTemplate) && this.props.DataDoc ? this.props.DataDoc : this.props.Document; }

    @observable private _flyout: boolean = false;
    private _mainCont: React.RefObject<HTMLDivElement>;
    private _reactionDisposer?: IReactionDisposer;
    private _keyValue: string = "";
    private _valueValue: string = "";
    private _scriptValue: string = "";
    private _keyRef: React.RefObject<HTMLInputElement>;
    private _valueRef: React.RefObject<HTMLInputElement>;
    private _scriptRef: React.RefObject<HTMLInputElement>;

    constructor(props: FieldViewProps) {
        super(props);

        this._mainCont = React.createRef();
        this._reactionDisposer = reaction(
            () => this.props.Document.scrollY,
            () => {
                if (this._mainCont.current) {
                    this._mainCont.current && this._mainCont.current.scrollTo({ top: NumCast(this.Document.scrollY), behavior: "auto" });
                }
            }
        );

        this._keyRef = React.createRef();
        this._valueRef = React.createRef();
        this._scriptRef = React.createRef();
    }

    componentDidMount() {
        if (this.props.setPdfBox) this.props.setPdfBox(this);
    }

    componentWillUnmount() {
        this._reactionDisposer && this._reactionDisposer();
    }

    public GetPage() {
        return Math.floor(NumCast(this.props.Document.scrollY) / NumCast(this.dataDoc.pdfHeight)) + 1;
    }
    public BackPage() {
        let cp = Math.ceil(NumCast(this.props.Document.scrollY) / NumCast(this.dataDoc.pdfHeight)) + 1;
        cp = cp - 1;
        if (cp > 0) {
            this.props.Document.curPage = cp;
            this.props.Document.scrollY = (cp - 1) * NumCast(this.dataDoc.pdfHeight);
        }
    }
    public GotoPage(p: number) {
        if (p > 0 && p <= NumCast(this.props.Document.numPages)) {
            this.props.Document.curPage = p;
            this.props.Document.scrollY = (p - 1) * NumCast(this.dataDoc.pdfHeight);
        }
    }

    public ForwardPage() {
        let cp = this.GetPage() + 1;
        if (cp <= NumCast(this.props.Document.numPages)) {
            this.props.Document.curPage = cp;
            this.props.Document.scrollY = (cp - 1) * NumCast(this.dataDoc.pdfHeight);
        }
    }

    private newKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        this._keyValue = e.currentTarget.value;
    }

    private newValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        this._valueValue = e.currentTarget.value;
    }

    @action
    private newScriptChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        this._scriptValue = e.currentTarget.value;
    }

    private applyFilter = () => {
        let scriptText = "";
        if (this._scriptValue.length > 0) {
            scriptText = this._scriptValue;
        } else if (this._keyValue.length > 0 && this._valueValue.length > 0) {
            scriptText = `return this.${this._keyValue} === ${this._valueValue}`;
        }
        else {
            scriptText = "return true";
        }
        let script = CompileScript(scriptText, { params: { this: Doc.name } });
        if (script.compiled) {
            this.props.Document.filterScript = new ScriptField(script);
        }
    }

    @action
    private toggleFlyout = () => {
        this._flyout = !this._flyout;
    }

    @action
    private resetFilters = () => {
        this._keyValue = this._valueValue = "";
        this._scriptValue = "return true";
        if (this._keyRef.current) {
            this._keyRef.current.value = "";
        }
        if (this._valueRef.current) {
            this._valueRef.current.value = "";
        }
        if (this._scriptRef.current) {
            this._scriptRef.current.value = "";
        }
        this.applyFilter();
    }

    scrollTo(y: number) {
        if (this._mainCont.current) {
            this._mainCont.current.scrollTo({ top: y, behavior: "auto" });
        }
    }

    settingsPanel() {
        return !this.props.active() ? (null) :
            (
                <div className="pdfBox-settingsCont" onPointerDown={(e) => e.stopPropagation()}>
                    <button className="pdfBox-settingsButton" onClick={this.toggleFlyout} title="Open Annotation Settings"
                        style={{ marginTop: `${NumCast(this.props.ContainingCollectionView!.props.Document.panY)}px` }}>
                        <div className="pdfBox-settingsButton-arrow"
                            style={{
                                borderTop: `25px solid ${this._flyout ? "#121721" : "transparent"}`,
                                borderBottom: `25px solid ${this._flyout ? "#121721" : "transparent"}`,
                                borderRight: `25px solid ${this._flyout ? "transparent" : "#121721"}`,
                                transform: `scaleX(${this._flyout ? -1 : 1})`
                            }}></div>
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
                </div>
            );
    }

    loaded = (nw: number, nh: number, np: number) => {
        if (this.props.Document) {
            let doc = this.dataDoc;
            doc.numPages = np;
            if (doc.nativeWidth && doc.nativeHeight) return;
            let oldaspect = NumCast(doc.nativeHeight) / NumCast(doc.nativeWidth, 1);
            doc.nativeWidth = nw;
            if (doc.nativeHeight) doc.nativeHeight = nw * oldaspect;
            else doc.nativeHeight = nh;
            let ccv = this.props.ContainingCollectionView;
            if (ccv) {
                ccv.props.Document.pdfHeight = nh;
            }
            doc.height = nh * (doc[WidthSym]() / nw);
        }
    }

    @action
    onScroll = (e: React.UIEvent<HTMLDivElement>) => {

        if (e.currentTarget) {
            this._scrollY = e.currentTarget.scrollTop;
            let ccv = this.props.ContainingCollectionView;
            if (ccv) {
                ccv.props.Document.panTransformType = "None";
                ccv.props.Document.scrollY = this._scrollY;
            }
        }
    }

    render() {
        // uses mozilla pdf as default
        const pdfUrl = Cast(this.props.Document.data, PdfField);
        if (!(pdfUrl instanceof PdfField)) return <div>{`pdf, ${this.props.Document.data}, not found`}</div>;
        let classname = "pdfBox-cont" + (this.props.active() && !InkingControl.Instance.selectedTool && !this._alt ? "-interactive" : "");
        return (
            <div className={classname}
                onScroll={this.onScroll}
                style={{
                    marginTop: `${NumCast(this.props.ContainingCollectionView!.props.Document.panY)}px`
                }}
                ref={this._mainCont}
                onWheel={(e: React.WheelEvent) => {
                    e.stopPropagation();
                }}>
                <PDFViewer url={pdfUrl.url.pathname} loaded={this.loaded} scrollY={this._scrollY} parent={this} />
                {/* <div style={{ width: "100px", height: "300px" }}></div> */}
                {this.settingsPanel()}
            </div>
        );
    }

}