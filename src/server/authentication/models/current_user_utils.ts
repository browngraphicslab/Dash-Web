import { action, computed, observable, reaction } from "mobx";
import * as rp from 'request-promise';
import { DocServer } from "../../../client/DocServer";
import { Docs, DocumentOptions } from "../../../client/documents/Documents";
import { UndoManager } from "../../../client/util/UndoManager";
import { Doc, DocListCast, DocListCastAsync } from "../../../new_fields/Doc";
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
import { DocumentType } from "../../../client/documents/DocumentTypes";

export class CurrentUserUtils {
    private static curr_id: string;
    //TODO tfs: these should be temporary...
    private static mainDocId: string | undefined;

    public static get id() { return this.curr_id; }
    public static get MainDocId() { return this.mainDocId; }
    public static set MainDocId(id: string | undefined) { this.mainDocId = id; }
    @computed public static get UserDocument() { return Doc.UserDoc(); }
    @computed public static get ActivePen() { return Doc.UserDoc().activePen instanceof Doc && (Doc.UserDoc().activePen as Doc).inkPen as Doc; }

    @observable public static GuestTarget: Doc | undefined;
    @observable public static GuestWorkspace: Doc | undefined;
    @observable public static GuestMobile: Doc | undefined;

    // sets up the default User Templates - slideView, queryView, descriptionView
    static setupUserTemplateButtons(doc: Doc) {
        if (doc["template-button-query"] === undefined) {
            const queryTemplate = Docs.Create.MulticolumnDocument(
                [
                    Docs.Create.QueryDocument({ title: "query", _height: 200 }),
                    Docs.Create.FreeformDocument([], { title: "data", _height: 100, _LODdisable: true })
                ],
                { _width: 400, _height: 300, title: "queryView", _chromeStatus: "disabled", _xMargin: 3, _yMargin: 3, hideFilterView: true }
            );
            queryTemplate.isTemplateDoc = makeTemplate(queryTemplate);
            doc["template-button-query"] = CurrentUserUtils.ficon({
                onDragStart: ScriptField.MakeFunction('getCopy(this.dragFactory, true)'),
                dragFactory: new PrefetchProxy(queryTemplate) as any as Doc,
                removeDropProperties: new List<string>(["dropAction"]), title: "query view", icon: "question-circle"
            });
        }

        if (doc["template-button-slides"] === undefined) {
            const slideTemplate = Docs.Create.MultirowDocument(
                [
                    Docs.Create.MulticolumnDocument([], { title: "data", _height: 200 }),
                    Docs.Create.TextDocument("", { title: "text", _height: 100 })
                ],
                { _width: 400, _height: 300, title: "slideView", _chromeStatus: "disabled", _xMargin: 3, _yMargin: 3, hideFilterView: true }
            );
            slideTemplate.isTemplateDoc = makeTemplate(slideTemplate);
            doc["template-button-slides"] = CurrentUserUtils.ficon({
                onDragStart: ScriptField.MakeFunction('getCopy(this.dragFactory, true)'),
                dragFactory: new PrefetchProxy(slideTemplate) as any as Doc,
                removeDropProperties: new List<string>(["dropAction"]), title: "presentation slide", icon: "address-card"
            });
        }

        if (doc["template-button-description"] === undefined) {
            const descriptionTemplate = Docs.Create.TextDocument("", { title: "text", _height: 100, _showTitle: "title" });
            Doc.GetProto(descriptionTemplate).layout = FormattedTextBox.LayoutString("description");
            descriptionTemplate.isTemplateDoc = makeTemplate(descriptionTemplate, true, "descriptionView");

            doc["template-button-description"] = CurrentUserUtils.ficon({
                onDragStart: ScriptField.MakeFunction('getCopy(this.dragFactory, true)'),
                dragFactory: new PrefetchProxy(descriptionTemplate) as any as Doc,
                removeDropProperties: new List<string>(["dropAction"]), title: "description view", icon: "window-maximize"
            });
        }

        if (doc["template-button-detail"] === undefined) {
            const { TextDocument, MasonryDocument, CarouselDocument } = Docs.Create;

            const carousel = CarouselDocument([], { title: "data", _height: 350, _itemIndex: 0, backgroundColor: "#9b9b9b3F" });

            const short = TextDocument("", { title: "shortDescription", treeViewOpen: true, treeViewExpandedView: "layout", _height: 50 });
            const long = TextDocument("", { title: "longDescription", treeViewOpen: false, treeViewExpandedView: "layout", _height: 350 });

            const buxtonFieldKeys = ["year", "originalPrice", "degreesOfFreedom", "company", "attribute", "primaryKey", "secondaryKey", "dimensions"];
            const detailedTemplate = {
                doc: {
                    type: "doc", content: buxtonFieldKeys.map(fieldKey => ({
                        type: "paragraph",
                        content: [{ type: "dashField", attrs: { fieldKey } }]
                    }))
                },
                selection: { type: "text", anchor: 1, head: 1 },
                storedMarks: []
            }; short.text = new RichTextField(JSON.stringify(detailedTemplate), buxtonFieldKeys.join(" "));

            const shared = { _chromeStatus: "disabled", _autoHeight: true, _xMargin: 0 };
            const detailViewOpts = { title: "detailView", _width: 300, _fontFamily: "Arial", _fontSize: 12 };
            const descriptionWrapperOpts = { title: "descriptions", _height: 300, columnWidth: -1, treeViewHideTitle: true, _pivotField: "title" };

            const descriptionWrapper = MasonryDocument([short, long], { ...shared, ...descriptionWrapperOpts });
            const detailView = Docs.Create.StackingDocument([carousel, descriptionWrapper], { ...shared, ...detailViewOpts });
            detailView.isTemplateDoc = makeTemplate(detailView);
            short.title = "A Short Description";
            long.title = "Long Description";


            const shared = { _chromeStatus: "disabled", _autoHeight: true, _xMargin: 0 };
            const detailViewOpts = { title: "detailView", _width: 300, _fontFamily: "Arial", _fontSize: 12 };
            const descriptionWrapperOpts = { title: "descriptions", _height: 300, columnWidth: -1, treeViewHideTitle: true, _pivotField: "title" };

            const descriptionWrapper = MasonryDocument([short, long], { ...shared, ...descriptionWrapperOpts });
            const detailView = Docs.Create.StackingDocument([carousel, descriptionWrapper], { ...shared, ...detailViewOpts });
            detailView.isTemplateDoc = makeTemplate(detailView);

            short.title = "A Short Description";
            long.title = "Long Description";

            doc["template-button-detail"] = CurrentUserUtils.ficon({
                onDragStart: ScriptField.MakeFunction('getCopy(this.dragFactory, true)'),
                dragFactory: new PrefetchProxy(detailView) as any as Doc,
                removeDropProperties: new List<string>(["dropAction"]), title: "detail view", icon: "window-maximize"
            });
        }

        if (doc["template-buttons"] === undefined) {
            doc["template-buttons"] = new PrefetchProxy(Docs.Create.MasonryDocument([doc["template-button-slides"] as Doc, doc["template-button-description"] as Doc,
            doc["template-button-query"] as Doc, doc["template-button-detail"] as Doc], {
                title: "Compound Item Creators", _xMargin: 0, _showTitle: "title",
                _autoHeight: true, _width: 500, columnWidth: 35, ignoreClick: true, lockedPosition: true, _chromeStatus: "disabled",
                dropConverter: ScriptField.MakeScript("convertToButtons(dragData)", { dragData: DragManager.DocumentDragData.name }),
            }));
        } else {
            DocListCast(Cast(doc["template-buttons"], Doc, null)?.data); // prefetch templates
        }
        return doc["template-buttons"] as Doc;
    }

