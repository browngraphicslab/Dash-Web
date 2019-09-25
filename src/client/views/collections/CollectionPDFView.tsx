import { trace } from "mobx";
import { observer } from "mobx-react";
import { Id } from "../../../new_fields/FieldSymbols";
import { emptyFunction } from "../../../Utils";
import { ContextMenu } from "../ContextMenu";
import { FieldView, FieldViewProps } from "../nodes/FieldView";
import { CollectionBaseView, CollectionRenderProps, CollectionViewType } from "./CollectionBaseView";
import { CollectionFreeFormView } from "./collectionFreeForm/CollectionFreeFormView";
import "./CollectionPDFView.scss";
import React = require("react");


@observer
export class CollectionPDFView extends React.Component<FieldViewProps> {
    public static LayoutString(fieldKey: string = "data", fieldExt: string = "annotations") {
        return FieldView.LayoutString(CollectionPDFView, fieldKey, fieldExt);
    }

    onContextMenu = (e: React.MouseEvent): void => {
        if (!e.isPropagationStopped() && this.props.Document[Id] !== "mainDoc") { // need to test this because GoldenLayout causes a parallel hierarchy in the React DOM for its children and the main document view7
            ContextMenu.Instance.addItem({ description: "PDFOptions", event: emptyFunction, icon: "file-pdf" });
        }
    }

    subView = (_type: CollectionViewType, renderProps: CollectionRenderProps) => {
        return (<CollectionFreeFormView {...this.props} {...renderProps} CollectionView={this} chromeCollapsed={true} />);
    }

    render() {
        trace();
        return (
            <CollectionBaseView {...this.props} className={"collectionPdfView-cont"} onContextMenu={this.onContextMenu}>
                {this.subView}
            </CollectionBaseView>
        );
    }
}