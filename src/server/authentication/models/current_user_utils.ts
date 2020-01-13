import { action, computed, observable, reaction } from "mobx";
import * as rp from 'request-promise';
import { DocServer } from "../../../client/DocServer";
import { Docs } from "../../../client/documents/Documents";
import { Attribute, AttributeGroup, Catalog, Schema } from "../../../client/northstar/model/idea/idea";
import { ArrayUtil } from "../../../client/northstar/utils/ArrayUtil";
import { UndoManager } from "../../../client/util/UndoManager";
import { Doc, DocListCast } from "../../../new_fields/Doc";
import { List } from "../../../new_fields/List";
import { listSpec } from "../../../new_fields/Schema";
import { ScriptField, ComputedField } from "../../../new_fields/ScriptField";
import { Cast, PromiseValue, StrCast } from "../../../new_fields/Types";
import { Utils } from "../../../Utils";
import { nullAudio } from "../../../new_fields/URLField";
import { DragManager } from "../../../client/util/DragManager";
import { InkingControl } from "../../../client/views/InkingControl";

export class CurrentUserUtils {
    private static curr_id: string;
    //TODO tfs: these should be temporary...
    private static mainDocId: string | undefined;

    public static get id() { return this.curr_id; }
    public static get MainDocId() { return this.mainDocId; }
    public static set MainDocId(id: string | undefined) { this.mainDocId = id; }
    @computed public static get UserDocument() { return Doc.UserDoc(); }
    @computed public static get ActivePen() { return Doc.UserDoc().activePen instanceof Doc && (Doc.UserDoc().activePen as Doc).pen as Doc; }

    @observable public static GuestTarget: Doc | undefined;
    @observable public static GuestWorkspace: Doc | undefined;
    @observable public static GuestMobile: Doc | undefined;

    // a default set of note types .. not being used yet...
    static setupNoteTypes(doc: Doc) {
        return [
            Docs.Create.TextDocument({ title: "Note", backgroundColor: "yellow", isTemplateDoc: true }),
            Docs.Create.TextDocument({ title: "Idea", backgroundColor: "pink", isTemplateDoc: true }),
            Docs.Create.TextDocument({ title: "Topic", backgroundColor: "lightBlue", isTemplateDoc: true }),
            Docs.Create.TextDocument({ title: "Person", backgroundColor: "lightGreen", isTemplateDoc: true }),
            Docs.Create.TextDocument({ title: "Todo", backgroundColor: "orange", isTemplateDoc: true })
        ];
    }

