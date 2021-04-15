import { Doc, Opt, DataSym, AclReadonly, AclAddonly, AclPrivate, AclEdit, AclSym, DocListCastAsync, DocListCast, AclAdmin } from '../../fields/Doc';
import { Touchable } from './Touchable';
import { computed, action, observable } from 'mobx';
import { Cast, BoolCast, ScriptCast } from '../../fields/Types';
import { InkTool } from '../../fields/InkField';
import { InteractionUtils } from '../util/InteractionUtils';
import { List } from '../../fields/List';
import { DateField } from '../../fields/DateField';
import { ScriptField } from '../../fields/ScriptField';
import { GetEffectiveAcl, SharingPermissions, distributeAcls, denormalizeEmail } from '../../fields/util';
import { CurrentUserUtils } from '../util/CurrentUserUtils';
import { DocUtils } from '../documents/Documents';
import { returnFalse } from '../../Utils';
import { UndoManager } from '../util/UndoManager';


///  DocComponent returns a generic React base class used by views that don't have 'fieldKey' props (e.g.,CollectionFreeFormDocumentView, DocumentView)
export interface DocComponentProps {
    Document: Doc;
    LayoutTemplate?: () => Opt<Doc>;
    LayoutTemplateString?: string;
}
export function DocComponent<P extends DocComponentProps, T>(schemaCtor: (doc: Doc) => T) {
    class Component extends Touchable<P> {
        //TODO This might be pretty inefficient if doc isn't observed, because computed doesn't cache then
        @computed get Document(): T { return schemaCtor(this.props.Document); }
        // This is the "The Document" -- it encapsulates, data, layout, and any templates
        @computed get rootDoc() { return Cast(this.props.Document.rootDocument, Doc, null) || this.props.Document; }
        // This is the rendering data of a document -- it may be "The Document", or it may be some template document that holds the rendering info
        @computed get layoutDoc() { return this.props.LayoutTemplateString ? this.props.Document : Doc.Layout(this.props.Document, this.props.LayoutTemplate?.()); }
        // This is the data part of a document -- ie, the data that is constant across all views of the document
        @computed get dataDoc() { return this.props.Document[DataSym] as Doc; }

        protected _multiTouchDisposer?: InteractionUtils.MultiTouchEventDisposer;
    }
    return Component;
}

/// FieldViewBoxProps  -  a generic base class for field views that are not annotatable (e.g. InkingStroke, ColorBox)
interface ViewBoxBaseProps {
    Document: Doc;
    DataDoc?: Doc;
    ContainingCollectionDoc: Opt<Doc>;
    fieldKey: string;
    layerProvider?: (doc: Doc, assign?: boolean) => boolean;
    isSelected: (outsideReaction?: boolean) => boolean;
    isContentActive: () => boolean;
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

        isContentActive = (outsideReaction?: boolean) => (CurrentUserUtils.SelectedTool !== InkTool.None ||
            (this.props.isContentActive?.() || this.props.Document.forceActive ||
                this.props.isSelected(outsideReaction) ||
                this.props.rootSelected(outsideReaction)) ? true : false)
        protected _multiTouchDisposer?: InteractionUtils.MultiTouchEventDisposer;
    }
    return Component;
}


