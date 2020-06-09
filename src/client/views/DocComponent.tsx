import { Doc, Opt, DataSym, DocListCast } from '../../fields/Doc';
import { Touchable } from './Touchable';
import { computed, action, observable } from 'mobx';
import { Cast, BoolCast, ScriptCast } from '../../fields/Types';
import { InkTool } from '../../fields/InkField';
import { InteractionUtils } from '../util/InteractionUtils';
import { List } from '../../fields/List';
import { DateField } from '../../fields/DateField';
import { ScriptField } from '../../fields/ScriptField';


///  DocComponent returns a generic React base class used by views that don't have 'fieldKey' props (e.g.,CollectionFreeFormDocumentView, DocumentView)
interface DocComponentProps {
    Document: Doc;
    LayoutTemplate?: () => Opt<Doc>;
}
export function DocComponent<P extends DocComponentProps, T>(schemaCtor: (doc: Doc) => T) {
    class Component extends Touchable<P> {
        //TODO This might be pretty inefficient if doc isn't observed, because computed doesn't cache then
        @computed get Document(): T { return schemaCtor(this.props.Document); }
        // This is the "The Document" -- it encapsulates, data, layout, and any templates
        @computed get rootDoc() { return Cast(this.props.Document.rootDocument, Doc, null) || this.props.Document; }
        // This is the rendering data of a document -- it may be "The Document", or it may be some template document that holds the rendering info
        @computed get layoutDoc() { return Doc.Layout(this.props.Document, this.props.LayoutTemplate?.()); }
        // This is the data part of a document -- ie, the data that is constant across all views of the document
        @computed get dataDoc() { return this.props.Document[DataSym] as Doc; }

        protected multiTouchDisposer?: InteractionUtils.MultiTouchEventDisposer;
    }
    return Component;
}

/// FieldViewBoxProps  -  a generic base class for field views that are not annotatable (e.g. AudioBox, FormattedTextBox)
interface ViewBoxBaseProps {
    Document: Doc;
    DataDoc?: Doc;
    ContainingCollectionDoc: Opt<Doc>;
    fieldKey: string;
    isSelected: (outsideReaction?: boolean) => boolean;
    renderDepth: number;
    rootSelected: (outsideReaction?: boolean) => boolean;
}
export function ViewBoxBaseComponent<P extends ViewBoxBaseProps, T>(schemaCtor: (doc: Doc) => T) {
    class Component extends Touchable<P> {
        //TODO This might be pretty inefficient if doc isn't observed, because computed doesn't cache then
        //@computed get Document(): T { return schemaCtor(this.props.Document); }

        // This is the "The Document" -- it encapsulates, data, layout, and any templates
        @computed get rootDoc() { return Cast(this.props.Document.rootDocument, Doc, null) || this.props.Document; }
        // This is the rendering data of a document -- it may be "The Document", or it may be some template document that holds the rendering info
        @computed get layoutDoc() { return Doc.Layout(this.props.Document); }
        // This is the data part of a document -- ie, the data that is constant across all views of the document
        @computed get dataDoc() { return this.props.DataDoc && (this.props.Document.isTemplateForField || this.props.Document.isTemplateDoc) ? this.props.DataDoc : this.props.Document[DataSym]; }

        // key where data is stored
        @computed get fieldKey() { return this.props.fieldKey; }

        lookupField = (field: string) => ScriptCast(this.layoutDoc.lookupField)?.script.run({ self: this.layoutDoc, data: this.rootDoc, field: field, container: this.props.ContainingCollectionDoc }).result;

        active = (outsideReaction?: boolean) => !this.props.Document.isBackground && (this.props.rootSelected(outsideReaction) || this.props.isSelected(outsideReaction) || this.props.renderDepth === 0 || this.layoutDoc.forceActive);//  && !Doc.SelectedTool();  // bcz: inking state shouldn't affect static tools 
        protected multiTouchDisposer?: InteractionUtils.MultiTouchEventDisposer;
    }
    return Component;
}


