import { action, computed } from 'mobx';
import { observer } from 'mobx-react';
import * as React from 'react';
import { Document } from '../../../fields/Document';
import { FieldValue, FieldWaiting } from '../../../fields/Field';
import { KeyStore } from '../../../fields/KeyStore';
import { ListField } from '../../../fields/ListField';
import { NumberField } from '../../../fields/NumberField';
import { ContextMenu } from '../ContextMenu';
import { FieldViewProps } from '../nodes/FieldView';

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
    get collectionViewType(): CollectionViewType | undefined {
        let Document = this.props.Document;
        let viewField = Document.GetT(KeyStore.ViewType, NumberField);
        if (viewField === FieldWaiting) {
            return undefined;
        } else if (viewField) {
            return viewField.Data;
        } else {
            return CollectionViewType.Invalid;
        }
    }

    active = (): boolean => {
        var isSelected = this.props.isSelected();
        var topMost = this.props.isTopMost;
        return isSelected || this._isChildActive || topMost;
    }

    //TODO should this be observable?
    private _isChildActive = false;
    whenActiveChanged = (isActive: boolean) => {
        this._isChildActive = isActive;
        this.props.whenActiveChanged(isActive);
    }

    createsCycle(documentToAdd: Document, containerDocument: Document): boolean {
        if (!(documentToAdd instanceof Document)) {
            return false;
        }
        let data = documentToAdd.GetList(KeyStore.Data, [] as Document[]);
        for (const doc of data.filter(d => d instanceof Document)) {
            if (this.createsCycle(doc, containerDocument)) {
                return true;
            }
        }
        let annots = documentToAdd.GetList(KeyStore.Annotations, [] as Document[]);
        for (const annot of annots) {
            if (this.createsCycle(annot, containerDocument)) {
                return true;
            }
        }
        for (let containerProto: FieldValue<Document> = containerDocument; containerProto && containerProto !== FieldWaiting; containerProto = containerProto.GetPrototype()) {
            if (containerProto.Id === documentToAdd.Id) {
                return true;
            }
        }
        return false;
    }
    @computed get isAnnotationOverlay() { return this.props.fieldKey && this.props.fieldKey.Id === KeyStore.Annotations.Id; } // bcz: ? Why do we need to compare Id's?

    @action.bound
    addDocument(doc: Document, allowDuplicates: boolean = false): boolean {
        var curPage = this.props.Document.GetNumber(KeyStore.CurPage, -1);
        doc.SetOnPrototype(KeyStore.Page, new NumberField(curPage));
        if (curPage >= 0) {
            doc.SetOnPrototype(KeyStore.AnnotationOn, this.props.Document);
        }
        if (!this.createsCycle(doc, this.props.Document)) {
            let value = this.props.Document.Get(this.props.fieldKey) as ListField<Document>;
            if (value) {
                if (!value.Data.some(v => v.Id === doc.Id) || allowDuplicates) {
                    value.Data.push(doc);
                }
            } else {
                this.props.Document.Set(this.props.fieldKey, new ListField([doc]));
            }
            // set the ZoomBasis only if hasn't already been set -- bcz: maybe set/resetting the ZoomBasis should be a parameter to addDocument?
            if (this.collectionViewType === CollectionViewType.Freeform || this.collectionViewType === CollectionViewType.Invalid) {
                let zoom = this.props.Document.GetNumber(KeyStore.Scale, 1);
                doc.SetNumber(KeyStore.ZoomBasis, zoom);
            }
        }
        return true;
        // bcz: What is this code trying to do?
        // else {
        //     let proto = props.Document.GetPrototype();
        //     if (!proto || proto === FieldWaiting || !this.createsCycle(proto, doc)) {
        //         const field = new ListField([doc]);
        //         // const script = CompileScript(`
        //         //     if(added) {
        //         //         console.log("added " + field.Title + " " + doc.Title);
        //         //     } else {
        //         //         console.log("removed " + field.Title + " " + doc.Title);
        //         //     }
        //         // `, {
        //         //         addReturn: false,
        //         //         params: {
        //         //             field: Document.name,
        //         //             added: "boolean"
        //         //         },
        //         //         capturedVariables: {
        //         //             doc: this.props.Document
        //         //         }
        //         //     });
        //         // if (script.compiled) {
        //         //     field.addScript(new ScriptField(script));
        //         // }
        //         props.Document.SetOnPrototype(props.fieldKey, field);
        //         return true;
        //     }
        // }
        return false;
    }

    @action.bound
    removeDocument(doc: Document): boolean {
        const props = this.props;
        //TODO This won't create the field if it doesn't already exist
        const value = props.Document.GetData(props.fieldKey, ListField, new Array<Document>());
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
        });

        if (index !== -1) {
            value.splice(index, 1);

            // SelectionManager.DeselectAll()
            ContextMenu.Instance.clearItems();
            return true;
        }
        return false;
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
            whenActiveChanged: this.whenActiveChanged,
        };
        const viewtype = this.collectionViewType;
        return (
            <div className={this.props.className || "collectionView-cont"}
                style={{ borderRadius: "inherit", pointerEvents: "all" }}
                onContextMenu={this.props.onContextMenu} ref={this.props.contentRef}>
                {viewtype !== undefined ? this.props.children(viewtype, props) : (null)}
            </div>
        );
    }

}