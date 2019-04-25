import { computed, observable, action, runInAction } from "mobx";
import * as rp from 'request-promise';
import { Docs } from "../../../client/documents/Documents";
import { Attribute, AttributeGroup, Catalog, Schema } from "../../../client/northstar/model/idea/idea";
import { ArrayUtil } from "../../../client/northstar/utils/ArrayUtil";
import { RouteStore } from "../../RouteStore";
import { DocServer } from "../../../client/DocServer";
import { Doc } from "../../../new_fields/Doc";
import { List } from "../../../new_fields/List";

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
        doc.workspaces = new List<Doc>();
        doc.optionalRightCollection = Docs.SchemaDocument([], { title: "Pending documents" });
        return doc;
    }

    public static loadCurrentUser(): Promise<any> {
        let userPromise = rp.get(DocServer.prepend(RouteStore.getCurrUser)).then(response => {
            if (response) {
                let obj = JSON.parse(response);
                CurrentUserUtils.curr_id = obj.id as string;
                CurrentUserUtils.curr_email = obj.email as string;
            } else {
                throw new Error("There should be a user! Why does Dash think there isn't one?");
            }
        });
        let userDocPromise = rp.get(DocServer.prepend(RouteStore.getUserDocumentId)).then(id => {
            if (id) {
                return DocServer.GetRefField(id).then(field =>
                    runInAction(() => this.user_document = field instanceof Doc ? field : this.createUserDocument(id)));
            } else {
                throw new Error("There should be a user id! Why does Dash think there isn't one?");
            }
        });
        return Promise.all([userPromise, userDocPromise]);
    }

    /* Northstar catalog ... really just for testing so this should eventually go away */
    @observable private static _northstarCatalog?: Catalog;
    @computed public static get NorthstarDBCatalog() { return this._northstarCatalog; }
    public static set NorthstarDBCatalog(ctlog: Catalog | undefined) { this._northstarCatalog = ctlog; }

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