    // setup the different note type skins
    static setupNoteTemplates(doc: Doc) {
        if (doc["template-note-Note"] === undefined) {
            const noteView = Docs.Create.TextDocument("", { title: "text", style: "Note", isTemplateDoc: true, backgroundColor: "yellow" });
            noteView.isTemplateDoc = makeTemplate(noteView, true, "Note");
            doc["template-note-Note"] = new PrefetchProxy(noteView);
        }
        if (doc["template-note-Idea"] === undefined) {
            const noteView = Docs.Create.TextDocument("", { title: "text", style: "Idea", backgroundColor: "pink" });
            noteView.isTemplateDoc = makeTemplate(noteView, true, "Idea");
            doc["template-note-Idea"] = new PrefetchProxy(noteView);
        }
        if (doc["template-note-Topic"] === undefined) {
            const noteView = Docs.Create.TextDocument("", { title: "text", style: "Topic", backgroundColor: "lightBlue" });
            noteView.isTemplateDoc = makeTemplate(noteView, true, "Topic");
            doc["template-note-Topic"] = new PrefetchProxy(noteView);
        }
        if (doc["template-note-Todo"] === undefined) {
            const noteView = Docs.Create.TextDocument("", {
                title: "text", style: "Todo", backgroundColor: "orange", _autoHeight: false, _height: 100, _showCaption: "caption",
                layout: FormattedTextBox.LayoutString("Todo"), caption: RichTextField.DashField("taskStatus")
            });
            noteView.isTemplateDoc = makeTemplate(noteView, true, "Todo");
            doc["template-note-Todo"] = new PrefetchProxy(noteView);
        }
        const taskStatusValues = [
            { title: "todo", _backgroundColor: "blue", color: "white" },
            { title: "in progress", _backgroundColor: "yellow", color: "black" },
            { title: "completed", _backgroundColor: "green", color: "white" }
        ];
        if (doc.fieldTypes === undefined) {
            doc.fieldTypes = Docs.Create.TreeDocument([], { title: "field enumerations" });
            Doc.addFieldEnumerations(Doc.GetProto(doc["template-note-Todo"] as any as Doc), "taskStatus", taskStatusValues);
        }

        if (doc["template-notes"] === undefined) {
            doc["template-notes"] = new PrefetchProxy(Docs.Create.TreeDocument([doc["template-note-Note"] as any as Doc,
            doc["template-note-Idea"] as any as Doc, doc["template-note-Topic"] as any as Doc, doc["template-note-Todo"] as any as Doc],
                { title: "Note Layouts", _height: 75 }));
        } else {
            const noteTypes = Cast(doc["template-notes"], Doc, null);
            DocListCastAsync(noteTypes).then(list => noteTypes.data = new List<Doc>([doc["template-note-Note"] as any as Doc,
            doc["template-note-Idea"] as any as Doc, doc["template-note-Topic"] as any as Doc, doc["template-note-Todo"] as any as Doc]));
        }

        return doc["template-notes"] as Doc;
    }

