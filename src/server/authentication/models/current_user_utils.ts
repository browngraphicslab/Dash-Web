import { action, computed, observable, runInAction } from "mobx";
import * as rp from 'request-promise';
import { DocServer } from "../../../client/DocServer";
import { Docs } from "../../../client/documents/Documents";
import { Attribute, AttributeGroup, Catalog, Schema } from "../../../client/northstar/model/idea/idea";
import { ArrayUtil } from "../../../client/northstar/utils/ArrayUtil";
import { CollectionViewType } from "../../../client/views/collections/CollectionBaseView";
import { CollectionView } from "../../../client/views/collections/CollectionView";
import { Doc, DocListCast } from "../../../new_fields/Doc";
import { List } from "../../../new_fields/List";
import { listSpec } from "../../../new_fields/Schema";
import { Cast, StrCast, PromiseValue } from "../../../new_fields/Types";
import { Utils } from "../../../Utils";
import { RouteStore } from "../../RouteStore";
import { ScriptField } from "../../../new_fields/ScriptField";

export class CurrentUserUtils {
    private static curr_id: string;
    //TODO tfs: these should be temporary...
    private static mainDocId: string | undefined;

    public static get id() { return this.curr_id; }
    @computed public static get UserDocument() { return Doc.UserDoc(); }
    public static get MainDocId() { return this.mainDocId; }
    public static set MainDocId(id: string | undefined) { this.mainDocId = id; }

    @observable public static GuestTarget: Doc | undefined;
    @observable public static GuestWorkspace: Doc | undefined;

    private static createUserDocument(id: string): Doc {
        let doc = new Doc(id, true);
        doc.viewType = CollectionViewType.Tree;
        doc.dropAction = "alias";
        doc.layout = CollectionView.LayoutString();
        doc.title = Doc.CurrentUserEmail;
        this.updateUserDocument(doc);
        doc.data = new List<Doc>();
        doc.gridGap = 5;
        doc.xMargin = 5;
        doc.yMargin = 5;
        doc.boxShadow = "0 0";
        doc.optionalRightCollection = Docs.Create.StackingDocument([], { title: "New mobile uploads" });
        return doc;
    }

