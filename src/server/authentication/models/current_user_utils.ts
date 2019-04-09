import { DashUserModel } from "./user_model";
import * as rp from 'request-promise';
import { RouteStore } from "../../RouteStore";
import { ServerUtils } from "../../ServerUtil";
import { Server } from "../../../client/Server";
import { Document } from "../../../fields/Document";
import { KeyStore } from "../../../fields/KeyStore";
import { ListField } from "../../../fields/ListField";
import { Documents } from "../../../client/documents/Documents";
import { Schema, Attribute, AttributeGroup, Catalog } from "../../../client/northstar/model/idea/idea";
import { observable, computed, action } from "mobx";
import { ArrayUtil } from "../../../client/northstar/utils/ArrayUtil";

export class CurrentUserUtils {
    private static curr_email: string;
    private static curr_id: string;
    private static user_document: Document;
    //TODO tfs: these should be temporary...
    private static mainDocId: string | undefined;
    @observable private static catalog?: Catalog;

    public static get email(): string {
        return this.curr_email;
    }

    public static get id(): string {
        return this.curr_id;
    }

    public static get UserDocument(): Document {
        return this.user_document;
    }

    public static get MainDocId(): string | undefined {
        return this.mainDocId;
    }

    public static set MainDocId(id: string | undefined) {
        this.mainDocId = id;
    }

    @computed public static get NorthstarDBCatalog(): Catalog | undefined {
        return this.catalog;
    }
    public static set NorthstarDBCatalog(ctlog: Catalog | undefined) {
        this.catalog = ctlog;
    }
    public static GetNorthstarSchema(name: string): Schema | undefined {
        return !this.catalog || !this.catalog.schemas ? undefined :
            ArrayUtil.FirstOrDefault<Schema>(this.catalog.schemas, (s: Schema) => s.displayName === name);
    }
    public static GetAllNorthstarColumnAttributes(schema: Schema) {
        if (!schema || !schema.rootAttributeGroup) {
            return [];
        }
        const recurs = (attrs: Attribute[], g: AttributeGroup) => {
            if (g.attributes) {
                attrs.push.apply(attrs, g.attributes);
                if (g.attributeGroups) {
                    g.attributeGroups.forEach(ng => recurs(attrs, ng));
                }
            }
        };
        const allAttributes: Attribute[] = new Array<Attribute>();
        recurs(allAttributes, schema.rootAttributeGroup);
        return allAttributes;
    }

    private static createUserDocument(id: string): Document {
        let doc = new Document(id);

        doc.Set(KeyStore.Workspaces, new ListField<Document>());
        doc.Set(KeyStore.OptionalRightCollection, Documents.SchemaDocument([], { title: "Pending documents" }));
        return doc;
    }

    public static loadCurrentUser(): Promise<any> {
        let userPromise = rp.get(ServerUtils.prepend(RouteStore.getCurrUser)).then((response) => {
            if (response) {
                let obj = JSON.parse(response);
                CurrentUserUtils.curr_id = obj.id as string;
                CurrentUserUtils.curr_email = obj.email as string;
            } else {
                throw new Error("There should be a user! Why does Dash think there isn't one?");
            }
        });
        let userDocPromise = rp.get(ServerUtils.prepend(RouteStore.getUserDocumentId)).then(id => {
            if (id) {
                return Server.GetField(id).then(field => {
                    if (field instanceof Document) {
                        this.user_document = field;
                    } else {
                        this.user_document = this.createUserDocument(id);
                    }
                });
            } else {
                throw new Error("There should be a user id! Why does Dash think there isn't one?");
            }
        });
        return Promise.all([userPromise, userDocPromise]);
    }
}