import { action, computed, observable } from 'mobx';
import { observer } from 'mobx-react';
import * as React from 'react';
import { Doc, DocListCast } from '../../../new_fields/Doc';
import { Id } from '../../../new_fields/FieldSymbols';
import { List } from '../../../new_fields/List';
import { listSpec } from '../../../new_fields/Schema';
import { BoolCast, Cast, NumCast, PromiseValue, StrCast, FieldValue } from '../../../new_fields/Types';
import { DocumentManager } from '../../util/DocumentManager';
import { SelectionManager } from '../../util/SelectionManager';
import { ContextMenu } from '../ContextMenu';
import { FieldViewProps } from '../nodes/FieldView';
import './CollectionBaseView.scss';
import { DateField } from '../../../new_fields/DateField';
import { ImageField } from '../../../new_fields/URLField';

export enum CollectionViewType {
    Invalid,
    Freeform,
    Schema,
    Docking,
    Tree,
    Stacking,
    Masonry,
    Pivot,
    Linear,
}

export namespace CollectionViewType {

    const stringMapping = new Map<string, CollectionViewType>([
        ["invalid", CollectionViewType.Invalid],
        ["freeform", CollectionViewType.Freeform],
        ["schema", CollectionViewType.Schema],
        ["docking", CollectionViewType.Docking],
        ["tree", CollectionViewType.Tree],
        ["stacking", CollectionViewType.Stacking],
        ["masonry", CollectionViewType.Masonry],
        ["pivot", CollectionViewType.Pivot],
        ["linear", CollectionViewType.Linear]
    ]);

    export const valueOf = (value: string) => {
        return stringMapping.get(value.toLowerCase());
    };

}

export interface CollectionRenderProps {
    addDocument: (document: Doc) => boolean;
    removeDocument: (document: Doc) => boolean;
    moveDocument: (document: Doc, targetCollection: Doc, addDocument: (document: Doc) => boolean) => boolean;
    active: () => boolean;
    whenActiveChanged: (isActive: boolean) => void;
}

export interface CollectionViewProps extends FieldViewProps {
    onContextMenu?: (e: React.MouseEvent) => void;
    children: (type: CollectionViewType, props: CollectionRenderProps) => JSX.Element | JSX.Element[] | null | (JSX.Element | null)[];
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

    @computed get dataDoc() { return Doc.fieldExtensionDoc(this.props.Document.isTemplateField && this.props.DataDoc ? this.props.DataDoc : this.props.Document, this.props.fieldKey, this.props.fieldExt); }
    @computed get dataField() { return this.props.fieldExt ? this.props.fieldExt : this.props.fieldKey; }

    active = (): boolean => {
        var isSelected = this.props.isSelected();
        return isSelected || BoolCast(this.props.Document.forceActive) || this._isChildActive || this.props.renderDepth === 0;
    }

    //TODO should this be observable?
    private _isChildActive = false;
    whenActiveChanged = (isActive: boolean) => {
        this._isChildActive = isActive;
        this.props.whenActiveChanged(isActive);
    }

    @computed get extensionDoc() { return Doc.fieldExtensionDoc(this.props.DataDoc ? this.props.DataDoc : this.props.Document, this.props.fieldKey, this.props.fieldExt); }

    @action.bound
    addDocument(doc: Doc): boolean {
        if (this.props.fieldExt) { // bcz: fieldExt !== undefined means this is an overlay layer
            Doc.GetProto(doc).annotationOn = this.props.Document;
        }
        let targetDataDoc = this.props.fieldExt || this.props.Document.isTemplateField ? this.extensionDoc : this.props.Document;
        let targetField = (this.props.fieldExt || this.props.Document.isTemplateField) && this.props.fieldExt ? this.props.fieldExt : this.props.fieldKey;
        Doc.AddDocToList(targetDataDoc, targetField, doc);
        Doc.GetProto(doc).lastOpened = new DateField;
        return true;
    }

    @action.bound
    removeDocument(doc: Doc): boolean {
        let docView = DocumentManager.Instance.getDocumentView(doc, this.props.ContainingCollectionView);
        docView && SelectionManager.DeselectDoc(docView);
        //TODO This won't create the field if it doesn't already exist
        let targetDataDoc = this.props.fieldExt || this.props.Document.isTemplateField ? this.extensionDoc : this.props.Document;
        let targetField = (this.props.fieldExt || this.props.Document.isTemplateField) && this.props.fieldExt ? this.props.fieldExt : this.props.fieldKey;
        let value = Cast(targetDataDoc[targetField], listSpec(Doc), []);
        let index = value.reduce((p, v, i) => (v instanceof Doc && v === doc) ? i : p, -1);
        index = index !== -1 ? index : value.reduce((p, v, i) => (v instanceof Doc && Doc.AreProtosEqual(v, doc)) ? i : p, -1);
        PromiseValue(Cast(doc.annotationOn, Doc)).then(annotationOn => {
            if (Doc.AreProtosEqual(annotationOn, FieldValue(Cast(this.dataDoc.extendsDoc, Doc)))) {
                Doc.GetProto(doc).annotationOn = undefined;
            }
        });

        if (index !== -1) {
            value.splice(index, 1);

            // SelectionManager.DeselectAll()
            ContextMenu.Instance.clearItems();
            return true;
        }
        return false;
    }

    // this is called with the document that was dragged and the collection to move it into.
    // if the target collection is the same as this collection, then the move will be allowed.
    // otherwise, the document being moved must be able to be removed from its container before
    // moving it into the target.  
    @action.bound
    moveDocument(doc: Doc, targetCollection: Doc, addDocument: (doc: Doc) => boolean): boolean {
        if (Doc.AreProtosEqual(this.props.Document, targetCollection)) {
            return true;
        }
        return this.removeDocument(doc) ? addDocument(doc) : false;
    }

    showIsTagged = () => {
        const children = DocListCast(this.props.Document.data);
        const imageProtos = children.filter(doc => Cast(doc.data, ImageField)).map(Doc.GetProto);
        const allTagged = imageProtos.length > 0 && imageProtos.every(image => image.googlePhotosTags);
        if (allTagged) {
            return (
                <img
                    id={"google-tags"}
                    src={"/assets/google_tags.png"}
                />
            );
        }
        return (null);
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
            <div id="collectionBaseView"
                style={{
                    pointerEvents: this.props.Document.isBackground ? "none" : "all",
                    boxShadow: this.props.Document.isBackground || viewtype === CollectionViewType.Linear ? undefined : `#9c9396 ${StrCast(this.props.Document.boxShadow, "0.2vw 0.2vw 0.8vw")}`
                }}
                className={this.props.className || "collectionView-cont"}
                onContextMenu={this.props.onContextMenu} ref={this.props.contentRef}>
                {this.showIsTagged()}
                {viewtype !== undefined ? this.props.children(viewtype, props) : (null)}
            </div>
        );
    }

}
