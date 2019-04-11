import { action, computed, observable } from "mobx";
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

    private get curPage() { return this.props.Document.GetNumber(KeyStore.CurPage, -1); }
    private get numPages() { return this.props.Document.GetNumber(KeyStore.NumPages, 0); }
    @action onPageBack = () => this.curPage > 1 ? this.props.Document.SetNumber(KeyStore.CurPage, this.curPage - 1) : -1;
    @action onPageForward = () => this.curPage < this.numPages ? this.props.Document.SetNumber(KeyStore.CurPage, this.curPage + 1) : -1;

    private get uIButtons() {
        let scaling = Math.min(1.8, this.props.ScreenToLocalTransform().Scale);
        return (
            <div className="collectionPdfView-buttonTray" key="tray" style={{ transform: `scale(${scaling}, ${scaling})` }}>
                <button className="collectionPdfView-backward" onClick={this.onPageBack}>{"<"}</button>
                <button className="collectionPdfView-forward" onClick={this.onPageForward}>{">"}</button>
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
                <CollectionFreeFormView {...props} />
                {this.props.isSelected() ? this.uIButtons : (null)}
            </>
        );
    }

    render() {
        return (
            <CollectionBaseView {...this.props} className="collectionPdfView-cont" onContextMenu={this.onContextMenu}>
                {this.subView}
            </CollectionBaseView>
        );
    }
}