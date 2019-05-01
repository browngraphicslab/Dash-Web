import { action, observable } from "mobx";
import { observer } from "mobx-react";
import { KeyStore } from "../../../fields/KeyStore";
import { ContextMenu } from "../ContextMenu";
import "./CollectionPDFView.scss";
import React = require("react");
import { CollectionFreeFormView } from "./collectionFreeForm/CollectionFreeFormView";
import { FieldView, FieldViewProps } from "../nodes/FieldView";
import { CollectionRenderProps, CollectionBaseView, CollectionViewType } from "./CollectionBaseView";
import { emptyFunction } from "../../../Utils";


@observer
export class CollectionPDFView extends React.Component<FieldViewProps> {

    public static LayoutString(fieldKey: string = "DataKey") {
        return FieldView.LayoutString(CollectionPDFView, fieldKey);
    }
    @observable _inThumb = false;

    private get curPage() { return this.props.Document.GetNumber(KeyStore.CurPage, -1); }
    private set curPage(value: number) { this.props.Document.SetNumber(KeyStore.CurPage, value); }
    private get numPages() { return this.props.Document.GetNumber(KeyStore.NumPages, 0); }
    @action onPageBack = () => this.curPage > 1 ? this.props.Document.SetNumber(KeyStore.CurPage, this.curPage - 1) : -1;
    @action onPageForward = () => this.curPage < this.numPages ? this.props.Document.SetNumber(KeyStore.CurPage, this.curPage + 1) : -1;

    @action
    onThumbDown = (e: React.PointerEvent) => {
        document.addEventListener("pointermove", this.onThumbMove, false);
        document.addEventListener("pointerup", this.onThumbUp, false);
        e.stopPropagation();
        this._inThumb = true;
    }
    @action
    onThumbMove = (e: PointerEvent) => {
        let pso = (e.clientY - (e as any).target.parentElement.getBoundingClientRect().top) / (e as any).target.parentElement.getBoundingClientRect().height;
        this.curPage = Math.trunc(Math.min(this.numPages, pso * this.numPages + 1));
        e.stopPropagation();
    }
    @action
    onThumbUp = (e: PointerEvent) => {
        this._inThumb = false;
        document.removeEventListener("pointermove", this.onThumbMove);
        document.removeEventListener("pointerup", this.onThumbUp);
    }
    nativeWidth = () => this.props.Document.GetNumber(KeyStore.NativeWidth, 0);
    nativeHeight = () => this.props.Document.GetNumber(KeyStore.NativeHeight, 0);
    private get uIButtons() {
        let ratio = (this.curPage - 1) / this.numPages * 100;
        return (
            <div className="collectionPdfView-buttonTray" key="tray" style={{ height: "100%" }}>
                <button className="collectionPdfView-backward" onClick={this.onPageBack}>{"<"}</button>
                <button className="collectionPdfView-forward" onClick={this.onPageForward}>{">"}</button>
                <div className="collectionPdfView-slider" onPointerDown={this.onThumbDown} style={{ top: 60, left: -20, width: 50, height: `calc(100% - 80px)` }} >
                    <div className="collectionPdfView-thumb" onPointerDown={this.onThumbDown} style={{ top: `${ratio}%`, width: 50, height: 50 }} />
                </div>
            </div>
        );
    }

    onContextMenu = (e: React.MouseEvent): void => {
        if (!e.isPropagationStopped() && this.props.Document.Id !== "mainDoc") { // need to test this because GoldenLayout causes a parallel hierarchy in the React DOM for its children and the main document view7
            ContextMenu.Instance.addItem({ description: "PDFOptions", event: emptyFunction });
        }
    }

    private subView = (_type: CollectionViewType, renderProps: CollectionRenderProps) => {
        let props = { ...this.props, ...renderProps };
        return (
            <>
                <CollectionFreeFormView {...props} CollectionView={this} />
                {this.props.isSelected() ? this.uIButtons : (null)}
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