    // setup the "creator" buttons for the sidebar-- eg. the default set of draggable document creation tools
    static setupCreatorButtons(doc: Doc, buttons?: string[]) {
        const notes = CurrentUserUtils.setupNoteTypes(doc);
        doc.noteTypes = Docs.Create.TreeDocument(notes, { title: "Note Types", height: 75 });
        doc.activePen = doc;
        const docProtoData: { title: string, icon: string, drag?: string, ignoreClick?: boolean, click?: string, ischecked?: string, activePen?: Doc, backgroundColor?: string, dragFactory?: Doc }[] = [
            { title: "collection", icon: "folder", ignoreClick: true, drag: 'Docs.Create.FreeformDocument([], { nativeWidth: undefined, nativeHeight: undefined, width: 150, height: 100, title: "freeform" })' },
            { title: "preview", icon: "expand", ignoreClick: true, drag: 'Docs.Create.DocumentDocument(ComputedField.MakeFunction("selectedDocs(this,true,[_last_])?.[0]"), { width: 250, height: 250, title: "container" })' },
            { title: "todo item", icon: "check", ignoreClick: true, drag: 'getCopy(this.dragFactory, true)', dragFactory: notes[notes.length - 1] },
            { title: "web page", icon: "globe-asia", ignoreClick: true, drag: 'Docs.Create.WebDocument("https://en.wikipedia.org/wiki/Hedgehog", { width: 300, height: 300, title: "New Webpage" })' },
            { title: "cat image", icon: "cat", ignoreClick: true, drag: 'Docs.Create.ImageDocument("https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Cat03.jpg/1200px-Cat03.jpg", { width: 200, title: "an image of a cat" })' },
            { title: "record", icon: "microphone", ignoreClick: true, drag: `Docs.Create.AudioDocument("${nullAudio}", { width: 200, title: "ready to record audio" })` },
            { title: "clickable button", icon: "bolt", ignoreClick: true, drag: 'Docs.Create.ButtonDocument({ width: 150, height: 50, title: "Button" })' },
            { title: "presentation", icon: "tv", ignoreClick: true, drag: 'Doc.UserDoc().curPresentation = Docs.Create.PresDocument(new List<Doc>(), { width: 200, height: 500, title: "a presentation trail" })' },
            { title: "import folder", icon: "cloud-upload-alt", ignoreClick: true, drag: 'Docs.Create.DirectoryImportDocument({ title: "Directory Import", width: 400, height: 400 })' },
            { title: "mobile view", icon: "phone", ignoreClick: true, drag: 'Doc.UserDoc().activeMobile' },
            { title: "use pen", icon: "pen-nib", click: 'activatePen(this.activePen.pen = sameDocs(this.activePen.pen, this) ? undefined : this,2, this.backgroundColor)', backgroundColor: "blue", ischecked: `sameDocs(this.activePen.pen,  this)`, activePen: doc },
            { title: "use highlighter", icon: "highlighter", click: 'activateBrush(this.activePen.pen = sameDocs(this.activePen.pen, this) ? undefined : this,20,this.backgroundColor)', backgroundColor: "yellow", ischecked: `sameDocs(this.activePen.pen, this)`, activePen: doc },
            { title: "use stamp", icon: "stamp", click: 'activateStamp(this.activePen.pen = sameDocs(this.activePen.pen, this) ? undefined : this)', backgroundColor: "orange", ischecked: `sameDocs(this.activePen.pen, this)`, activePen: doc },
            { title: "use eraser", icon: "eraser", click: 'activateEraser(this.activePen.pen = sameDocs(this.activePen.pen, this) ? undefined : this);', ischecked: `sameDocs(this.activePen.pen, this)`, backgroundColor: "pink", activePen: doc },
            { title: "use scrubber", icon: "eraser", click: 'activateScrubber(this.activePen.pen = sameDocs(this.activePen.pen, this) ? undefined : this);', ischecked: `sameDocs(this.activePen.pen, this)`, backgroundColor: "green", activePen: doc },
            { title: "use drag", icon: "mouse-pointer", click: 'deactivateInk();this.activePen.pen = this;', ischecked: `sameDocs(this.activePen.pen, this)`, backgroundColor: "white", activePen: doc },
        ];
        return docProtoData.filter(d => !buttons || !buttons.includes(d.title)).map(data => Docs.Create.FontIconDocument({
            nativeWidth: 100, nativeHeight: 100, width: 100, height: 100, dropAction: data.click ? "copy" : undefined, title: data.title, icon: data.icon, ignoreClick: data.ignoreClick,
            onDragStart: data.drag ? ScriptField.MakeFunction(data.drag) : undefined, onClick: data.click ? ScriptField.MakeScript(data.click) : undefined,
            ischecked: data.ischecked ? ComputedField.MakeFunction(data.ischecked) : undefined, activePen: data.activePen,
            backgroundColor: data.backgroundColor, removeDropProperties: new List<string>(["dropAction"]), dragFactory: data.dragFactory,
        }));
    }

