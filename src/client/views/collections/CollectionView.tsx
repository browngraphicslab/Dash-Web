import { action, computed, observable } from "mobx";
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
import { Field, FieldId, FieldWaiting } from "../../../fields/Field";
import { CurrentUserUtils } from "../../../server/authentication/models/current_user_utils";

export enum CollectionViewType {
    Invalid,
    Freeform,
    Schema,
    Docking,
    Tree
}

export const COLLECTION_BORDER_WIDTH = 1;

@observer
export class CollectionView extends React.Component<CollectionViewProps> {

    public static LayoutString(fieldKey: string = "DataKey") {
        return `<${CollectionView.name} Document={Document}
                    ScreenToLocalTransform={ScreenToLocalTransform} fieldKey={${fieldKey}} panelWidth={PanelWidth} panelHeight={PanelHeight} isSelected={isSelected} select={select} bindings={bindings}
                    isTopMost={isTopMost} SelectOnLoad={selectOnLoad} BackgroundView={BackgroundView} focus={focus}/>`;
    }

    @observable
    public SelectedDocs: FieldId[] = [];
    public active: () => boolean = () => CollectionView.Active(this);
    addDocument = (doc: Document, allowDuplicates: boolean): void => { CollectionView.AddDocument(this.props, doc, allowDuplicates); }
    removeDocument = (doc: Document): boolean => { return CollectionView.RemoveDocument(this.props, doc); }
    get subView() { return CollectionView.SubView(this); }

    public static Active(self: CollectionView): boolean {
        var isSelected = self.props.isSelected();
        var childSelected = SelectionManager.SelectedDocuments().some(view => view.props.ContainingCollectionView == self);
        var topMost = self.props.isTopMost;
        return isSelected || childSelected || topMost;
    }

    @action
    public static AddDocument(props: CollectionViewProps, doc: Document, allowDuplicates: boolean) {
        doc.SetNumber(KeyStore.Page, props.Document.GetNumber(KeyStore.CurPage, -1));
        if (props.Document.Get(props.fieldKey) instanceof Field) {
            //TODO This won't create the field if it doesn't already exist
            const value = props.Document.GetData(props.fieldKey, ListField, new Array<Document>())
            if (!value.some(v => v.Id == doc.Id) || allowDuplicates)
                value.push(doc);
        } else {
            props.Document.SetOnPrototype(props.fieldKey, new ListField([doc]));
        }
    }

    @action
    public static RemoveDocument(props: CollectionViewProps, doc: Document): boolean {
        //TODO This won't create the field if it doesn't already exist
        const value = props.Document.GetData(props.fieldKey, ListField, new Array<Document>())
        let index = -1;
        for (let i = 0; i < value.length; i++) {
            if (value[i].Id == doc.Id) {
                index = i;
                break;
            }
        }

        if (index !== -1) {
            value.splice(index, 1)

            SelectionManager.DeselectAll()
            ContextMenu.Instance.clearItems()
            return true;
        }
        return false
    }

    get collectionViewType(): CollectionViewType {
        let Document = this.props.Document;
        let viewField = Document.GetT(KeyStore.ViewType, NumberField);
        if (viewField === FieldWaiting) {
            return CollectionViewType.Invalid;
        } else if (viewField) {
            return viewField.Data;
        } else {
            return CollectionViewType.Freeform;
        }
    }

    specificContextMenu = (e: React.MouseEvent): void => {
        if (!e.isPropagationStopped() && this.props.Document.Id != CurrentUserUtils.MainDocId) { // need to test this because GoldenLayout causes a parallel hierarchy in the React DOM for its children and the main document view7
            ContextMenu.Instance.addItem({ description: "Freeform", event: () => this.props.Document.SetNumber(KeyStore.ViewType, CollectionViewType.Freeform) })
            ContextMenu.Instance.addItem({ description: "Schema", event: () => this.props.Document.SetNumber(KeyStore.ViewType, CollectionViewType.Schema) })
            ContextMenu.Instance.addItem({ description: "Treeview", event: () => this.props.Document.SetNumber(KeyStore.ViewType, CollectionViewType.Tree) })
        }
    }

    public static SubView(self: CollectionView) {
        let subProps = { ...self.props, addDocument: self.addDocument, removeDocument: self.removeDocument, active: self.active, CollectionView: self }
        switch (self.collectionViewType) {
            case CollectionViewType.Freeform: return (<CollectionFreeFormView {...subProps} />)
            case CollectionViewType.Schema: return (<CollectionSchemaView {...subProps} />)
            case CollectionViewType.Docking: return (<CollectionDockingView {...subProps} />)
            case CollectionViewType.Tree: return (<CollectionTreeView {...subProps} />)
        }
        return (null);
    }

    render() {
        return (<div className="collectionView-cont" onContextMenu={this.specificContextMenu}>
            {this.subView}
        </div>)
    }
}
