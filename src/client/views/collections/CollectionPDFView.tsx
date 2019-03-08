import { action, computed } from "mobx";
import { observer } from "mobx-react";
import { Document } from "../../../fields/Document";
import { ListField } from "../../../fields/ListField";
import { SelectionManager } from "../../util/SelectionManager";
import { ContextMenu } from "../ContextMenu";
import React = require("react");
import { KeyStore } from "../../../fields/KeyStore";
import { NumberField } from "../../../fields/NumberField";
import { CollectionFreeFormView } from "./CollectionFreeFormView";
import { CollectionDockingView } from "./CollectionDockingView";
import { CollectionSchemaView } from "./CollectionSchemaView";
import { CollectionViewProps } from "./CollectionViewBase";
import { CollectionTreeView } from "./CollectionTreeView";
import { Field } from "../../../fields/Field";
import { CollectionViewType, CollectionView } from "./CollectionView";
import { JSXElement } from "babel-types";


@observer
export class CollectionPDFView extends React.Component<CollectionViewProps> {

    public static LayoutString(fieldKey: string = "DataKey") {
        return `<${CollectionPDFView.name} Document={Document}
                    ScreenToLocalTransform={ScreenToLocalTransform} fieldKey={${fieldKey}} panelWidth={PanelWidth} panelHeight={PanelHeight} isSelected={isSelected} select={select} bindings={bindings}
                    isTopMost={isTopMost} SelectOnLoad={selectOnLoad} BackgroundView={BackgroundView} focus={focus}/>`;
    }

    @action onPageBack = () => this.curPage > 1 ? this.props.Document.SetNumber(KeyStore.CurPage, this.curPage - 1) : 0;
    @action onPageForward = () => this.curPage < this.numPages ? this.props.Document.SetNumber(KeyStore.CurPage, this.curPage + 1) : 0;

    @computed private get curPage() { return this.props.Document.GetNumber(KeyStore.CurPage, 0); }
    @computed private get numPages() { return this.props.Document.GetNumber(KeyStore.NumPages, 0); }
    @computed private get uIButtons() {
        return (
            <div className="pdfBox-buttonTray" key="tray">
                <button className="pdfButton" onClick={this.onPageBack}>{"<"}</button>
                <button className="pdfButton" onClick={this.onPageForward}>{">"}</button>
            </div>);
    }

    // CollectionView API starts here...

    public active: () => boolean = () => CollectionView.Active(this);

    @action
    addDocument = (doc: Document): void => {
        doc.SetNumber(KeyStore.Page, this.curPage);
        CollectionView.AddDocument(this.props, doc);
    }

    @action removeDocument = (doc: Document): boolean => {
        return CollectionView.RemoveDocument(this.props, doc);
    }

    specificContextMenu = (e: React.MouseEvent): void => {
        if (!e.isPropagationStopped) { // need to test this because GoldenLayout causes a parallel hierarchy in the React DOM for its children and the main document view7
            ContextMenu.Instance.addItem({ description: "PDFOptions", event: () => { } })
        }
    }

    get collectionViewType(): CollectionViewType { return CollectionViewType.Freeform; }


    @computed
    get subView(): any { return CollectionView.SubView(this); }

    render() {
        return (<div className="collectionView-cont" onContextMenu={this.specificContextMenu}>
            {this.subView}
            {this.props.isSelected() ? this.uIButtons : (null)}
        </div>)
    }
}