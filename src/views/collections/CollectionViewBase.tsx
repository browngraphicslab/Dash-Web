import { action, computed } from "mobx";
import { observer } from "mobx-react";
import { Document } from "../../fields/Document";
import { Opt } from "../../fields/Field";
import { Key, KeyStore } from "../../fields/Key";
import { ListField } from "../../fields/ListField";
import { SelectionManager } from "../../util/SelectionManager";
import { ContextMenu } from "../ContextMenu";
import React = require("react");
import { DocumentView } from "../nodes/DocumentView";
import { CollectionDockingView } from "./CollectionDockingView";


export interface CollectionViewProps {
    fieldKey: Key;
    Document: Document;
    ContainingDocumentView: Opt<DocumentView>;
}

export const COLLECTION_BORDER_WIDTH = 2;

@observer
export class CollectionViewBase extends React.Component<CollectionViewProps> {

    @computed
    public get active(): boolean {
        var isSelected = (this.props.ContainingDocumentView != undefined && SelectionManager.IsSelected(this.props.ContainingDocumentView));
        var childSelected = SelectionManager.SelectedDocuments().some(view => view.props.ContainingCollectionView == this);
        var topMost = this.props.ContainingDocumentView != undefined && (
            this.props.ContainingDocumentView.props.ContainingCollectionView == undefined ||
            this.props.ContainingDocumentView.props.ContainingCollectionView instanceof CollectionDockingView);
        return isSelected || childSelected || topMost;
    }
    @action
    addDocument = (doc: Document): void => {
        //TODO This won't create the field if it doesn't already exist
        const value = this.props.Document.GetFieldValue(this.props.fieldKey, ListField, new Array<Document>())
        value.push(doc);
    }

    @action
    removeDocument = (doc: Document): void => {
        //TODO This won't create the field if it doesn't already exist
        const value = this.props.Document.GetFieldValue(this.props.fieldKey, ListField, new Array<Document>())
        if (value.indexOf(doc) !== -1) {
            value.splice(value.indexOf(doc), 1)

            SelectionManager.DeselectAll()
            ContextMenu.Instance.clearItems()
        }
    }

}