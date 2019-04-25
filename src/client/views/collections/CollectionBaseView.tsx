import { action, computed } from 'mobx';
import { observer } from 'mobx-react';
import * as React from 'react';
import { ContextMenu } from '../ContextMenu';
import { FieldViewProps } from '../nodes/FieldView';
import { Cast, FieldValue, PromiseValue } from '../../../new_fields/Types';
import { Doc, FieldResult, Opt, Id } from '../../../new_fields/Doc';
import { listSpec } from '../../../new_fields/Schema';
import { List } from '../../../new_fields/List';

export enum CollectionViewType {
    Invalid,
    Freeform,
    Schema,
    Docking,
    Tree,
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
    get collectionViewType(): CollectionViewType | undefined {
        let Document = this.props.Document;
        let viewField = Cast(Document.viewType, "number");
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
        let data = Cast(documentToAdd.data, listSpec(Doc), []);
        for (const doc of data.filter(d => d instanceof Document)) {
            if (this.createsCycle(doc, containerDocument)) {
                return true;
            }
        }
        let annots = Cast(documentToAdd.annotations, listSpec(Doc), []);
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
    @computed get isAnnotationOverlay() { return this.props.fieldKey && this.props.fieldKey === "annotations"; }

    @action.bound
    addDocument(doc: Doc, allowDuplicates: boolean = false): boolean {
        let props = this.props;
        var curPage = Cast(props.Document.curPage, "number", -1);
        Doc.SetOnPrototype(doc, "page", curPage);
        if (true || this.isAnnotationOverlay) {
            doc.zoom = Cast(this.props.Document.scale, "number", 1);
        }
        if (curPage >= 0) {
            Doc.SetOnPrototype(doc, "annotationOn", props.Document);
        }
        const data = props.Document[props.fieldKey];
        if (data !== undefined) {
            //TODO This won't create the field if it doesn't already exist
            const value = Cast(data, listSpec(Doc));
            if (!this.createsCycle(doc, props.Document) && value !== undefined) {
                if (allowDuplicates || !value.some(v => v.Id === doc.Id)) {
                    value.push(doc);
                }
            }
            else {
                return false;
            }
        } else {
            let proto = FieldValue(props.Document.proto);
            if (!proto || !this.createsCycle(proto, doc)) {
                const field = new List([doc]);
                // const script = CompileScript(`
                //     if(added) {
                //         console.log("added " + field.Title + " " + doc.Title);
                //     } else {
                //         console.log("removed " + field.Title + " " + doc.Title);
                //     }
                // `, {
                //         addReturn: false,
                //         params: {
                //             field: Document.name,
                //             added: "boolean"
                //         },
                //         capturedVariables: {
                //             doc: this.props.Document
                //         }
                //     });
                // if (script.compiled) {
                //     field.addScript(new ScriptField(script));
                // }
                Doc.SetOnPrototype(props.Document, props.fieldKey, field);
            }
            else {
                return false;
            }
        }
        return true;
    }

    @action.bound
    removeDocument(doc: Doc): boolean {
        const props = this.props;
        //TODO This won't create the field if it doesn't already exist
        const value = Cast(props.Document[props.fieldKey], listSpec(Doc), []);
        let index = -1;
        for (let i = 0; i < value.length; i++) {
            if (value[i][Id] === doc[Id]) {
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
            <div className={this.props.className || "collectionView-cont"} onContextMenu={this.props.onContextMenu} ref={this.props.contentRef}>
                {viewtype !== undefined ? this.props.children(viewtype, props) : (null)}
            </div>
        );
    }

}