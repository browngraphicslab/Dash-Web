import { action, computed } from "mobx";
import { observer } from "mobx-react";
import { Document } from "../../../fields/Document";
import { Key } from "../../../fields/Key";
import { ListField } from "../../../fields/ListField";
import { SelectionManager } from "../../util/SelectionManager";
import { ContextMenu } from "../ContextMenu";
import React = require("react");
import { Transform } from "../../util/Transform";


export interface CollectionViewProps {
    fieldKey: Key;
    Document: Document;
    ScreenToLocalTransform: () => Transform;
    isSelected: () => boolean;
    isTopMost: boolean;
    select: (ctrlPressed: boolean) => void;
    BackgroundView?: () => JSX.Element;
}

export const COLLECTION_BORDER_WIDTH = 2;

@observer
export class CollectionViewBase extends React.Component<CollectionViewProps> {

    public static LayoutString(collectionType: string, fieldKey: string = "DataKey") {
        return `<${collectionType} Document={Document}
                    ScreenToLocalTransform={ScreenToLocalTransform} fieldKey={${fieldKey}} isSelected={isSelected} select={select}
                    isTopMost={isTopMost} BackgroundView={BackgroundView} />`;
    }
    @computed
    public get active(): boolean {
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

}