    // creates Note templates, and initial "user" templates
    static setupDocTemplates(doc: Doc) {
        const noteTemplates = CurrentUserUtils.setupNoteTemplates(doc);
        const userTemplateBtns = CurrentUserUtils.setupUserTemplateButtons(doc);
        const clickTemplates = CurrentUserUtils.setupClickEditorTemplates(doc);
        if (doc.templateDocs === undefined) {
            doc.templateDocs = new PrefetchProxy(Docs.Create.TreeDocument([noteTemplates, userTemplateBtns, clickTemplates], {
                title: "template layouts", _xPadding: 0,
                dropConverter: ScriptField.MakeScript("convertToButtons(dragData)", { dragData: DragManager.DocumentDragData.name })
            }));
        }
    }

    // setup templates for different document types when they are iconified from Document Decorations
    static setupDefaultIconTemplates(doc: Doc) {
        if (doc["template-icon-view"] === undefined) {
            const iconView = Docs.Create.TextDocument("", {
                title: "icon", _width: 150, _height: 30, isTemplateDoc: true,
                onClick: ScriptField.MakeScript("deiconifyView(self)")
            });
            Doc.GetProto(iconView).icon = new RichTextField('{"doc":{"type":"doc","content":[{"type":"paragraph","attrs":{"align":null,"color":null,"id":null,"indent":null,"inset":null,"lineSpacing":null,"paddingBottom":null,"paddingTop":null},"content":[{"type":"dashField","attrs":{"fieldKey":"title","docid":""}}]}]},"selection":{"type":"text","anchor":2,"head":2},"storedMarks":[]}', "");
            iconView.isTemplateDoc = makeTemplate(iconView);
            doc["template-icon-view"] = new PrefetchProxy(iconView);
        }
        if (doc["template-icon-view-rtf"] === undefined) {
            const iconRtfView = Docs.Create.LabelDocument({ title: "icon_" + DocumentType.RTF, textTransform: "unset", letterSpacing: "unset", _width: 150, _height: 70, _xPadding: 10, _yPadding: 10, isTemplateDoc: true, onClick: ScriptField.MakeScript("deiconifyView(self)") });
            iconRtfView.isTemplateDoc = makeTemplate(iconRtfView, true, "icon_" + DocumentType.RTF);
            doc["template-icon-view-rtf"] = new PrefetchProxy(iconRtfView);
        }
        if (doc["template-icon-view-img"] === undefined) {
            const iconImageView = Docs.Create.ImageDocument("http://www.cs.brown.edu/~bcz/face.gif", {
                title: "data", _width: 50, isTemplateDoc: true,
                onClick: ScriptField.MakeScript("deiconifyView(self)")
            });
            iconImageView.isTemplateDoc = makeTemplate(iconImageView, true, "icon_" + DocumentType.IMG);
            doc["template-icon-view-img"] = new PrefetchProxy(iconImageView);
        }
        if (doc["template-icon-view-col"] === undefined) {
            const iconColView = Docs.Create.TreeDocument([], { title: "data", _width: 180, _height: 80, onClick: ScriptField.MakeScript("deiconifyView(self)") });
            iconColView.isTemplateDoc = makeTemplate(iconColView, true, "icon_" + DocumentType.COL);
            doc["template-icon-view-col"] = new PrefetchProxy(iconColView);
        }
        if (doc["template-icons"] === undefined) {
            doc["template-icons"] = new PrefetchProxy(Docs.Create.TreeDocument([doc["template-icon-view"] as Doc, doc["template-icon-view-img"] as Doc,
            doc["template-icon-view-col"] as Doc, doc["template-icon-view-rtf"] as Doc], { title: "icon templates", _height: 75 }));
        } else {
            const templateIconsDoc = Cast(doc["template-icons"], Doc, null);
            DocListCastAsync(templateIconsDoc).then(list => templateIconsDoc.data = new List<Doc>([doc["template-icon-view"] as Doc, doc["template-icon-view-img"] as Doc,
            doc["template-icon-view-col"] as Doc, doc["template-icon-view-rtf"] as Doc]));
        }
        return doc["template-icons"] as Doc;
    }

