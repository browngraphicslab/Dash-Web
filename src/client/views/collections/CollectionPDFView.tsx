import { action, IReactionDisposer, observable, reaction } from "mobx";
import { observer } from "mobx-react";
import { WidthSym } from "../../../new_fields/Doc";
import { Id } from "../../../new_fields/FieldSymbols";
import { NumCast } from "../../../new_fields/Types";
import { emptyFunction } from "../../../Utils";
import { ContextMenu } from "../ContextMenu";
import { FieldView, FieldViewProps } from "../nodes/FieldView";
import { CollectionBaseView, CollectionRenderProps, CollectionViewType } from "./CollectionBaseView";
import { CollectionFreeFormView } from "./collectionFreeForm/CollectionFreeFormView";
import "./CollectionPDFView.scss";
import React = require("react");
import { PDFBox } from "../nodes/PDFBox";


@observer
export class CollectionPDFView extends React.Component<FieldViewProps> {
    private _pdfBox?: PDFBox;
    private _reactionDisposer?: IReactionDisposer;
    private _buttonTray: React.RefObject<HTMLDivElement>;

    constructor(props: FieldViewProps) {
        super(props);

        this._buttonTray = React.createRef();
    }

    componentDidMount() {
        this._reactionDisposer = reaction(
            () => NumCast(this.props.Document.scrollY),
            () => {
                // let transform = this.props.ScreenToLocalTransform();
                if (this._buttonTray.current) {
                    // console.log(this._buttonTray.current.offsetHeight);
                    // console.log(NumCast(this.props.Document.scrollY));
                    let scale = this.nativeWidth() / this.props.Document[WidthSym]();
                    this.props.Document.panY = NumCast(this.props.Document.scrollY);
                    // console.log(scale);
                }
                // console.log(this.props.Document[HeightSym]());
            },
            { fireImmediately: true }
        );
    }

    componentWillUnmount() {
        this._reactionDisposer && this._reactionDisposer();
    }

    public static LayoutString(fieldKey: string = "data") {
        return FieldView.LayoutString(CollectionPDFView, fieldKey);
    }
    @observable _inThumb = false;

    private set curPage(value: number) { this._pdfBox && this._pdfBox.GotoPage(value); }
    private get curPage() { return NumCast(this.props.Document.curPage, -1); }
    private get numPages() { return NumCast(this.props.Document.numPages); }
    @action onPageBack = () => this._pdfBox && this._pdfBox.BackPage();
    @action onPageForward = () => this._pdfBox && this._pdfBox.ForwardPage();

    nativeWidth = () => NumCast(this.props.Document.nativeWidth);
    nativeHeight = () => NumCast(this.props.Document.nativeHeight);
    private get uIButtons() {
        let ratio = (this.curPage - 1) / this.numPages * 100;
        return (
            <div className="collectionPdfView-buttonTray" ref={this._buttonTray} key="tray" style={{ height: "100%" }}>
                <button className="collectionPdfView-backward" onClick={this.onPageBack}>{"<"}</button>
                <button className="collectionPdfView-forward" onClick={this.onPageForward}>{">"}</button>
                {/* <div className="collectionPdfView-slider" onPointerDown={this.onThumbDown} style={{ top: 60, left: -20, width: 50, height: `calc(100% - 80px)` }} >
                    <div className="collectionPdfView-thumb" onPointerDown={this.onThumbDown} style={{ top: `${ratio}%`, width: 50, height: 50 }} />
                </div> */}
            </div>
        );
    }

    onContextMenu = (e: React.MouseEvent): void => {
        if (!e.isPropagationStopped() && this.props.Document[Id] !== "mainDoc") { // need to test this because GoldenLayout causes a parallel hierarchy in the React DOM for its children and the main document view7
            ContextMenu.Instance.addItem({ description: "PDFOptions", event: emptyFunction, icon: "file-pdf" });
        }
    }

    setPdfBox = (pdfBox: PDFBox) => { this._pdfBox = pdfBox; };


    private subView = (_type: CollectionViewType, renderProps: CollectionRenderProps) => {
        let props = { ...this.props, ...renderProps };
        return (
            <>
                <CollectionFreeFormView {...props} setPdfBox={this.setPdfBox} CollectionView={this} />
                {renderProps.active() ? this.uIButtons : (null)}
            </>
        );
    }

    render() {
        return (
            <CollectionBaseView {...this.props} className={`collectionPdfView-cont${this._inThumb ? "-dragging" : ""}`} onContextMenu={this.onContextMenu}>
                {this.subView}
            </CollectionBaseView>
        );
    }
}