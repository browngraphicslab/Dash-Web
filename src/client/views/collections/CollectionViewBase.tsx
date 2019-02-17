import { action, computed } from "mobx";
import { observer } from "mobx-react";
import { Document } from "../../../fields/Document";
import { Opt } from "../../../fields/Field";
import { Key } from "../../../fields/Key";
import { ListField } from "../../../fields/ListField";
import { SelectionManager } from "../../util/SelectionManager";
import { ContextMenu } from "../ContextMenu";
import React = require("react");
import { DocumentView } from "../nodes/DocumentView";
import { CollectionDockingView } from "./CollectionDockingView";
import { CollectionFreeFormDocumentView } from "../nodes/CollectionFreeFormDocumentView";
import { FieldViewProps } from "../nodes/FieldView";

export const COLLECTION_BORDER_WIDTH = 2;

@observer
export class CollectionViewBase extends React.Component<FieldViewProps> {

    @computed
    public get active(): boolean {
        var isSelected = (this.props.DocumentViewForField instanceof CollectionFreeFormDocumentView && SelectionManager.IsSelected(this.props.DocumentViewForField));
        var childSelected = SelectionManager.SelectedDocuments().some(view => view.props.ContainingCollectionView == this);
        var topMost = this.props.DocumentViewForField != undefined && (
            this.props.DocumentViewForField.props.ContainingCollectionView == undefined ||
            this.props.DocumentViewForField.props.ContainingCollectionView instanceof CollectionDockingView);
        return isSelected || childSelected || topMost;
    }
    @action
    addDocument = (doc: Document): void => {
        //TODO This won't create the field if it doesn't already exist
        const value = this.props.doc.GetData(this.props.fieldKey, ListField, new Array<Document>())
        value.push(doc);
    }

    @action
    removeDocument = (doc: Document): void => {
        //TODO This won't create the field if it doesn't already exist
        const value = this.props.doc.GetData(this.props.fieldKey, ListField, new Array<Document>())
        if (value.indexOf(doc) !== -1) {
            value.splice(value.indexOf(doc), 1)

            SelectionManager.DeselectAll()
            ContextMenu.Instance.clearItems()
        }
    }

}