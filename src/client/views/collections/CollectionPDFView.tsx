import { computed } from "mobx";
import { observer } from "mobx-react";
import { Id } from "../../../new_fields/FieldSymbols";
import { emptyFunction } from "../../../Utils";
import { ContextMenu } from "../ContextMenu";
import { FieldView, FieldViewProps } from "../nodes/FieldView";
import { PDFBox } from "../nodes/PDFBox";
import { CollectionBaseView, CollectionRenderProps, CollectionViewType } from "./CollectionBaseView";
import { CollectionFreeFormView } from "./collectionFreeForm/CollectionFreeFormView";
import "./CollectionPDFView.scss";
import React = require("react");


@observer
export class CollectionPDFView extends React.Component<FieldViewProps> {
    public static LayoutString(fieldKey: string = "data", fieldExt: string = "annotations") {
        return FieldView.LayoutString(CollectionPDFView, fieldKey, fieldExt);
    }

    private _pdfBox?: PDFBox;
    private _buttonTray: React.RefObject<HTMLDivElement> = React.createRef();

    @computed
    get uIButtons() {
        return (
            <div className="collectionPdfView-buttonTray" ref={this._buttonTray} key="tray" style={{ height: "100%" }}>
                <button className="collectionPdfView-backward" onClick={() => this._pdfBox && this._pdfBox.BackPage()}>{"<"}</button>
                <button className="collectionPdfView-forward" onClick={() => this._pdfBox && this._pdfBox.ForwardPage()}>{">"}</button>
            </div>
        );
    }

    onContextMenu = (e: React.MouseEvent): void => {
        if (!e.isPropagationStopped() && this.props.Document[Id] !== "mainDoc") { // need to test this because GoldenLayout causes a parallel hierarchy in the React DOM for its children and the main document view7
            ContextMenu.Instance.addItem({ description: "PDFOptions", event: emptyFunction, icon: "file-pdf" });
        }
    }

    setPdfBox = (pdfBox: PDFBox) => { this._pdfBox = pdfBox; };

    subView = (_type: CollectionViewType, renderProps: CollectionRenderProps) => {
        return (<>
            <CollectionFreeFormView {...this.props} {...renderProps} setPdfBox={this.setPdfBox} CollectionView={this} chromeCollapsed={true} />
            {renderProps.active() ? this.uIButtons : (null)}
        </>);
    }

    render() {
        return (
            <CollectionBaseView {...this.props} className={"collectionPdfView-cont"} onContextMenu={this.onContextMenu}>
                {this.subView}
            </CollectionBaseView>
        );
    }
}