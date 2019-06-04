import { action, computed, observable } from 'mobx';
import { observer } from 'mobx-react';
import * as React from 'react';
import { ContextMenu } from '../ContextMenu';
import { FieldViewProps } from '../nodes/FieldView';
import { Cast, FieldValue, PromiseValue, NumCast } from '../../../new_fields/Types';
import { Doc, FieldResult, Opt, DocListCast } from '../../../new_fields/Doc';
import { listSpec } from '../../../new_fields/Schema';
import { List } from '../../../new_fields/List';
import { SelectionManager } from '../../util/SelectionManager';
import { Id } from '../../../new_fields/FieldSymbols';

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

    createsCycle(documentToAdd: Doc, containerDocument: Doc): boolean {
        if (!(documentToAdd instanceof Doc)) {
            return false;
        }
        let data = DocListCast(documentToAdd.data);
        for (const doc of data) {
            if (this.createsCycle(doc, containerDocument)) {
                return true;
            }
        }
        let annots = DocListCast(documentToAdd.annotations);
        for (const annot of annots) {
            if (this.createsCycle(annot, containerDocument)) {
                return true;
            }
        }
        for (let containerProto: Opt<Doc> = containerDocument; containerProto !== undefined; containerProto = FieldValue(containerProto.proto)) {
            if (containerProto[Id] === documentToAdd[Id]) {
                return true;
            }
        }
        return false;
    }
    @computed get isAnnotationOverlay() { return this.props.fieldKey === "annotations"; }

    @action.bound
    addDocument(doc: Doc, allowDuplicates: boolean = false): boolean {
        let props = this.props;
        var curPage = NumCast(props.Document.curPage, -1);
        Doc.SetOnPrototype(doc, "page", curPage);
        if (curPage >= 0) {
            Doc.SetOnPrototype(doc, "annotationOn", props.Document);
        }
        if (!this.createsCycle(doc, props.Document)) {
            //TODO This won't create the field if it doesn't already exist
            const value = Cast(props.Document[props.fieldKey], listSpec(Doc));
            let alreadyAdded = true;
            if (value !== undefined) {
                if (allowDuplicates || !value.some(v => v instanceof Doc && v[Id] === doc[Id])) {
                    alreadyAdded = false;
                    value.push(doc);
                }
            } else {
                alreadyAdded = false;
                Doc.SetOnPrototype(this.props.Document, this.props.fieldKey, new List([doc]));
            }
            // set the ZoomBasis only if hasn't already been set -- bcz: maybe set/resetting the ZoomBasis should be a parameter to addDocument?
            if (!alreadyAdded && (this.collectionViewType === CollectionViewType.Freeform || this.collectionViewType === CollectionViewType.Invalid)) {
                let zoom = NumCast(this.props.Document.scale, 1);
                // Doc.GetProto(doc).zoomBasis = zoom;
            }
        }
        return true;
    }

    @action.bound
    removeDocument(doc: Doc): boolean {
        SelectionManager.DeselectAll();
        const props = this.props;
        //TODO This won't create the field if it doesn't already exist
        const value = Cast(props.Document[props.fieldKey], listSpec(Doc), []);
        let index = -1;
        for (let i = 0; i < value.length; i++) {
            let v = value[i];
            if (v instanceof Doc && v[Id] === doc[Id]) {
                index = i;
                break;
            }
        }
        PromiseValue(Cast(doc.annotationOn, Doc)).then((annotationOn) => {
            if (annotationOn === props.Document) {
                doc.annotationOn = undefined;
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
    moveDocument(doc: Doc, targetCollection: Doc, addDocument: (doc: Doc) => boolean): boolean {
        if (this.props.Document === targetCollection) {
            return true;
        }
        if (this.removeDocument(doc)) {
            SelectionManager.DeselectAll();
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