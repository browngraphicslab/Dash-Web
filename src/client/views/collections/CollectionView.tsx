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



export enum CollectionViewType {
    Invalid,
    Freeform,
    Schema,
    Docking,
}

export const COLLECTION_BORDER_WIDTH = 2;

@observer
export class CollectionView extends React.Component<CollectionViewProps> {

    public static LayoutString(fieldKey: string = "DataKey") {
        return `<CollectionView Document={Document}
                    ScreenToLocalTransform={ScreenToLocalTransform} fieldKey={${fieldKey}} isSelected={isSelected} select={select} bindings={bindings}
                    isTopMost={isTopMost} BackgroundView={BackgroundView} />`;
    }
    public active = () => {
        var isSelected = this.props.isSelected();
        var childSelected = SelectionManager.SelectedDocuments().some(view => view.props.ContainingCollectionView == this);
        var topMost = this.props.isTopMost;
        return isSelected || childSelected || topMost;
    }
    @action
    addDocument = (doc: Document): void => {
        //TODO This won't create the field if it doesn't already exist
        const value = this.props.Document.GetData(this.props.fieldKey, ListField, new Array<Document>())
        value.push(doc);
    }

    @action
    removeDocument = (doc: Document): boolean => {
        //TODO This won't create the field if it doesn't already exist
        const value = this.props.Document.GetData(this.props.fieldKey, ListField, new Array<Document>())
        let index = value.indexOf(doc);
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
        if (viewField === "<Waiting>") {
            return CollectionViewType.Invalid;
        } else if (viewField) {
            return viewField.Data;
        } else {
            return CollectionViewType.Freeform;
        }
    }

    set collectionViewType(type: CollectionViewType) {
        let Document = this.props.Document;
        Document.SetData(KeyStore.ViewType, type, NumberField);
    }

    render() {
        let viewType = this.collectionViewType;
        switch (viewType) {
            case CollectionViewType.Freeform:
                return (<CollectionFreeFormView {...this.props}
                    addDocument={this.addDocument} removeDocument={this.removeDocument} active={this.active}
                    CollectionView={this} />)
            case CollectionViewType.Schema:
                return (<CollectionSchemaView {...this.props}
                    addDocument={this.addDocument} removeDocument={this.removeDocument} active={this.active}
                    CollectionView={this} />)
            case CollectionViewType.Docking:
                return (<CollectionDockingView {...this.props}
                    addDocument={this.addDocument} removeDocument={this.removeDocument} active={this.active}
                    CollectionView={this} />)
            default:
                return <div></div>
        }
    }
}