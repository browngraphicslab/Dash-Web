import { action, computed } from "mobx";
import { observer } from "mobx-react";
import { Document } from "../../../fields/Document";
import { KeyStore } from "../../../fields/KeyStore";
import { ContextMenu } from "../ContextMenu";
import { CollectionView, CollectionViewType } from "./CollectionView";
import { CollectionViewProps } from "./CollectionViewBase";
import React = require("react");
import { FieldId } from "../../../fields/Field";


@observer
export class CollectionPDFView extends React.Component<CollectionViewProps> {

    public static LayoutString(fieldKey: string = "DataKey") {
        return `<${CollectionPDFView.name} Document={Document}
                    ScreenToLocalTransform={ScreenToLocalTransform} fieldKey={${fieldKey}} panelWidth={PanelWidth} panelHeight={PanelHeight} isSelected={isSelected} select={select} bindings={bindings}
                    isTopMost={isTopMost} SelectOnLoad={selectOnLoad} BackgroundView={BackgroundView} focus={focus}/>`;
    }

    public SelectedDocs: FieldId[] = []
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

    // "inherited" CollectionView API starts here...

    public active: () => boolean = () => CollectionView.Active(this);

    addDocument = (doc: Document): void => { CollectionView.AddDocument(this.props, doc); }
    removeDocument = (doc: Document): boolean => { return CollectionView.RemoveDocument(this.props, doc); }

    specificContextMenu = (e: React.MouseEvent): void => {
        if (!e.isPropagationStopped() && this.props.Document.Id != "mainDoc") { // need to test this because GoldenLayout causes a parallel hierarchy in the React DOM for its children and the main document view7
            ContextMenu.Instance.addItem({ description: "PDFOptions", event: () => { }, icon: "file-pdf" });
        }
    }

    get collectionViewType(): CollectionViewType { return CollectionViewType.Freeform; }
    get subView(): any { return CollectionView.SubView(this); }

    render() {
        return (<div className="collectionView-cont" onContextMenu={this.specificContextMenu}>
            {this.subView}
            {this.props.isSelected() ? this.uIButtons : (null)}
        </div>)
    }
}