import { computed, observable, reaction } from "mobx";
import * as rp from 'request-promise';
import { Utils } from "../../Utils";
import { DocServer } from "../DocServer";
import { Docs, DocumentOptions, DocUtils } from "../documents/Documents";
import { UndoManager } from "./UndoManager";
import { Doc, DocListCast, DocListCastAsync, DataSym } from "../../fields/Doc";
import { List } from "../../fields/List";
import { listSpec } from "../../fields/Schema";
import { ScriptField, ComputedField } from "../../fields/ScriptField";
import { Cast, PromiseValue, StrCast, NumCast, BoolCast } from "../../fields/Types";
import { nullAudio } from "../../fields/URLField";
import { DragManager } from "./DragManager";
import { Scripting } from "./Scripting";
import { CollectionViewType, CollectionView } from "../views/collections/CollectionView";
import { makeTemplate } from "./DropConverter";
import { RichTextField } from "../../fields/RichTextField";
import { PrefetchProxy } from "../../fields/Proxy";
import { FormattedTextBox } from "../views/nodes/formattedText/FormattedTextBox";
import { MainView } from "../views/MainView";
import { DocumentType } from "../documents/DocumentTypes";
import { SchemaHeaderField } from "../../fields/SchemaHeaderField";
import { DimUnit } from "../views/collections/collectionMulticolumn/CollectionMulticolumnView";
import { LabelBox } from "../views/nodes/LabelBox";
import { LinkManager } from "./LinkManager";
import { Id } from "../../fields/FieldSymbols";

export class CurrentUserUtils {
    private static curr_id: string;
    //TODO tfs: these should be temporary...
    private static mainDocId: string | undefined;

    public static get id() { return this.curr_id; }
    public static get MainDocId() { return this.mainDocId; }
    public static set MainDocId(id: string | undefined) { this.mainDocId = id; }
    @computed public static get UserDocument() { return Doc.UserDoc(); }

    @observable public static GuestTarget: Doc | undefined;
    @observable public static GuestWorkspace: Doc | undefined;
    @observable public static GuestMobile: Doc | undefined;

    @observable public static propertiesWidth: number = 0;

    // sets up the default User Templates - slideView, queryView, descriptionView
    static setupUserTemplateButtons(doc: Doc) {
        if (doc["template-button-query"] === undefined) {
            const queryTemplate = Docs.Create.MulticolumnDocument(
                [
                    Docs.Create.SearchDocument({ _viewType: CollectionViewType.Schema, ignoreClick: true, forceActive: true, lockedPosition: true, title: "query", _height: 200, system: true }),
                    Docs.Create.FreeformDocument([], { title: "data", _height: 100, system: true })
                ],
                { _width: 400, _height: 300, title: "queryView", _chromeStatus: "disabled", _xMargin: 3, _yMargin: 3, hideFilterView: true, system: true }
            );
            queryTemplate.isTemplateDoc = makeTemplate(queryTemplate);
            doc["template-button-query"] = CurrentUserUtils.ficon({
                onDragStart: ScriptField.MakeFunction('getCopy(this.dragFactory, true)'),
                dragFactory: new PrefetchProxy(queryTemplate) as any as Doc,
                removeDropProperties: new List<string>(["dropAction"]), title: "query view", icon: "question-circle"
            });
        }
        // Prototype for mobile button (not sure if 'Advanced Item Prototypes' is ideal location)
        if (doc["template-mobile-button"] === undefined) {
            const queryTemplate = this.mobileButton({
                title: "NEW MOBILE BUTTON",
                onClick: undefined,
            },
                [this.ficon({
                    ignoreClick: true,
                    icon: "mobile",
                    backgroundColor: "rgba(0,0,0,0)"
                }),
                this.mobileTextContainer({},
                    [this.mobileButtonText({}, "NEW MOBILE BUTTON"), this.mobileButtonInfo({}, "You can customize this button and make it your own.")])]);
            doc["template-mobile-button"] = CurrentUserUtils.ficon({
                onDragStart: ScriptField.MakeFunction('getCopy(this.dragFactory, true)'),
                dragFactory: new PrefetchProxy(queryTemplate) as any as Doc,
                removeDropProperties: new List<string>(["dropAction"]), title: "mobile button", icon: "mobile"
            });
        }

        if (doc["template-button-slides"] === undefined) {
            const slideTemplate = Docs.Create.MultirowDocument(
                [
                    Docs.Create.MulticolumnDocument([], { title: "data", _height: 200, system: true }),
                    Docs.Create.TextDocument("", { title: "text", _height: 100, system: true })
                ],
                { _width: 400, _height: 300, title: "slideView", _chromeStatus: "disabled", _xMargin: 3, _yMargin: 3, hideFilterView: true, system: true }
            );
            slideTemplate.isTemplateDoc = makeTemplate(slideTemplate);
            doc["template-button-slides"] = CurrentUserUtils.ficon({
                onDragStart: ScriptField.MakeFunction('getCopy(this.dragFactory, true)'),
                dragFactory: new PrefetchProxy(slideTemplate) as any as Doc,
                removeDropProperties: new List<string>(["dropAction"]), title: "presentation slide", icon: "address-card"
            });
        }

        if (doc["template-button-description"] === undefined) {
            const descriptionTemplate = Doc.MakeDelegate(Docs.Create.TextDocument(" ", { title: "header", _height: 100, system: true }, "header")); // text needs to be a space to allow templateText to be created
            descriptionTemplate[DataSym].layout =
                "<div>" +
                "    <FormattedTextBox {...props} height='{this._headerHeight||75}px' background='{this._headerColor||`orange`}' fieldKey={'header'}/>" +
                "    <FormattedTextBox {...props} position='absolute' top='{(this._headerHeight||75)*scale}px' height='calc({100/scale}% - {this._headerHeight||75}px)' fieldKey={'text'}/>" +
                "</div>";
            (descriptionTemplate.proto as Doc).isTemplateDoc = makeTemplate(descriptionTemplate.proto as Doc, true, "descriptionView");

            doc["template-button-description"] = CurrentUserUtils.ficon({
                onDragStart: ScriptField.MakeFunction('getCopy(this.dragFactory, true)'),
                dragFactory: new PrefetchProxy(descriptionTemplate) as any as Doc,
                removeDropProperties: new List<string>(["dropAction"]), title: "description view", icon: "window-maximize"
            });
        }

        if (doc["template-button-link"] === undefined) {  // set _backgroundColor to transparent to prevent link dot from obscuring document it's attached to.
            const linkTemplate = Doc.MakeDelegate(Docs.Create.TextDocument(" ", { title: "header", _height: 100, system: true }, "header")); // text needs to be a space to allow templateText to be created
            Doc.GetProto(linkTemplate).layout =
                "<div>" +
                "    <FormattedTextBox {...props} height='{this._headerHeight||75}px' background='{this._headerColor||`lightGray`}' fieldKey={'header'}/>" +
                "    <FormattedTextBox {...props} position='absolute' top='{(this._headerHeight||75)*scale}px' height='calc({100/scale}% - {this._headerHeight||75}px)' fieldKey={'text'}/>" +
                "</div>";
            (linkTemplate.proto as Doc).isTemplateDoc = makeTemplate(linkTemplate.proto as Doc, true, "linkView");

            const rtf2 = {
                doc: {
                    type: "doc", content: [
                        {
                            type: "paragraph",
                            content: [{
                                type: "dashField",
                                attrs: {
                                    fieldKey: "src",
                                    hideKey: false
                                }
                            }]
                        },
                        { type: "paragraph" },
                        {
                            type: "paragraph",
                            content: [{
                                type: "dashField",
                                attrs: {
                                    fieldKey: "dst",
                                    hideKey: false
                                }
                            }]
                        }]
                },
                selection: { type: "text", anchor: 1, head: 1 },
                storedMarks: []
            };
            linkTemplate.header = new RichTextField(JSON.stringify(rtf2), "");

            doc["template-button-link"] = CurrentUserUtils.ficon({
                onDragStart: ScriptField.MakeFunction('getCopy(this.dragFactory, true)'),
                dragFactory: new PrefetchProxy(linkTemplate) as any as Doc,
                removeDropProperties: new List<string>(["dropAction"]), title: "link view", icon: "window-maximize"
            });
        }

        if (doc["template-button-switch"] === undefined) {
            const { FreeformDocument, MulticolumnDocument, TextDocument } = Docs.Create;

            const yes = FreeformDocument([], { title: "yes", _height: 35, _width: 50, _dimUnit: DimUnit.Pixel, _dimMagnitude: 40, system: true });
            const name = TextDocument("name", { title: "name", _height: 35, _width: 70, _dimMagnitude: 1, system: true });
            const no = FreeformDocument([], { title: "no", _height: 100, _width: 100, system: true });
            const labelTemplate = {
                doc: {
                    type: "doc", content: [{
                        type: "paragraph",
                        content: [{ type: "dashField", attrs: { fieldKey: "PARAMS", hideKey: true } }]
                    }]
                },
                selection: { type: "text", anchor: 1, head: 1 },
                storedMarks: []
            };
            Doc.GetProto(name).text = new RichTextField(JSON.stringify(labelTemplate), "PARAMS");
            Doc.GetProto(yes).backgroundColor = ComputedField.MakeFunction("self[this.PARAMS] ? 'green':'red'");
            // Doc.GetProto(no).backgroundColor = ComputedField.MakeFunction("!self[this.PARAMS] ? 'red':'white'");
            // Doc.GetProto(yes).onClick = ScriptField.MakeScript("self[this.PARAMS] = true");
            Doc.GetProto(yes).onClick = ScriptField.MakeScript("self[this.PARAMS] = !self[this.PARAMS]");
            // Doc.GetProto(no).onClick = ScriptField.MakeScript("self[this.PARAMS] = false");
            const box = MulticolumnDocument([/*no, */ yes, name], { title: "value", _width: 120, _height: 35, system: true });
            box.isTemplateDoc = makeTemplate(box, true, "switch");

            doc["template-button-switch"] = CurrentUserUtils.ficon({
                onDragStart: ScriptField.MakeFunction('getCopy(this.dragFactory, true)'),
                dragFactory: new PrefetchProxy(box) as any as Doc,
                removeDropProperties: new List<string>(["dropAction"]), title: "data switch", icon: "toggle-on", system: true
            });
        }

        if (doc["template-button-detail"] === undefined) {
            const { TextDocument, MasonryDocument, CarouselDocument } = Docs.Create;

            const openInTarget = ScriptField.MakeScript("openOnRight(self.doubleClickView)");
            const carousel = CarouselDocument([], {
                title: "data", _height: 350, _itemIndex: 0, "_carousel-caption-xMargin": 10, "_carousel-caption-yMargin": 10,
                onChildDoubleClick: openInTarget, backgroundColor: "#9b9b9b3F", system: true
            });

            const details = TextDocument("", { title: "details", _height: 350, _autoHeight: true, system: true });
            const short = TextDocument("", { title: "shortDescription", treeViewOpen: true, treeViewExpandedView: "layout", _height: 100, _autoHeight: true, system: true });
            const long = TextDocument("", { title: "longDescription", treeViewOpen: false, treeViewExpandedView: "layout", _height: 350, _autoHeight: true, system: true });

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
            };
            details.text = new RichTextField(JSON.stringify(detailedTemplate), buxtonFieldKeys.join(" "));

            const shared = { _chromeStatus: "disabled", _autoHeight: true, _xMargin: 0 };
            const detailViewOpts = { title: "detailView", _width: 300, _fontFamily: "Arial", _fontSize: "12pt" };
            const descriptionWrapperOpts = { title: "descriptions", _height: 300, _columnWidth: -1, treeViewHideTitle: true, _pivotField: "title", system: true };

            const descriptionWrapper = MasonryDocument([details, short, long], { ...shared, ...descriptionWrapperOpts });
            descriptionWrapper._columnHeaders = new List<SchemaHeaderField>([
                new SchemaHeaderField("[A Short Description]", "dimGray", undefined, undefined, undefined, false),
                new SchemaHeaderField("[Long Description]", "dimGray", undefined, undefined, undefined, true),
                new SchemaHeaderField("[Details]", "dimGray", undefined, undefined, undefined, true),
            ]);
            const detailView = Docs.Create.StackingDocument([carousel, descriptionWrapper], { ...shared, ...detailViewOpts, system: true });
            detailView.isTemplateDoc = makeTemplate(detailView);

            details.title = "Details";
            short.title = "A Short Description";
            long.title = "Long Description";

            doc["template-button-detail"] = CurrentUserUtils.ficon({
                onDragStart: ScriptField.MakeFunction('getCopy(this.dragFactory, true)'),
                dragFactory: new PrefetchProxy(detailView) as any as Doc,
                removeDropProperties: new List<string>(["dropAction"]), title: "detail view", icon: "window-maximize", system: true
            });
        }