    static async updateCreatorButtons(doc: Doc) {
        const toolsBtn = await Cast(doc.ToolsBtn, Doc);
        if (toolsBtn) {
            const stackingDoc = await Cast(toolsBtn.sourcePanel, Doc);
            if (stackingDoc) {
                const stackdocs = await Cast(stackingDoc.data, listSpec(Doc));
                if (stackdocs) {
                    const dragset = await Cast(stackdocs[0], Doc);
                    if (dragset) {
                        const dragdocs = await Cast(dragset.data, listSpec(Doc));
                        if (dragdocs) {
                            const dragDocs = await Promise.all(dragdocs);
                            const newButtons = this.setupCreatorButtons(doc, dragDocs.map(d => StrCast(d.title)));
                            newButtons.map(nb => Doc.AddDocToList(dragset, "data", nb));
                        }
                    }
                }
            }
        }
    }

    static setupMobileButtons(doc: Doc, buttons?: string[]) {
        const docProtoData: { title: string, icon: string, drag?: string, ignoreClick?: boolean, click?: string, ischecked?: string, activePen?: Doc, backgroundColor?: string, dragFactory?: Doc }[] = [
            { title: "record", icon: "microphone", ignoreClick: true, click: "FILL" },
            { title: "use pen", icon: "pen-nib", click: 'activatePen(this.activePen.pen = sameDocs(this.activePen.pen, this) ? undefined : this,2, this.backgroundColor)', backgroundColor: "blue", ischecked: `sameDocs(this.activePen.pen,  this)`, activePen: doc },
            { title: "use highlighter", icon: "highlighter", click: 'activateBrush(this.activePen.pen = sameDocs(this.activePen.pen, this) ? undefined : this,20,this.backgroundColor)', backgroundColor: "yellow", ischecked: `sameDocs(this.activePen.pen, this)`, activePen: doc },
            { title: "use eraser", icon: "eraser", click: 'activateEraser(this.activePen.pen = sameDocs(this.activePen.pen, this) ? undefined : this);', ischecked: `sameDocs(this.activePen.pen, this)`, backgroundColor: "pink", activePen: doc },
            { title: "use scrubber", icon: "eraser", click: 'activateScrubber(this.activePen.pen = sameDocs(this.activePen.pen, this) ? undefined : this);', ischecked: `sameDocs(this.activePen.pen, this)`, backgroundColor: "green", activePen: doc },
            { title: "use drag", icon: "mouse-pointer", click: 'deactivateInk();this.activePen.pen = this;', ischecked: `sameDocs(this.activePen.pen, this)`, backgroundColor: "white", activePen: doc },
            { title: "draw", icon: "mouse-pointer", click: 'switchMobileView("ink");', ischecked: `sameDocs(this.activePen.pen, this)`, backgroundColor: "red", activePen: doc },
        ];
        return docProtoData.filter(d => !buttons || !buttons.includes(d.title)).map(data => Docs.Create.FontIconDocument({
            nativeWidth: 100, nativeHeight: 100, width: 100, height: 100, dropAction: data.click ? "copy" : undefined, title: data.title, icon: data.icon, ignoreClick: data.ignoreClick,
            onDragStart: data.drag ? ScriptField.MakeFunction(data.drag) : undefined, onClick: data.click ? ScriptField.MakeScript(data.click) : undefined,
            ischecked: data.ischecked ? ComputedField.MakeFunction(data.ischecked) : undefined, activePen: data.activePen,
            backgroundColor: data.backgroundColor, removeDropProperties: new List<string>(["dropAction"]), dragFactory: data.dragFactory,
        }));
    }