    static creatorBtnDescriptors(doc: Doc): {
        title: string, label: string, icon: string, drag?: string, ignoreClick?: boolean,
        click?: string, ischecked?: string, activePen?: Doc, backgroundColor?: string, dragFactory?: Doc
    }[] {
        if (doc.emptyPresentation === undefined) {
            doc.emptyPresentation = Docs.Create.PresDocument(new List<Doc>(),
                { title: "Presentation", _viewType: CollectionViewType.Stacking, _LODdisable: true, _chromeStatus: "replaced", _showTitle: "title", boxShadow: "0 0" });
        }
        if (doc.emptyCollection === undefined) {
            doc.emptyCollection = Docs.Create.FreeformDocument([],
                { _nativeWidth: undefined, _nativeHeight: undefined, _LODdisable: true, _width: 150, _height: 100, title: "freeform" });
        }
        return [
            { title: "Drag a collection", label: "Col", icon: "folder", click: 'openOnRight(getCopy(this.dragFactory, true))', drag: 'getCopy(this.dragFactory, true)', dragFactory: doc.emptyCollection as Doc },
            { title: "Drag a web page", label: "Web", icon: "globe-asia", ignoreClick: true, drag: 'Docs.Create.WebDocument("", { title: "New Webpage" })' },
            { title: "Drag a cat image", label: "Img", icon: "cat", ignoreClick: true, drag: 'Docs.Create.ImageDocument("https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Cat03.jpg/1200px-Cat03.jpg", { _width: 250, _nativeWidth:250, title: "an image of a cat" })' },
            { title: "Drag a screenshot", label: "Grab", icon: "photo-video", ignoreClick: true, drag: 'Docs.Create.ScreenshotDocument("", { _width: 400, _height: 200, title: "screen snapshot" })' },
            { title: "Drag a webcam", label: "Cam", icon: "video", ignoreClick: true, drag: 'Docs.Create.WebCamDocument("", { _width: 400, _height: 400, title: "a test cam" })' },
            { title: "Drag a audio recorder", label: "Audio", icon: "microphone", ignoreClick: true, drag: `Docs.Create.AudioDocument("${nullAudio}", { _width: 200, title: "ready to record audio" })` },
            { title: "Drag a clickable button", label: "Btn", icon: "bolt", ignoreClick: true, drag: 'Docs.Create.ButtonDocument({ _width: 150, _height: 50, _xPadding:10, _yPadding: 10, title: "Button" })' },
            { title: "Drag a presentation view", label: "Prezi", icon: "tv", click: 'openOnRight(Doc.UserDoc().activePresentation = getCopy(this.dragFactory, true))', drag: `Doc.UserDoc().activePresentation = getCopy(this.dragFactory,true)`, dragFactory: doc.emptyPresentation as Doc },
            { title: "Drag a search box", label: "Query", icon: "search", ignoreClick: true, drag: 'Docs.Create.QueryDocument({ _width: 200, title: "an image of a cat" })' },
            { title: "Drag a scripting box", label: "Script", icon: "terminal", ignoreClick: true, drag: 'Docs.Create.ScriptingDocument(undefined, { _width: 200, _height: 250 title: "untitled script" })' },
            { title: "Drag an import folder", label: "Load", icon: "cloud-upload-alt", ignoreClick: true, drag: 'Docs.Create.DirectoryImportDocument({ title: "Directory Import", _width: 400, _height: 400 })' },
            { title: "Drag a mobile view", label: "Phone", icon: "phone", ignoreClick: true, drag: 'Doc.UserDoc().activeMobile' },
            { title: "Drag an instance of the device collection", label: "Buxton", icon: "globe-asia", ignoreClick: true, drag: 'Docs.Create.Buxton()' },
            // { title: "use pen", icon: "pen-nib", click: 'activatePen(this.activePen.inkPen = sameDocs(this.activePen.inkPen, this) ? undefined : this,2, this.backgroundColor)', backgroundColor: "blue", ischecked: `sameDocs(this.activePen.inkPen,  this)`, activePen: doc },
            // { title: "use highlighter", icon: "highlighter", click: 'activateBrush(this.activePen.inkPen = sameDocs(this.activePen.inkPen, this) ? undefined : this,20,this.backgroundColor)', backgroundColor: "yellow", ischecked: `sameDocs(this.activePen.inkPen, this)`, activePen: doc },
            // { title: "use stamp", icon: "stamp", click: 'activateStamp(this.activePen.inkPen = sameDocs(this.activePen.inkPen, this) ? undefined : this)', backgroundColor: "orange", ischecked: `sameDocs(this.activePen.inkPen, this)`, activePen: doc },
            // { title: "use eraser", icon: "eraser", click: 'activateEraser(this.activePen.inkPen = sameDocs(this.activePen.inkPen, this) ? undefined : this);', ischecked: `sameDocs(this.activePen.inkPen, this)`, backgroundColor: "pink", activePen: doc },
            // { title: "use drag", icon: "mouse-pointer", click: 'deactivateInk();this.activePen.inkPen = this;', ischecked: `sameDocs(this.activePen.inkPen, this)`, backgroundColor: "white", activePen: doc },
            { title: "Drag a document previewer", label: "Prev", icon: "expand", ignoreClick: true, drag: 'Docs.Create.DocumentDocument(ComputedField.MakeFunction("selectedDocs(this,this.excludeCollections,[_last_])?.[0]"), { _width: 250, _height: 250, title: "container" })' },
            { title: "Drag a Calculator REPL", label: "repl", icon: "calculator", click: 'addOverlayWindow("ScriptingRepl", { x: 300, y: 100, width: 200, height: 200, title: "Scripting REPL" })' },
        ];

    }

