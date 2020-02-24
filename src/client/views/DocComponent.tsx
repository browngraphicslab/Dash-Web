import { Doc, Opt, DataSym } from '../../new_fields/Doc';
import { Touchable } from './Touchable';
import { computed, action, observable } from 'mobx';
import { Cast } from '../../new_fields/Types';
import { listSpec } from '../../new_fields/Schema';
import { InkingControl } from './InkingControl';
import { InkTool } from '../../new_fields/InkField';
import { PositionDocument } from '../../new_fields/documentSchemas';


///  DocComponent returns a generic React base class used by views that don't have any data extensions (e.g.,CollectionFreeFormDocumentView, DocumentView, ButtonBox)
interface DocComponentProps {
    Document: Doc;
    LayoutDoc?: () => Opt<Doc>;
}
export function DocComponent<P extends DocComponentProps, T>(schemaCtor: (doc: Doc) => T) {
    class Component extends Touchable<P> {
        //TODO This might be pretty inefficient if doc isn't observed, because computed doesn't cache then
        @computed get Document(): T { return schemaCtor(this.props.Document); }
        @computed get layoutDoc() { return PositionDocument(Doc.Layout(this.props.Document, this.props.LayoutDoc?.())); }
    }
    return Component;
}

///  DocStaticProps return a base class for React document views that have data extensions but aren't annotatable (e.g. AudioBox, FormattedTextBox)
interface DocExtendableProps {
    Document: Doc;
    DataDoc?: Doc;
    fieldKey: string;
    isSelected: (outsideReaction?: boolean) => boolean;
    renderDepth: number;
}
export function DocExtendableComponent<P extends DocExtendableProps, T>(schemaCtor: (doc: Doc) => T) {
    class Component extends Touchable<P> {
        //TODO This might be pretty inefficient if doc isn't observed, because computed doesn't cache then
        @computed get Document(): T { return schemaCtor(this.props.Document); }
        @computed get layoutDoc() { return Doc.Layout(this.props.Document); }
        @computed get dataDoc() { return (this.props.DataDoc && (this.props.Document.isTemplateForField || this.props.Document.isTemplateDoc) ? this.props.DataDoc : Cast(this.props.Document.resolvedDataDoc, Doc, null) || Doc.GetProto(this.props.Document)) as Doc; }
        active = (outsideReaction?: boolean) => !this.props.Document.isBackground && (this.props.Document.forceActive || this.props.isSelected(outsideReaction) || this.props.renderDepth === 0);//  && !InkingControl.Instance.selectedTool;  // bcz: inking state shouldn't affect static tools 
    }
    return Component;
}


///  DocAnnotatbleComponent return a base class for React views of document fields that are annotatable *and* interactive when selected (e.g., pdf, image)
export interface DocAnnotatableProps {
    Document: Doc;
    DataDoc?: Doc;
    fieldKey: string;
    active: () => boolean;
    whenActiveChanged: (isActive: boolean) => void;
    isSelected: (outsideReaction?: boolean) => boolean;
    renderDepth: number;
}
export function DocAnnotatableComponent<P extends DocAnnotatableProps, T>(schemaCtor: (doc: Doc) => T) {
    class Component extends Touchable<P> {
        @observable _isChildActive = false;
        //TODO This might be pretty inefficient if doc isn't observed, because computed doesn't cache then
        @computed get Document(): T { return schemaCtor(this.props.Document); }
        @computed get layoutDoc() { return Doc.Layout(this.props.Document); }
        @computed get dataDoc() { return this.props.DataDoc && (this.props.Document.isTemplateForField || this.props.Document.isTemplateDoc) ? this.props.DataDoc : this.props.Document[DataSym]; }


        _annotationKey: string = "annotations";
        public set annotationKey(val: string) { this._annotationKey = val; }
        public get annotationKey() { return this._annotationKey; }

        @action.bound
        removeDocument(doc: Doc): boolean {
            Doc.GetProto(doc).annotationOn = undefined;
            const value = Cast(this.dataDoc[this.props.fieldKey + "-" + this._annotationKey], listSpec(Doc), []);
            const index = value ? Doc.IndexOf(doc, value.map(d => d as Doc), true) : -1;
            return index !== -1 && value && value.splice(index, 1) ? true : false;
        }
        // if the moved document is already in this overlay collection nothing needs to be done.
        // otherwise, if the document can be removed from where it was, it will then be added to this document's overlay collection. 
        @action.bound
        moveDocument(doc: Doc, targetCollection: Doc | undefined, addDocument: (doc: Doc) => boolean): boolean {
            return Doc.AreProtosEqual(this.props.Document, targetCollection) ? true : this.removeDocument(doc) ? addDocument(doc) : false;
        }
        @action.bound
        addDocument(doc: Doc): boolean {
            Doc.GetProto(doc).annotationOn = this.props.Document;
            return Doc.AddDocToList(this.dataDoc, this.props.fieldKey + "-" + this._annotationKey, doc) ? true : false;
        }

        whenActiveChanged = action((isActive: boolean) => this.props.whenActiveChanged(this._isChildActive = isActive));
        active = (outsideReaction?: boolean) => ((InkingControl.Instance.selectedTool === InkTool.None && !this.props.Document.isBackground) &&
            (this.props.Document.forceActive || this.props.isSelected(outsideReaction) || this._isChildActive || this.props.renderDepth === 0) ? true : false)
        annotationsActive = (outsideReaction?: boolean) => (InkingControl.Instance.selectedTool !== InkTool.None ||
            (this.props.Document.forceActive || this.props.isSelected(outsideReaction) || this._isChildActive || this.props.renderDepth === 0) ? true : false)
    }
    return Component;
}