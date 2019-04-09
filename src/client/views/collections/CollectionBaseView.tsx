import * as React from 'react';
import { FieldViewProps } from '../nodes/FieldView';
import { KeyStore } from '../../../fields/KeyStore';
import { NumberField } from '../../../fields/NumberField';
import { FieldWaiting, Field, FieldValue } from '../../../fields/Field';
import { ContextMenu } from '../ContextMenu';
import { SelectionManager } from '../../util/SelectionManager';
import { Document } from '../../../fields/Document';
import { ListField } from '../../../fields/ListField';
import { action } from 'mobx';
import { Transform } from '../../util/Transform';
import { observer } from 'mobx-react';

export enum CollectionViewType {
    Invalid,
    Freeform,
    Schema,
    Docking,
    Tree,
}

export interface CollectionRenderProps {
    addDocument: (document: Document, allowDuplicates?: boolean) => boolean;
    removeDocument: (document: Document) => boolean;
    moveDocument: (document: Document, targetCollection: Document, addDocument: (document: Document) => boolean) => boolean;
    active: () => boolean;
    onActiveChanged: (isActive: boolean) => void;
}

export interface CollectionViewProps extends FieldViewProps {
    onContextMenu?: (e: React.MouseEvent) => void;
    children: (type: CollectionViewType, props: CollectionRenderProps) => JSX.Element | JSX.Element[] | null;
    className?: string;
    contentRef?: React.Ref<HTMLDivElement>;
}

export const COLLECTION_BORDER_WIDTH = 1;

@observer
export class CollectionBaseView extends React.Component<CollectionViewProps> {
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

    active = (): boolean => {
        var isSelected = this.props.isSelected();
        var topMost = this.props.isTopMost;
        return isSelected || this._isChildActive || topMost;
    }

    //TODO should this be observable?
    private _isChildActive = false;
    onActiveChanged = (isActive: boolean) => {
        this._isChildActive = isActive;
        this.props.onActiveChanged(isActive);
    }

    createsCycle(documentToAdd: Document, containerDocument: Document): boolean {
        let data = documentToAdd.GetList<Document>(KeyStore.Data, []);
        for (const doc of data) {
            if (this.createsCycle(doc, containerDocument))
                return true;
        }
        let annots = documentToAdd.GetList<Document>(KeyStore.Annotations, []);
        for (const annot of annots) {
            if (this.createsCycle(annot, containerDocument))
                return true;
        }
        for (let containerProto: FieldValue<Document> = containerDocument; containerProto && containerProto !== FieldWaiting; containerProto = containerProto.GetPrototype()) {
            if (containerProto.Id === documentToAdd.Id)
                return true;
        }
        return false;
    }

    @action.bound
    addDocument(doc: Document, allowDuplicates: boolean = false): boolean {
        let props = this.props;
        var curPage = props.Document.GetNumber(KeyStore.CurPage, -1);
        doc.SetOnPrototype(KeyStore.Page, new NumberField(curPage));
        if (curPage >= 0) {
            doc.SetOnPrototype(KeyStore.AnnotationOn, props.Document);
        }
        if (props.Document.Get(props.fieldKey) instanceof Field) {
            //TODO This won't create the field if it doesn't already exist
            const value = props.Document.GetData(props.fieldKey, ListField, new Array<Document>())
            if (!this.createsCycle(doc, props.Document)) {
                if (!value.some(v => v.Id === doc.Id) || allowDuplicates)
                    value.push(doc);
            }
            else
                return false;
        } else {
            let proto = props.Document.GetPrototype();
            if (!proto || proto === FieldWaiting || !this.createsCycle(proto, doc)) {
                props.Document.SetOnPrototype(props.fieldKey, new ListField([doc]));
            }
            else
                return false;
        }
        return true;
    }

    @action.bound
    removeDocument(doc: Document): boolean {
        const props = this.props;
        //TODO This won't create the field if it doesn't already exist
        const value = props.Document.GetData(props.fieldKey, ListField, new Array<Document>())
        let index = -1;
        for (let i = 0; i < value.length; i++) {
            if (value[i].Id === doc.Id) {
                index = i;
                break;
            }
        }
        doc.GetTAsync(KeyStore.AnnotationOn, Document).then((annotationOn) => {
            if (annotationOn === props.Document) {
                doc.Set(KeyStore.AnnotationOn, undefined, true);
            }
        })

        if (index !== -1) {
            value.splice(index, 1)

            // SelectionManager.DeselectAll()
            ContextMenu.Instance.clearItems()
            return true;
        }
        return false
    }

    @action.bound
    moveDocument(doc: Document, targetCollection: Document, addDocument: (doc: Document) => boolean): boolean {
        if (this.props.Document === targetCollection) {
            return true;
        }
        if (this.removeDocument(doc)) {
            return addDocument(doc);
        }
        return false;
    }

    render() {
        const props: CollectionRenderProps = {
            addDocument: this.addDocument,
            removeDocument: this.removeDocument,
            moveDocument: this.moveDocument,
            active: this.active,
            onActiveChanged: this.onActiveChanged,
        }
        return (
            <div className={this.props.className || "collectionView-cont"} onContextMenu={this.props.onContextMenu} ref={this.props.contentRef}>
                {this.props.children(this.collectionViewType, props)}
            </div>
        )
    }

}