    // setup the "creator" buttons for the sidebar-- eg. the default set of draggable document creation tools
    static async setupCreatorButtons(doc: Doc) {
        let alreadyCreatedButtons: string[] = [];
        const dragCreatorSet = await Cast(doc.myItemCreators, Doc, null);
        if (dragCreatorSet) {
            const dragCreators = await Cast(dragCreatorSet.data, listSpec(Doc));
            if (dragCreators) {
                const dragDocs = await Promise.all(dragCreators);
                alreadyCreatedButtons = dragDocs.map(d => StrCast(d.title));
            }
        }
        const creatorBtns = CurrentUserUtils.creatorBtnDescriptors(doc).filter(d => !alreadyCreatedButtons?.includes(d.title)).
            map(data => Docs.Create.FontIconDocument({
                _nativeWidth: 100, _nativeHeight: 100, _width: 100, _height: 100,
                icon: data.icon,
                title: data.title,
                label: data.label,
                ignoreClick: data.ignoreClick,
                dropAction: data.click ? "copy" : undefined,
                onDragStart: data.drag ? ScriptField.MakeFunction(data.drag) : undefined,
                onClick: data.click ? ScriptField.MakeScript(data.click) : undefined,
                ischecked: data.ischecked ? ComputedField.MakeFunction(data.ischecked) : undefined,
                activePen: data.activePen,
                backgroundColor: data.backgroundColor, removeDropProperties: new List<string>(["dropAction"]),
                dragFactory: data.dragFactory,
            }));

        if (dragCreatorSet === undefined) {
            doc.myItemCreators = new PrefetchProxy(Docs.Create.MasonryDocument(creatorBtns, {
                title: "Basic Item Creators", _showTitle: "title", _xMargin: 0,
                _autoHeight: true, _width: 500, columnWidth: 35, ignoreClick: true, lockedPosition: true, _chromeStatus: "disabled",
                dropConverter: ScriptField.MakeScript("convertToButtons(dragData)", { dragData: DragManager.DocumentDragData.name }),
            }));
        } else {
            creatorBtns.forEach(nb => Doc.AddDocToList(doc.myItemCreators as Doc, "data", nb));
        }
        return doc.myItemCreators as Doc;
    }

