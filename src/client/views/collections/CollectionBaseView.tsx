import { action, computed, observable } from 'mobx';
import { observer } from 'mobx-react';
import * as React from 'react';
import { Doc } from '../../../new_fields/Doc';
import { Id } from '../../../new_fields/FieldSymbols';
import { List } from '../../../new_fields/List';
import { listSpec } from '../../../new_fields/Schema';
import { BoolCast, Cast, NumCast, PromiseValue } from '../../../new_fields/Types';
import { DocumentManager } from '../../util/DocumentManager';
import { SelectionManager } from '../../util/SelectionManager';
import { ContextMenu } from '../ContextMenu';
import { FieldViewProps } from '../nodes/FieldView';
import './CollectionBaseView.scss';

export enum CollectionViewType {
    Invalid,
    Freeform,
    Schema,
    Docking,
    Tree,
    Stacking
}

export interface CollectionRenderProps {
    addDocument: (document: Doc, allowDuplicates?: boolean) => boolean;
    removeDocument: (document: Doc) => boolean;
    moveDocument: (document: Doc, targetCollection: Doc, addDocument: (document: Doc) => boolean) => boolean;
    active: () => boolean;
    whenActiveChanged: (isActive: boolean) => void;
}

export interface CollectionViewProps extends FieldViewProps {
    onContextMenu?: (e: React.MouseEvent) => void;
    children: (type: CollectionViewType, props: CollectionRenderProps) => JSX.Element | JSX.Element[] | null;
    className?: string;
    contentRef?: React.Ref<HTMLDivElement>;
}

@observer
export class CollectionBaseView extends React.Component<CollectionViewProps> {
    @observable private static _safeMode = false;
    static InSafeMode() { return this._safeMode; }
    static SetSafeMode(safeMode: boolean) { this._safeMode = safeMode; }
    get collectionViewType(): CollectionViewType | undefined {
        let Document = this.props.Document;
        let viewField = Cast(Document.viewType, "number");
        if (CollectionBaseView._safeMode) {
            if (viewField === CollectionViewType.Freeform) {
                return CollectionViewType.Tree;
            }
            if (viewField === CollectionViewType.Invalid) {
                return CollectionViewType.Freeform;
            }
        }
        if (viewField !== undefined) {
            return viewField;
        } else {
            return CollectionViewType.Invalid;
        }
    }

    @computed get dataDoc() { return Doc.resolvedFieldDataDoc(BoolCast(this.props.Document.isTemplate) ? this.props.DataDoc ? this.props.DataDoc : this.props.Document : this.props.Document, this.props.fieldKey, this.props.fieldExt); }
    @computed get dataField() { return this.props.fieldExt ? this.props.fieldExt : this.props.fieldKey; }

    active = (): boolean => {
        var isSelected = this.props.isSelected();
        return isSelected || this._isChildActive || this.props.renderDepth === 0;
    }

    //TODO should this be observable?
    private _isChildActive = false;
    whenActiveChanged = (isActive: boolean) => {
        this._isChildActive = isActive;
        this.props.whenActiveChanged(isActive);
    }

    @action.bound
    addDocument(doc: Doc, allowDuplicates: boolean = false): boolean {
        var curPage = NumCast(this.props.Document.curPage, -1);
        Doc.GetProto(doc).page = curPage;
        if (curPage >= 0) {
            Doc.GetProto(doc).annotationOn = this.props.Document;
        }
        allowDuplicates = true;
        const value = Cast(this.dataDoc[this.dataField], listSpec(Doc));
        if (value !== undefined) {
            if (allowDuplicates || !value.some(v => v instanceof Doc && v[Id] === doc[Id])) {
                value.push(doc);
            }
        } else {
            Doc.GetProto(this.dataDoc)[this.dataField] = new List([doc]);
        }
        return true;
    }

    @action.bound
    removeDocument(doc: Doc): boolean {
        let docView = DocumentManager.Instance.getDocumentView(doc, this.props.ContainingCollectionView);
        docView && SelectionManager.DeselectDoc(docView);
        //TODO This won't create the field if it doesn't already exist
        const value = Cast(this.dataDoc[this.dataField], listSpec(Doc), []);
        let index = value.reduce((p, v, i) => (v instanceof Doc && v[Id] === doc[Id]) ? i : p, -1);
        PromiseValue(Cast(doc.annotationOn, Doc)).then(annotationOn =>
            annotationOn === this.dataDoc.Document && (doc.annotationOn = undefined)
        );

        if (index !== -1) {
            value.splice(index, 1);

            // SelectionManager.DeselectAll()
            ContextMenu.Instance.clearItems();
            return true;
        }
        return false;
    }

    @action.bound
    moveDocument(doc: Doc, targetCollection: Doc, addDocument: (doc: Doc) => boolean): boolean {
        if (Doc.AreProtosEqual(this.dataDoc, targetCollection)) {
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
            whenActiveChanged: this.whenActiveChanged,
        };
        const viewtype = this.collectionViewType;
        return (
            <div id="collectionBaseView" className={this.props.className || "collectionView-cont"}
                onContextMenu={this.props.onContextMenu} ref={this.props.contentRef}>
                {viewtype !== undefined ? this.props.children(viewtype, props) : (null)}
            </div>
        );
    }

}