    static setupThumbButtons(doc: Doc) {
        const docProtoData: { title: string, icon: string, drag?: string, ignoreClick?: boolean, pointerDown?: string, pointerUp?: string, ischecked?: string, activePen?: Doc, backgroundColor?: string, dragFactory?: Doc }[] = [
            { title: "use pen", icon: "pen-nib", pointerUp: "resetPen()", pointerDown: 'setPen(2, this.backgroundColor)', backgroundColor: "blue", ischecked: `sameDocs(this.activePen.pen,  this)`, activePen: doc },
            { title: "use highlighter", icon: "highlighter", pointerUp: "resetPen()", pointerDown: 'setPen(20, this.backgroundColor)', backgroundColor: "yellow", ischecked: `sameDocs(this.activePen.pen, this)`, activePen: doc },
        ];
        return docProtoData.map(data => Docs.Create.FontIconDocument({
            nativeWidth: 100, nativeHeight: 100, width: 100, height: 100, dropAction: data.pointerDown ? "copy" : undefined, title: data.title, icon: data.icon, ignoreClick: data.ignoreClick,
            onDragStart: data.drag ? ScriptField.MakeFunction(data.drag) : undefined,
            onPointerUp: data.pointerUp ? ScriptField.MakeScript(data.pointerUp) : undefined, onPointerDown: data.pointerDown ? ScriptField.MakeScript(data.pointerDown) : undefined,
            ischecked: data.ischecked ? ComputedField.MakeFunction(data.ischecked) : undefined, activePen: data.activePen, pointerHack: true,
            backgroundColor: data.backgroundColor, removeDropProperties: new List<string>(["dropAction"]), dragFactory: data.dragFactory,
        }));
    }

    static setupThumbDoc(userDoc: Doc) {
        if (!userDoc.thumbDoc) {
            return Docs.Create.MasonryDocument(CurrentUserUtils.setupThumbButtons(userDoc), {
                width: 300, columnWidth: 100, ignoreClick: true, lockedPosition: true, chromeStatus: "disabled", title: "buttons", autoHeight: true, yMargin: 5
            });
        }
        return userDoc.thumbDoc;
    }

    static setupMobileDoc(userDoc: Doc) {
        return userDoc.activeMoble ?? Docs.Create.MasonryDocument(CurrentUserUtils.setupMobileButtons(userDoc), {
            columnWidth: 100, ignoreClick: true, lockedPosition: true, chromeStatus: "disabled", title: "buttons", autoHeight: true, yMargin: 5
        });
    }

    // setup the Creator button which will display the creator panel.  This panel will include the drag creators and the color picker.  when clicked, this panel will be displayed in the target container (ie, sidebarContainer)  
    static setupToolsPanel(sidebarContainer: Doc, doc: Doc) {
        // setup a masonry view of all he creators
        const dragCreators = Docs.Create.MasonryDocument(CurrentUserUtils.setupCreatorButtons(doc), {
            width: 500, autoHeight: true, columnWidth: 35, ignoreClick: true, lockedPosition: true, chromeStatus: "disabled", title: "buttons",
            dropConverter: ScriptField.MakeScript("convertToButtons(dragData)", { dragData: DragManager.DocumentDragData.name }), yMargin: 5
        });
        // setup a color picker
        const color = Docs.Create.ColorDocument({
            title: "color picker", width: 400, dropAction: "alias", forceActive: true, removeDropProperties: new List<string>(["dropAction", "forceActive"])
        });

        return Docs.Create.ButtonDocument({
            width: 35, height: 35, backgroundColor: "#222222", color: "lightgrey", title: "Tools", fontSize: 10, targetContainer: sidebarContainer,
            sourcePanel: Docs.Create.StackingDocument([dragCreators, color], {
                width: 500, height: 800, lockedPosition: true, chromeStatus: "disabled", title: "tools stack"
            }),
            onClick: ScriptField.MakeScript("this.targetContainer.proto = this.sourcePanel"),
        });
    }