    static updateUserDocument(doc: Doc) {

        // setup workspaces library item
        if (doc.workspaces === undefined) {
            const workspaces = Docs.Create.TreeDocument([], { title: "WORKSPACES", height: 100 });
            workspaces.boxShadow = "0 0";
            doc.workspaces = workspaces;
        }
        PromiseValue(Cast(doc.workspaces, Doc)).then(workspaces => {
            if (workspaces) {
                workspaces.backgroundColor = "#eeeeee";
                workspaces.preventTreeViewOpen = true;
                workspaces.forceActive = true;
                workspaces.lockedPosition = true;
                if (StrCast(workspaces.title) === "Workspaces") {
                    workspaces.title = "WORKSPACES";
                }
            }
        });

        // setup notes list
        if (doc.noteTypes === undefined) {
            let notes = [Docs.Create.TextDocument({ title: "Note", backgroundColor: "yellow", isTemplate: true }),
            Docs.Create.TextDocument({ title: "Idea", backgroundColor: "pink", isTemplate: true }),
            Docs.Create.TextDocument({ title: "Topic", backgroundColor: "lightBlue", isTemplate: true }),
            Docs.Create.TextDocument({ title: "Person", backgroundColor: "lightGreen", isTemplate: true })];
            const noteTypes = Docs.Create.TreeDocument(notes, { title: "Note Types", height: 75 });
            doc.noteTypes = noteTypes;
        }
        PromiseValue(Cast(doc.noteTypes, Doc)).then(noteTypes => noteTypes && PromiseValue(noteTypes.data).then(DocListCast));

        // setup Recently Closed library item
        if (doc.recentlyClosed === undefined) {
            const recentlyClosed = Docs.Create.TreeDocument([], { title: "Recently Closed".toUpperCase(), height: 75 });
            recentlyClosed.boxShadow = "0 0";
            doc.recentlyClosed = recentlyClosed;
        }
        PromiseValue(Cast(doc.recentlyClosed, Doc)).then(recent => {
            if (recent) {
                recent.backgroundColor = "#eeeeee";
                recent.preventTreeViewOpen = true;
                recent.forceActive = true;
                recent.lockedPosition = true;
                if (StrCast(recent.title) === "Recently Closed") {
                    recent.title = "RECENTLY CLOSED";
                }
            }
        });


        if (doc.curPresentation === undefined) {
            const curPresentation = Docs.Create.PresDocument(new List<Doc>(), { title: "Presentation" });
            curPresentation.boxShadow = "0 0";
            doc.curPresentation = curPresentation;
        }

        if (doc.Library === undefined) {
            let Search = Docs.Create.ButtonDocument({ width: 50, height: 35, title: "Search" });
            let Library = Docs.Create.ButtonDocument({ width: 50, height: 35, title: "Library" });
            let Create = Docs.Create.ButtonDocument({ width: 35, height: 35, title: "Create" });
            if (doc.sidebarContainer === undefined) {
                doc.sidebarContainer = new Doc();
                (doc.sidebarContainer as Doc).chromeStatus = "disabled";
            }

            const library = Docs.Create.TreeDocument([doc.workspaces as Doc, doc, doc.recentlyClosed as Doc], { title: "Library" });
            library.forceActive = true;
            library.lockedPosition = true;
            library.gridGap = 5;
            library.xMargin = 5;
            library.yMargin = 5;
            library.boxShadow = "1 1 3";
            library.workspaceLibrary = true; // flag that this is the document that shows the Notifications button when documents are shared
            Library.targetContainer = doc.sidebarContainer;
            Library.library = library;
            Library.onClick = ScriptField.MakeScript("this.targetContainer.proto = this.library");

            const searchBox = Docs.Create.QueryDocument({ title: "Searching" });
            searchBox.boxShadow = "0 0";
            searchBox.ignoreClick = true;
            Search.searchBox = searchBox;
            Search.targetContainer = doc.sidebarContainer;
            Search.onClick = ScriptField.MakeScript("this.targetContainer.proto = this.searchBox");

            let createCollection = Docs.Create.DragboxDocument({ width: 35, height: 35, title: "Collection", icon: "folder" });
            let createWebPage = Docs.Create.DragboxDocument({ width: 35, height: 35, title: "Web Page", icon: "globe-asia" });
            createWebPage.onDragStart = ScriptField.MakeFunction('Docs.Create.WebDocument("https://en.wikipedia.org/wiki/Hedgehog", { width: 300, height: 300, title: "New Webpage" })');
            let createCatImage = Docs.Create.DragboxDocument({ width: 35, height: 35, title: "Image", icon: "cat" });
            createCatImage.onDragStart = ScriptField.MakeFunction('Docs.Create.ImageDocument(imgurl, { width: 200, title: "an image of a cat" })');
            let createButton = Docs.Create.DragboxDocument({ width: 35, height: 35, title: "Button", icon: "bolt" });
            createButton.onDragStart = ScriptField.MakeFunction('Docs.Create.ButtonDocument({ width: 150, height: 50, title: "Button" })');
            let createPresentation = Docs.Create.DragboxDocument({ width: 35, height: 35, title: "Presentation", icon: "tv" });
            createPresentation.onDragStart = ScriptField.MakeFunction('Doc.UserDoc().curPresentation = Docs.Create.PresDocument(new List<Doc>(), { width: 200, height: 500, title: "a presentation trail" })');
            let createFolderImport = Docs.Create.DragboxDocument({ width: 35, height: 35, title: "Import Folder", icon: "cloud-upload-alt" });
            createFolderImport.onDragStart = ScriptField.MakeFunction('Docs.Create.DirectoryImportDocument({ title: "Directory Import", width: 400, height: 400 })');
            const creators = Docs.Create.MasonryDocument([createCollection, createWebPage, createCatImage, createButton, createPresentation, createFolderImport], { width: 500, height: 50, columnWidth: 35, chromeStatus: "disabled", title: "buttons" });
            Create.targetContainer = doc.sidebarContainer;
            Create.creators = creators;
            Create.onClick = ScriptField.MakeScript("this.targetContainer.proto = this.creators");

            const buttons = Docs.Create.StackingDocument([Search, Library, Create], { width: 500, height: 80, chromeStatus: "disabled", title: "buttons" });
            buttons.sectionFilter = "title";
            buttons.boxShadow = "0 0";
            buttons.ignoreClick = true;
            buttons.hideHeadings = true;
            doc.libraryButtons = buttons;

            doc.Library = Library;
            doc.Create = Create;
            doc.Search = Search;
            (Library.onClick as ScriptField).script.run({ this: Library });
            //(doc.sidebarContainer as Doc).proto = library;
        }
        PromiseValue(Cast(doc.libraryButtons, Doc)).then(libraryButtons => {
            if (libraryButtons) {
                libraryButtons.backgroundColor = "lightgrey";
            }
        });

        PromiseValue(Cast(doc.sidebar, Doc)).then(sidebar => {
            if (sidebar) {
                sidebar.backgroundColor = "lightgrey";
            }
        });

        if (doc.overlays === undefined) {
            const overlays = Docs.Create.FreeformDocument([], { title: "Overlays" });
            Doc.GetProto(overlays).backgroundColor = "#aca3a6";
            doc.overlays = overlays;
        }

        if (doc.linkFollowBox === undefined) {
            PromiseValue(Cast(doc.overlays, Doc)).then(overlays => overlays && Doc.AddDocToList(overlays, "data", doc.linkFollowBox = Docs.Create.LinkFollowBoxDocument({ x: 250, y: 20, width: 500, height: 370, title: "Link Follower" })));
        }

        StrCast(doc.title).indexOf("@") !== -1 && (doc.title = (StrCast(doc.title).split("@")[0] + "'s Library").toUpperCase());
        StrCast(doc.title).indexOf("'s Library") !== -1 && (doc.title = StrCast(doc.title).toUpperCase());
        doc.backgroundColor = "#eeeeee";
        doc.width = 100;
        doc.preventTreeViewOpen = true;
        doc.forceActive = true;
        doc.lockedPosition = true;
    }

