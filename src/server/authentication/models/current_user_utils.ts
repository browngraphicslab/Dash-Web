import { action, computed, observable, runInAction } from "mobx";
import * as rp from 'request-promise';
import { DocServer } from "../../../client/DocServer";
import { Docs } from "../../../client/documents/Documents";
import { Gateway, NorthstarSettings } from "../../../client/northstar/manager/Gateway";
import { Attribute, AttributeGroup, Catalog, Schema } from "../../../client/northstar/model/idea/idea";
import { ArrayUtil } from "../../../client/northstar/utils/ArrayUtil";
import { CollectionViewType } from "../../../client/views/collections/CollectionBaseView";
import { CollectionView } from "../../../client/views/collections/CollectionView";
import { Doc } from "../../../new_fields/Doc";
import { List } from "../../../new_fields/List";
import { listSpec } from "../../../new_fields/Schema";
import { Cast } from "../../../new_fields/Types";
import { RouteStore } from "../../RouteStore";

export class CurrentUserUtils {
    private static curr_email: string;
    private static curr_id: string;
    @observable private static user_document: Doc;
    //TODO tfs: these should be temporary...
    private static mainDocId: string | undefined;

    public static get email() { return this.curr_email; }
    public static get id() { return this.curr_id; }
    @computed public static get UserDocument() { return this.user_document; }
    public static get MainDocId() { return this.mainDocId; }
    public static set MainDocId(id: string | undefined) { this.mainDocId = id; }

    private static createUserDocument(id: string): Doc {
        let doc = new Doc(id, true);
        doc.viewType = CollectionViewType.Tree;
        doc.dropAction = "alias";
        doc.layout = CollectionView.LayoutString();
        doc.title = this.email;
        doc.data = new List<Doc>();
        doc.excludeFromLibrary = true;
        doc.optionalRightCollection = Docs.StackingDocument([], { title: "New mobile uploads" });
        // doc.library = Docs.TreeDocument([doc], { title: `Library: ${CurrentUserUtils.email}` });
        // (doc.library as Doc).excludeFromLibrary = true;
        return doc;
    }

    public static async loadCurrentUser(): Promise<any> {
        let userPromise = rp.get(DocServer.prepend(RouteStore.getCurrUser)).then(response => {
            if (response) {
                let obj = JSON.parse(response);
                CurrentUserUtils.curr_id = obj.id as string;
                CurrentUserUtils.curr_email = obj.email as string;
            } else {
                throw new Error("There should be a user! Why does Dash think there isn't one?");
            }
        });
        let userDocPromise = await rp.get(DocServer.prepend(RouteStore.getUserDocumentId)).then(id => {
            if (id) {
                return DocServer.GetRefField(id).then(field =>
                    runInAction(() => this.user_document = field instanceof Doc ? field : this.createUserDocument(id)));
            } else {
                throw new Error("There should be a user id! Why does Dash think there isn't one?");
            }
        });
        try {
            const getEnvironment = await fetch("/assets/env.json", { redirect: "follow", method: "GET", credentials: "include" });
            NorthstarSettings.Instance.UpdateEnvironment(await getEnvironment.json());
            await Gateway.Instance.ClearCatalog();
            const extraSchemas = Cast(CurrentUserUtils.UserDocument.DBSchemas, listSpec("string"), []);
            let extras = await Promise.all(extraSchemas.map(sc => Gateway.Instance.GetSchema("", sc)));
            let catprom = CurrentUserUtils.SetNorthstarCatalog(await Gateway.Instance.GetCatalog(), extras);
            // if (catprom) await Promise.all(catprom);
        } catch (e) {

        }
        return Promise.all([userPromise, userDocPromise]);
    }

    /* Northstar catalog ... really just for testing so this should eventually go away */
    // --------------- Northstar hooks ------------- /
    static _northstarSchemas: Doc[] = [];
    @observable private static _northstarCatalog?: Catalog;
    @computed public static get NorthstarDBCatalog() { return this._northstarCatalog; }

    @action static SetNorthstarCatalog(ctlog: Catalog, extras: Catalog[]) {
        CurrentUserUtils.NorthstarDBCatalog = ctlog;
        // if (ctlog && ctlog.schemas) {
        //     extras.map(ex => ctlog.schemas!.push(ex));
        //     return ctlog.schemas.map(async schema => {
        //         let schemaDocuments: Doc[] = [];
        //         let attributesToBecomeDocs = CurrentUserUtils.GetAllNorthstarColumnAttributes(schema);
        //         await Promise.all(attributesToBecomeDocs.reduce((promises, attr) => {
        //             promises.push(DocServer.GetRefField(attr.displayName! + ".alias").then(action((field: Opt<Field>) => {
        //                 if (field instanceof Doc) {
        //                     schemaDocuments.push(field);
        //                 } else {
        //                     var atmod = new ColumnAttributeModel(attr);
        //                     let histoOp = new HistogramOperation(schema.displayName!,
        //                         new AttributeTransformationModel(atmod, AggregateFunction.None),
        //                         new AttributeTransformationModel(atmod, AggregateFunction.Count),
        //                         new AttributeTransformationModel(atmod, AggregateFunction.Count));
        //                     schemaDocuments.push(Docs.HistogramDocument(histoOp, { width: 200, height: 200, title: attr.displayName! }));
        //                 }
        //             })));
        //             return promises;
        //         }, [] as Promise<void>[]));
        //         return CurrentUserUtils._northstarSchemas.push(Docs.TreeDocument(schemaDocuments, { width: 50, height: 100, title: schema.displayName! }));
        //     });
        // }
    }
    public static set NorthstarDBCatalog(ctlog: Catalog | undefined) { this._northstarCatalog = ctlog; }

    public static AddNorthstarSchema(schema: Schema, schemaDoc: Doc) {
        if (this._northstarCatalog && CurrentUserUtils._northstarSchemas) {
            this._northstarCatalog.schemas!.push(schema);
            CurrentUserUtils._northstarSchemas.push(schemaDoc);
            let schemas = Cast(CurrentUserUtils.UserDocument.DBSchemas, listSpec("string"), []);
            schemas.push(schema.displayName!);
            CurrentUserUtils.UserDocument.DBSchemas = new List<string>(schemas);
        }
    }
    public static GetNorthstarSchema(name: string): Schema | undefined {
        return !this._northstarCatalog || !this._northstarCatalog.schemas ? undefined :
            ArrayUtil.FirstOrDefault<Schema>(this._northstarCatalog.schemas, (s: Schema) => s.displayName === name);
    }
    public static GetAllNorthstarColumnAttributes(schema: Schema) {
        const recurs = (attrs: Attribute[], g?: AttributeGroup) => {
            if (g && g.attributes) {
                attrs.push.apply(attrs, g.attributes);
                if (g.attributeGroups) {
                    g.attributeGroups.forEach(ng => recurs(attrs, ng));
                }
            }
            return attrs;
        };
        return recurs([] as Attribute[], schema ? schema.rootAttributeGroup : undefined);
    }
}