    // setup the Library button which will display the library panel.  This panel includes a collection of workspaces, documents, and recently closed views
    static setupLibraryPanel(sidebarContainer: Doc, doc: Doc) {
        // setup workspaces library item
        doc.workspaces = Docs.Create.TreeDocument([], {
            title: "WORKSPACES", height: 100, forceActive: true, boxShadow: "0 0", lockedPosition: true, backgroundColor: "#eeeeee"
        });

        doc.documents = Docs.Create.TreeDocument([], {
            title: "DOCUMENTS", height: 42, forceActive: true, boxShadow: "0 0", preventTreeViewOpen: true, lockedPosition: true, backgroundColor: "#eeeeee"
        });

        // setup Recently Closed library item
        doc.recentlyClosed = Docs.Create.TreeDocument([], {
            title: "RECENTLY CLOSED", height: 75, forceActive: true, boxShadow: "0 0", preventTreeViewOpen: true, lockedPosition: true, backgroundColor: "#eeeeee"
        });

        return Docs.Create.ButtonDocument({
            width: 50, height: 35, backgroundColor: "#222222", color: "lightgrey", title: "Library", fontSize: 10,
            sourcePanel: Docs.Create.TreeDocument([doc.workspaces as Doc, doc.documents as Doc, doc.recentlyClosed as Doc], {
                title: "Library", xMargin: 5, yMargin: 5, gridGap: 5, forceActive: true, dropAction: "alias", lockedPosition: true
            }),
            targetContainer: sidebarContainer,
            onClick: ScriptField.MakeScript("this.targetContainer.proto = this.sourcePanel;")
        });
    }

    // setup the Search button which will display the search panel.  
    static setupSearchPanel(sidebarContainer: Doc) {
        return Docs.Create.ButtonDocument({
            width: 50, height: 35, backgroundColor: "#222222", color: "lightgrey", title: "Search", fontSize: 10,
            sourcePanel: Docs.Create.QueryDocument({
                title: "search stack", ignoreClick: true
            }),
            targetContainer: sidebarContainer,
            lockedPosition: true,
            onClick: ScriptField.MakeScript("this.targetContainer.proto = this.sourcePanel")
        });
    }

    // setup the list of sidebar mode buttons which determine what is displayed in the sidebar
    static setupSidebarButtons(doc: Doc) {
        doc.sidebarContainer = new Doc();
        (doc.sidebarContainer as Doc).chromeStatus = "disabled";
        (doc.sidebarContainer as Doc).onClick = ScriptField.MakeScript("freezeSidebar()");

        doc.ToolsBtn = this.setupToolsPanel(doc.sidebarContainer as Doc, doc);
        doc.LibraryBtn = this.setupLibraryPanel(doc.sidebarContainer as Doc, doc);
        doc.SearchBtn = this.setupSearchPanel(doc.sidebarContainer as Doc);

        // Finally, setup the list of buttons to display in the sidebar
        doc.sidebarButtons = Docs.Create.StackingDocument([doc.SearchBtn as Doc, doc.LibraryBtn as Doc, doc.ToolsBtn as Doc], {
            width: 500, height: 80, boxShadow: "0 0", sectionFilter: "title", hideHeadings: true, ignoreClick: true,
            backgroundColor: "lightgrey", chromeStatus: "disabled", title: "library stack"
        });
    }

    /// sets up the default list of buttons to be shown in the expanding button menu at the bottom of the Dash window
    static setupExpandingButtons(doc: Doc) {
        doc.undoBtn = Docs.Create.FontIconDocument(
            { nativeWidth: 100, nativeHeight: 100, width: 100, height: 100, dropAction: "alias", onClick: ScriptField.MakeScript("undo()"), removeDropProperties: new List<string>(["dropAction"]), title: "undo button", icon: "undo-alt" });
        doc.redoBtn = Docs.Create.FontIconDocument(
            { nativeWidth: 100, nativeHeight: 100, width: 100, height: 100, dropAction: "alias", onClick: ScriptField.MakeScript("redo()"), removeDropProperties: new List<string>(["dropAction"]), title: "redo button", icon: "redo-alt" });

        doc.expandingButtons = Docs.Create.LinearDocument([doc.undoBtn as Doc, doc.redoBtn as Doc], {
            title: "expanding buttons", gridGap: 5, xMargin: 5, yMargin: 5, height: 42, width: 100, boxShadow: "0 0",
            backgroundColor: "black", preventTreeViewOpen: true, forceActive: true, lockedPosition: true,
            dropConverter: ScriptField.MakeScript("convertToButtons(dragData)", { dragData: DragManager.DocumentDragData.name })
        });
    }

