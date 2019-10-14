import * as React from 'react';
import { Doc } from '../../new_fields/Doc';
import { computed, action } from 'mobx';
import { Cast } from '../../new_fields/Types';
import { listSpec } from '../../new_fields/Schema';

export function DocComponent<P extends { Document: Doc }, T>(schemaCtor: (doc: Doc) => T) {
    class Component extends React.Component<P> {
        //TODO This might be pretty inefficient if doc isn't observed, because computed doesn't cache then
        @computed
        get Document(): T {
            return schemaCtor(this.props.Document);
        }
    }
    return Component;
}

interface DocAnnotatableProps {
    Document: Doc;
    DataDoc?: Doc;
    fieldKey: string;
    fieldExt: string;
    whenActiveChanged: (isActive: boolean) => void;
    isSelected: () => boolean;
    renderDepth: number;
}
export function DocAnnotatableComponent<P extends DocAnnotatableProps, T>(schemaCtor: (doc: Doc) => T) {
    class Component extends React.Component<P> {
        //TODO This might be pretty inefficient if doc isn't observed, because computed doesn't cache then
        @computed
        get Document(): T {
            return schemaCtor(this.props.Document);
        }
        _isChildActive = false;
        @action.bound
        removeDocument(doc: Doc): boolean {
            Doc.GetProto(doc).annotationOn = undefined;
            let value = Cast(this.extensionDoc[this.props.fieldExt], listSpec(Doc), []);
            let index = value ? Doc.IndexOf(doc, value.map(d => d as Doc), true) : -1;
            return index !== -1 && value.splice(index, 1) ? true : false;
        }

        @computed get dataDoc() { return (this.props.DataDoc && this.props.Document.isTemplate ? this.props.DataDoc : Doc.GetProto(this.props.Document)) as Doc; }

        @computed get extensionDoc() { return Doc.fieldExtensionDoc(this.dataDoc, this.props.fieldKey); }

        // if the moved document is already in this overlay collection nothing needs to be done.
        // otherwise, if the document can be removed from where it was, it will then be added to this document's overlay collection. 
        @action.bound
        moveDocument(doc: Doc, targetCollection: Doc, addDocument: (doc: Doc) => boolean): boolean {
            return Doc.AreProtosEqual(this.props.Document, targetCollection) ? true : this.removeDocument(doc) ? addDocument(doc) : false;
        }

        @action.bound
        addDocument(doc: Doc): boolean {
            Doc.GetProto(doc).annotationOn = this.props.Document;
            return Doc.AddDocToList(this.extensionDoc, this.props.fieldExt, doc);
        }
        whenActiveChanged = (isActive: boolean) => this.props.whenActiveChanged(this._isChildActive = isActive);
        active = () => this.props.isSelected() || this._isChildActive || this.props.renderDepth === 0;
    }
    return Component;
}