        const requiredTypes = [
            doc["template-button-slides"] as Doc,
            doc["template-button-description"] as Doc,
            doc["template-button-query"] as Doc,
            doc["template-mobile-button"] as Doc,
            doc["template-button-detail"] as Doc,
            doc["template-button-link"] as Doc,
            doc["template-button-switch"] as Doc];
        if (doc["template-buttons"] === undefined) {
            doc["template-buttons"] = new PrefetchProxy(Docs.Create.MasonryDocument(requiredTypes, {
                title: "Advanced Item Prototypes", _xMargin: 0, _showTitle: "title",
                hidden: ComputedField.MakeFunction("self.userDoc.noviceMode") as any,
                userDoc: doc,
                _autoHeight: true, _width: 500, _columnWidth: 35, ignoreClick: true, lockedPosition: true, _chromeStatus: "disabled",
                dropConverter: ScriptField.MakeScript("convertToButtons(dragData)", { dragData: DragManager.DocumentDragData.name }), system: true
            }));
        } else {
            const curButnTypes = Cast(doc["template-buttons"], Doc, null);
            DocListCastAsync(curButnTypes.data).then(async curBtns => {
                await Promise.all(curBtns!);
                requiredTypes.map(btype => Doc.AddDocToList(curButnTypes, "data", btype));
            });
        }
        return doc["template-buttons"] as Doc;
    }

    // setup the different note type skins
    static setupNoteTemplates(doc: Doc) {
        if (doc["template-note-Note"] === undefined) {
            const noteView = Docs.Create.TextDocument("", { title: "text", style: "Note", isTemplateDoc: true, backgroundColor: "yellow", system: true });
            noteView.isTemplateDoc = makeTemplate(noteView, true, "Note");
            doc["template-note-Note"] = new PrefetchProxy(noteView);
        }
        if (doc["template-note-Idea"] === undefined) {
            const noteView = Docs.Create.TextDocument("", { title: "text", style: "Idea", backgroundColor: "pink", system: true });
            noteView.isTemplateDoc = makeTemplate(noteView, true, "Idea");
            doc["template-note-Idea"] = new PrefetchProxy(noteView);
        }
        if (doc["template-note-Topic"] === undefined) {
            const noteView = Docs.Create.TextDocument("", { title: "text", style: "Topic", backgroundColor: "lightBlue", system: true });
            noteView.isTemplateDoc = makeTemplate(noteView, true, "Topic");
            doc["template-note-Topic"] = new PrefetchProxy(noteView);
        }
        if (doc["template-note-Todo"] === undefined) {
            const noteView = Docs.Create.TextDocument("", {
                title: "text", style: "Todo", backgroundColor: "orange", _autoHeight: false, _height: 100, _showCaption: "caption",
                layout: FormattedTextBox.LayoutString("Todo"), caption: RichTextField.DashField("taskStatus"), system: true
            });
            noteView.isTemplateDoc = makeTemplate(noteView, true, "Todo");
            doc["template-note-Todo"] = new PrefetchProxy(noteView);
        }
        const taskStatusValues = [
            { title: "todo", _backgroundColor: "blue", color: "white", system: true },
            { title: "in progress", _backgroundColor: "yellow", color: "black", system: true },
            { title: "completed", _backgroundColor: "green", color: "white", system: true }
        ];
        if (doc.fieldTypes === undefined) {
            doc.fieldTypes = Docs.Create.TreeDocument([], { title: "field enumerations", system: true });
            DocUtils.addFieldEnumerations(Doc.GetProto(doc["template-note-Todo"] as any as Doc), "taskStatus", taskStatusValues);
        }

        if (doc["template-notes"] === undefined) {
            doc["template-notes"] = new PrefetchProxy(Docs.Create.TreeDocument([doc["template-note-Note"] as any as Doc,
            doc["template-note-Idea"] as any as Doc, doc["template-note-Topic"] as any as Doc, doc["template-note-Todo"] as any as Doc],
                { title: "Note Layouts", _height: 75, system: true }));
        } else {
            const curNoteTypes = Cast(doc["template-notes"], Doc, null);
            const requiredTypes = [doc["template-note-Note"] as any as Doc, doc["template-note-Idea"] as any as Doc,
            doc["template-note-Topic"] as any as Doc, doc["template-note-Todo"] as any as Doc];
            DocListCastAsync(curNoteTypes.data).then(async curNotes => {
                await Promise.all(curNotes!);
                requiredTypes.map(ntype => Doc.AddDocToList(curNoteTypes, "data", ntype));
            });
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
                title: "template layouts", _xPadding: 0, system: true,
                dropConverter: ScriptField.MakeScript("convertToButtons(dragData)", { dragData: DragManager.DocumentDragData.name })
            }));
        }
    }

    // setup templates for different document types when they are iconified from Document Decorations
    static setupDefaultIconTemplates(doc: Doc) {
        if (doc["template-icon-view"] === undefined) {
            const iconView = Docs.Create.LabelDocument({
                title: "icon", textTransform: "unset", letterSpacing: "unset", layout: LabelBox.LayoutString("title"), _backgroundColor: "dimGray",
                _width: 150, _height: 70, _xPadding: 10, _yPadding: 10, isTemplateDoc: true, onDoubleClick: ScriptField.MakeScript("deiconifyView(self)"), system: true
            });
            //  Docs.Create.TextDocument("", {
            //     title: "icon", _width: 150, _height: 30, isTemplateDoc: true, onDoubleClick: ScriptField.MakeScript("deiconifyView(self)")
            // });
            // Doc.GetProto(iconView).icon = new RichTextField('{"doc":{"type":"doc","content":[{"type":"paragraph","attrs":{"align":null,"color":null,"id":null,"indent":null,"inset":null,"lineSpacing":null,"paddingBottom":null,"paddingTop":null},"content":[{"type":"dashField","attrs":{"fieldKey":"title","docid":""}}]}]},"selection":{"type":"text","anchor":2,"head":2},"storedMarks":[]}', "");
            iconView.isTemplateDoc = makeTemplate(iconView);
            doc["template-icon-view"] = new PrefetchProxy(iconView);
        }
        if (doc["template-icon-view-rtf"] === undefined) {
            const iconRtfView = Docs.Create.LabelDocument({
                title: "icon_" + DocumentType.RTF, textTransform: "unset", letterSpacing: "unset", layout: LabelBox.LayoutString("text"),
                _width: 150, _height: 70, _xPadding: 10, _yPadding: 10, isTemplateDoc: true, onDoubleClick: ScriptField.MakeScript("deiconifyView(self)"), system: true
            });
            iconRtfView.isTemplateDoc = makeTemplate(iconRtfView, true, "icon_" + DocumentType.RTF);
            doc["template-icon-view-rtf"] = new PrefetchProxy(iconRtfView);
        }
        if (doc["template-icon-view-button"] === undefined) {
            const iconBtnView = Docs.Create.FontIconDocument({
                title: "icon_" + DocumentType.BUTTON, _nativeHeight: 30, _nativeWidth: 30,
                _width: 30, _height: 30, isTemplateDoc: true, onDoubleClick: ScriptField.MakeScript("deiconifyView(self)"), system: true
            });
            iconBtnView.isTemplateDoc = makeTemplate(iconBtnView, true, "icon_" + DocumentType.BUTTON);
            doc["template-icon-view-button"] = new PrefetchProxy(iconBtnView);
        }
        if (doc["template-icon-view-img"] === undefined) {
            const iconImageView = Docs.Create.ImageDocument("http://www.cs.brown.edu/~bcz/face.gif", {
                title: "data", _width: 50, isTemplateDoc: true, onDoubleClick: ScriptField.MakeScript("deiconifyView(self)"), system: true
            });
            iconImageView.isTemplateDoc = makeTemplate(iconImageView, true, "icon_" + DocumentType.IMG);
            doc["template-icon-view-img"] = new PrefetchProxy(iconImageView);
        }
        if (doc["template-icon-view-col"] === undefined) {
            const iconColView = Docs.Create.TreeDocument([], { title: "data", _width: 180, _height: 80, onDoubleClick: ScriptField.MakeScript("deiconifyView(self)"), system: true });
            iconColView.isTemplateDoc = makeTemplate(iconColView, true, "icon_" + DocumentType.COL);
            doc["template-icon-view-col"] = new PrefetchProxy(iconColView);
        }
        if (doc["template-icons"] === undefined) {
            doc["template-icons"] = new PrefetchProxy(Docs.Create.TreeDocument([doc["template-icon-view"] as Doc, doc["template-icon-view-img"] as Doc, doc["template-icon-view-button"] as Doc,
            doc["template-icon-view-col"] as Doc, doc["template-icon-view-rtf"] as Doc, doc["template-icon-view-pdf"] as Doc], { title: "icon templates", _height: 75, system: true }));
        } else {
            const templateIconsDoc = Cast(doc["template-icons"], Doc, null);
            const requiredTypes = [doc["template-icon-view"] as Doc, doc["template-icon-view-img"] as Doc, doc["template-icon-view-button"] as Doc,
            doc["template-icon-view-col"] as Doc, doc["template-icon-view-rtf"] as Doc];
            DocListCastAsync(templateIconsDoc.data).then(async curIcons => {
                await Promise.all(curIcons!);
                requiredTypes.map(ntype => Doc.AddDocToList(templateIconsDoc, "data", ntype));
            });
        }
        return doc["template-icons"] as Doc;
    }

    static creatorBtnDescriptors(doc: Doc): {
        title: string, toolTip: string, icon: string, drag?: string, ignoreClick?: boolean,
        click?: string, ischecked?: string, activeInkPen?: Doc, backgroundColor?: string, dragFactory?: Doc, noviceMode?: boolean, clickFactory?: Doc
    }[] {
        if (doc.emptyPresentation === undefined) {
            doc.emptyPresentation = Docs.Create.PresDocument(new List<Doc>(),
                { title: "Presentation", _viewType: CollectionViewType.Stacking, _width: 400, _height: 500, targetDropAction: "alias", _chromeStatus: "replaced", boxShadow: "0 0", system: true });
        }
        if (doc.emptyCollection === undefined) {
            doc.emptyCollection = Docs.Create.FreeformDocument([],
                { _nativeWidth: undefined, _nativeHeight: undefined, _width: 150, _height: 100, title: "freeform", system: true });
        }
        if (doc.emptyPane === undefined) {
            doc.emptyPane = Docs.Create.FreeformDocument([], { _nativeWidth: undefined, _nativeHeight: undefined, title: "Untitled Collection", system: true });
        }
        if (doc.emptyComparison === undefined) {
            doc.emptyComparison = Docs.Create.ComparisonDocument({ title: "compare", _width: 300, _height: 300, system: true });
        }
        if (doc.emptyScript === undefined) {
            doc.emptyScript = Docs.Create.ScriptingDocument(undefined, { _width: 200, _height: 250, title: "script", system: true });
        }
        if (doc.emptyScreenshot === undefined) {
            doc.emptyScreenshot = Docs.Create.ScreenshotDocument("", { _width: 400, _height: 200, title: "screen snapshot", system: true });
        }
        if (doc.emptyAudio === undefined) {
            doc.emptyAudio = Docs.Create.AudioDocument(nullAudio, { _width: 200, title: "ready to record audio", system: true });
        }
        if (doc.emptyImage === undefined) {
            doc.emptyImage = Docs.Create.ImageDocument("https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Cat03.jpg/1200px-Cat03.jpg", { _width: 250, _nativeWidth: 250, title: "an image of a cat", system: true });
        }
        if (doc.emptyButton === undefined) {
            doc.emptyButton = Docs.Create.ButtonDocument({ _width: 150, _height: 50, _xPadding: 10, _yPadding: 10, title: "Button", system: true });
        }
        if (doc.emptyDocHolder === undefined) {
            doc.emptyDocHolder = Docs.Create.DocumentDocument(
                ComputedField.MakeFunction("selectedDocs(this,this.excludeCollections,[_last_])?.[0]") as any,
                { _width: 250, _height: 250, title: "container", system: true });
        }
        if (doc.emptyWebpage === undefined) {
            doc.emptyWebpage = Docs.Create.WebDocument("", { title: "webpage", _nativeWidth: 850, _nativeHeight: 962, _width: 400, UseCors: true, system: true });
        }
        if (doc.activeMobileMenu === undefined) {
            this.setupActiveMobileMenu(doc);
        }
        return [
            { toolTip: "Tap to create a collection in a new pane, drag for a collection", title: "Col", icon: "folder", click: 'openOnRight(getCopy(this.clickFactory, true))', drag: 'getCopy(this.dragFactory, true)', dragFactory: doc.emptyCollection as Doc, noviceMode: true, clickFactory: doc.emptyPane as Doc, },
            { toolTip: "Tap to create a webpage in a new pane, drag for a webpage", title: "Web", icon: "globe-asia", click: 'openOnRight(getCopy(this.dragFactory, true))', drag: 'getCopy(this.dragFactory, true)', dragFactory: doc.emptyWebpage as Doc, noviceMode: true },
            { toolTip: "Tap to create a cat image in a new pane, drag for a cat image", title: "Image", icon: "cat", click: 'openOnRight(getCopy(this.dragFactory, true))', drag: 'getCopy(this.dragFactory, true)', dragFactory: doc.emptyImage as Doc },
            { toolTip: "Tap to create a comparison box in a new pane, drag for a comparison box", title: "Compare", icon: "columns", click: 'openOnRight(getCopy(this.dragFactory, true))', drag: 'getCopy(this.dragFactory, true)', dragFactory: doc.emptyComparison as Doc, noviceMode: true },
            { toolTip: "Tap to create a screen grabber in a new pane, drag for a screen grabber", title: "Grab", icon: "photo-video", click: 'openOnRight(getCopy(this.dragFactory, true))', drag: 'getCopy(this.dragFactory, true)', dragFactory: doc.emptyScreenshot as Doc },
            //  { title: "Drag a webcam", title: "Cam", icon: "video", ignoreClick: true, drag: 'Docs.Create.WebCamDocument("", { _width: 400, _height: 400, title: "a test cam" })' },
            { toolTip: "Tap to create an audio recorder in a new pane, drag for an audio recorder", title: "Audio", icon: "microphone", click: 'openOnRight(getCopy(this.dragFactory, true))', drag: 'getCopy(this.dragFactory, true)', dragFactory: doc.emptyAudio as Doc, noviceMode: true },
            { toolTip: "Tap to create a button in a new pane, drag for a button", title: "Button", icon: "bolt", click: 'openOnRight(getCopy(this.dragFactory, true))', drag: 'getCopy(this.dragFactory, true)', dragFactory: doc.emptyButton as Doc, noviceMode: true },

            { toolTip: "Tap to create a presentation in a new pane, drag for a presentation", title: "Present", icon: "tv", click: 'openOnRight(Doc.UserDoc().activePresentation = getCopy(this.dragFactory, true))', drag: `Doc.UserDoc().activePresentation = getCopy(this.dragFactory, true)`, dragFactory: doc.emptyPresentation as Doc, noviceMode: true },
            { toolTip: "Tap to create a search box in a new pane, drag for a search box", title: "Query", icon: "search", click: 'openOnRight(getCopy(this.dragFactory, true))', drag: 'getCopy(this.dragFactory, true)', dragFactory: doc.emptySearch as Doc },
            { toolTip: "Tap to create a scripting box in a new pane, drag for a scripting box", title: "Script", icon: "terminal", click: 'openOnRight(getCopy(this.dragFactory, true))', drag: 'getCopy(this.dragFactory, true)', dragFactory: doc.emptyScript as Doc },
            // { title: "Drag an import folder", title: "Load", icon: "cloud-upload-alt", ignoreClick: true, drag: 'Docs.Create.DirectoryImportDocument({ title: "Directory Import", _width: 400, _height: 400 })' },
            { toolTip: "Tap to create a mobile view in a new pane, drag for a mobile view", title: "Phone", icon: "mobile", click: 'openOnRight(Doc.UserDoc().activeMobileMenu)', drag: 'this.dragFactory', dragFactory: doc.activeMobileMenu as Doc },
            // { title: "Drag an instance of the device collection", title: "Buxton", icon: "globe-asia", ignoreClick: true, drag: 'Docs.Create.Buxton()' },
            // { title: "use pen", icon: "pen-nib", click: 'activatePen(this.activeInkPen = sameDocs(this.activeInkPen, this) ? undefined : this)', backgroundColor: "blue", ischecked: `sameDocs(this.activeInkPen,  this)`, activeInkPen: doc },
            // { title: "use highlighter", icon: "highlighter", click: 'activateBrush(this.activeInkPen = sameDocs(this.activeInkPen, this) ? undefined : this,20,this.backgroundColor)', backgroundColor: "yellow", ischecked: `sameDocs(this.activeInkPen, this)`, activeInkPen: doc },
            // { title: "use stamp", icon: "stamp", click: 'activateStamp(this.activeInkPen = sameDocs(this.activeInkPen, this) ? undefined : this)', backgroundColor: "orange", ischecked: `sameDocs(this.activeInkPen, this)`, activeInkPen: doc },
            // { title: "use eraser", icon: "eraser", click: 'activateEraser(this.activeInkPen = sameDocs(this.activeInkPen, this) ? undefined : this);', ischecked: `sameDocs(this.activeInkPen, this)`, backgroundColor: "pink", activeInkPen: doc },
            // { title: "use drag", icon: "mouse-pointer", click: 'deactivateInk();this.activeInkPen = this;', ischecked: `sameDocs(this.activeInkPen, this)`, backgroundColor: "white", activeInkPen: doc },
            { toolTip: "Tap to create a document previewer in a new pane, drag for a document previewer", title: "Prev", icon: "expand", click: 'openOnRight(getCopy(this.dragFactory, true))', drag: 'getCopy(this.dragFactory,true)', dragFactory: doc.emptyDocHolder as Doc },
            { toolTip: "Toggle a Calculator REPL", title: "repl", icon: "calculator", click: 'addOverlayWindow("ScriptingRepl", { x: 300, y: 100, width: 200, height: 200, title: "Scripting REPL" })' },
            { toolTip: "Connect a Google Account", title: "Google Account", icon: "external-link-alt", click: 'GoogleAuthenticationManager.Instance.fetchOrGenerateAccessToken(true)' },
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
        const buttons = CurrentUserUtils.creatorBtnDescriptors(doc).filter(d => !alreadyCreatedButtons?.includes(d.title));
        const creatorBtns = buttons.map(({ title, toolTip, icon, ignoreClick, drag, click, ischecked, activeInkPen, backgroundColor, dragFactory, noviceMode, clickFactory }) => Docs.Create.FontIconDocument({
            _nativeWidth: 50, _nativeHeight: 50, _width: 50, _height: 50,
            icon,
            title,
            toolTip,
            ignoreClick,
            dropAction: "copy",
            onDragStart: drag ? ScriptField.MakeFunction(drag) : undefined,
            onClick: click ? ScriptField.MakeScript(click) : undefined,
            ischecked: ischecked ? ComputedField.MakeFunction(ischecked) : undefined,
            activeInkPen,
            backgroundColor,
            removeDropProperties: new List<string>(["dropAction"]),
            dragFactory,
            clickFactory,
            userDoc: noviceMode ? undefined as any : doc,
            hidden: noviceMode ? undefined as any : ComputedField.MakeFunction("self.userDoc.noviceMode"), system: true
        }));

        if (dragCreatorSet === undefined) {
            doc.myItemCreators = new PrefetchProxy(Docs.Create.MasonryDocument(creatorBtns, {
                title: "Basic Item Creators", _showTitle: "title", _xMargin: 0,
                _autoHeight: true, _width: 500, _columnWidth: 35, ignoreClick: true, lockedPosition: true, _chromeStatus: "disabled",
                dropConverter: ScriptField.MakeScript("convertToButtons(dragData)", { dragData: DragManager.DocumentDragData.name }), system: true
            }));
        } else {
            creatorBtns.forEach(nb => Doc.AddDocToList(doc.myItemCreators as Doc, "data", nb));
        }
        return doc.myItemCreators as Doc;
    }

    static menuBtnDescriptions(doc: Doc): {
        title: string, icon: string, click: string, watchedDocuments?: Doc
    }[] {
        this.setupSharingSidebar(doc);  // sets up the right sidebar collection for mobile upload documents and sharing
        return [
            { title: "Sharing", icon: "users", click: 'scriptContext.selectMenu(self, "Sharing")', watchedDocuments: doc["sidebar-sharing"] as Doc },
            { title: "Workspace", icon: "desktop", click: 'scriptContext.selectMenu(self, "Workspace")' },
            { title: "Catalog", icon: "file", click: 'scriptContext.selectMenu(self, "Catalog")' },
            { title: "Archive", icon: "archive", click: 'scriptContext.selectMenu(self, "Archive")' },
            { title: "Import", icon: "upload", click: 'scriptContext.selectMenu(self, "Import")' },
            { title: "Tools", icon: "wrench", click: 'scriptContext.selectMenu(self, "Tools")' },
            { title: "Help", icon: "question-circle", click: 'scriptContext.selectMenu(self, "Help")' },
            { title: "Settings", icon: "cog", click: 'scriptContext.selectMenu(self, "Settings")' },
            { title: "User Doc", icon: "address-card", click: 'scriptContext.selectMenu(self, "UserDoc")' },
        ];
    }

    static setupSearchPanel(doc: Doc) {
        if (doc["search-panel"] === undefined) {
            doc["search-panel"] = new PrefetchProxy(Docs.Create.SearchDocument({
                _width: 500, _height: 400, backgroundColor: "dimGray", ignoreClick: true,
                childDropAction: "alias", lockedPosition: true, _viewType: CollectionViewType.Schema, _chromeStatus: "disabled", title: "sidebar search stack", system: true
            })) as any as Doc;
        }
    }
    static setupMenuPanel(doc: Doc) {
        if (doc.menuStack === undefined) {
            const menuBtns = CurrentUserUtils.menuBtnDescriptions(doc).map(({ title, icon, click, watchedDocuments }) =>
                Docs.Create.FontIconDocument({
                    icon,
                    iconShape: "square",
                    title,
                    _backgroundColor: "black",
                    stayInCollection: true,
                    childDropAction: "same",
                    _width: 60,
                    _height: 60,
                    watchedDocuments,
                    onClick: ScriptField.MakeScript(click, { scriptContext: "any" }), system: true
                }));
            const userDoc = menuBtns[menuBtns.length - 1];
            userDoc.userDoc = doc;
            userDoc.hidden = ComputedField.MakeFunction("self.userDoc.noviceMode");

            doc.menuStack = new PrefetchProxy(Docs.Create.StackingDocument(menuBtns, {
                title: "menuItemPanel",
                dropConverter: ScriptField.MakeScript("convertToButtons(dragData)", { dragData: DragManager.DocumentDragData.name }),
                _backgroundColor: "black",
                _gridGap: 0,
                _yMargin: 0,
                _yPadding: 0, _xMargin: 0, _autoHeight: false, _width: 60, _columnWidth: 60, lockedPosition: true, _chromeStatus: "disabled", system: true
            }));
        }
        // this resets all sidebar buttons to being deactivated
        PromiseValue(Cast(doc.menuStack, Doc)).then(stack => {
            stack && PromiseValue(stack.data).then(btns => {
                DocListCastAsync(btns).then(bts => bts?.forEach(btn => {
                    btn.color = "white";
                    btn._backgroundColor = "";
                }));
            });
        });
        return doc.menuStack as Doc;
    }


    // Sets up mobile menu if it is undefined creates a new one, otherwise returns existing menu
    static setupActiveMobileMenu(doc: Doc) {
        if (doc.activeMobileMenu === undefined) {
            doc.activeMobileMenu = this.setupMobileMenu();
        }
        return doc.activeMobileMenu as Doc;
    }

    // Sets up mobileMenu stacking document
    static setupMobileMenu() {
        const menu = new PrefetchProxy(Docs.Create.StackingDocument(this.setupMobileButtons(), {
            _width: 980, ignoreClick: true, lockedPosition: false, _chromeStatus: "disabled", title: "home", _yMargin: 100, system: true
        }));
        return menu;
    }

    // SEts up mobile buttons for inside mobile menu
    static setupMobileButtons(doc?: Doc, buttons?: string[]) {
        const docProtoData: { title: string, icon: string, drag?: string, ignoreClick?: boolean, click?: string, ischecked?: string, activePen?: Doc, backgroundColor?: string, info: string, dragFactory?: Doc }[] = [
            { title: "WORKSPACES", icon: "bars", click: 'switchToMobileLibrary()', backgroundColor: "lightgrey", info: "Access your Workspaces from your mobile, and navigate through all of your documents. " },
            { title: "UPLOAD", icon: "upload", click: 'openMobileUploads()', backgroundColor: "lightgrey", info: "Upload files from your mobile device so they can be accessed on Dash Web." },
            { title: "MOBILE UPLOAD", icon: "mobile", click: 'switchToMobileUploadCollection()', backgroundColor: "lightgrey", info: "Access the collection of your mobile uploads." },
            { title: "RECORD", icon: "microphone", click: 'openMobileAudio()', backgroundColor: "lightgrey", info: "Use your phone to record, dictate and then upload audio onto Dash Web." },
            { title: "PRESENTATION", icon: "desktop", click: 'switchToMobilePresentation()', backgroundColor: "lightgrey", info: "Use your phone as a remote for you presentation." },
            { title: "SETTINGS", icon: "cog", click: 'openMobileSettings()', backgroundColor: "lightgrey", info: "Change your password, log out, or manage your account security." }
        ];
        // returns a list of mobile buttons
        return docProtoData.filter(d => !buttons || !buttons.includes(d.title)).map(data =>
            this.mobileButton({
                title: data.title,
                lockedPosition: true,
                onClick: data.click ? ScriptField.MakeScript(data.click) : undefined,
                _backgroundColor: data.backgroundColor, system: true
            },
                [this.ficon({ ignoreClick: true, icon: data.icon, backgroundColor: "rgba(0,0,0,0)", system: true }), this.mobileTextContainer({}, [this.mobileButtonText({}, data.title), this.mobileButtonInfo({}, data.info)])])
        );
    }

    // sets up the main document for the mobile button
    static mobileButton = (opts: DocumentOptions, docs: Doc[]) => Docs.Create.MulticolumnDocument(docs, {
        ...opts,
        dropAction: undefined, removeDropProperties: new List<string>(["dropAction"]), _nativeWidth: 900, _nativeHeight: 250, _width: 900, _height: 250, _yMargin: 15,
        borderRounding: "5px", boxShadow: "0 0", _chromeStatus: "disabled", system: true
    }) as any as Doc

    // sets up the text container for the information contained within the mobile button
    static mobileTextContainer = (opts: DocumentOptions, docs: Doc[]) => Docs.Create.MultirowDocument(docs, {
        ...opts,
        dropAction: undefined, removeDropProperties: new List<string>(["dropAction"]), _nativeWidth: 450, _nativeHeight: 250, _width: 450, _height: 250, _yMargin: 25,
        backgroundColor: "rgba(0,0,0,0)", borderRounding: "0", boxShadow: "0 0", _chromeStatus: "disabled", ignoreClick: true, system: true
    }) as any as Doc

    // Sets up the title of the button
    static mobileButtonText = (opts: DocumentOptions, buttonTitle: string) => Docs.Create.TextDocument(buttonTitle, {
        ...opts,
        dropAction: undefined, title: buttonTitle, _fontSize: "37pt", _xMargin: 0, _yMargin: 0, ignoreClick: true, _chromeStatus: "disabled", backgroundColor: "rgba(0,0,0,0)", system: true
    }) as any as Doc

    // Sets up the description of the button
    static mobileButtonInfo = (opts: DocumentOptions, buttonInfo: string) => Docs.Create.TextDocument(buttonInfo, {
        ...opts,
        dropAction: undefined, title: "info", _fontSize: "25pt", _xMargin: 0, _yMargin: 0, ignoreClick: true, _chromeStatus: "disabled", backgroundColor: "rgba(0,0,0,0)", _dimMagnitude: 2, system: true
    }) as any as Doc


    static setupThumbButtons(doc: Doc) {
        const docProtoData: { title: string, icon: string, drag?: string, ignoreClick?: boolean, pointerDown?: string, pointerUp?: string, ischecked?: string, clipboard?: Doc, activeInkPen?: Doc, backgroundColor?: string, dragFactory?: Doc }[] = [
            { title: "use pen", icon: "pen-nib", pointerUp: "resetPen()", pointerDown: 'setPen(2, this.backgroundColor)', backgroundColor: "blue", ischecked: `sameDocs(this.activeInkPen,  this)`, activeInkPen: doc },
            { title: "use highlighter", icon: "highlighter", pointerUp: "resetPen()", pointerDown: 'setPen(20, this.backgroundColor)', backgroundColor: "yellow", ischecked: `sameDocs(this.activeInkPen, this)`, activeInkPen: doc },
            { title: "notepad", icon: "clipboard", pointerUp: "GestureOverlay.Instance.closeFloatingDoc()", pointerDown: 'GestureOverlay.Instance.openFloatingDoc(this.clipboard)', clipboard: Docs.Create.FreeformDocument([], { _width: 300, _height: 300, system: true }), backgroundColor: "orange", ischecked: `sameDocs(this.activeInkPen, this)`, activeInkPen: doc },
            { title: "interpret text", icon: "font", pointerUp: "setToolglass('none')", pointerDown: "setToolglass('inktotext')", backgroundColor: "orange", ischecked: `sameDocs(this.activeInkPen, this)`, activeInkPen: doc },
            { title: "ignore gestures", icon: "signature", pointerUp: "setToolglass('none')", pointerDown: "setToolglass('ignoregesture')", backgroundColor: "green", ischecked: `sameDocs(this.activeInkPen, this)`, activeInkPen: doc },
        ];
        return docProtoData.map(data => Docs.Create.FontIconDocument({
            _nativeWidth: 10, _nativeHeight: 10, _width: 10, _height: 10, title: data.title, icon: data.icon,
            dropAction: data.pointerDown ? "copy" : undefined, ignoreClick: data.ignoreClick,
            onDragStart: data.drag ? ScriptField.MakeFunction(data.drag) : undefined,
            clipboard: data.clipboard,
            onPointerUp: data.pointerUp ? ScriptField.MakeScript(data.pointerUp) : undefined, onPointerDown: data.pointerDown ? ScriptField.MakeScript(data.pointerDown) : undefined,
            ischecked: data.ischecked ? ComputedField.MakeFunction(data.ischecked) : undefined, activeInkPen: data.activeInkPen, pointerHack: true,
            backgroundColor: data.backgroundColor, removeDropProperties: new List<string>(["dropAction"]), dragFactory: data.dragFactory, system: true
        }));
    }

    static setupThumbDoc(userDoc: Doc) {
        if (!userDoc.thumbDoc) {
            const thumbDoc = Docs.Create.LinearDocument(CurrentUserUtils.setupThumbButtons(userDoc), {
                _width: 100, _height: 50, ignoreClick: true, lockedPosition: true, _chromeStatus: "disabled", title: "buttons",
                _autoHeight: true, _yMargin: 5, linearViewIsExpanded: true, backgroundColor: "white", system: true
            });
            thumbDoc.inkToTextDoc = Docs.Create.LinearDocument([], {
                _width: 300, _height: 25, _autoHeight: true, _chromeStatus: "disabled", linearViewIsExpanded: true, flexDirection: "column", system: true
            });
            userDoc.thumbDoc = thumbDoc;
        }
        return Cast(userDoc.thumbDoc, Doc);
    }

    // setup the Creator button which will display the creator panel.  This panel will include the drag creators and the color picker.
    // when clicked, this panel will be displayed in the target container (ie, sidebarContainer)
    static async setupToolsBtnPanel(doc: Doc) {
        // setup a masonry view of all he creators
        const creatorBtns = await CurrentUserUtils.setupCreatorButtons(doc);
        const templateBtns = CurrentUserUtils.setupUserTemplateButtons(doc);

        doc["tabs-button-tools"] = undefined;

        if (doc.myCreators === undefined) {
            doc.myCreators = new PrefetchProxy(Docs.Create.StackingDocument([creatorBtns, templateBtns], {
                title: "all Creators", _yMargin: 0, _autoHeight: true, _xMargin: 0,
                _width: 500, ignoreClick: true, lockedPosition: true, _chromeStatus: "disabled", system: true
            }));
        }
        // setup a color picker
        if (doc.myColorPicker === undefined) {
            const color = Docs.Create.ColorDocument({
                title: "color picker", _width: 300, dropAction: "alias", forceActive: true, removeDropProperties: new List<string>(["dropAction", "forceActive"]), system: true
            });
            doc.myColorPicker = new PrefetchProxy(color);
        }

        if (doc["sidebar-tools"] === undefined) {
            const toolsStack = new PrefetchProxy(Docs.Create.StackingDocument([doc.myCreators as Doc, doc.myColorPicker as Doc], {
                title: "sidebar-tools", _width: 500, _yMargin: 20, lockedPosition: true, _chromeStatus: "disabled", hideFilterView: true, forceActive: true, system: true
            })) as any as Doc;

            doc["sidebar-tools"] = toolsStack;
        }
    }

    static setupWorkspaces(doc: Doc) {
        // setup workspaces library item
        doc.myWorkspaces === undefined;
        if (doc.myWorkspaces === undefined) {
            doc.myWorkspaces = new PrefetchProxy(Docs.Create.TreeDocument([], {
                title: "WORKSPACES", _height: 100, forceActive: true, boxShadow: "0 0", lockedPosition: true, treeViewOpen: true, system: true
            }));
        }
        if (doc["sidebar-workspaces"] === undefined) {
            const newWorkspace = ScriptField.MakeScript(`createNewWorkspace()`);
            (doc.myWorkspaces as Doc).contextMenuScripts = new List<ScriptField>([newWorkspace!]);
            (doc.myWorkspaces as Doc).contextMenuLabels = new List<string>(["Create New Workspace"]);

            const workspaces = doc.myWorkspaces as Doc;

            doc["sidebar-workspaces"] = new PrefetchProxy(Docs.Create.TreeDocument([workspaces], {
                treeViewHideTitle: true, _xMargin: 5, _yMargin: 5, _gridGap: 5, forceActive: true, childDropAction: "alias",
                treeViewTruncateTitleWidth: 150, hideFilterView: true, treeViewPreventOpen: false, treeViewOpen: true,
                lockedPosition: true, boxShadow: "0 0", dontRegisterChildViews: true, targetDropAction: "same", system: true
            })) as any as Doc;
        }
    }

    static setupCatalog(doc: Doc) {
        doc.myCatalog === undefined;
        if (doc.myCatalog === undefined) {
            doc.myCatalog = new PrefetchProxy(Docs.Create.SchemaDocument([], [], {
                title: "CATALOG", _height: 1000, _fitWidth: true, forceActive: true, boxShadow: "0 0", treeViewPreventOpen: false,
                childDropAction: "alias", targetDropAction: "same", stayInCollection: true, treeViewOpen: true, system: true
            }));
        }

        if (doc["sidebar-catalog"] === undefined) {
            const catalog = doc.myCatalog as Doc;

            doc["sidebar-catalog"] = new PrefetchProxy(Docs.Create.TreeDocument([catalog], {
                title: "sidebar-catalog",
                treeViewHideTitle: true, _xMargin: 5, _yMargin: 5, _gridGap: 5, forceActive: true, childDropAction: "alias",
                treeViewTruncateTitleWidth: 150, hideFilterView: true, treeViewPreventOpen: false, treeViewOpen: true,
                lockedPosition: true, boxShadow: "0 0", dontRegisterChildViews: true, targetDropAction: "same", system: true
            })) as any as Doc;
        }
    }
    static setupRecentlyClosed(doc: Doc) {
        // setup Recently Closed library item
        doc.myRecentlyClosed === undefined;
        if (doc.myRecentlyClosed === undefined) {
            doc.myRecentlyClosed = new PrefetchProxy(Docs.Create.TreeDocument([], {
                title: "RECENTLY CLOSED", _height: 75, forceActive: true, boxShadow: "0 0", treeViewPreventOpen: false, treeViewOpen: true, stayInCollection: true, system: true
            }));
        }
        // this is equivalent to using PrefetchProxies to make sure the recentlyClosed doc is ready
        PromiseValue(Cast(doc.myRecentlyClosed, Doc)).then(recent => recent && PromiseValue(recent.data).then(DocListCast));
        if (doc["sidebar-recentlyClosed"] === undefined) {
            const clearAll = ScriptField.MakeScript(`self.data = new List([])`);
            (doc.myRecentlyClosed as Doc).contextMenuScripts = new List<ScriptField>([clearAll!]);
            (doc.myRecentlyClosed as Doc).contextMenuLabels = new List<string>(["Clear All"]);

            const recentlyClosed = doc.myRecentlyClosed as Doc;

            doc["sidebar-recentlyClosed"] = new PrefetchProxy(Docs.Create.TreeDocument([recentlyClosed], {
                title: "sidebar-recentlyClosed",
                treeViewHideTitle: true, _xMargin: 5, _yMargin: 5, _gridGap: 5, forceActive: true, childDropAction: "alias",
                treeViewTruncateTitleWidth: 150, hideFilterView: true, treeViewPreventOpen: false, treeViewOpen: true,
                lockedPosition: true, boxShadow: "0 0", dontRegisterChildViews: true, targetDropAction: "same", system: true
            })) as any as Doc;
        }
    }


    static setupUserDoc(doc: Doc) {
        if (doc["sidebar-userDoc"] === undefined) {
            doc.treeViewOpen = true;
            doc.treeViewExpandedView = "fields";
            doc["sidebar-userDoc"] = new PrefetchProxy(Docs.Create.TreeDocument([doc], {
                treeViewHideTitle: true, _xMargin: 5, _yMargin: 5, _gridGap: 5, forceActive: true, title: "sidebar-userDoc",
                treeViewTruncateTitleWidth: 150, hideFilterView: true, treeViewPreventOpen: false,
                lockedPosition: true, boxShadow: "0 0", dontRegisterChildViews: true, targetDropAction: "same", system: true
            })) as any as Doc;
        }
    }

    static setupSidebarContainer(doc: Doc) {
        if (doc.sidebar === undefined) {
            const sidebarContainer = new Doc();
            sidebarContainer._chromeStatus = "disabled";
            sidebarContainer.onClick = ScriptField.MakeScript("freezeSidebar()");
            doc.sidebar = new PrefetchProxy(sidebarContainer);
            doc.system = true;
        }
        return doc.sidebar as Doc;
    }

    // setup the list of sidebar mode buttons which determine what is displayed in the sidebar
    static async setupSidebarButtons(doc: Doc) {
        CurrentUserUtils.setupSidebarContainer(doc);
        await CurrentUserUtils.setupToolsBtnPanel(doc);
        CurrentUserUtils.setupWorkspaces(doc);
        CurrentUserUtils.setupCatalog(doc);
        CurrentUserUtils.setupRecentlyClosed(doc);
        CurrentUserUtils.setupUserDoc(doc);
    }

    static blist = (opts: DocumentOptions, docs: Doc[]) => new PrefetchProxy(Docs.Create.LinearDocument(docs, {
        ...opts, _gridGap: 5, _xMargin: 5, _yMargin: 5, _height: 42, _width: 100, boxShadow: "0 0", forceActive: true,
        dropConverter: ScriptField.MakeScript("convertToButtons(dragData)", { dragData: DragManager.DocumentDragData.name }),
        backgroundColor: "black", treeViewPreventOpen: true, lockedPosition: true, _chromeStatus: "disabled", linearViewIsExpanded: true, system: true
    })) as any as Doc

    static ficon = (opts: DocumentOptions) => new PrefetchProxy(Docs.Create.FontIconDocument({
        ...opts, dropAction: "alias", removeDropProperties: new List<string>(["dropAction"]), _nativeWidth: 40, _nativeHeight: 40, _width: 40, _height: 40, system: true
    })) as any as Doc

    /// sets up the default list of buttons to be shown in the expanding button menu at the bottom of the Dash window
    static setupDockedButtons(doc: Doc) {
        if (doc["dockedBtn-undo"] === undefined) {
            doc["dockedBtn-undo"] = CurrentUserUtils.ficon({ onClick: ScriptField.MakeScript("undo()"), toolTip: "click to undo", title: "undo", icon: "undo-alt", system: true });
        }
        if (doc["dockedBtn-redo"] === undefined) {
            doc["dockedBtn-redo"] = CurrentUserUtils.ficon({ onClick: ScriptField.MakeScript("redo()"), toolTip: "click to redo", title: "redo", icon: "redo-alt", system: true });
        }
        if (doc.dockedBtns === undefined) {
            doc.dockedBtns = CurrentUserUtils.blist({ title: "docked buttons", ignoreClick: true }, [doc["dockedBtn-undo"] as Doc, doc["dockedBtn-redo"] as Doc]);
        }
    }
    // sets up the default set of documents to be shown in the Overlay layer
    static setupOverlays(doc: Doc) {
        if (doc.myOverlayDocuments === undefined) {
            doc.myOverlayDocuments = new PrefetchProxy(Docs.Create.FreeformDocument([], { title: "overlay documents", backgroundColor: "#aca3a6", system: true }));
        }
    }

    // the initial presentation Doc to use
    static setupDefaultPresentation(doc: Doc) {
        if (doc["template-presentation"] === undefined) {
            doc["template-presentation"] = new PrefetchProxy(Docs.Create.PresElementBoxDocument({
                title: "pres element template", backgroundColor: "transparent", _xMargin: 5, _height: 46, isTemplateDoc: true, isTemplateForField: "data", system: true
            }));
        }
        if (doc.activePresentation === undefined) {
            doc.activePresentation = Doc.MakeCopy(doc.emptyPresentation as Doc, true);
        }
    }

    // Sharing sidebar is where shared documents are contained
    static setupSharingSidebar(doc: Doc) {
        if (doc["sidebar-sharing"] === undefined) {
            doc["sidebar-sharing"] = new PrefetchProxy(Docs.Create.StackingDocument([], { title: "Shared Documents", childDropAction: "alias", system: true }));
        }
    }

    // Import sidebar is where shared documents are contained
    static setupImportSidebar(doc: Doc) {
        if (doc["sidebar-import-documents"] === undefined) {
            doc["sidebar-import-documents"] = new PrefetchProxy(Docs.Create.StackingDocument([], { title: "Imported Documents", _showTitle: "title", _height: 300, _yMargin: 30, childDropAction: "alias" }));
        }
        if (doc["sidebar-import"] === undefined) {
            const uploads = Cast(doc["sidebar-import-documents"], Doc, null) as Doc;
            const newUpload = CurrentUserUtils.ficon({ onClick: ScriptField.MakeScript("importDocument()"), toolTip: "Import external document", _backgroundColor: "black", title: "Import", icon: "upload", system: true });
            doc["sidebar-import"] = new PrefetchProxy(Docs.Create.StackingDocument([newUpload, uploads], { title: "Imported Documents", _yMargin: 30, childDropAction: "alias" }));
        }
    }


    static setupClickEditorTemplates(doc: Doc) {
        if (doc["clickFuncs-child"] === undefined) {
            // to use this function, select it from the context menu of a collection.  then edit the onChildClick script.  Add two Doc variables: 'target' and 'thisContainer', then assign 'target' to some target collection.  After that, clicking on any document in the initial collection will open it in the target 
            const openInTarget = Docs.Create.ScriptingDocument(ScriptField.MakeScript(
                "docCast(thisContainer.target).then((target) => target && (target.proto.data = new List([self]))) ",
                { thisContainer: Doc.name }), {
                title: "Click to open in target", _width: 300, _height: 200,
                targetScriptKey: "onChildClick", system: true
            });

            const openDetail = Docs.Create.ScriptingDocument(ScriptField.MakeScript(
                "openOnRight(self.doubleClickView)",
                {}), { title: "Double click to open doubleClickView", _width: 300, _height: 200, targetScriptKey: "onChildDoubleClick", system: true });

            doc["clickFuncs-child"] = Docs.Create.TreeDocument([openInTarget, openDetail], { title: "on Child Click function templates", system: true });
        }
        // this is equivalent to using PrefetchProxies to make sure all the childClickFuncs have been retrieved.
        PromiseValue(Cast(doc["clickFuncs-child"], Doc)).then(func => func && PromiseValue(func.data).then(DocListCast));

        if (doc.clickFuncs === undefined) {
            const onClick = Docs.Create.ScriptingDocument(undefined, {
                title: "onClick", "onClick-rawScript": "console.log('click')",
                isTemplateDoc: true, isTemplateForField: "onClick", _width: 300, _height: 200, system: true
            }, "onClick");
            const onChildClick = Docs.Create.ScriptingDocument(undefined, {
                title: "onChildClick", "onChildClick-rawScript": "console.log('child click')",
                isTemplateDoc: true, isTemplateForField: "onChildClick", _width: 300, _height: 200, system: true
            }, "onChildClick");
            const onDoubleClick = Docs.Create.ScriptingDocument(undefined, {
                title: "onDoubleClick", "onDoubleClick-rawScript": "console.log('double click')",
                isTemplateDoc: true, isTemplateForField: "onDoubleClick", _width: 300, _height: 200, system: true
            }, "onDoubleClick");
            const onChildDoubleClick = Docs.Create.ScriptingDocument(undefined, {
                title: "onChildDoubleClick", "onChildDoubleClick-rawScript": "console.log('child double click')",
                isTemplateDoc: true, isTemplateForField: "onChildDoubleClick", _width: 300, _height: 200, system: true
            }, "onChildDoubleClick");
            const onCheckedClick = Docs.Create.ScriptingDocument(undefined, {
                title: "onCheckedClick", "onCheckedClick-rawScript": "console.log(heading + checked + containingTreeView)",
                "onCheckedClick-params": new List<string>(["heading", "checked", "containingTreeView"]), isTemplateDoc: true,
                isTemplateForField: "onCheckedClick", _width: 300, _height: 200, system: true
            }, "onCheckedClick");
            doc.clickFuncs = Docs.Create.TreeDocument([onClick, onChildClick, onDoubleClick, onCheckedClick], { title: "onClick funcs", system: true });
        }
        PromiseValue(Cast(doc.clickFuncs, Doc)).then(func => func && PromiseValue(func.data).then(DocListCast));

        return doc.clickFuncs as Doc;
    }

    static async updateUserDocument(doc: Doc) {
        doc.noviceMode = doc.noviceMode === undefined ? "true" : doc.noviceMode;
        doc.title = Doc.CurrentUserEmail;
        doc.activeInkPen = doc;
        doc.activeInkColor = StrCast(doc.activeInkColor, "rgb(0, 0, 0)");
        doc.activeInkWidth = StrCast(doc.activeInkWidth, "1");
        doc.activeInkBezier = StrCast(doc.activeInkBezier, "0");
        doc.activeFillColor = StrCast(doc.activeFillColor, "");
        doc.activeArrowStart = StrCast(doc.activeArrowStart, "");
        doc.activeArrowEnd = StrCast(doc.activeArrowEnd, "");
        doc.activeDash = StrCast(doc.activeDash, "0");
        doc.fontSize = StrCast(doc.fontSize, "12pt");
        doc.fontFamily = StrCast(doc.fontFamily, "Arial");
        doc.fontColor = StrCast(doc.fontColor, "black");
        doc.fontHighlight = StrCast(doc.fontHighlight, "");
        doc.defaultAclPrivate = BoolCast(doc.defaultAclPrivate, true);
        doc.activeCollectionBackground = StrCast(doc.activeCollectionBackground, "white");
        doc.activeCollectionNestedBackground = Cast(doc.activeCollectionNestedBackground, "string", null);
        doc.noviceMode = BoolCast(doc.noviceMode, true);
        doc["constants-snapThreshold"] = NumCast(doc["constants-snapThreshold"], 10); //
        doc["constants-dragThreshold"] = NumCast(doc["constants-dragThreshold"], 4); //
        Utils.DRAG_THRESHOLD = NumCast(doc["constants-dragThreshold"]);
        this.setupDefaultIconTemplates(doc);  // creates a set of icon templates triggered by the document deoration icon
        this.setupDocTemplates(doc); // sets up the template menu of templates
        this.setupImportSidebar(doc);
        this.setupActiveMobileMenu(doc); // sets up the current mobile menu for Dash Mobile
        this.setupMenuPanel(doc);
        this.setupSearchPanel(doc);
        this.setupOverlays(doc);  // documents in overlay layer
        this.setupDockedButtons(doc);  // the bottom bar of font icons
        await this.setupSidebarButtons(doc); // the pop-out left sidebar of tools/panels
        doc.globalLinkDatabase = Docs.Prototypes.MainLinkDocument();
        doc.globalScriptDatabase = Docs.Prototypes.MainScriptDocument();
        doc.globalGroupDatabase = Docs.Prototypes.MainGroupDocument();

        setTimeout(() => this.setupDefaultPresentation(doc), 0); // presentation that's initially triggered

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

Scripting.addGlobal(function createNewWorkspace() { return MainView.Instance.createNewWorkspace(); },
    "creates a new workspace when called");

Scripting.addGlobal(function links(doc: any) { return new List(LinkManager.Instance.getAllRelatedLinks(doc)); },
    "returns all the links to the document or its annotations", "(doc: any)");
Scripting.addGlobal(function directLinks(doc: any) { return new List(LinkManager.Instance.getAllDirectLinks(doc)); },
    "returns all the links directly to the document", "(doc: any)");