    // sets up the default set of documents to be shown in the Overlay layer
    static setupOverlays(doc: Doc) {
        doc.overlays = Docs.Create.FreeformDocument([], { title: "Overlays", backgroundColor: "#aca3a6" });
        doc.linkFollowBox = Docs.Create.LinkFollowBoxDocument({ x: 250, y: 20, width: 500, height: 370, title: "Link Follower" });
        Doc.AddDocToList(doc.overlays as Doc, "data", doc.linkFollowBox as Doc);
    }

    // the initial presentation Doc to use
    static setupDefaultPresentation(doc: Doc) {
        doc.curPresentation = Docs.Create.PresDocument(new List<Doc>(), { title: "Presentation", boxShadow: "0 0" });
    }

    static setupMobileUploads(doc: Doc) {
        doc.optionalRightCollection = Docs.Create.StackingDocument([], { title: "New mobile uploads" });
    }

    static updateUserDocument(doc: Doc) {
        doc.title = Doc.CurrentUserEmail;
        new InkingControl();
        (doc.optionalRightCollection === undefined) && CurrentUserUtils.setupMobileUploads(doc);
        (doc.overlays === undefined) && CurrentUserUtils.setupOverlays(doc);
        (doc.expandingButtons === undefined) && CurrentUserUtils.setupExpandingButtons(doc);
        (doc.curPresentation === undefined) && CurrentUserUtils.setupDefaultPresentation(doc);
        (doc.sidebarButtons === undefined) && CurrentUserUtils.setupSidebarButtons(doc);

        // this is equivalent to using PrefetchProxies to make sure the recentlyClosed doc is ready
        PromiseValue(Cast(doc.recentlyClosed, Doc)).then(recent => recent && PromiseValue(recent.data).then(DocListCast));
        // this is equivalent to using PrefetchProxies to make sure all the sidebarButtons and noteType internal Doc's have been retrieved.
        PromiseValue(Cast(doc.noteTypes, Doc)).then(noteTypes => noteTypes && PromiseValue(noteTypes.data).then(DocListCast));
        PromiseValue(Cast(doc.sidebarButtons, Doc)).then(stackingDoc => {
            stackingDoc && PromiseValue(Cast(stackingDoc.data, listSpec(Doc))).then(sidebarButtons => {
                sidebarButtons && sidebarButtons.map((sidebarBtn, i) => {
                    sidebarBtn && PromiseValue(Cast(sidebarBtn, Doc)).then(async btn => {
                        btn && btn.sourcePanel && btn.targetContainer && i === 1 && (btn.onClick as ScriptField).script.run({ this: btn });
                    });
                });
            });
        });

        // setup reactions to change the highlights on the undo/redo buttons -- would be better to encode this in the undo/redo buttons, but the undo/redo stacks are not wired up that way yet
        doc.undoBtn && reaction(() => UndoManager.undoStack.slice(), () => Doc.GetProto(doc.undoBtn as Doc).opacity = UndoManager.CanUndo() ? 1 : 0.4, { fireImmediately: true });
        doc.redoBtn && reaction(() => UndoManager.redoStack.slice(), () => Doc.GetProto(doc.redoBtn as Doc).opacity = UndoManager.CanRedo() ? 1 : 0.4, { fireImmediately: true });

        this.updateCreatorButtons(doc);
        return doc;
    }

    public static async loadCurrentUser() {
        return rp.get(Utils.prepend("/getCurrentUser")).then(response => {
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
        await rp.get(Utils.prepend("/getUserDocumentId")).then(id => {
            if (id && id !== "guest") {
                return DocServer.GetRefField(id).then(async field =>
                    Doc.SetUserDoc(await this.updateUserDocument(field instanceof Doc ? field : new Doc(id, true))));
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
            const schemas = Cast(CurrentUserUtils.UserDocument.DBSchemas, listSpec("string"), []);
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