///  DocAnnotatbleComponent -return a base class for React views of document fields that are annotatable *and* interactive when selected (e.g., pdf, image)
export interface ViewBoxAnnotatableProps {
    Document: Doc;
    DataDoc?: Doc;
    fieldKey: string;
    active: () => boolean;
    whenActiveChanged: (isActive: boolean) => void;
    isSelected: (outsideReaction?: boolean) => boolean;
    rootSelected: (outsideReaction?: boolean) => boolean;
    renderDepth: number;
}
export function ViewBoxAnnotatableComponent<P extends ViewBoxAnnotatableProps, T>(schemaCtor: (doc: Doc) => T) {
    class Component extends Touchable<P> {
        @observable _isChildActive = false;
        //TODO This might be pretty inefficient if doc isn't observed, because computed doesn't cache then
        @computed get Document(): T { return schemaCtor(this.props.Document); }

        // This is the "The Document" -- it encapsulates, data, layout, and any templates
        @computed get rootDoc() { return Cast(this.props.Document.rootDocument, Doc, null) || this.props.Document; }
        // This is the rendering data of a document -- it may be "The Document", or it may be some template document that holds the rendering info
        @computed get layoutDoc() { return schemaCtor(Doc.Layout(this.props.Document)); }
        // This is the data part of a document -- ie, the data that is constant across all views of the document
        @computed get dataDoc() { return this.props.DataDoc && (this.props.Document.isTemplateForField || this.props.Document.isTemplateDoc) ? this.props.DataDoc : this.props.Document[DataSym]; }

        // key where data is stored
        @computed get fieldKey() { return this.props.fieldKey; }

        lookupField = (field: string) => ScriptCast((this.layoutDoc as any).lookupField)?.script.run({ self: this.layoutDoc, data: this.rootDoc, field: field }).result;

        styleFromLayoutString = (scale: number) => {
            const style: { [key: string]: any } = {};
            const divKeys = ["width", "height", "background", "top", "position"];
            const replacer = (match: any, expr: string, offset: any, string: any) => { // bcz: this executes a script to convert a property expression string:  { script }  into a value
                return ScriptField.MakeFunction(expr, { self: Doc.name, this: Doc.name, scale: "number" })?.script.run({ self: this.rootDoc, this: this.layoutDoc, scale }).result as string || "";
            };
            divKeys.map((prop: string) => {
                const p = (this.props as any)[prop] as string;
                p && (style[prop] = p?.replace(/{([^.'][^}']+)}/g, replacer));
            });
            return style;
        }

        protected multiTouchDisposer?: InteractionUtils.MultiTouchEventDisposer;

        _annotationKey: string = "annotations";
        public get annotationKey() { return this.fieldKey + "-" + this._annotationKey; }

        @action.bound
        removeDocument(doc: Doc | Doc[]): boolean {
            const docs = doc instanceof Doc ? [doc] : doc;
            docs.map(doc => doc.annotationOn = undefined);
            const targetDataDoc = this.dataDoc;
            const value = DocListCast(targetDataDoc[this.annotationKey]);
            const result = value.filter(v => !docs.includes(v));
            if (result.length !== value.length) {
                targetDataDoc[this.annotationKey] = new List<Doc>(result);
                return true;
            }
            return false;
        }
        // if the moved document is already in this overlay collection nothing needs to be done.
        // otherwise, if the document can be removed from where it was, it will then be added to this document's overlay collection. 
        @action.bound
        moveDocument(doc: Doc | Doc[], targetCollection: Doc | undefined, addDocument: (doc: Doc | Doc[]) => boolean): boolean {
            return Doc.AreProtosEqual(this.props.Document, targetCollection) ? true : this.removeDocument(doc) ? addDocument(doc) : false;
        }
        @action.bound
        addDocument(doc: Doc | Doc[]): boolean {
            const docs = doc instanceof Doc ? [doc] : doc;
            docs.map(doc => doc.context = Doc.GetProto(doc).annotationOn = this.props.Document);
            const targetDataDoc = this.props.Document[DataSym];
            const docList = DocListCast(targetDataDoc[this.annotationKey]);
            const added = docs.filter(d => !docList.includes(d));
            if (added.length) {
                added.map(doc => doc.context = this.props.Document);
                targetDataDoc[this.annotationKey] = new List<Doc>([...docList, ...added]);
                targetDataDoc[this.annotationKey + "-lastModified"] = new DateField(new Date(Date.now()));
            }
            return true;
        }

        whenActiveChanged = action((isActive: boolean) => this.props.whenActiveChanged(this._isChildActive = isActive));
        active = (outsideReaction?: boolean) => ((Doc.GetSelectedTool() === InkTool.None && !this.props.Document.isBackground) &&
            (this.props.rootSelected(outsideReaction) || this.props.isSelected(outsideReaction) || this._isChildActive || this.props.renderDepth === 0 || BoolCast((this.layoutDoc as any).forceActive)) ? true : false)
        annotationsActive = (outsideReaction?: boolean) => (Doc.GetSelectedTool() !== InkTool.None || (this.props.Document.isBackground && this.props.active()) ||
            (this.props.Document.forceActive || this.props.isSelected(outsideReaction) || this._isChildActive || this.props.renderDepth === 0) ? true : false)
    }
    return Component;
}