    static setupMobileButtons(doc: Doc, buttons?: string[]) {
        const docProtoData: { title: string, icon: string, drag?: string, ignoreClick?: boolean, click?: string, ischecked?: string, activePen?: Doc, backgroundColor?: string, dragFactory?: Doc }[] = [
            { title: "record", icon: "microphone", ignoreClick: true, click: "FILL" },
            { title: "use pen", icon: "pen-nib", click: 'activatePen(this.activePen.inkPen = sameDocs(this.activePen.inkPen, this) ? undefined : this,2, this.backgroundColor)', backgroundColor: "blue", ischecked: `sameDocs(this.activePen.inkPen,  this)`, activePen: doc },
            { title: "use highlighter", icon: "highlighter", click: 'activateBrush(this.activePen.inkPen = sameDocs(this.activePen.inkPen, this) ? undefined : this,20,this.backgroundColor)', backgroundColor: "yellow", ischecked: `sameDocs(this.activePen.inkPen, this)`, activePen: doc },
            { title: "use eraser", icon: "eraser", click: 'activateEraser(this.activePen.inkPen = sameDocs(this.activePen.inkPen, this) ? undefined : this);', ischecked: `sameDocs(this.activePen.inkPen, this)`, backgroundColor: "pink", activePen: doc },
            { title: "use drag", icon: "mouse-pointer", click: 'deactivateInk();this.activePen.inkPen = this;', ischecked: `sameDocs(this.activePen.inkPen, this)`, backgroundColor: "white", activePen: doc },
            // { title: "draw", icon: "pen-nib", click: 'switchMobileView(setupMobileInkingDoc, renderMobileInking, onSwitchMobileInking);', ischecked: `sameDocs(this.activePen.inkPen, this)`, backgroundColor: "red", activePen: doc },
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
            { title: "use pen", icon: "pen-nib", pointerUp: "resetPen()", pointerDown: 'setPen(2, this.backgroundColor)', backgroundColor: "blue", ischecked: `sameDocs(this.activePen.inkPen,  this)`, activePen: doc },
            { title: "use highlighter", icon: "highlighter", pointerUp: "resetPen()", pointerDown: 'setPen(20, this.backgroundColor)', backgroundColor: "yellow", ischecked: `sameDocs(this.activePen.inkPen, this)`, activePen: doc },
            { title: "notepad", icon: "clipboard", pointerUp: "GestureOverlay.Instance.closeFloatingDoc()", pointerDown: 'GestureOverlay.Instance.openFloatingDoc(this.clipboard)', clipboard: Docs.Create.FreeformDocument([], { _width: 300, _height: 300 }), backgroundColor: "orange", ischecked: `sameDocs(this.activePen.inkPen, this)`, activePen: doc },
            { title: "interpret text", icon: "font", pointerUp: "setToolglass('none')", pointerDown: "setToolglass('inktotext')", backgroundColor: "orange", ischecked: `sameDocs(this.activePen.inkPen, this)`, activePen: doc },
            { title: "ignore gestures", icon: "signature", pointerUp: "setToolglass('none')", pointerDown: "setToolglass('ignoregesture')", backgroundColor: "green", ischecked: `sameDocs(this.activePen.inkPen, this)`, activePen: doc },
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

    // setup the Creator button which will display the creator panel.  This panel will include the drag creators and the color picker. 
    // when clicked, this panel will be displayed in the target container (ie, sidebarContainer)  
    static async setupToolsBtnPanel(doc: Doc, sidebarContainer: Doc) {
        // setup a masonry view of all he creators
        const creatorBtns = await CurrentUserUtils.setupCreatorButtons(doc);
        const templateBtns = CurrentUserUtils.setupUserTemplateButtons(doc);

        if (doc.myCreators === undefined) {
            doc.myCreators = new PrefetchProxy(Docs.Create.StackingDocument([creatorBtns, templateBtns], {
                title: "all Creators", _yMargin: 0, _autoHeight: true, _xMargin: 0,
                _width: 500, ignoreClick: true, lockedPosition: true, _chromeStatus: "disabled",
            }));
        }
        // setup a color picker
        if (doc.myColorPicker === undefined) {
            const color = Docs.Create.ColorDocument({
                title: "color picker", _width: 300, dropAction: "alias", forceActive: true, removeDropProperties: new List<string>(["dropAction", "forceActive"])
            });
            doc.myColorPicker = new PrefetchProxy(color);
        }

        if (doc["tabs-button-tools"] === undefined) {
            doc["tabs-button-tools"] = new PrefetchProxy(Docs.Create.ButtonDocument({
                _width: 35, _height: 25, title: "Tools", _fontSize: 10,
                letterSpacing: "0px", textTransform: "unset", borderRounding: "5px 5px 0px 0px", boxShadow: "3px 3px 0px rgb(34, 34, 34)",
                sourcePanel: new PrefetchProxy(Docs.Create.StackingDocument([doc.myCreators as Doc, doc.myColorPicker as Doc], {
                    _width: 500, lockedPosition: true, _chromeStatus: "disabled", title: "tools stack", forceActive: true
                })) as any as Doc,
                targetContainer: new PrefetchProxy(sidebarContainer) as any as Doc,
                onClick: ScriptField.MakeScript("this.targetContainer.proto = this.sourcePanel"),
            }));
        }
        (doc["tabs-button-tools"] as Doc).sourcePanel; // prefetch sourcePanel
        return doc["tabs-button-tools"] as Doc;
    }

    static setupWorkspaces(doc: Doc) {
        // setup workspaces library item
        if (doc.myWorkspaces === undefined) {
            doc.myWorkspaces = new PrefetchProxy(Docs.Create.TreeDocument([], {
                title: "WORKSPACES", _height: 100, forceActive: true, boxShadow: "0 0", lockedPosition: true,
            }));
        }
        const newWorkspace = ScriptField.MakeScript(`createNewWorkspace()`);
        (doc.myWorkspaces as Doc).contextMenuScripts = new List<ScriptField>([newWorkspace!]);
        (doc.myWorkspaces as Doc).contextMenuLabels = new List<string>(["Create New Workspace"]);

        return doc.myWorkspaces as Doc;
    }
    static setupDocumentCollection(doc: Doc) {
        if (doc.myDocuments === undefined) {
            doc.myDocuments = new PrefetchProxy(Docs.Create.TreeDocument([], {
                title: "DOCUMENTS", _height: 42, forceActive: true, boxShadow: "0 0", treeViewPreventOpen: true, lockedPosition: true,
            }));
        }
        return doc.myDocuments as Doc;
    }
    static setupRecentlyClosed(doc: Doc) {
        // setup Recently Closed library item
        if (doc.myRecentlyClosed === undefined) {
            doc.myRecentlyClosed = new PrefetchProxy(Docs.Create.TreeDocument([], {
                title: "RECENTLY CLOSED", _height: 75, forceActive: true, boxShadow: "0 0", treeViewPreventOpen: true, lockedPosition: true,
            }));
        }
        // this is equivalent to using PrefetchProxies to make sure the recentlyClosed doc is ready
        PromiseValue(Cast(doc.myRecentlyClosed, Doc)).then(recent => recent && PromiseValue(recent.data).then(DocListCast));
        const clearAll = ScriptField.MakeScript(`self.data = new List([])`);
        (doc.myRecentlyClosed as Doc).contextMenuScripts = new List<ScriptField>([clearAll!]);
        (doc.myRecentlyClosed as Doc).contextMenuLabels = new List<string>(["Clear All"]);

        return doc.myRecentlyClosed as Doc;
    }
    // setup the Library button which will display the library panel.  This panel includes a collection of workspaces, documents, and recently closed views
    static setupLibraryPanel(doc: Doc, sidebarContainer: Doc) {
        const workspaces = CurrentUserUtils.setupWorkspaces(doc);
        const documents = CurrentUserUtils.setupDocumentCollection(doc);
        const recentlyClosed = CurrentUserUtils.setupRecentlyClosed(doc);

        if (doc["tabs-button-library"] === undefined) {
            doc["tabs-button-library"] = new PrefetchProxy(Docs.Create.ButtonDocument({
                _width: 50, _height: 25, title: "Library", _fontSize: 10,
                letterSpacing: "0px", textTransform: "unset", borderRounding: "5px 5px 0px 0px", boxShadow: "3px 3px 0px rgb(34, 34, 34)",
                sourcePanel: new PrefetchProxy(Docs.Create.TreeDocument([workspaces, documents, recentlyClosed, doc], {
                    title: "Library", _xMargin: 5, _yMargin: 5, _gridGap: 5, forceActive: true, childDropAction: "move", lockedPosition: true, boxShadow: "0 0", dontRegisterChildren: true
                })) as any as Doc,
                targetContainer: new PrefetchProxy(sidebarContainer) as any as Doc,
                onClick: ScriptField.MakeScript("this.targetContainer.proto = this.sourcePanel;")
            }));
        }
        return doc["tabs-button-library"] as Doc;
    }

    // setup the Search button which will display the search panel.  
    static setupSearchBtnPanel(doc: Doc, sidebarContainer: Doc) {
        if (doc["tabs-button-search"] === undefined) {
            doc["tabs-button-search"] = new PrefetchProxy(Docs.Create.ButtonDocument({
                _width: 50, _height: 25, title: "Search", _fontSize: 10,
                letterSpacing: "0px", textTransform: "unset", borderRounding: "5px 5px 0px 0px", boxShadow: "3px 3px 0px rgb(34, 34, 34)",
                sourcePanel: new PrefetchProxy(Docs.Create.QueryDocument({ title: "search stack", })) as any as Doc,
                searchFileTypes: new List<string>([DocumentType.RTF, DocumentType.IMG, DocumentType.PDF, DocumentType.VID, DocumentType.WEB, DocumentType.SCRIPTING]),
                targetContainer: new PrefetchProxy(sidebarContainer) as any as Doc,
                lockedPosition: true,
                onClick: ScriptField.MakeScript("this.targetContainer.proto = this.sourcePanel")
            }));
        }
        return doc["tabs-button-search"] as Doc;
    }

    static setupSidebarContainer(doc: Doc) {
        if (doc["tabs-panelContainer"] === undefined) {
            const sidebarContainer = new Doc();
            sidebarContainer._chromeStatus = "disabled";
            sidebarContainer.onClick = ScriptField.MakeScript("freezeSidebar()");
            doc["tabs-panelContainer"] = new PrefetchProxy(sidebarContainer);
        }
        return doc["tabs-panelContainer"] as Doc;
    }

    // setup the list of sidebar mode buttons which determine what is displayed in the sidebar
    static async setupSidebarButtons(doc: Doc) {
        const sidebarContainer = CurrentUserUtils.setupSidebarContainer(doc);
        const toolsBtn = await CurrentUserUtils.setupToolsBtnPanel(doc, sidebarContainer);
        const libraryBtn = CurrentUserUtils.setupLibraryPanel(doc, sidebarContainer);
        const searchBtn = CurrentUserUtils.setupSearchBtnPanel(doc, sidebarContainer);

        // Finally, setup the list of buttons to display in the sidebar
        if (doc["tabs-buttons"] === undefined) {
            doc["tabs-buttons"] = new PrefetchProxy(Docs.Create.StackingDocument([searchBtn, libraryBtn, toolsBtn], {
                _width: 500, _height: 80, boxShadow: "0 0", _pivotField: "title", hideHeadings: true, ignoreClick: true, _chromeStatus: "view-mode",
                title: "sidebar btn row stack", backgroundColor: "dimGray",
            }));
            (toolsBtn.onClick as ScriptField).script.run({ this: toolsBtn });
        }
    }

    static blist = (opts: DocumentOptions, docs: Doc[]) => new PrefetchProxy(Docs.Create.LinearDocument(docs, {
        ...opts,
        _gridGap: 5, _xMargin: 5, _yMargin: 5, _height: 42, _width: 100, boxShadow: "0 0", forceActive: true,
        dropConverter: ScriptField.MakeScript("convertToButtons(dragData)", { dragData: DragManager.DocumentDragData.name }),
        backgroundColor: "black", treeViewPreventOpen: true, lockedPosition: true, _chromeStatus: "disabled", linearViewIsExpanded: true
    })) as any as Doc

    static ficon = (opts: DocumentOptions) => new PrefetchProxy(Docs.Create.FontIconDocument({
        ...opts,
        dropAction: "alias", removeDropProperties: new List<string>(["dropAction"]), _nativeWidth: 100, _nativeHeight: 100, _width: 100, _height: 100
    })) as any as Doc

    /// sets up the default list of buttons to be shown in the expanding button menu at the bottom of the Dash window
    static setupDockedButtons(doc: Doc) {
        if (doc["dockedBtn-pen"] === undefined) {
            doc["dockedBtn-pen"] = CurrentUserUtils.ficon({
                onClick: ScriptField.MakeScript("activatePen(this.activePen.inkPen = sameDocs(this.activePen.inkPen, this) ? undefined : this,2, this.backgroundColor)"),
                author: "systemTemplates", title: "ink mode", icon: "pen-nib", ischecked: ComputedField.MakeFunction(`sameDocs(this.activePen.inkPen,  this)`), activePen: doc
            });
        }
        if (doc["dockedBtn-undo"] === undefined) {
            doc["dockedBtn-undo"] = CurrentUserUtils.ficon({ onClick: ScriptField.MakeScript("undo()"), title: "undo button", icon: "undo-alt" });
        }
        if (doc["dockedBtn-redo"] === undefined) {
            doc["dockedBtn-redo"] = CurrentUserUtils.ficon({ onClick: ScriptField.MakeScript("redo()"), title: "redo button", icon: "redo-alt" });
        }
        if (doc.dockedBtns === undefined) {
            doc.dockedBtns = CurrentUserUtils.blist({ title: "docked buttons", ignoreClick: true }, [doc["dockedBtn-undo"] as Doc, doc["dockedBtn-redo"] as Doc, doc["dockedBtn-pen"] as Doc]);
        }
    }
    // sets up the default set of documents to be shown in the Overlay layer
    static setupOverlays(doc: Doc) {
        if (doc.myOverlayDocuments === undefined) {
            doc.myOverlayDocuments = new PrefetchProxy(Docs.Create.FreeformDocument([], { title: "overlay documents", backgroundColor: "#aca3a6" }));
        }
    }

    // the initial presentation Doc to use
    static setupDefaultPresentation(doc: Doc) {
        if (doc["template-presentation"] === undefined) {
            doc["template-presentation"] = new PrefetchProxy(Docs.Create.PresElementBoxDocument({
                title: "pres element template", backgroundColor: "transparent", _xMargin: 5, _height: 46, isTemplateDoc: true, isTemplateForField: "data"
            }));
        }
        if (doc.activePresentation === undefined) {
            doc.activePresentation = Docs.Create.PresDocument(new List<Doc>(), {
                title: "Presentation", _viewType: CollectionViewType.Stacking,
                _LODdisable: true, _chromeStatus: "replaced", _showTitle: "title", boxShadow: "0 0"
            });
        }
    }

    static setupRightSidebar(doc: Doc) {
        if (doc.rightSidebarCollection === undefined) {
            doc.rightSidebarCollection = new PrefetchProxy(Docs.Create.StackingDocument([], { title: "Right Sidebar" }));
        }
    }

    static setupClickEditorTemplates(doc: Doc) {
        if (doc.childClickFuncs === undefined) {
            const openInTarget = Docs.Create.ScriptingDocument(ScriptField.MakeScript(
                "docCast(thisContainer.target).then((target) => { target && docCast(this.source).then((source) => { target.proto.data = new List([source || this]); } ); } )",
                { target: Doc.name }), { title: "On Child Clicked (open in target)", _width: 300, _height: 200 });

            doc.childClickFuncs = Docs.Create.TreeDocument([openInTarget], { title: "on Child Click function templates" });
        }
        // this is equivalent to using PrefetchProxies to make sure all the childClickFuncs have been retrieved.
        PromiseValue(Cast(doc.childClickFuncs, Doc)).then(func => func && PromiseValue(func.data).then(DocListCast));

        if (doc.clickFuncs === undefined) {
            const onClick = Docs.Create.ScriptingDocument(undefined, {
                title: "onClick", "onClick-rawScript": "console.log('click')",
                isTemplateDoc: true, isTemplateForField: "onClick", _width: 300, _height: 200
            }, "onClick");
            const onCheckedClick = Docs.Create.ScriptingDocument(undefined, {
                title: "onCheckedClick", "onCheckedClick-rawScript": "console.log(heading + checked + containingTreeView)", "onCheckedClick-params": new List<string>(["heading", "checked", "containingTreeView"]), isTemplateDoc: true, isTemplateForField: "onCheckedClick", _width: 300, _height: 200
            }, "onCheckedClick");
            doc.clickFuncs = Docs.Create.TreeDocument([onClick, onCheckedClick], { title: "onClick funcs" });
        }
        PromiseValue(Cast(doc.clickFuncs, Doc)).then(func => func && PromiseValue(func.data).then(DocListCast));

        return doc.clickFuncs as Doc;
    }

    static async updateUserDocument(doc: Doc) {
        new InkingControl();
        doc.title = Doc.CurrentUserEmail;
        doc.activePen = doc;
        this.setupDefaultIconTemplates(doc);  // creates a set of icon templates triggered by the document deoration icon
        this.setupDocTemplates(doc); // sets up the template menu of templates
        this.setupRightSidebar(doc);  // sets up the right sidebar collection for mobile upload documents and sharing
        this.setupOverlays(doc);  // documents in overlay layer 
        this.setupDockedButtons(doc);  // the bottom bar of font icons
        this.setupDefaultPresentation(doc); // presentation that's initially triggered
        await this.setupSidebarButtons(doc); // the pop-out left sidebar of tools/panels
        doc.globalLinkDatabase = Docs.Prototypes.MainLinkDocument();

        // setup reactions to change the highlights on the undo/redo buttons -- would be better to encode this in the undo/redo buttons, but the undo/redo stacks are not wired up that way yet
        doc["dockedBtn-undo"] && reaction(() => UndoManager.undoStack.slice(), () => Doc.GetProto(doc["dockedBtn-undo"] as Doc).opacity = UndoManager.CanUndo() ? 1 : 0.4, { fireImmediately: true });
        doc["dockedBtn-redo"] && reaction(() => UndoManager.redoStack.slice(), () => Doc.GetProto(doc["dockedBtn-redo"] as Doc).opacity = UndoManager.CanRedo() ? 1 : 0.4, { fireImmediately: true });

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
    }
}

Scripting.addGlobal(function setupMobileInkingDoc(userDoc: Doc) { return CurrentUserUtils.setupMobileInkingDoc(userDoc); });
Scripting.addGlobal(function setupMobileUploadDoc(userDoc: Doc) { return CurrentUserUtils.setupMobileUploadDoc(userDoc); });
Scripting.addGlobal(function createNewWorkspace() { return MainView.Instance.createNewWorkspace(); });