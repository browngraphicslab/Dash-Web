import { action, computed, observable, reaction } from "mobx";
import * as rp from 'request-promise';
import { DocServer } from "../../../client/DocServer";
import { Docs, DocumentOptions } from "../../../client/documents/Documents";
import { UndoManager } from "../../../client/util/UndoManager";
import { Doc, DocListCast } from "../../../new_fields/Doc";
import { List } from "../../../new_fields/List";
import { listSpec } from "../../../new_fields/Schema";
import { ScriptField, ComputedField } from "../../../new_fields/ScriptField";
import { Cast, PromiseValue, StrCast } from "../../../new_fields/Types";
import { Utils } from "../../../Utils";
import { nullAudio, ImageField } from "../../../new_fields/URLField";
import { DragManager } from "../../../client/util/DragManager";
import { InkingControl } from "../../../client/views/InkingControl";
import { Scripting, CompileScript } from "../../../client/util/Scripting";
import { CollectionViewType } from "../../../client/views/collections/CollectionView";
import { makeTemplate } from "../../../client/util/DropConverter";
import { RichTextField } from "../../../new_fields/RichTextField";
import { PrefetchProxy } from "../../../new_fields/Proxy";
import { FormattedTextBox } from "../../../client/views/nodes/FormattedTextBox";
import { MainView } from "../../../client/views/MainView";

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

    static setupDefaultDocTemplates(doc: Doc, buttons?: string[]) {
        const taskStatusValues = [{ title: "todo", _backgroundColor: "blue", color: "white" },
        { title: "in progress", _backgroundColor: "yellow", color: "black" },
        { title: "completed", _backgroundColor: "green", color: "white" }
        ];
        const noteTemplates = [
            Docs.Create.TextDocument("", { title: "text", style: "Note", isTemplateDoc: true, backgroundColor: "yellow" }),
            Docs.Create.TextDocument("", { title: "text", style: "Idea", isTemplateDoc: true, backgroundColor: "pink" }),
            Docs.Create.TextDocument("", { title: "text", style: "Topic", isTemplateDoc: true, backgroundColor: "lightBlue" }),
            Docs.Create.TextDocument("", { title: "text", style: "Person", isTemplateDoc: true, backgroundColor: "lightGreen" }),
            Docs.Create.TextDocument("", {
                title: "text", style: "Todo", isTemplateDoc: true, backgroundColor: "orange", _autoHeight: false,
                layout: FormattedTextBox.LayoutString("Todo"), _height: 100, _showCaption: "caption", caption: RichTextField.DashField("taskStatus")
            })
        ];
        doc.fieldTypes = Docs.Create.TreeDocument([], { title: "field enumerations" });
        Doc.addFieldEnumerations(Doc.GetProto(noteTemplates[4]), "taskStatus", taskStatusValues);
        doc.noteTypes = new PrefetchProxy(Docs.Create.TreeDocument(noteTemplates.map(nt => makeTemplate(nt, true, StrCast(nt.style)) ? nt : nt), { title: "Note Layouts", _height: 75 }))
        doc.templateButtons = Docs.Create.MasonryDocument(CurrentUserUtils.setupTemplateButtons(doc), {
            title: "template buttons",
            _pivotField: "author", _xMargin: 0,
            _autoHeight: true, _width: 500, columnWidth: 35, ignoreClick: true, lockedPosition: true, _chromeStatus: "disabled",
            dropConverter: ScriptField.MakeScript("convertToButtons(dragData)", { dragData: DragManager.DocumentDragData.name }),
        });
        doc.templateDocs = new PrefetchProxy(Docs.Create.TreeDocument([doc.noteTypes as any as Doc, doc.templateButtons as Doc, doc.clickFuncs as Doc], {
            title: "template layouts", _xPadding: 0,
            dropConverter: ScriptField.MakeScript("convertToButtons(dragData)", { dragData: DragManager.DocumentDragData.name })
        }));
    }
    static setupDefaultIconTypes(doc: Doc, buttons?: string[]) {
        doc.iconView = new PrefetchProxy(Docs.Create.TextDocument("", { title: "icon", _width: 150, _height: 30, isTemplateDoc: true, onClick: ScriptField.MakeScript("deiconifyView(this)") }));
        Doc.GetProto(doc.iconView as any as Doc).icon = new RichTextField('{"doc":{"type":"doc","content":[{"type":"paragraph","attrs":{"align":null,"color":null,"id":null,"indent":null,"inset":null,"lineSpacing":null,"paddingBottom":null,"paddingTop":null},"content":[{"type":"dashField","attrs":{"fieldKey":"title","docid":""}}]}]},"selection":{"type":"text","anchor":2,"head":2},"storedMarks":[]}', "");
        doc.isTemplateDoc = makeTemplate(doc.iconView as any as Doc);
        doc.iconImageView = new PrefetchProxy(Docs.Create.ImageDocument("http://www.cs.brown.edu/~bcz/face.gif", { title: "data", _width: 50, isTemplateDoc: true, onClick: ScriptField.MakeScript("deiconifyView(self)") }));
        doc.isTemplateDoc = makeTemplate(doc.iconImageView as any as Doc, true, "image_icon");
        doc.iconColView = new PrefetchProxy(Docs.Create.TreeDocument([], { title: "data", _width: 180, _height: 80, isTemplateDoc: true, onClick: ScriptField.MakeScript("deiconifyView(self)") }));
        doc.isTemplateDoc = makeTemplate(doc.iconColView as any as Doc, true, "collection_icon");
        doc.iconViews = Docs.Create.TreeDocument([doc.iconView as any as Doc, doc.iconImageView as any as Doc, doc.iconColView as any as Doc], { title: "icon types", _height: 75 });
    }

    // setup the "creator" buttons for the sidebar-- eg. the default set of draggable document creation tools
    static setupCreatorButtons(doc: Doc, alreadyCreatedButtons?: string[]) {
        const emptyPresentation = Docs.Create.PresDocument(new List<Doc>(), { title: "Presentation", _viewType: CollectionViewType.Stacking, _LODdisable: true, _chromeStatus: "replaced", _showTitle: "title", boxShadow: "0 0" });
        const emptyCollection = Docs.Create.FreeformDocument([], { _nativeWidth: undefined, _nativeHeight: undefined, _LODdisable: true, _width: 150, _height: 100, title: "freeform" });
        doc.activePen = doc;
        const docProtoData: { title: string, label: string, icon: string, drag?: string, ignoreClick?: boolean, click?: string, ischecked?: string, activePen?: Doc, backgroundColor?: string, dragFactory?: Doc }[] = [
            { title: "Drag a collection", label: "Col", icon: "folder", click: 'openOnRight(getCopy(this.dragFactory, true))', drag: 'getCopy(this.dragFactory, true)', dragFactory: emptyCollection },
            { title: "Drag a web page", label: "Web", icon: "globe-asia", ignoreClick: true, drag: 'Docs.Create.WebDocument("", {_width: 300, _height: 300, title: "New Webpage" })' },
            { title: "Drag a cat image", label: "Img", icon: "cat", ignoreClick: true, drag: 'Docs.Create.ImageDocument("https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Cat03.jpg/1200px-Cat03.jpg", { _width: 250, _nativeWidth:250, title: "an image of a cat" })' },
            { title: "Drag a screenshot", label: "Grab", icon: "photo-video", ignoreClick: true, drag: 'Docs.Create.ScreenshotDocument("", { _width: 400, _height: 200, title: "screen snapshot" })' },
            { title: "Drag a webcam", label: "Cam", icon: "video", ignoreClick: true, drag: 'Docs.Create.WebCamDocument("", { _width: 400, _height: 400, title: "a test cam" })' },
            { title: "Drag a audio recorder", label: "Audio", icon: "microphone", ignoreClick: true, drag: `Docs.Create.AudioDocument("${nullAudio}", { _width: 200, title: "ready to record audio" })` },
            { title: "Drag a clickable button", label: "Btn", icon: "bolt", ignoreClick: true, drag: 'Docs.Create.ButtonDocument({ _width: 150, _height: 50, title: "Button" })' },
            { title: "Drag a presentation view", label: "Prezi", icon: "tv", click: 'openOnRight(Doc.UserDoc().curPresentation = getCopy(this.dragFactory, true))', drag: `Doc.UserDoc().curPresentation = getCopy(this.dragFactory,true)`, dragFactory: emptyPresentation },
            { title: "Drag a scripting box", label: "Script", icon: "terminal", ignoreClick: true, drag: 'Docs.Create.ScriptingDocument(undefined, { _width: 200, _height: 250 title: "untitled script" })' },
            { title: "Drag an import folder", label: "Load", icon: "cloud-upload-alt", ignoreClick: true, drag: 'Docs.Create.DirectoryImportDocument({ title: "Directory Import", _width: 400, _height: 400 })' },
            { title: "Drag a mobile view", label: "Phone", icon: "phone", ignoreClick: true, drag: 'Doc.UserDoc().activeMobile' },
            // { title: "use pen", icon: "pen-nib", click: 'activatePen(this.activePen.pen = sameDocs(this.activePen.pen, this) ? undefined : this,2, this.backgroundColor)', backgroundColor: "blue", ischecked: `sameDocs(this.activePen.pen,  this)`, activePen: doc },
            // { title: "use highlighter", icon: "highlighter", click: 'activateBrush(this.activePen.pen = sameDocs(this.activePen.pen, this) ? undefined : this,20,this.backgroundColor)', backgroundColor: "yellow", ischecked: `sameDocs(this.activePen.pen, this)`, activePen: doc },
            // { title: "use stamp", icon: "stamp", click: 'activateStamp(this.activePen.pen = sameDocs(this.activePen.pen, this) ? undefined : this)', backgroundColor: "orange", ischecked: `sameDocs(this.activePen.pen, this)`, activePen: doc },
            // { title: "use eraser", icon: "eraser", click: 'activateEraser(this.activePen.pen = sameDocs(this.activePen.pen, this) ? undefined : this);', ischecked: `sameDocs(this.activePen.pen, this)`, backgroundColor: "pink", activePen: doc },
            // { title: "use drag", icon: "mouse-pointer", click: 'deactivateInk();this.activePen.pen = this;', ischecked: `sameDocs(this.activePen.pen, this)`, backgroundColor: "white", activePen: doc },
            { title: "Drag a search box", label: "Query", icon: "search", ignoreClick: true, drag: 'Docs.Create.QueryDocument({ _width: 200, title: "an image of a cat" })' },
            { title: "Drag a document previewer", label: "Prev", icon: "expand", ignoreClick: true, drag: 'Docs.Create.DocumentDocument(ComputedField.MakeFunction("selectedDocs(this,this.excludeCollections,[_last_])?.[0]"), { _width: 250, _height: 250, title: "container" })' },
            // { title: "buxton", icon: "cloud-upload-alt", ignoreClick: true, drag: "Docs.Create.Buxton()" },
        ];
        return docProtoData.filter(d => !alreadyCreatedButtons?.includes(d.title)).map(data => Docs.Create.FontIconDocument({
            _nativeWidth: 100, _nativeHeight: 100, _width: 100, _height: 100,
            icon: data.icon,
            title: data.title,
            label: data.label,
            author: "Draggable Items",
            ignoreClick: data.ignoreClick,
            dropAction: data.click ? "copy" : undefined,
            onDragStart: data.drag ? ScriptField.MakeFunction(data.drag) : undefined,
            onClick: data.click ? ScriptField.MakeScript(data.click) : undefined,
            ischecked: data.ischecked ? ComputedField.MakeFunction(data.ischecked) : undefined,
            activePen: data.activePen,
            backgroundColor: data.backgroundColor, removeDropProperties: new List<string>(["dropAction"]),
            dragFactory: data.dragFactory,
        }));
    }

    static setupTemplateButtons(doc: Doc) {
        const queryTemplate = Docs.Create.MulticolumnDocument(
            [
                Docs.Create.QueryDocument({ title: "query", _height: 200, forceActive: true }),
                Docs.Create.FreeformDocument([], { title: "data", _height: 100, _LODdisable: true, forceActive: true })
            ],
            { _width: 400, _height: 300, title: "queryView", _chromeStatus: "disabled", _xMargin: 3, _yMargin: 3, _autoHeight: false, forceActive: true, hideFilterView: true });
        queryTemplate.isTemplateDoc = makeTemplate(queryTemplate);
        const slideTemplate = Docs.Create.MultirowDocument(
            [
                Docs.Create.MulticolumnDocument([], { title: "data", _height: 200, forceActive: true }),
                Docs.Create.TextDocument("", { title: "text", _height: 100, forceActive: true })
            ],
            { _width: 400, _height: 300, title: "slideView", _chromeStatus: "disabled", _xMargin: 3, _yMargin: 3, _autoHeight: false, forceActive: true, hideFilterView: true });
        slideTemplate.isTemplateDoc = makeTemplate(slideTemplate);
        const descriptionTemplate = Docs.Create.TextDocument("", { title: "text", _height: 100, _showTitle: "title" });
        Doc.GetProto(descriptionTemplate).layout = FormattedTextBox.LayoutString("description");
        descriptionTemplate.isTemplateDoc = makeTemplate(descriptionTemplate, true, "descriptionView");

        doc.slidesBtn = CurrentUserUtils.ficon({ onDragStart: ScriptField.MakeFunction('getCopy(this.dragFactory, true)'), dragFactory: slideTemplate, author: "-Template Items", removeDropProperties: new List<string>(["dropAction"]), title: "presentation slide", icon: "address-card" });
        doc.descriptionBtn = CurrentUserUtils.ficon({ onDragStart: ScriptField.MakeFunction('getCopy(this.dragFactory, true)'), dragFactory: descriptionTemplate, author: "-Template Items", removeDropProperties: new List<string>(["dropAction"]), title: "description view", icon: "window-maximize" });
        doc.queryBtn = CurrentUserUtils.ficon({ onDragStart: ScriptField.MakeFunction('getCopy(this.dragFactory, true)'), dragFactory: queryTemplate, author: "-Template Items", removeDropProperties: new List<string>(["dropAction"]), title: "query view", icon: "question-circle" });

        return [doc.slidesBtn as Doc, doc.descriptionBtn as Doc, doc.queryBtn as Doc];
    }


    static async updateCreatorButtons(doc: Doc) {
        const dragset = await Cast(doc.dragCreators, Doc);
        if (dragset) {
            const dragdocs = await Cast(dragset.data, listSpec(Doc));
            if (dragdocs) {
                const dragDocs = await Promise.all(dragdocs);
                this.setupCreatorButtons(doc, dragDocs.map(d => StrCast(d.title))).map(nb => Doc.AddDocToList(dragset, "data", nb));
            }
        }
    }

    static setupMobileButtons(doc: Doc, buttons?: string[]) {
        const docProtoData: { title: string, icon: string, drag?: string, ignoreClick?: boolean, click?: string, ischecked?: string, activePen?: Doc, backgroundColor?: string, dragFactory?: Doc }[] = [
            { title: "record", icon: "microphone", ignoreClick: true, click: "FILL" },
            { title: "use pen", icon: "pen-nib", click: 'activatePen(this.activePen.pen = sameDocs(this.activePen.pen, this) ? undefined : this,2, this.backgroundColor)', backgroundColor: "blue", ischecked: `sameDocs(this.activePen.pen,  this)`, activePen: doc },
            { title: "use highlighter", icon: "highlighter", click: 'activateBrush(this.activePen.pen = sameDocs(this.activePen.pen, this) ? undefined : this,20,this.backgroundColor)', backgroundColor: "yellow", ischecked: `sameDocs(this.activePen.pen, this)`, activePen: doc },
            { title: "use eraser", icon: "eraser", click: 'activateEraser(this.activePen.pen = sameDocs(this.activePen.pen, this) ? undefined : this);', ischecked: `sameDocs(this.activePen.pen, this)`, backgroundColor: "pink", activePen: doc },
            { title: "use drag", icon: "mouse-pointer", click: 'deactivateInk();this.activePen.pen = this;', ischecked: `sameDocs(this.activePen.pen, this)`, backgroundColor: "white", activePen: doc },
            // { title: "draw", icon: "pen-nib", click: 'switchMobileView(setupMobileInkingDoc, renderMobileInking, onSwitchMobileInking);', ischecked: `sameDocs(this.activePen.pen, this)`, backgroundColor: "red", activePen: doc },
            { title: "upload", icon: "upload", click: 'switchMobileView(setupMobileUploadDoc, renderMobileUpload, onSwitchMobileUpload);', backgroundColor: "orange" },
            // { title: "upload", icon: "upload", click: 'uploadImageMobile();', backgroundColor: "cyan" },
        ];
        return docProtoData.filter(d => !buttons || !buttons.includes(d.title)).map(data => Docs.Create.FontIconDocument({
            _nativeWidth: 100, _nativeHeight: 100, _width: 100, _height: 100, dropAction: data.click ? "copy" : undefined, title: data.title, icon: data.icon, ignoreClick: data.ignoreClick,
            onDragStart: data.drag ? ScriptField.MakeFunction(data.drag) : undefined, onClick: data.click ? ScriptField.MakeScript(data.click) : undefined,
            ischecked: data.ischecked ? ComputedField.MakeFunction(data.ischecked) : undefined, activePen: data.activePen,
            backgroundColor: data.backgroundColor, removeDropProperties: new List<string>(["dropAction"]), dragFactory: data.dragFactory,
        }));
    }

    static setupThumbButtons(doc: Doc) {
        const docProtoData: { title: string, icon: string, drag?: string, ignoreClick?: boolean, pointerDown?: string, pointerUp?: string, ischecked?: string, clipboard?: Doc, activePen?: Doc, backgroundColor?: string, dragFactory?: Doc }[] = [
            { title: "use pen", icon: "pen-nib", pointerUp: "resetPen()", pointerDown: 'setPen(2, this.backgroundColor)', backgroundColor: "blue", ischecked: `sameDocs(this.activePen.pen,  this)`, activePen: doc },
            { title: "use highlighter", icon: "highlighter", pointerUp: "resetPen()", pointerDown: 'setPen(20, this.backgroundColor)', backgroundColor: "yellow", ischecked: `sameDocs(this.activePen.pen, this)`, activePen: doc },
            { title: "notepad", icon: "clipboard", pointerUp: "GestureOverlay.Instance.closeFloatingDoc()", pointerDown: 'GestureOverlay.Instance.openFloatingDoc(this.clipboard)', clipboard: Docs.Create.FreeformDocument([], { _width: 300, _height: 300 }), backgroundColor: "orange", ischecked: `sameDocs(this.activePen.pen, this)`, activePen: doc },
            { title: "interpret text", icon: "font", pointerUp: "setToolglass('none')", pointerDown: "setToolglass('inktotext')", backgroundColor: "orange", ischecked: `sameDocs(this.activePen.pen, this)`, activePen: doc },
            { title: "ignore gestures", icon: "signature", pointerUp: "setToolglass('none')", pointerDown: "setToolglass('ignoregesture')", backgroundColor: "green", ischecked: `sameDocs(this.activePen.pen, this)`, activePen: doc },
        ];
        return docProtoData.map(data => Docs.Create.FontIconDocument({
            _nativeWidth: 10, _nativeHeight: 10, _width: 10, _height: 10, title: data.title, icon: data.icon,
            dropAction: data.pointerDown ? "copy" : undefined, ignoreClick: data.ignoreClick,
            onDragStart: data.drag ? ScriptField.MakeFunction(data.drag) : undefined,
            clipboard: data.clipboard,
            onPointerUp: data.pointerUp ? ScriptField.MakeScript(data.pointerUp) : undefined, onPointerDown: data.pointerDown ? ScriptField.MakeScript(data.pointerDown) : undefined,
            ischecked: data.ischecked ? ComputedField.MakeFunction(data.ischecked) : undefined, activePen: data.activePen, pointerHack: true,
            backgroundColor: data.backgroundColor, removeDropProperties: new List<string>(["dropAction"]), dragFactory: data.dragFactory,
        }));
    }

    static setupThumbDoc(userDoc: Doc) {
        if (!userDoc.thumbDoc) {
            const thumbDoc = Docs.Create.LinearDocument(CurrentUserUtils.setupThumbButtons(userDoc), {
                _width: 100, _height: 50, ignoreClick: true, lockedPosition: true, _chromeStatus: "disabled", title: "buttons",
                _autoHeight: true, _yMargin: 5, linearViewIsExpanded: true, backgroundColor: "white"
            });
            thumbDoc.inkToTextDoc = Docs.Create.LinearDocument([], {
                _width: 300, _height: 25, _autoHeight: true, _chromeStatus: "disabled", linearViewIsExpanded: true, flexDirection: "column"
            });
            userDoc.thumbDoc = thumbDoc;
        }
        return Cast(userDoc.thumbDoc, Doc);
    }

    static setupMobileDoc(userDoc: Doc) {
        return userDoc.activeMoble ?? Docs.Create.MasonryDocument(CurrentUserUtils.setupMobileButtons(userDoc), {
            columnWidth: 100, ignoreClick: true, lockedPosition: true, _chromeStatus: "disabled", title: "buttons", _autoHeight: true, _yMargin: 5
        });
    }

    static setupMobileInkingDoc(userDoc: Doc) {
        return Docs.Create.FreeformDocument([], { title: "Mobile Inking", backgroundColor: "white" });
    }

    static setupMobileUploadDoc(userDoc: Doc) {
        // const addButton = Docs.Create.FontIconDocument({ onDragStart: ScriptField.MakeScript('addWebToMobileUpload()'), title: "Add Web Doc to Upload Collection", icon: "plus", backgroundColor: "black" })
        const webDoc = Docs.Create.WebDocument("https://www.britannica.com/biography/Miles-Davis", {
            title: "Upload Images From the Web", _chromeStatus: "enabled", lockedPosition: true
        });
        const uploadDoc = Docs.Create.StackingDocument([], {
            title: "Mobile Upload Collection", backgroundColor: "white", lockedPosition: true
        });
        return Docs.Create.StackingDocument([webDoc, uploadDoc], {
            _width: screen.width, lockedPosition: true, _chromeStatus: "disabled", title: "Upload", _autoHeight: true, _yMargin: 80, backgroundColor: "lightgray"
        });
    }

    // setup the Creator button which will display the creator panel.  This panel will include the drag creators and the color picker.  when clicked, this panel will be displayed in the target container (ie, sidebarContainer)  
    static setupToolsPanel(sidebarContainer: Doc, doc: Doc) {
        // setup a masonry view of all he creators
        const creatorBtns = CurrentUserUtils.setupCreatorButtons(doc);
        doc.dragCreators = Docs.Create.MasonryDocument(creatorBtns, {
            title: "drag Creators",
            _pivotField: "author", _xMargin: 0,
            _autoHeight: true, _width: 500, columnWidth: 35, ignoreClick: true, lockedPosition: true, _chromeStatus: "disabled",
            dropConverter: ScriptField.MakeScript("convertToButtons(dragData)", { dragData: DragManager.DocumentDragData.name }),
        });
        doc.allCreators = Docs.Create.StackingDocument([doc.dragCreators as any as Doc, doc.templateButtons as any as Doc], {
            title: "all Creators", _yMargin: 0, _autoHeight: true, _xMargin: 0,
            _width: 500, ignoreClick: true, lockedPosition: true, _chromeStatus: "disabled",
        });
        // setup a color picker
        const color = Docs.Create.ColorDocument({
            title: "color picker", _width: 300, dropAction: "alias", forceActive: true, removeDropProperties: new List<string>(["dropAction", "forceActive"])
        });

        return Docs.Create.ButtonDocument({
            _width: 35, _height: 25, title: "Tools", fontSize: 10, targetContainer: sidebarContainer,
            letterSpacing: "0px", textTransform: "unset", borderRounding: "5px 5px 0px 0px", boxShadow: "3px 3px 0px rgb(34, 34, 34)",
            sourcePanel: Docs.Create.StackingDocument([doc.allCreators as Doc, color], {
                _width: 500, lockedPosition: true, _chromeStatus: "disabled", title: "tools stack", forceActive: true
            }),
            onClick: ScriptField.MakeScript("this.targetContainer.proto = this.sourcePanel"),
        });
    }

    // setup the Library button which will display the library panel.  This panel includes a collection of workspaces, documents, and recently closed views
    static setupLibraryPanel(sidebarContainer: Doc, doc: Doc) {
        // setup workspaces library item
        doc.workspaces = Docs.Create.TreeDocument([], {
            title: "WORKSPACES", _height: 100, forceActive: true, boxShadow: "0 0", lockedPosition: true,
        });
        const newWorkspace = ScriptField.MakeScript(`createNewWorkspace()`);
        (doc.workspaces as Doc).contextMenuScripts = new List<ScriptField>([newWorkspace!]);
        (doc.workspaces as Doc).contextMenuLabels = new List<string>(["Create New Workspace"]);

        doc.documents = Docs.Create.TreeDocument([], {
            title: "DOCUMENTS", _height: 42, forceActive: true, boxShadow: "0 0", treeViewPreventOpen: true, lockedPosition: true,
        });

        // setup Recently Closed library item
        doc.recentlyClosed = Docs.Create.TreeDocument([], {
            title: "RECENTLY CLOSED", _height: 75, forceActive: true, boxShadow: "0 0", treeViewPreventOpen: true, lockedPosition: true,
        });
        const clearAll = ScriptField.MakeScript(`self.data = new List([])`);
        (doc.recentlyClosed as Doc).contextMenuScripts = new List<ScriptField>([clearAll!]);
        (doc.recentlyClosed as Doc).contextMenuLabels = new List<string>(["Clear All"]);

        return Docs.Create.ButtonDocument({
            _width: 50, _height: 25, title: "Library", fontSize: 10,
            letterSpacing: "0px", textTransform: "unset", borderRounding: "5px 5px 0px 0px", boxShadow: "3px 3px 0px rgb(34, 34, 34)",
            sourcePanel: Docs.Create.TreeDocument([doc.workspaces as Doc, doc.documents as Doc, doc.recentlyClosed as Doc, doc], {
                title: "Library", _xMargin: 5, _yMargin: 5, _gridGap: 5, forceActive: true, childDropAction: "place", lockedPosition: true, boxShadow: "0 0", dontRegisterChildren: true
            }),
            targetContainer: sidebarContainer,
            onClick: ScriptField.MakeScript("this.targetContainer.proto = this.sourcePanel;")
        });
    }

    // setup the Search button which will display the search panel.  
    static setupSearchPanel(sidebarContainer: Doc) {
        return Docs.Create.ButtonDocument({
            _width: 50, _height: 25, title: "Search", fontSize: 10,
            letterSpacing: "0px", textTransform: "unset", borderRounding: "5px 5px 0px 0px", boxShadow: "3px 3px 0px rgb(34, 34, 34)",
            sourcePanel: Docs.Create.QueryDocument({ title: "search stack", }),
            targetContainer: sidebarContainer,
            lockedPosition: true,
            onClick: ScriptField.MakeScript("this.targetContainer.proto = this.sourcePanel")
        });
    }

    // setup the list of sidebar mode buttons which determine what is displayed in the sidebar
    static setupSidebarButtons(doc: Doc) {
        const sidebarContainer = new Doc();
        doc.sidebarContainer = new PrefetchProxy(sidebarContainer);
        sidebarContainer._chromeStatus = "disabled";
        sidebarContainer.onClick = ScriptField.MakeScript("freezeSidebar()");

        doc.ToolsBtn = new PrefetchProxy(this.setupToolsPanel(sidebarContainer, doc));
        doc.LibraryBtn = new PrefetchProxy(this.setupLibraryPanel(sidebarContainer, doc));
        doc.SearchBtn = new PrefetchProxy(this.setupSearchPanel(sidebarContainer));

        // Finally, setup the list of buttons to display in the sidebar
        doc.sidebarButtons = new PrefetchProxy(Docs.Create.StackingDocument([doc.SearchBtn as any as Doc, doc.LibraryBtn as any as Doc, doc.ToolsBtn as any as Doc], {
            _width: 500, _height: 80, boxShadow: "0 0", _pivotField: "title", hideHeadings: true, ignoreClick: true, _chromeStatus: "view-mode",
            title: "sidebar btn row stack", backgroundColor: "dimGray",
        }));
    }

    static blist = (opts: DocumentOptions, docs: Doc[]) => new PrefetchProxy(Docs.Create.LinearDocument(docs, {
        ...opts,
        _gridGap: 5, _xMargin: 5, _yMargin: 5, _height: 42, _width: 100, boxShadow: "0 0", forceActive: true,
        dropConverter: ScriptField.MakeScript("convertToButtons(dragData)", { dragData: DragManager.DocumentDragData.name }),
        backgroundColor: "black", treeViewPreventOpen: true, lockedPosition: true, _chromeStatus: "disabled", linearViewIsExpanded: true
    })) as any as Doc;

    static ficon = (opts: DocumentOptions) => new PrefetchProxy(Docs.Create.FontIconDocument({
        ...opts,
        dropAction: "alias", removeDropProperties: new List<string>(["dropAction"]), _nativeWidth: 100, _nativeHeight: 100, _width: 100, _height: 100
    })) as any as Doc;

    /// sets up the default list of buttons to be shown in the expanding button menu at the bottom of the Dash window
    static setupExpandingButtons(doc: Doc) {
        doc.penBtn = CurrentUserUtils.ficon({
            onClick: ScriptField.MakeScript("activatePen(this.activePen.pen = sameDocs(this.activePen.pen, this) ? undefined : this,2, this.backgroundColor)"),
            author: "systemTemplates", title: "ink mode", icon: "pen-nib", ischecked: ComputedField.MakeFunction(`sameDocs(this.activePen.pen,  this)`), activePen: doc
        })
        doc.undoBtn = CurrentUserUtils.ficon({ onClick: ScriptField.MakeScript("undo()"), title: "undo button", icon: "undo-alt" });
        doc.redoBtn = CurrentUserUtils.ficon({ onClick: ScriptField.MakeScript("redo()"), title: "redo button", icon: "redo-alt" });
        doc.expandingButtons = CurrentUserUtils.blist({ title: "expanding buttons", ignoreClick: true }, [doc.undoBtn as Doc, doc.redoBtn as Doc, doc.penBtn as Doc]);
    }
    // sets up the default set of documents to be shown in the Overlay layer
    static setupOverlays(doc: Doc) {
        doc.overlays = new PrefetchProxy(Docs.Create.FreeformDocument([], { title: "Overlays", backgroundColor: "#aca3a6" }));
    }

    // the initial presentation Doc to use
    static setupDefaultPresentation(doc: Doc) {
        doc.presentationTemplate = new PrefetchProxy(Docs.Create.PresElementBoxDocument({ title: "pres element template", backgroundColor: "transparent", _xMargin: 5, _height: 46, isTemplateDoc: true, isTemplateForField: "data" }));
        doc.curPresentation = Docs.Create.PresDocument(new List<Doc>(), { title: "Presentation", _viewType: CollectionViewType.Stacking, _LODdisable: true, _chromeStatus: "replaced", _showTitle: "title", boxShadow: "0 0" });
    }

    static setupMobileUploads(doc: Doc) {
        doc.optionalRightCollection = new PrefetchProxy(Docs.Create.StackingDocument([], { title: "New mobile uploads" }));
    }

    static setupChildClicks(doc: Doc) {
        const openInTarget = Docs.Create.ScriptingDocument(ScriptField.MakeScript(
            "docCast(thisContainer.target).then((target) => { target && docCast(this.source).then((source) => { target.proto.data = new List([source || this]); } ); } )",
            { target: Doc.name }), { title: "On Child Clicked (open in target)", _width: 300, _height: 200 });
        const onClick = Docs.Create.ScriptingDocument(undefined, { title: "onClick", "onClick-rawScript": "console.log('click')", isTemplateDoc: true, isTemplateForField: "onClick", _width: 300, _height: 200 }, "onClick");
        const onCheckedClick = Docs.Create.ScriptingDocument(undefined,
            { title: "onCheckedClick", "onCheckedClick-rawScript": "console.log(heading + checked + containingTreeView)", "onCheckedClick-params": new List<string>(["heading", "checked", "containingTreeView"]), isTemplateDoc: true, isTemplateForField: "onCheckedClick", _width: 300, _height: 200 }, "onCheckedClick");
        doc.childClickFuncs = Docs.Create.TreeDocument([openInTarget], { title: "on Child Click function templates" });
        doc.clickFuncs = Docs.Create.TreeDocument([onClick, onCheckedClick], { title: "onClick funcs" });
    }

    static updateUserDocument(doc: Doc) {
        doc.title = Doc.CurrentUserEmail;
        new InkingControl();
        (doc.childClickFuncs === undefined) && CurrentUserUtils.setupChildClicks(doc);
        (doc.iconTypes === undefined) && CurrentUserUtils.setupDefaultIconTypes(doc);
        (doc.templateDocs === undefined) && CurrentUserUtils.setupDefaultDocTemplates(doc);
        (doc.optionalRightCollection === undefined) && CurrentUserUtils.setupMobileUploads(doc);
        (doc.overlays === undefined) && CurrentUserUtils.setupOverlays(doc);
        (doc.expandingButtons === undefined) && CurrentUserUtils.setupExpandingButtons(doc);
        (doc.curPresentation === undefined) && CurrentUserUtils.setupDefaultPresentation(doc);
        (doc.sidebarButtons === undefined) && CurrentUserUtils.setupSidebarButtons(doc);
        doc.linkDb = Docs.Prototypes.MainLinkDocument();

        // this is equivalent to using PrefetchProxies to make sure all the childClickFuncs have been retrieved.
        PromiseValue(Cast(doc.childClickFuncs, Doc)).then(func => func && PromiseValue(func.data).then(DocListCast));
        // this is equivalent to using PrefetchProxies to make sure the recentlyClosed doc is ready
        PromiseValue(Cast(doc.recentlyClosed, Doc)).then(recent => recent && PromiseValue(recent.data).then(DocListCast));
        // this is equivalent to using PrefetchProxies to make sure all the sidebarButtons and noteType internal Doc's have been retrieved.
        PromiseValue(Cast(doc.noteTypes, Doc)).then(noteTypes => noteTypes && PromiseValue(noteTypes.data).then(DocListCast));
        PromiseValue(Cast(doc.clickFuncs, Doc)).then(func => func && PromiseValue(func.data).then(DocListCast));
        PromiseValue(Cast(doc.childClickFuncs, Doc)).then(func => func && PromiseValue(func.data).then(DocListCast));
        PromiseValue(Cast(doc.sidebarButtons, Doc)).then(stackingDoc => {
            stackingDoc && PromiseValue(Cast(stackingDoc.data, listSpec(Doc))).then(sidebarButtons => {
                sidebarButtons?.map((sidebarBtn, i) => {
                    sidebarBtn && PromiseValue(Cast(sidebarBtn, Doc)).then(async btn => { // choose which item to display first in sidebar panel (i === 0,1, or 2)
                        btn?.sourcePanel && btn.targetContainer && i === 2 && (btn.onClick as ScriptField).script.run({ this: btn });
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

    public static IsDocPinned(doc: Doc) {
        //add this new doc to props.Document
        const curPres = Cast(CurrentUserUtils.UserDocument.curPresentation, Doc) as Doc;
        if (curPres) {
            return DocListCast(curPres.data).findIndex((val) => Doc.AreProtosEqual(val, doc)) !== -1;
        }
        return false;
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
    }
}

Scripting.addGlobal(function setupMobileInkingDoc(userDoc: Doc) { return CurrentUserUtils.setupMobileInkingDoc(userDoc); });
Scripting.addGlobal(function setupMobileUploadDoc(userDoc: Doc) { return CurrentUserUtils.setupMobileUploadDoc(userDoc); });
Scripting.addGlobal(function createNewWorkspace() { return MainView.Instance.createNewWorkspace(); });