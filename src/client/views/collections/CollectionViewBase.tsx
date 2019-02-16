import { action, computed } from "mobx";
import { observer } from "mobx-react";
import { Document } from "../../../fields/Document";
import { Opt } from "../../../fields/Field";
import { Key, KeyStore } from "../../../fields/Key";
import { ListField } from "../../../fields/ListField";
import { SelectionManager } from "../../util/SelectionManager";
import { ContextMenu } from "../ContextMenu";
import React = require("react");
import { DocumentView } from "../nodes/DocumentView";
import { CollectionDockingView } from "./CollectionDockingView";
import { CollectionFreeFormDocumentView } from "../nodes/CollectionFreeFormDocumentView";


export interface CollectionViewProps {
    CollectionFieldKey: Key;
    DocumentForCollection: Document;
    ContainingDocumentView: Opt<DocumentView>;
    BackgroundView: Opt<DocumentView>;
    DownX: number;
    DownY: number;
}

export const COLLECTION_BORDER_WIDTH = 2;

@observer
export class CollectionViewBase extends React.Component<CollectionViewProps> {

    public static LayoutString(collectionType: string) {
        return `<${collectionType} DocumentForCollection={Document} CollectionFieldKey={DataKey} ContainingDocumentView={DocumentView}/>`;
    }
    @computed
    public get active(): boolean {
        var isSelected = (this.props.ContainingDocumentView instanceof CollectionFreeFormDocumentView && SelectionManager.IsSelected(this.props.ContainingDocumentView));
        var childSelected = SelectionManager.SelectedDocuments().some(view => view.props.ContainingCollectionView == this);
        var topMost = this.props.ContainingDocumentView != undefined && (
            this.props.ContainingDocumentView.props.ContainingCollectionView == undefined ||
            this.props.ContainingDocumentView.props.ContainingCollectionView instanceof CollectionDockingView);
        return isSelected || childSelected || topMost;
    }
    @action
    addDocument = (doc: Document): void => {
        //TODO This won't create the field if it doesn't already exist
        const value = this.props.DocumentForCollection.GetData(this.props.CollectionFieldKey, ListField, new Array<Document>())
        value.push(doc);
    }

    @action
    removeDocument = (doc: Document): void => {
        //TODO This won't create the field if it doesn't already exist
        const value = this.props.DocumentForCollection.GetData(this.props.CollectionFieldKey, ListField, new Array<Document>())
        if (value.indexOf(doc) !== -1) {
            value.splice(value.indexOf(doc), 1)

            SelectionManager.DeselectAll()
            ContextMenu.Instance.clearItems()
        }
    }

}