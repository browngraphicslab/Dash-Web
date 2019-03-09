import { action } from "mobx";
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

export enum CollectionViewType {
    Invalid,
    Freeform,
    Schema,
    Docking,
    Video, 
    Audio,
    Tree
}

export const COLLECTION_BORDER_WIDTH = 2;

@observer
export class CollectionView extends React.Component<CollectionViewProps> {

    public static LayoutString(fieldKey: string = "DataKey") {
        return `<CollectionView Document={Document}
                    ScreenToLocalTransform={ScreenToLocalTransform} fieldKey={${fieldKey}} panelWidth={PanelWidth} panelHeight={PanelHeight} isSelected={isSelected} select={select} bindings={bindings}
                    isTopMost={isTopMost} SelectOnLoad={selectOnLoad} BackgroundView={BackgroundView} focus={focus}/>`;
    }
    public active = () => {
        var isSelected = this.props.isSelected();
        var childSelected = SelectionManager.SelectedDocuments().some(view => view.props.ContainingCollectionView == this);
        var topMost = this.props.isTopMost;
        return isSelected || childSelected || topMost;
    }
    @action
    addDocument = (doc: Document): void => {
        if (this.props.Document.Get(this.props.fieldKey) instanceof Field) {
            //TODO This won't create the field if it doesn't already exist
            const value = this.props.Document.GetData(this.props.fieldKey, ListField, new Array<Document>())
            value.push(doc);
        } else {
            this.props.Document.SetData(this.props.fieldKey, [doc], ListField);
        }
    }


    @action
    removeDocument = (doc: Document): boolean => {
        //TODO This won't create the field if it doesn't already exist
        const value = this.props.Document.GetData(this.props.fieldKey, ListField, new Array<Document>())
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

    specificContextMenu = (e: React.MouseEvent): void => {
        if (!e.isPropagationStopped) { // need to test this because GoldenLayout causes a parallel hierarchy in the React DOM for its children and the main document view7
            ContextMenu.Instance.addItem({ description: "Freeform", event: () => this.props.Document.SetNumber(KeyStore.ViewType, CollectionViewType.Freeform) })
            ContextMenu.Instance.addItem({ description: "Schema", event: () => this.props.Document.SetNumber(KeyStore.ViewType, CollectionViewType.Schema) })
            ContextMenu.Instance.addItem({ description: "Treeview", event: () => this.props.Document.SetNumber(KeyStore.ViewType, CollectionViewType.Tree) })
            ContextMenu.Instance.addItem({ description: "Docking", event: () => this.props.Document.SetNumber(KeyStore.ViewType, CollectionViewType.Docking) })
        }
    }

    render() {
        let viewType = this.collectionViewType;
        let subView: JSX.Element;
        switch (viewType) {
            case CollectionViewType.Freeform:
                subView = (<CollectionFreeFormView {...this.props}
                    addDocument={this.addDocument} removeDocument={this.removeDocument} active={this.active}
                    CollectionView={this} />)
                break;
            case CollectionViewType.Schema:
                subView = (<CollectionSchemaView {...this.props}
                    addDocument={this.addDocument} removeDocument={this.removeDocument} active={this.active}
                    CollectionView={this} />)
                break;
            case CollectionViewType.Docking:
                subView = (<CollectionDockingView {...this.props}
                    addDocument={this.addDocument} removeDocument={this.removeDocument} active={this.active}
                    CollectionView={this} />)
                break;
            case CollectionViewType.Tree:
                subView = (<CollectionTreeView {...this.props}
                    addDocument={this.addDocument} removeDocument={this.removeDocument} active={this.active}
                    CollectionView={this} />)
                break;
            default:
                subView = <div></div>
                break;
        }
        return (<div onContextMenu={this.specificContextMenu}>
            {subView}
        </div>)
    }
}