///  DocAnnotatbleComponent -return a base class for React views of document fields that are annotatable *and* interactive when selected (e.g., pdf, image)
export interface ViewBoxAnnotatableProps {
    Document: Doc;
    DataDoc?: Doc;
    fieldKey: string;
    filterAddDocument?: (doc: Doc[]) => boolean;  // allows a document that renders a Collection view to filter or modify any documents added to the collection (see PresBox for an example)
    layerProvider?: (doc: Doc, assign?: boolean) => boolean;
    isContentActive: () => boolean;
    select: (isCtrlPressed: boolean) => void;
    whenChildContentsActiveChanged: (isActive: boolean) => void;
    isSelected: (outsideReaction?: boolean) => boolean;
    rootSelected: (outsideReaction?: boolean) => boolean;
    renderDepth: number;
    isAnnotationOverlay?: boolean;
}
export function ViewBoxAnnotatableComponent<P extends ViewBoxAnnotatableProps, T>(schemaCtor: (doc: Doc) => T, _annotationKey: string = "annotations") {
    class Component extends Touchable<P> {
        @observable _annotationKey: string = _annotationKey;

        @observable _isAnyChildContentActive = false;
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

        private AclMap = new Map<symbol, string>([
            [AclPrivate, SharingPermissions.None],
            [AclReadonly, SharingPermissions.View],
            [AclAddonly, SharingPermissions.Add],
            [AclEdit, SharingPermissions.Edit],
            [AclAdmin, SharingPermissions.Admin]
        ]);

        lookupField = (field: string) => ScriptCast((this.layoutDoc as any).lookupField)?.script.run({ self: this.layoutDoc, data: this.rootDoc, field: field }).result;

        styleFromLayoutString = (scale: number) => {
            const style: { [key: string]: any } = {};
            const divKeys = ["width", "height", "fontSize", "left", "background", "top", "pointerEvents", "position"];
            const replacer = (match: any, expr: string, offset: any, string: any) => { // bcz: this executes a script to convert a property expression string:  { script }  into a value
                return ScriptField.MakeFunction(expr, { self: Doc.name, this: Doc.name, scale: "number" })?.script.run({ self: this.rootDoc, this: this.layoutDoc, scale }).result as string || "";
            };
            divKeys.map((prop: string) => {
                const p = (this.props as any)[prop];
                typeof p === "string" && (style[prop] = p?.replace(/{([^.'][^}']+)}/g, replacer));
            });
            return style;
        }

        protected _multiTouchDisposer?: InteractionUtils.MultiTouchEventDisposer;

        @computed public get annotationKey() { return this.fieldKey + (this._annotationKey ? "-" + this._annotationKey : ""); }

        @action.bound
        removeDocument(doc: Doc | Doc[], annotationKey?: string, leavePushpin?: boolean): boolean {
            const effectiveAcl = GetEffectiveAcl(this.dataDoc);
            const indocs = doc instanceof Doc ? [doc] : doc;
            const docs = indocs.filter(doc => effectiveAcl === AclEdit || effectiveAcl === AclAdmin || GetEffectiveAcl(doc) === AclAdmin);
            if (docs.length) {
                setTimeout(() => docs.map(doc => { // this allows 'addDocument' to see the annotationOn field in order to create a pushin
                    Doc.SetInPlace(doc, "isPushpin", undefined, true);
                    doc.annotationOn === this.props.Document && Doc.SetInPlace(doc, "annotationOn", undefined, true);
                }));
                const targetDataDoc = this.dataDoc;
                const value = DocListCast(targetDataDoc[annotationKey ?? this.annotationKey]);
                const toRemove = value.filter(v => docs.includes(v));

                if (toRemove.length !== 0) {
                    const recent = Cast(Doc.UserDoc().myRecentlyClosedDocs, Doc) as Doc;
                    toRemove.forEach(doc => {
                        leavePushpin && DocUtils.LeavePushpin(doc, annotationKey ?? this.annotationKey);
                        Doc.RemoveDocFromList(targetDataDoc, annotationKey ?? this.annotationKey, doc);
                        doc.context = undefined;
                        recent && Doc.AddDocToList(recent, "data", doc, undefined, true, true);
                    });
                    this.props.select(false);
                    return true;
                }
            }

            return false;
        }
        // this is called with the document that was dragged and the collection to move it into.
        // if the target collection is the same as this collection, then the move will be allowed.
        // otherwise, the document being moved must be able to be removed from its container before
        // moving it into the target.
        @action.bound
        moveDocument = (doc: Doc | Doc[], targetCollection: Doc | undefined, addDocument: (doc: Doc | Doc[]) => boolean, annotationKey?: string): boolean => {
            if (Doc.AreProtosEqual(this.props.Document, targetCollection)) {
                return true;
            }
            const first = doc instanceof Doc ? doc : doc[0];
            if (!first?._stayInCollection && addDocument !== returnFalse) {
                return UndoManager.RunInTempBatch(() => this.removeDocument(doc, annotationKey, true) && addDocument(doc));
            }
            return false;
        }
        @action.bound
        addDocument(doc: Doc | Doc[], annotationKey?: string): boolean {
            const docs = doc instanceof Doc ? [doc] : doc;
            if (this.props.filterAddDocument?.(docs) === false ||
                docs.find(doc => Doc.AreProtosEqual(doc, this.props.Document))) {
                return false;
            }
            const targetDataDoc = this.props.Document[DataSym];
            const docList = DocListCast(targetDataDoc[annotationKey ?? this.annotationKey]);
            const added = docs.filter(d => !docList.includes(d));
            const effectiveAcl = GetEffectiveAcl(this.dataDoc);

            if (added.length) {
                if (effectiveAcl === AclPrivate || effectiveAcl === AclReadonly) {
                    return false;
                }
                else {
                    if (this.props.Document[AclSym] && Object.keys(this.props.Document[AclSym]).length) {
                        added.forEach(d => {
                            for (const [key, value] of Object.entries(this.props.Document[AclSym])) {
                                if (d.author === denormalizeEmail(key.substring(4)) && !d.aliasOf) distributeAcls(key, SharingPermissions.Admin, d, true);
                                //else if (this.props.Document[key] === SharingPermissions.Admin) distributeAcls(key, SharingPermissions.Add, d, true);
                                // else distributeAcls(key, this.AclMap.get(value) as SharingPermissions, d, true);
                            }
                        });
                    }

                    if (effectiveAcl === AclAddonly) {
                        added.map(doc => {
                            doc.context = this.props.Document;
                            if (annotationKey ?? this._annotationKey) Doc.GetProto(doc).annotationOn = this.props.Document;
                            this.props.layerProvider?.(doc, true);
                            Doc.AddDocToList(targetDataDoc, annotationKey ?? this.annotationKey, doc);
                        });
                    }
                    else {
                        added.filter(doc => [AclAdmin, AclEdit].includes(GetEffectiveAcl(doc))).map(doc => {  // only make a pushpin if we have acl's to edit the document
                            this.props.layerProvider?.(doc, true);
                            //DocUtils.LeavePushpin(doc);
                            doc._stayInCollection = undefined;
                            doc.context = this.props.Document;
                            if (annotationKey ?? this._annotationKey) Doc.GetProto(doc).annotationOn = this.props.Document;
                        });
                        const annoDocs = targetDataDoc[annotationKey ?? this.annotationKey] as List<Doc>;
                        if (annoDocs) annoDocs.push(...added);
                        else targetDataDoc[annotationKey ?? this.annotationKey] = new List<Doc>(added);
                        targetDataDoc[(annotationKey ?? this.annotationKey) + "-lastModified"] = new DateField(new Date(Date.now()));
                    }
                }
            }
            return true;
        }

        whenChildContentsActiveChanged = action((isActive: boolean) => this.props.whenChildContentsActiveChanged(this._isAnyChildContentActive = isActive));
        isContentActive = (outsideReaction?: boolean) => (CurrentUserUtils.SelectedTool !== InkTool.None ||
            (this.props.isContentActive?.() || this.props.Document.forceActive ||
                this.props.isSelected(outsideReaction) || this._isAnyChildContentActive ||
                this.props.rootSelected(outsideReaction)) ? true : false)
    }
    return Component;
}