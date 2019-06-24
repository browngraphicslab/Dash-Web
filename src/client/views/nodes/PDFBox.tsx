import { action, IReactionDisposer, observable, reaction, trace, untracked } from 'mobx';
import { observer } from "mobx-react";
import 'react-image-lightbox/style.css';
import { WidthSym, Doc } from "../../../new_fields/Doc";
import { makeInterface } from "../../../new_fields/Schema";
import { Cast, NumCast } from "../../../new_fields/Types";
import { PdfField } from "../../../new_fields/URLField";
//@ts-ignore
// import { Document, Page } from "react-pdf";
// import 'react-pdf/dist/Page/AnnotationLayer.css';
import { RouteStore } from "../../../server/RouteStore";
import { DocComponent } from "../DocComponent";
import { InkingControl } from "../InkingControl";
import { PDFViewer } from "../pdf/PDFViewer";
import { positionSchema } from "./DocumentView";
import { FieldView, FieldViewProps } from './FieldView';
import { pageSchema } from "./ImageBox";
import "./PDFBox.scss";
import React = require("react");
import { CompileScript } from '../../util/Scripting';
import { ScriptField } from '../../../fields/ScriptField';
import { Flyout, anchorPoints } from '../DocumentDecorations';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

type PdfDocument = makeInterface<[typeof positionSchema, typeof pageSchema]>;
const PdfDocument = makeInterface(positionSchema, pageSchema);

@observer
export class PDFBox extends DocComponent<FieldViewProps, PdfDocument>(PdfDocument) {
    public static LayoutString() { return FieldView.LayoutString(PDFBox); }

    @observable private _alt = false;
    @observable private _scrollY: number = 0;
    @observable private _flyout: boolean = false;
    private _mainCont: React.RefObject<HTMLDivElement>;
    private _reactionDisposer?: IReactionDisposer;
    private _keyValue: string = "";
    private _valueValue: string = "";
    private _scriptValue: string = "";

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

        let script = CompileScript("return this.page === 0", { params: { this: Doc.name } });
        if (script.compiled) {
            this.props.Document.filterScript = new ScriptField(script);
        }
    }

    componentDidMount() {
        if (this.props.setPdfBox) this.props.setPdfBox(this);
    }

    componentWillUnmount() {
        this._reactionDisposer && this._reactionDisposer();
    }

    public GetPage() {
        return Math.floor(NumCast(this.props.Document.scrollY) / NumCast(this.Document.pdfHeight)) + 1;
    }
    public BackPage() {
        let cp = Math.ceil(NumCast(this.props.Document.scrollY) / NumCast(this.Document.pdfHeight)) + 1;
        cp = cp - 1;
        if (cp > 0) {
            this.props.Document.curPage = cp;
            this.props.Document.scrollY = (cp - 1) * NumCast(this.Document.pdfHeight);
        }
    }
    public GotoPage(p: number) {
        if (p > 0 && p <= NumCast(this.props.Document.numPages)) {
            this.props.Document.curPage = p;
            this.props.Document.scrollY = (p - 1) * NumCast(this.Document.pdfHeight);
        }
    }

    public ForwardPage() {
        let cp = this.GetPage() + 1;
        if (cp <= NumCast(this.props.Document.numPages)) {
            this.props.Document.curPage = cp;
            this.props.Document.scrollY = (cp - 1) * NumCast(this.Document.pdfHeight);
        }
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

    private applyFilter = (e: React.MouseEvent<HTMLButtonElement>) => {
        let scriptText = "";
        if (this._scriptValue.length > 0) {
            scriptText = this._scriptValue;
        } else if (this._keyValue.length > 0 && this._valueValue.length > 0) {
            scriptText = `return this.${this._keyValue} === ${this._valueValue}`;
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
                            <input placeholder="Key" className="pdfBox-settingsFlyout-input" onChange={this.newKeyChange}
                                style={{ gridColumn: 1 }} />
                            <input placeholder="Value" className="pdfBox-settingsFlyout-input" onChange={this.newValueChange}
                                style={{ gridColumn: 3 }} />
                        </div>
                        <div className="pdfBox-settingsFlyout-kvpInput">
                            <input placeholder="Custom Script" onChange={this.newScriptChange} style={{ gridColumn: "1 / 4" }} />
                        </div>
                        <div className="pdfBox-settingsFlyout-kvpInput">
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
            let doc = this.props.Document.proto ? this.props.Document.proto : this.props.Document;
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
                ccv.props.Document.scrollY = this._scrollY;
            }
        }
    }

    render() {
        // uses mozilla pdf as default
        const pdfUrl = Cast(this.props.Document.data, PdfField, new PdfField(window.origin + RouteStore.corsProxy + "/https://mozilla.github.io/pdf.js/web/compressed.tracemonkey-pldi-09.pdf"));
        let classname = "pdfBox-cont" + (this.props.active() && !InkingControl.Instance.selectedTool && !this._alt ? "-interactive" : "");
        return (
            <div onScroll={this.onScroll}
                style={{
                    height: "100%",
                    overflowY: "scroll", overflowX: "hidden",
                    marginTop: `${NumCast(this.props.ContainingCollectionView!.props.Document.panY)}px`
                }}
                ref={this._mainCont}
                onWheel={(e: React.WheelEvent) => {
                    e.stopPropagation();
                }} className={classname}>
                <PDFViewer url={pdfUrl.url.pathname} loaded={this.loaded} scrollY={this._scrollY} parent={this} />
                {/* <div style={{ width: "100px", height: "300px" }}></div> */}
                {this.settingsPanel()}
            </div>
        );
    }

}