    public static loadCurrentUser() {
        return rp.get(Utils.prepend(RouteStore.getCurrUser)).then(response => {
            if (response) {
                const result: { id: string, email: string } = JSON.parse(response);
                return result;
            } else {
                throw new Error("There should be a user! Why does Dash think there isn't one?");
            }
        });
    }

    public static async loadUserDocument({ id, email }: { id: string, email: string }) {
        this.curr_id = id;
        Doc.CurrentUserEmail = email;
        await rp.get(Utils.prepend(RouteStore.getUserDocumentId)).then(id => {
            if (id && id !== "guest") {
                return DocServer.GetRefField(id).then(async field => {
                    if (field instanceof Doc) {
                        await this.updateUserDocument(field);
                        runInAction(() => Doc.SetUserDoc(field));
                    } else {
                        runInAction(() => Doc.SetUserDoc(this.createUserDocument(id)));
                    }
                });
            } else {
                throw new Error("There should be a user id! Why does Dash think there isn't one?");
            }
        });
        // try {
        //     const getEnvironment = await fetch("/assets/env.json", { redirect: "follow", method: "GET", credentials: "include" });
        //     NorthstarSettings.Instance.UpdateEnvironment(await getEnvironment.json());
        //     await Gateway.Instance.ClearCatalog();
        //     const extraSchemas = Cast(CurrentUserUtils.UserDocument.DBSchemas, listSpec("string"), []);
        //     let extras = await Promise.all(extraSchemas.map(sc => Gateway.Instance.GetSchema("", sc)));
        //     let catprom = CurrentUserUtils.SetNorthstarCatalog(await Gateway.Instance.GetCatalog(), extras);
        //     // if (catprom) await Promise.all(catprom);
        // } catch (e) {

        // }
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
        //                     schemaDocuments.push(Docs.Create.HistogramDocument(histoOp, { width: 200, height: 200, title: attr.displayName! }));
        //                 }
        //             })));
        //             return promises;
        //         }, [] as Promise<void>[]));
        //         return CurrentUserUtils._northstarSchemas.push(Docs.Create.TreeDocument(schemaDocuments, { width: 50, height: 100, title: schema.displayName! }));
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