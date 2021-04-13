import { computed, observable, reaction } from "mobx";
import * as rp from 'request-promise';
import { DataSym, Doc, DocListCast, DocListCastAsync } from "../../fields/Doc";
import { Id } from "../../fields/FieldSymbols";
import { List } from "../../fields/List";
import { PrefetchProxy } from "../../fields/Proxy";
import { RichTextField } from "../../fields/RichTextField";
import { listSpec } from "../../fields/Schema";
import { SchemaHeaderField } from "../../fields/SchemaHeaderField";
import { ComputedField, ScriptField } from "../../fields/ScriptField";
import { BoolCast, Cast, NumCast, PromiseValue, StrCast, DateCast } from "../../fields/Types";
import { nullAudio } from "../../fields/URLField";
import { SharingPermissions } from "../../fields/util";
import { Utils } from "../../Utils";
import { DocServer } from "../DocServer";
import { Docs, DocumentOptions, DocUtils } from "../documents/Documents";
import { DocumentType } from "../documents/DocumentTypes";
import { Networking } from "../Network";
import { CollectionDockingView } from "../views/collections/CollectionDockingView";
import { DimUnit } from "../views/collections/collectionMulticolumn/CollectionMulticolumnView";
import { CollectionView, CollectionViewType } from "../views/collections/CollectionView";
import { MainView } from "../views/MainView";
import { FormattedTextBox } from "../views/nodes/formattedText/FormattedTextBox";
import { LabelBox } from "../views/nodes/LabelBox";
import { OverlayView } from "../views/OverlayView";
import { DocumentManager } from "./DocumentManager";
import { DragManager } from "./DragManager";
import { makeTemplate } from "./DropConverter";
import { HistoryUtil } from "./History";
import { LinkManager } from "./LinkManager";
import { Scripting } from "./Scripting";
import { SearchUtil } from "./SearchUtil";
import { SelectionManager } from "./SelectionManager";
import { UndoManager } from "./UndoManager";
import { SnappingManager } from "./SnappingManager";
import { InkTool } from "../../fields/InkField";
import { SharingManager } from "./SharingManager";


export let resolvedPorts: { server: number, socket: number };
const headerViewVersion = "0.1";
export class CurrentUserUtils {
    private static curr_id: string;
    //TODO tfs: these should be temporary...
    private static mainDocId: string | undefined;

    public static get id() { return this.curr_id; }
    public static get MainDocId() { return this.mainDocId; }
    public static set MainDocId(id: string | undefined) { this.mainDocId = id; }
    @computed public static get UserDocument() { return Doc.UserDoc(); }

    @observable public static GuestTarget: Doc | undefined;
    @observable public static GuestDashboard: Doc | undefined;
    @observable public static GuestMobile: Doc | undefined;
    @observable public static propertiesWidth: number = 0;

    // sets up the default User Templates - slideView,  headerView
    static setupUserTemplateButtons(doc: Doc) {
        // Prototype for mobile button (not sure if 'Advanced Item Prototypes' is ideal location)
        if (doc["template-mobile-button"] === undefined) {
            const queryTemplate = this.mobileButton({
                title: "NEW MOBILE BUTTON",
                onClick: undefined,
            },
                [this.ficon({
                    ignoreClick: true,
                    icon: "mobile",
                    backgroundColor: "transparent"
                }),
                this.mobileTextContainer({},
                    [this.mobileButtonText({}, "NEW MOBILE BUTTON"), this.mobileButtonInfo({}, "You can customize this button and make it your own.")])]);
            doc["template-mobile-button"] = CurrentUserUtils.ficon({
                onDragStart: ScriptField.MakeFunction('copyDragFactory(this.dragFactory)'),
                dragFactory: new PrefetchProxy(queryTemplate) as any as Doc, title: "mobile button", icon: "mobile"
            });
        }

        if (doc["template-button-slides"] === undefined) {
            const slideTemplate = Docs.Create.MultirowDocument(
                [
                    Docs.Create.MulticolumnDocument([], { title: "data", _height: 200, system: true }),
                    Docs.Create.TextDocument("", { title: "text", _height: 100, system: true })
                ],
                { _width: 400, _height: 300, title: "slideView", _xMargin: 3, _yMargin: 3, system: true }
            );
            slideTemplate.isTemplateDoc = makeTemplate(slideTemplate);
            doc["template-button-slides"] = CurrentUserUtils.ficon({
                onDragStart: ScriptField.MakeFunction('copyDragFactory(this.dragFactory)'),
                dragFactory: new PrefetchProxy(slideTemplate) as any as Doc, title: "presentation slide", icon: "address-card"
            });
        }

        if (doc["template-button-link"] === undefined) {  // set _backgroundColor to transparent to prevent link dot from obscuring document it's attached to.
            const linkTemplate = Doc.MakeDelegate(Docs.Create.TextDocument(" ", { title: "header", _autoHeight: true, system: true }, "header")); // text needs to be a space to allow templateText to be created
            linkTemplate.system = true;
            Doc.GetProto(linkTemplate).layout =
                "<div>" +
                "    <FormattedTextBox {...props} dontSelectOnLoad={'true'} height='{this._headerHeight||75}px' ignoreAutoHeight={'true'} background='{this._headerColor||`lightGray`}' fieldKey={'header'}/>" +
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
                onDragStart: ScriptField.MakeFunction('copyDragFactory(this.dragFactory)'),
                dragFactory: new PrefetchProxy(linkTemplate) as any as Doc, title: "link view", icon: "window-maximize", system: true
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
                onDragStart: ScriptField.MakeFunction('copyDragFactory(this.dragFactory)'),
                dragFactory: new PrefetchProxy(box) as any as Doc, title: "data switch", icon: "toggle-on", system: true
            });
        }

        if (doc["template-button-detail"] === undefined) {
            const { TextDocument, MasonryDocument, CarouselDocument } = Docs.Create;

            const openInTarget = ScriptField.MakeScript("openOnRight(self.doubleClickView)");
            const carousel = CarouselDocument([], {
                title: "data", _height: 350, _itemIndex: 0, "_carousel-caption-xMargin": 10, "_carousel-caption-yMargin": 10,
                onChildDoubleClick: openInTarget, backgroundColor: "#9b9b9b3F", system: true
            });

            const details = TextDocument("", { title: "details", _height: 200, _autoHeight: true, system: true });
            const short = TextDocument("", { title: "shortDescription", treeViewOpen: true, treeViewExpandedView: "layout", _height: 75, _autoHeight: true, system: true });
            const long = TextDocument("", { title: "longDescription", treeViewOpen: false, treeViewExpandedView: "layout", _height: 150, _autoHeight: true, system: true });

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

            const shared = { _autoHeight: true, _xMargin: 0 };
            const detailViewOpts = { title: "detailView", _width: 300, _fontFamily: "Arial", _fontSize: "12px" };
            const descriptionWrapperOpts = { title: "descriptions", _height: 300, _columnWidth: -1, treeViewHideTitle: true, _pivotField: "title", system: true };

            const descriptionWrapper = MasonryDocument([details, short, long], { ...shared, ...descriptionWrapperOpts });
            descriptionWrapper._columnHeaders = new List<SchemaHeaderField>([
                new SchemaHeaderField("[A Short Description]", "dimGray", undefined, undefined, undefined, false),
                new SchemaHeaderField("[Long Description]", "dimGray", undefined, undefined, undefined, true),
                new SchemaHeaderField("[Details]", "dimGray", undefined, undefined, undefined, true),
            ]);
            const detailView = Docs.Create.StackingDocument([carousel, descriptionWrapper], { ...shared, ...detailViewOpts, _chromeHidden: true, system: true });
            detailView.isTemplateDoc = makeTemplate(detailView);

            details.title = "Details";
            short.title = "A Short Description";
            long.title = "Long Description";

            doc["template-button-detail"] = CurrentUserUtils.ficon({
                onDragStart: ScriptField.MakeFunction('copyDragFactory(this.dragFactory)'),
                dragFactory: new PrefetchProxy(detailView) as any as Doc, title: "detailView", icon: "window-maximize", system: true
            });
        }

        const requiredTypes = [
            doc["template-button-slides"] as Doc,
            doc["template-mobile-button"] as Doc,
            doc["template-button-detail"] as Doc,
            doc["template-button-link"] as Doc,
            //doc["template-button-switch"] as Doc]
        ];
        if (doc["template-buttons"] === undefined) {
            doc["template-buttons"] = new PrefetchProxy(Docs.Create.MasonryDocument(requiredTypes, {
                title: "Advanced Item Prototypes", _xMargin: 0, _showTitle: "title", _chromeHidden: true,
                hidden: ComputedField.MakeFunction("IsNoviceMode()") as any,
                _stayInCollection: true, _hideContextMenu: true,
                _autoHeight: true, _width: 500, _height: 300, _fitWidth: true, _columnWidth: 35, ignoreClick: true, _lockedPosition: true,
                dropConverter: ScriptField.MakeScript("convertToButtons(dragData)", { dragData: DragManager.DocumentDragData.name }), system: true
            }));
        } else {
            const curButnTypes = Cast(doc["template-buttons"], Doc, null);
            DocListCastAsync(curButnTypes.data).then(async curBtns => {
                curBtns && await Promise.all(curBtns);
                requiredTypes.map(btype => Doc.AddDocToList(curButnTypes, "data", btype));
            });
        }
        return doc["template-buttons"] as Doc;
    }

    // setup the different note type skins
    static setupNoteTemplates(doc: Doc) {
        if (doc["template-note-Note"] === undefined) {
            const noteView = Docs.Create.TextDocument("", { title: "text", isTemplateDoc: true, backgroundColor: "yellow", system: true });
            noteView.isTemplateDoc = makeTemplate(noteView, true, "Note");
            doc["template-note-Note"] = new PrefetchProxy(noteView);
        }
        if (doc["template-note-Idea"] === undefined) {
            const noteView = Docs.Create.TextDocument("", { title: "text", backgroundColor: "pink", system: true });
            noteView.isTemplateDoc = makeTemplate(noteView, true, "Idea");
            doc["template-note-Idea"] = new PrefetchProxy(noteView);
        }
        if (doc["template-note-Topic"] === undefined) {
            const noteView = Docs.Create.TextDocument("", { title: "text", backgroundColor: "lightblue", system: true });
            noteView.isTemplateDoc = makeTemplate(noteView, true, "Topic");
            doc["template-note-Topic"] = new PrefetchProxy(noteView);
        }
        if (doc["template-note-Todo"] === undefined) {
            const noteView = Docs.Create.TextDocument("", {
                title: "text", backgroundColor: "orange", _autoHeight: false, _height: 100, _showCaption: "caption",
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
            doc["template-notes"] = new PrefetchProxy(Docs.Create.TreeDocument([doc["template-note-Note"] as any as Doc, doc["template-note-Idea"] as any as Doc, doc["template-note-Topic"] as any as Doc], // doc["template-note-Todo"] as any as Doc],
                { title: "Note Layouts", _height: 75, system: true }));
        } else {
            const curNoteTypes = Cast(doc["template-notes"], Doc, null);
            const requiredTypes = [doc["template-note-Note"] as any as Doc, doc["template-note-Idea"] as any as Doc, doc["template-note-Topic"] as any as Doc];//, doc["template-note-Todo"] as any as Doc];
            DocListCastAsync(curNoteTypes.data).then(async curNotes => {
                curNotes && await Promise.all(curNotes);
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
                curIcons && await Promise.all(curIcons);
                requiredTypes.map(ntype => Doc.AddDocToList(templateIconsDoc, "data", ntype));
            });
        }
        return doc["template-icons"] as Doc;
    }

    static creatorBtnDescriptors(doc: Doc): {
        title: string, toolTip: string, icon: string, drag?: string, ignoreClick?: boolean,
        click?: string, backgroundColor?: string, dragFactory?: Doc, noviceMode?: boolean, clickFactory?: Doc
    }[] {
        if (doc.emptyPresentation === undefined) {
            doc.emptyPresentation = Docs.Create.PresDocument(new List<Doc>(),
                { title: "Untitled Presentation", _viewType: CollectionViewType.Stacking, _fitWidth: true, _width: 400, _height: 500, targetDropAction: "alias", _chromeHidden: true, boxShadow: "0 0", system: true, cloneFieldFilter: new List<string>(["system"]) });
            ((doc.emptyPresentation as Doc).proto as Doc)["dragFactory-count"] = 0;
        }
        if (doc.emptyCollection === undefined) {
            doc.emptyCollection = Docs.Create.FreeformDocument([],
                { _nativeWidth: undefined, _nativeHeight: undefined, _fitWidth: true, _width: 150, _height: 100, title: "freeform", system: true, cloneFieldFilter: new List<string>(["system"]) });
            ((doc.emptyCollection as Doc).proto as Doc)["dragFactory-count"] = 0;
        }
        if (doc.emptyPane === undefined) {
            doc.emptyPane = Docs.Create.FreeformDocument([], { _nativeWidth: undefined, _nativeHeight: undefined, _width: 500, _height: 800, title: "Untitled Tab", system: true, cloneFieldFilter: new List<string>(["system"]) });
            ((doc.emptyPane as Doc).proto as Doc)["dragFactory-count"] = 0;
        }
        if (doc.emptySlide === undefined) {
            const textDoc = Docs.Create.TreeDocument([], { title: "Slide", _viewType: CollectionViewType.Tree, _fontSize: "20px", treeViewType: "outline", _xMargin: 0, _yMargin: 0, _width: 300, _height: 200, _singleLine: true, backgroundColor: "transparent", system: true, cloneFieldFilter: new List<string>(["system"]) });
            Doc.GetProto(textDoc).title = ComputedField.MakeFunction('self.text?.Text');
            FormattedTextBox.SelectOnLoad = textDoc[Id];
            doc.emptySlide = textDoc;
        }
        if ((doc.emptyHeader as Doc)?.version !== headerViewVersion) {
            const json = {
                doc: {
                    type: "doc",
                    content: [
                        {
                            type: "paragraph", attrs: {}, content: [{
                                type: "dashField",
                                attrs: { fieldKey: "author", docid: "", hideKey: false },
                                marks: [{ type: "strong" }]
                            }, {
                                type: "dashField",
                                attrs: { fieldKey: "creationDate", docid: "", hideKey: false },
                                marks: [{ type: "strong" }]
                            }]
                        }]
                },
                selection: { type: "text", anchor: 1, head: 1 },
                storedMarks: []
            };
            const headerTemplate = Docs.Create.RTFDocument(new RichTextField(JSON.stringify(json), ""), { title: "header", version: headerViewVersion, target: doc, _height: 70, _headerPointerEvents: "all", _headerHeight: 12, _headerFontSize: 9, _autoHeight: true, system: true, cloneFieldFilter: new List<string>(["system"]) }, "header"); // text needs to be a space to allow templateText to be created
            headerTemplate[DataSym].layout =
                "<div style={'height:100%'}>" +
                "    <FormattedTextBox {...props} fieldKey={'header'} dontSelectOnLoad={'true'} ignoreAutoHeight={'true'} pointerEvents='{this._headerPointerEvents||`none`}' fontSize='{this._headerFontSize}px' height='{this._headerHeight}px' background='{this._headerColor||this.target.mySharedDocs.userColor}' />" +
                "    <FormattedTextBox {...props} fieldKey={'text'} position='absolute' top='{(this._headerHeight)*scale}px' height='calc({100/scale}% - {this._headerHeight}px)'/>" +
                "</div>";
            (headerTemplate.proto as Doc).isTemplateDoc = makeTemplate(headerTemplate.proto as Doc, true, "headerView");
            doc.emptyHeader = headerTemplate;
            ((doc.emptyHeader as Doc).proto as Doc)["dragFactory-count"] = 0;
        }
        if (doc.emptyComparison === undefined) {
            doc.emptyComparison = Docs.Create.ComparisonDocument({ title: "compare", _width: 300, _height: 300, system: true, cloneFieldFilter: new List<string>(["system"]) });
        }
        if (doc.emptyScript === undefined) {
            doc.emptyScript = Docs.Create.ScriptingDocument(undefined, { _width: 200, _height: 250, title: "script", system: true, cloneFieldFilter: new List<string>(["system"]) });
            ((doc.emptyScript as Doc).proto as Doc)["dragFactory-count"] = 0;
        }
        if (doc.emptyScreenshot === undefined) {
            doc.emptyScreenshot = Docs.Create.ScreenshotDocument("", { _fitWidth: true, _width: 400, _height: 200, title: "screen snapshot", system: true, cloneFieldFilter: new List<string>(["system"]) });
        }
        if (doc.emptyAudio === undefined) {
            doc.emptyAudio = Docs.Create.AudioDocument(nullAudio, { _width: 200, title: "audio recording", system: true, cloneFieldFilter: new List<string>(["system"]) });
            ((doc.emptyAudio as Doc).proto as Doc)["dragFactory-count"] = 0;
        }
        if (doc.emptyNote === undefined) {
            doc.emptyNote = Docs.Create.TextDocument("", { _width: 200, title: "text note", _autoHeight: true, system: true, cloneFieldFilter: new List<string>(["system"]) });
            ((doc.emptyNote as Doc).proto as Doc)["dragFactory-count"] = 0;
        }
        if (doc.emptyImage === undefined) {
            doc.emptyImage = Docs.Create.ImageDocument("https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Cat03.jpg/1200px-Cat03.jpg", { _width: 250, _nativeWidth: 250, title: "an image of a cat", system: true });
        }
        if (doc.emptyButton === undefined) {
            doc.emptyButton = Docs.Create.ButtonDocument({ _width: 150, _height: 50, _xPadding: 10, _yPadding: 10, title: "Button", system: true, cloneFieldFilter: new List<string>(["system"]) });
            ((doc.emptyButton as Doc).proto as Doc)["dragFactory-count"] = 0;
        }
        if (doc.emptyWebpage === undefined) {
            doc.emptyWebpage = Docs.Create.WebDocument("", { title: "webpage", _nativeWidth: 850, isTemplateDoc: true, _height: 512, _width: 400, useCors: true, system: true, cloneFieldFilter: new List<string>(["system"]) });
        }
        if (doc.activeMobileMenu === undefined) {
            this.setupActiveMobileMenu(doc);
        }
        return [
            { toolTip: "Tap to create a note in a new pane, drag for a note", title: "Note", icon: "sticky-note", click: 'openOnRight(copyDragFactory(this.clickFactory))', drag: 'copyDragFactory(this.dragFactory)', dragFactory: doc.emptyNote as Doc, noviceMode: true, clickFactory: doc.emptyNote as Doc, },
            { toolTip: "Tap to create a collection in a new pane, drag for a collection", title: "Col", icon: "folder", click: 'openOnRight(copyDragFactory(this.clickFactory))', drag: 'copyDragFactory(this.dragFactory)', dragFactory: doc.emptyCollection as Doc, noviceMode: true, clickFactory: doc.emptyPane as Doc, },
            { toolTip: "Tap to create a webpage in a new pane, drag for a webpage", title: "Web", icon: "globe-asia", click: 'openOnRight(copyDragFactory(this.dragFactory))', drag: 'copyDragFactory(this.dragFactory)', dragFactory: doc.emptyWebpage as Doc, noviceMode: true },
            { toolTip: "Tap to create a progressive slide", title: "Slide", icon: "file", click: 'openOnRight(copyDragFactory(this.dragFactory))', drag: 'copyDragFactory(this.dragFactory)', dragFactory: doc.emptySlide as Doc, noviceMode: true },
            { toolTip: "Tap to create a cat image in a new pane, drag for a cat image", title: "Image", icon: "cat", click: 'openOnRight(copyDragFactory(this.dragFactory))', drag: 'copyDragFactory(this.dragFactory)', dragFactory: doc.emptyImage as Doc },
            { toolTip: "Tap to create a comparison box in a new pane, drag for a comparison box", title: "Compare", icon: "columns", click: 'openOnRight(copyDragFactory(this.dragFactory))', drag: 'copyDragFactory(this.dragFactory)', dragFactory: doc.emptyComparison as Doc, noviceMode: true },
            { toolTip: "Tap to create a screen grabber in a new pane, drag for a screen grabber", title: "Grab", icon: "photo-video", click: 'openOnRight(copyDragFactory(this.dragFactory))', drag: 'copyDragFactory(this.dragFactory)', dragFactory: doc.emptyScreenshot as Doc, noviceMode: true },
            { toolTip: "Tap to create an audio recorder in a new pane, drag for an audio recorder", title: "Audio", icon: "microphone", click: 'openOnRight(copyDragFactory(this.dragFactory))', drag: 'copyDragFactory(this.dragFactory)', dragFactory: doc.emptyAudio as Doc, noviceMode: true },
            { toolTip: "Tap to create a button in a new pane, drag for a button", title: "Button", icon: "bolt", click: 'openOnRight(copyDragFactory(this.dragFactory))', drag: 'copyDragFactory(this.dragFactory)', dragFactory: doc.emptyButton as Doc },
            { toolTip: "Tap to create a presentation in a new pane, drag for a presentation", title: "Trails", icon: "pres-trail", click: 'openOnRight(Doc.UserDoc().activePresentation = copyDragFactory(this.dragFactory))', drag: `Doc.UserDoc().activePresentation = copyDragFactory(this.dragFactory)`, dragFactory: doc.emptyPresentation as Doc, noviceMode: true },
            { toolTip: "Tap to create a scripting box in a new pane, drag for a scripting box", title: "Script", icon: "terminal", click: 'openOnRight(copyDragFactory(this.dragFactory))', drag: 'copyDragFactory(this.dragFactory)', dragFactory: doc.emptyScript as Doc },
            { toolTip: "Tap to create a mobile view in a new pane, drag for a mobile view", title: "Phone", icon: "mobile", click: 'openOnRight(Doc.UserDoc().activeMobileMenu)', drag: 'this.dragFactory', dragFactory: doc.activeMobileMenu as Doc },
            { toolTip: "Tap to create a custom header note document, drag for a custom header note", title: "Custom", icon: "window-maximize", click: 'openOnRight(delegateDragFactory(this.dragFactory))', drag: 'delegateDragFactory(this.dragFactory)', dragFactory: doc.emptyHeader as Doc },
            { toolTip: "Toggle a Calculator REPL", title: "repl", icon: "calculator", click: 'addOverlayWindow("ScriptingRepl", { x: 300, y: 100, width: 200, height: 200, title: "Scripting REPL" })' },
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
        const creatorBtns = buttons.map(({ title, toolTip, icon, ignoreClick, drag, click, backgroundColor, dragFactory, noviceMode, clickFactory }) => Docs.Create.FontIconDocument({
            _nativeWidth: 50, _nativeHeight: 50, _width: 35, _height: 35,
            icon,
            title,
            toolTip,
            ignoreClick,
            _dropAction: "alias",
            onDragStart: drag ? ScriptField.MakeFunction(drag) : undefined,
            onClick: click ? ScriptField.MakeScript(click) : undefined,
            backgroundColor,
            _hideContextMenu: true,
            _removeDropProperties: new List<string>(["_stayInCollection"]),
            _stayInCollection: true,
            dragFactory,
            clickFactory,
            hidden: !noviceMode ? ComputedField.MakeFunction("IsNoviceMode()") as any : undefined,
            system: true,
        }));

        if (dragCreatorSet === undefined) {
            doc.myItemCreators = new PrefetchProxy(Docs.Create.MasonryDocument(creatorBtns, {
                title: "Basic Item Creators", _showTitle: "title", _xMargin: 0, _stayInCollection: true, _hideContextMenu: true, _chromeHidden: true,
                _autoHeight: true, _width: 500, _height: 300, _fitWidth: true, _columnWidth: 35, ignoreClick: true, _lockedPosition: true,
                dropConverter: ScriptField.MakeScript("convertToButtons(dragData)", { dragData: DragManager.DocumentDragData.name }), system: true
            }));
        } else {
            creatorBtns.forEach(nb => Doc.AddDocToList(doc.myItemCreators as Doc, "data", nb));
        }
        return doc.myItemCreators as Doc;
    }

    static async menuBtnDescriptions(doc: Doc) {
        return [
            { title: "Dashboards", target: Cast(doc.myDashboards, Doc, null), icon: "desktop", click: 'selectMainMenu(self)' },
            { title: "My Files", target: Cast(doc.myFilesystem, Doc, null), icon: "file", click: 'selectMainMenu(self)' },
            { title: "Tools", target: Cast(doc.myTools, Doc, null), icon: "wrench", click: 'selectMainMenu(self)' },
            { title: "Import", target: Cast(doc.myImportPanel, Doc, null), icon: "upload", click: 'selectMainMenu(self)' },
            { title: "Recently Closed", target: Cast(doc.myRecentlyClosedDocs, Doc, null), icon: "archive", click: 'selectMainMenu(self)' },
            { title: "Sharing", target: Cast(doc.mySharedDocs, Doc, null), icon: "users", click: 'selectMainMenu(self)', watchedDocuments: doc.mySharedDocs as Doc },
            { title: "Pres. Trails", target: Cast(doc.myPresentations, Doc, null), icon: "pres-trail", click: 'selectMainMenu(self)' },
            { title: "Help", target: undefined as any, icon: "question-circle", click: 'selectMainMenu(self)' },
            { title: "Settings", target: undefined as any, icon: "cog", click: 'selectMainMenu(self)' },
            { title: "User Doc", target: Cast(doc.myUserDoc, Doc, null), icon: "address-card", click: 'selectMainMenu(self)' },
        ];
    }

    static setupSearchPanel(doc: Doc) {
        if (doc.mySearchPanelDoc === undefined) {
            doc.mySearchPanelDoc = new PrefetchProxy(Docs.Create.SearchDocument({
                _width: 500, _height: 300, backgroundColor: "dimGray", ignoreClick: true, _searchDoc: true,
                childDropAction: "alias", _lockedPosition: true, _viewType: CollectionViewType.Schema, title: "sidebar search stack", system: true
            })) as any as Doc;
        }
    }
    static async setupMenuPanel(doc: Doc, sharingDocumentId: string, linkDatabaseId: string) {
        if (doc.menuStack === undefined) {
            await this.setupSharingSidebar(doc, sharingDocumentId, linkDatabaseId);  // sets up the right sidebar collection for mobile upload documents and sharing
            const menuBtns = (await CurrentUserUtils.menuBtnDescriptions(doc)).map(({ title, target, icon, click, watchedDocuments }) =>
                Docs.Create.FontIconDocument({
                    icon,
                    iconShape: "square",
                    _stayInCollection: true,
                    _hideContextMenu: true,
                    system: true,
                    dontUndo: true,
                    title,
                    target,
                    backgroundColor: "black",
                    _dropAction: "alias",
                    _removeDropProperties: new List<string>(["dropAction", "_stayInCollection"]),
                    _width: 60,
                    _height: 60,
                    watchedDocuments,
                    onClick: ScriptField.MakeScript(click, { scriptContext: "any" })
                }));
            // hack -- last button is assumed to be the userDoc
            menuBtns[menuBtns.length - 1].hidden = ComputedField.MakeFunction("IsNoviceMode()");

            doc.menuStack = new PrefetchProxy(Docs.Create.StackingDocument(menuBtns, {
                title: "menuItemPanel",
                childDropAction: "alias",
                _chromeHidden: true,
                dropConverter: ScriptField.MakeScript("convertToButtons(dragData)", { dragData: DragManager.DocumentDragData.name }),
                backgroundColor: "black", ignoreClick: true,
                _gridGap: 0,
                _yMargin: 0,
                _yPadding: 0, _xMargin: 0, _autoHeight: false, _width: 60, _columnWidth: 60, _lockedPosition: true, system: true
            }));
        }
        // this resets all sidebar buttons to being deactivated
        PromiseValue(Cast(doc.menuStack, Doc)).then(stack => {
            stack && PromiseValue(stack.data).then(btns => {
                DocListCastAsync(btns).then(bts => bts?.forEach(btn => {
                    btn.color = "white";
                    btn._backgroundColor = "";
                    btn.dontUndo = true;
                    btn.system = true;
                    if (btn.title === "Catalog" || btn.title === "My Files") { // migration from Catalog to My Files
                        btn.target = Doc.UserDoc().myFilesystem;
                        btn.title = "My Files";
                    }
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
            _width: 980, ignoreClick: true, _lockedPosition: false, title: "home", _yMargin: 100, system: true, _chromeHidden: true,
        }));
        return menu;
    }

    // SEts up mobile buttons for inside mobile menu
    static setupMobileButtons(doc?: Doc, buttons?: string[]) {
        const docProtoData: { title: string, icon: string, drag?: string, ignoreClick?: boolean, click?: string, activePen?: Doc, backgroundColor?: string, info: string, dragFactory?: Doc }[] = [
            { title: "DASHBOARDS", icon: "bars", click: 'switchToMobileLibrary()', backgroundColor: "lightgrey", info: "Access your Dashboards from your mobile, and navigate through all of your documents. " },
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
                _lockedPosition: true,
                onClick: data.click ? ScriptField.MakeScript(data.click) : undefined,
                backgroundColor: data.backgroundColor, system: true
            },
                [this.ficon({ ignoreClick: true, icon: data.icon, backgroundColor: "rgba(0,0,0,0)", system: true }), this.mobileTextContainer({}, [this.mobileButtonText({}, data.title), this.mobileButtonInfo({}, data.info)])])
        );
    }

    // sets up the main document for the mobile button
    static mobileButton = (opts: DocumentOptions, docs: Doc[]) => Docs.Create.MulticolumnDocument(docs, {
        ...opts,
        _removeDropProperties: new List<string>(["dropAction"]), _nativeWidth: 900, _nativeHeight: 250, _width: 900, _height: 250, _yMargin: 15,
        borderRounding: "5px", boxShadow: "0 0", system: true
    }) as any as Doc

    // sets up the text container for the information contained within the mobile button
    static mobileTextContainer = (opts: DocumentOptions, docs: Doc[]) => Docs.Create.MultirowDocument(docs, {
        ...opts,
        _removeDropProperties: new List<string>(["dropAction"]), _nativeWidth: 450, _nativeHeight: 250, _width: 450, _height: 250, _yMargin: 25,
        backgroundColor: "rgba(0,0,0,0)", borderRounding: "0", boxShadow: "0 0", ignoreClick: true, system: true
    }) as any as Doc

    // Sets up the title of the button
    static mobileButtonText = (opts: DocumentOptions, buttonTitle: string) => Docs.Create.TextDocument(buttonTitle, {
        ...opts,
        title: buttonTitle, _fontSize: "37px", _xMargin: 0, _yMargin: 0, ignoreClick: true, backgroundColor: "rgba(0,0,0,0)", system: true
    }) as any as Doc

    // Sets up the description of the button
    static mobileButtonInfo = (opts: DocumentOptions, buttonInfo: string) => Docs.Create.TextDocument(buttonInfo, {
        ...opts,
        title: "info", _fontSize: "25px", _xMargin: 0, _yMargin: 0, ignoreClick: true, backgroundColor: "rgba(0,0,0,0)", _dimMagnitude: 2, system: true
    }) as any as Doc


    static setupThumbButtons(doc: Doc) {
        const docProtoData: { title: string, icon: string, drag?: string, ignoreClick?: boolean, pointerDown?: string, pointerUp?: string, clipboard?: Doc, backgroundColor?: string, dragFactory?: Doc }[] = [
            { title: "use pen", icon: "pen-nib", pointerUp: "resetPen()", pointerDown: 'setPen(2, this.backgroundColor)', backgroundColor: "blue" },
            { title: "use highlighter", icon: "highlighter", pointerUp: "resetPen()", pointerDown: 'setPen(20, this.backgroundColor)', backgroundColor: "yellow" },
            { title: "notepad", icon: "clipboard", pointerUp: "GestureOverlay.Instance.closeFloatingDoc()", pointerDown: 'GestureOverlay.Instance.openFloatingDoc(this.clipboard)', clipboard: Docs.Create.FreeformDocument([], { _width: 300, _height: 300, system: true }), backgroundColor: "orange" },
            { title: "interpret text", icon: "font", pointerUp: "setToolglass('none')", pointerDown: "setToolglass('inktotext')", backgroundColor: "orange" },
            { title: "ignore gestures", icon: "signature", pointerUp: "setToolglass('none')", pointerDown: "setToolglass('ignoregesture')", backgroundColor: "green" },
        ];
        return docProtoData.map(data => Docs.Create.FontIconDocument({
            _nativeWidth: 10, _nativeHeight: 10, _width: 10, _height: 10, title: data.title, icon: data.icon,
            _dropAction: data.pointerDown ? "copy" : undefined, ignoreClick: data.ignoreClick,
            onDragStart: data.drag ? ScriptField.MakeFunction(data.drag) : undefined,
            clipboard: data.clipboard,
            onPointerUp: data.pointerUp ? ScriptField.MakeScript(data.pointerUp) : undefined, onPointerDown: data.pointerDown ? ScriptField.MakeScript(data.pointerDown) : undefined,
            backgroundColor: data.backgroundColor,
            _removeDropProperties: new List<string>(["dropAction"]), dragFactory: data.dragFactory, system: true
        }));
    }

    static setupThumbDoc(userDoc: Doc) {
        if (!userDoc.thumbDoc) {
            const thumbDoc = Docs.Create.LinearDocument(CurrentUserUtils.setupThumbButtons(userDoc), {
                _width: 100, _height: 50, ignoreClick: true, _lockedPosition: true, title: "buttons",
                _autoHeight: true, _yMargin: 5, linearViewIsExpanded: true, backgroundColor: "white", system: true
            });
            thumbDoc.inkToTextDoc = Docs.Create.LinearDocument([], {
                _width: 300, _height: 25, _autoHeight: true, linearViewIsExpanded: true, flexDirection: "column", system: true
            });
            userDoc.thumbDoc = thumbDoc;
        }
        return Cast(userDoc.thumbDoc, Doc);
    }

    static setupMobileInkingDoc(userDoc: Doc) {
        return Docs.Create.FreeformDocument([], { title: "Mobile Inking", backgroundColor: "white", system: true });
    }

    static setupMobileUploadDoc(userDoc: Doc) {
        // const addButton = Docs.Create.FontIconDocument({ onDragStart: ScriptField.MakeScript('addWebToMobileUpload()'), title: "Add Web Doc to Upload Collection", icon: "plus", backgroundColor: "black" })
        const webDoc = Docs.Create.WebDocument("https://www.britannica.com/biography/Miles-Davis", {
            title: "Upload Images From the Web", _lockedPosition: true, system: true
        });
        const uploadDoc = Docs.Create.StackingDocument([], {
            title: "Mobile Upload Collection", backgroundColor: "white", _lockedPosition: true, system: true, _chromeHidden: true,
        });
        return Docs.Create.StackingDocument([webDoc, uploadDoc], {
            _width: screen.width, _lockedPosition: true, title: "Upload", _autoHeight: true, _yMargin: 80, backgroundColor: "lightgray", system: true, _chromeHidden: true,
        });
    }

    static setupLibrary(userDoc: Doc) {
        return CurrentUserUtils.setupDashboards(userDoc);
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
                title: "all Creators", _yMargin: 0, _autoHeight: true, _xMargin: 0, _fitWidth: true,
                _width: 500, _height: 300, ignoreClick: true, _lockedPosition: true, system: true, _chromeHidden: true,
            }));
        }
        // setup a color picker
        if (doc.myColorPicker === undefined) {
            const color = Docs.Create.ColorDocument({
                title: "color picker", _width: 220, _dropAction: "alias", _hideContextMenu: true, _stayInCollection: true, _forceActive: true, _removeDropProperties: new List<string>(["dropAction", "_stayInCollection", "_hideContextMenu", "forceActive"]), system: true
            });
            doc.myColorPicker = new PrefetchProxy(color);
        }

        if (doc.myTools === undefined) {
            const toolsStack = new PrefetchProxy(Docs.Create.StackingDocument([doc.myCreators as Doc, doc.myColorPicker as Doc], {
                title: "My Tools", _width: 500, _yMargin: 20, ignoreClick: true, _lockedPosition: true, _forceActive: true,
                system: true, _stayInCollection: true, _hideContextMenu: true, _chromeHidden: true,
            })) as any as Doc;

            doc.myTools = toolsStack;
        }
    }

    static async setupDashboards(doc: Doc) {
        // setup dashboards library item
        await doc.myDashboards;
        if (doc.myDashboards === undefined) {
            doc.myDashboards = new PrefetchProxy(Docs.Create.TreeDocument([], {
                title: "My Dashboards", _height: 400, childHideLinkButton: true,
                treeViewHideTitle: true, _xMargin: 5, _yMargin: 5, _gridGap: 5, _forceActive: true, childDropAction: "alias",
                treeViewTruncateTitleWidth: 150, ignoreClick: true,
                _lockedPosition: true, boxShadow: "0 0", childDontRegisterViews: true, targetDropAction: "same", system: true
            }));
            const newDashboard = ScriptField.MakeScript(`createNewDashboard(Doc.UserDoc())`);
            (doc.myDashboards as any as Doc).contextMenuScripts = new List<ScriptField>([newDashboard!]);
            (doc.myDashboards as any as Doc).contextMenuLabels = new List<string>(["Create New Dashboard"]);
        }
        return doc.myDashboards as any as Doc;
    }

    static async setupPresentations(doc: Doc) {
        await doc.myPresentations;
        if (doc.myPresentations === undefined) {
            doc.myPresentations = new PrefetchProxy(Docs.Create.TreeDocument([], {
                title: "My Presentations", _height: 100,
                treeViewHideTitle: true, _xMargin: 5, _yMargin: 5, _gridGap: 5, _forceActive: true, childDropAction: "alias",
                treeViewTruncateTitleWidth: 150, ignoreClick: true,
                _lockedPosition: true, boxShadow: "0 0", childDontRegisterViews: true, targetDropAction: "same", system: true
            }));
            const newPresentations = ScriptField.MakeScript(`createNewPresentation()`);
            (doc.myPresentations as any as Doc).contextMenuScripts = new List<ScriptField>([newPresentations!]);
            (doc.myPresentations as any as Doc).contextMenuLabels = new List<string>(["Create New Presentation"]);
            const presentations = doc.myPresentations as any as Doc;
        }
        return doc.myPresentations as any as Doc;
    }

    static async setupFilesystem(doc: Doc) {
        await doc.myFilesystem;
        if (doc.myFilesystem === undefined) {
            doc.myFileOrphans = Docs.Create.TreeDocument([], { title: "Unfiled", _stayInCollection: true, system: true, isFolder: true });
            doc.myFileRoot = Docs.Create.TreeDocument([], { title: "file root", _stayInCollection: true, system: true, isFolder: true });
            doc.myFilesystem = new PrefetchProxy(Docs.Create.TreeDocument([doc.myFileRoot as Doc, doc.myFileOrphans as Doc], {
                title: "My Documents", _height: 100,
                treeViewHideTitle: true, _xMargin: 5, _yMargin: 5, _gridGap: 5, _forceActive: true, childDropAction: "alias",
                treeViewTruncateTitleWidth: 150, ignoreClick: true,
                isFolder: true, treeViewType: "fileSystem", childHideLinkButton: true,
                _lockedPosition: true, boxShadow: "0 0", childDontRegisterViews: true, targetDropAction: "proto", system: true
            }));
        }
        return doc.myFilesystem as any as Doc;
    }

    static setupRecentlyClosedDocs(doc: Doc) {
        // setup Recently Closed library item
        if (doc.myRecentlyClosedDocs === undefined) {
            doc.myRecentlyClosedDocs = new PrefetchProxy(Docs.Create.TreeDocument([], {
                title: "Recently Closed", treeViewShowClearButton: true, childHideLinkButton: true,
                treeViewHideTitle: true, _xMargin: 5, _yMargin: 5, _gridGap: 5, _forceActive: true, childDropAction: "alias",
                treeViewTruncateTitleWidth: 150, ignoreClick: true,
                _lockedPosition: true, boxShadow: "0 0", childDontRegisterViews: true, targetDropAction: "same", system: true
            }));
            const clearAll = ScriptField.MakeScript(`getProto(self).data = new List([])`);
            (doc.myRecentlyClosedDocs as any as Doc).contextMenuScripts = new List<ScriptField>([clearAll!]);
            (doc.myRecentlyClosedDocs as any as Doc).contextMenuLabels = new List<string>(["Clear All"]);
        }
    }
    static setupFilterDocs(doc: Doc) {
        // setup Filter item
        if (doc.currentFilter === undefined) {
            doc.currentFilter = Docs.Create.FilterDocument({
                title: "unnamed filter", _height: 150,
                treeViewHideTitle: true, _xMargin: 5, _yMargin: 5, _gridGap: 5, _forceActive: true, childDropAction: "none",
                treeViewTruncateTitleWidth: 150, ignoreClick: true,
                _lockedPosition: true, boxShadow: "0 0", childDontRegisterViews: true, targetDropAction: "same", system: true, _autoHeight: true, _fitWidth: true
            });
            const clearAll = ScriptField.MakeScript(`getProto(self).data = new List([])`);
            (doc.currentFilter as Doc).contextMenuScripts = new List<ScriptField>([clearAll!]);
            (doc.currentFilter as Doc).contextMenuLabels = new List<string>(["Clear All"]);
            (doc.currentFilter as Doc).filterBoolean = "AND";
        }
    }

    static setupUserDoc(doc: Doc) {
        if (doc.myUserDoc === undefined) {
            doc.treeViewOpen = true;
            doc.treeViewExpandedView = "fields";
            doc.myUserDoc = new PrefetchProxy(Docs.Create.TreeDocument([doc], {
                treeViewHideTitle: true, _xMargin: 5, _yMargin: 5, _gridGap: 5, _forceActive: true, title: "My UserDoc",
                treeViewTruncateTitleWidth: 150, ignoreClick: true,
                _lockedPosition: true, boxShadow: "0 0", childDontRegisterViews: true, targetDropAction: "same", system: true
            })) as any as Doc;
        }
    }

    static setupSidebarContainer(doc: Doc) {
        if (doc.sidebar === undefined) {
            const sidebarContainer = new Doc();
            sidebarContainer.system = true;
            doc.sidebar = new PrefetchProxy(sidebarContainer);
        }
        return doc.sidebar as Doc;
    }

    // setup the list of sidebar mode buttons which determine what is displayed in the sidebar
    static async setupSidebarButtons(doc: Doc) {
        CurrentUserUtils.setupSidebarContainer(doc);
        await CurrentUserUtils.setupToolsBtnPanel(doc);
        CurrentUserUtils.setupDashboards(doc);
        CurrentUserUtils.setupPresentations(doc);
        CurrentUserUtils.setupFilesystem(doc);
        CurrentUserUtils.setupRecentlyClosedDocs(doc);
        // CurrentUserUtils.setupFilterDocs(doc);
        CurrentUserUtils.setupUserDoc(doc);
    }

    static blist = (opts: DocumentOptions, docs: Doc[]) => new PrefetchProxy(Docs.Create.LinearDocument(docs, {
        ...opts, _gridGap: 5, _xMargin: 5, _yMargin: 5, _height: 42, _width: 100, boxShadow: "0 0", _forceActive: true,
        dropConverter: ScriptField.MakeScript("convertToButtons(dragData)", { dragData: DragManager.DocumentDragData.name }),
        backgroundColor: "black", _lockedPosition: true, linearViewIsExpanded: true, system: true
    })) as any as Doc

    static ficon = (opts: DocumentOptions) => new PrefetchProxy(Docs.Create.FontIconDocument({
        ...opts, _dropAction: "alias", _removeDropProperties: new List<string>(["_dropAction", "stayInCollection"]), _nativeWidth: 40, _nativeHeight: 40, _width: 40, _height: 40, system: true
    })) as any as Doc

    /// sets up the default list of buttons to be shown in the expanding button menu at the bottom of the Dash window
    static setupDockedButtons(doc: Doc) {
        if (doc["dockedBtn-undo"] === undefined) {
            doc["dockedBtn-undo"] = CurrentUserUtils.ficon({ onClick: ScriptField.MakeScript("undo()"), dontUndo: true, _stayInCollection: true, _dropAction: "alias", _hideContextMenu: true, _removeDropProperties: new List<string>(["dropAction", "_hideContextMenu", "stayInCollection"]), toolTip: "click to undo", title: "undo", icon: "undo-alt", system: true });
        }
        if (doc["dockedBtn-redo"] === undefined) {
            doc["dockedBtn-redo"] = CurrentUserUtils.ficon({ onClick: ScriptField.MakeScript("redo()"), dontUndo: true, _stayInCollection: true, _dropAction: "alias", _hideContextMenu: true, _removeDropProperties: new List<string>(["dropAction", "_hideContextMenu", "stayInCollection"]), toolTip: "click to redo", title: "redo", icon: "redo-alt", system: true });
        }
        if (doc.dockedBtns === undefined) {
            doc.dockedBtns = CurrentUserUtils.blist({ title: "docked buttons", ignoreClick: true }, [doc["dockedBtn-undo"] as Doc, doc["dockedBtn-redo"] as Doc]);
        }
        (doc["dockedBtn-undo"] as Doc).dontUndo = true;
        (doc["dockedBtn-redo"] as Doc).dontUndo = true;
    }
    // sets up the default set of documents to be shown in the Overlay layer
    static setupOverlays(doc: Doc) {
        if (doc.myOverlayDocs === undefined) {
            doc.myOverlayDocs = new PrefetchProxy(Docs.Create.FreeformDocument([], { title: "overlay documents", backgroundColor: "#aca3a6", system: true }));
        }
    }

    // the initial presentation Doc to use
    static setupDefaultPresentation(doc: Doc) {
        if (doc["template-presentation"] === undefined) {
            doc["template-presentation"] = new PrefetchProxy(Docs.Create.PresElementBoxDocument({
                title: "pres element template", backgroundColor: "transparent", _xMargin: 5, _fitWidth: true, _height: 46, isTemplateDoc: true, isTemplateForField: "data", system: true
            }));
        }
    }

    // Sharing sidebar is where shared documents are contained
    static async setupSharingSidebar(doc: Doc, sharingDocumentId: string, linkDatabaseId: string) {
        if (doc.myLinkDatabase === undefined) {
            let linkDocs = Docs.newAccount ? undefined : await DocServer.GetRefField(linkDatabaseId);
            if (!linkDocs) {
                linkDocs = new Doc(linkDatabaseId, true);
                (linkDocs as Doc).author = Doc.CurrentUserEmail;
                (linkDocs as Doc).data = new List<Doc>([]);
                (linkDocs as Doc)["acl-Public"] = SharingPermissions.Add;
            }
            doc.myLinkDatabase = new PrefetchProxy(linkDocs);
        }
        if (doc.mySharedDocs === undefined) {
            let sharedDocs = Docs.newAccount ? undefined : await DocServer.GetRefField(sharingDocumentId + "outer");
            if (!sharedDocs) {
                sharedDocs = Docs.Create.TreeDocument([], {
                    title: "My SharedDocs", childDropAction: "alias", system: true, contentPointerEvents: "all", childLimitHeight: 0, _yMargin: 50, _gridGap: 15,
                    _showTitle: "title", ignoreClick: false, _lockedPosition: true, "acl-Public": SharingPermissions.Add, "_acl-Public": SharingPermissions.Add, _chromeHidden: true,
                }, sharingDocumentId + "outer", sharingDocumentId);
                (sharedDocs as Doc)["acl-Public"] = (sharedDocs as Doc)[DataSym]["acl-Public"] = SharingPermissions.Add;
            }
            if (sharedDocs instanceof Doc) {
                sharedDocs.userColor = sharedDocs.userColor || "rgb(202, 202, 202)";
            }
            doc.mySharedDocs = new PrefetchProxy(sharedDocs);
        }
    }

    // Import sidebar is where shared documents are contained
    static setupImportSidebar(doc: Doc) {
        if (doc.myImportDocs === undefined) {
            doc.myImportDocs = new PrefetchProxy(Docs.Create.StackingDocument([], {
                title: "My ImportDocuments", _forceActive: true, ignoreClick: true, _showTitle: "title", _stayInCollection: true, _hideContextMenu: true, childLimitHeight: 0,
                childDropAction: "alias", _autoHeight: true, _yMargin: 50, _gridGap: 15, _lockedPosition: true, system: true, _chromeHidden: true,
            }));
        }
        if (doc.myImportPanel === undefined) {
            const uploads = Cast(doc.myImportDocs, Doc, null);
            const newUpload = CurrentUserUtils.ficon({ onClick: ScriptField.MakeScript("importDocument()"), toolTip: "Import External document", _stayInCollection: true, _hideContextMenu: true, title: "Import", icon: "upload", system: true });
            doc.myImportPanel = new PrefetchProxy(Docs.Create.StackingDocument([newUpload, uploads], { title: "My ImportPanel", _yMargin: 20, ignoreClick: true, _chromeHidden: true, _stayInCollection: true, _hideContextMenu: true, _lockedPosition: true, system: true }));
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

    static async updateUserDocument(doc: Doc, sharingDocumentId: string, linkDatabaseId: string) {
        if (!doc.globalGroupDatabase) doc.globalGroupDatabase = Docs.Prototypes.MainGroupDocument();
        const groups = await DocListCastAsync((doc.globalGroupDatabase as Doc).data);
        reaction(() => DateCast((doc.globalGroupDatabase as Doc)["data-lastModified"]),
            async () => {
                const groups = await DocListCastAsync((doc.globalGroupDatabase as Doc).data);
                const mygroups = groups?.filter(group => JSON.parse(StrCast(group.members)).includes(Doc.CurrentUserEmail)) || [];
                SnappingManager.SetCachedGroups(["Public", ...mygroups?.map(g => StrCast(g.title))]);
            }, { fireImmediately: true });
        doc.system = true;
        doc.noviceMode = doc.noviceMode === undefined ? "true" : doc.noviceMode;
        doc.title = Doc.CurrentUserEmail;
        doc._raiseWhenDragged = true;
        doc.activeInkColor = StrCast(doc.activeInkColor, "rgb(0, 0, 0)");
        doc.activeInkWidth = StrCast(doc.activeInkWidth, "1");
        doc.activeInkBezier = StrCast(doc.activeInkBezier, "0");
        doc.activeFillColor = StrCast(doc.activeFillColor, "");
        doc.activeArrowStart = StrCast(doc.activeArrowStart, "");
        doc.activeArrowEnd = StrCast(doc.activeArrowEnd, "");
        doc.activeDash = StrCast(doc.activeDash, "0");
        doc.fontSize = StrCast(doc.fontSize, "12px");
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
        doc.savedFilters = new List<Doc>();
        doc.filterDocCount = 0;
        this.setupDefaultIconTemplates(doc);  // creates a set of icon templates triggered by the document deoration icon
        this.setupDocTemplates(doc); // sets up the template menu of templates
        this.setupImportSidebar(doc);
        this.setupActiveMobileMenu(doc); // sets up the current mobile menu for Dash Mobile
        this.setupSearchPanel(doc);
        this.setupOverlays(doc);  // documents in overlay layer
        this.setupDockedButtons(doc);  // the bottom bar of font icons
        await this.setupSidebarButtons(doc); // the pop-out left sidebar of tools/panels
        await this.setupMenuPanel(doc, sharingDocumentId, linkDatabaseId);
        if (!doc.globalScriptDatabase) doc.globalScriptDatabase = Docs.Prototypes.MainScriptDocument();

        setTimeout(() => this.setupDefaultPresentation(doc), 0); // presentation that's initially triggered

        // setup reactions to change the highlights on the undo/redo buttons -- would be better to encode this in the undo/redo buttons, but the undo/redo stacks are not wired up that way yet
        doc["dockedBtn-undo"] && reaction(() => UndoManager.undoStack.slice(), () => Doc.GetProto(doc["dockedBtn-undo"] as Doc).opacity = UndoManager.CanUndo() ? 1 : 0.4, { fireImmediately: true });
        doc["dockedBtn-redo"] && reaction(() => UndoManager.redoStack.slice(), () => Doc.GetProto(doc["dockedBtn-redo"] as Doc).opacity = UndoManager.CanRedo() ? 1 : 0.4, { fireImmediately: true });

        // uncomment this to setup a default note style that uses the custom header layout
        // PromiseValue(doc.emptyHeader).then(factory => {
        //     if (Cast(doc.defaultTextLayout, Doc, null)?.version !== headerViewVersion) {
        //         const deleg = Doc.delegateDragFactory(factory as Doc);
        //         deleg.title = "header";
        //         doc.defaultTextLayout = new PrefetchProxy(deleg);
        //         Doc.AddDocToList(Cast(doc["template-notes"], Doc, null), "data", deleg);
        //     }
        // });
        setTimeout(() => DocServer.UPDATE_SERVER_CACHE(), 2500);
        doc.fieldInfos = await Docs.setupFieldInfos();
        return doc;
    }

    public static async loadCurrentUser() {
        return rp.get(Utils.prepend("/getCurrentUser")).then(async response => {
            if (response) {
                const result: { id: string, email: string, cacheDocumentIds: string } = JSON.parse(response);
                Doc.CurrentUserEmail = result.email;
                resolvedPorts = JSON.parse(await Networking.FetchFromServer("/resolvedPorts"));
                DocServer.init(window.location.protocol, window.location.hostname, resolvedPorts.socket, result.email);
                result.cacheDocumentIds && (await DocServer.GetRefFields(result.cacheDocumentIds.split(";")));
                return result;
            } else {
                throw new Error("There should be a user! Why does Dash think there isn't one?");
            }
        });
    }

    public static async loadUserDocument(id: string) {
        this.curr_id = id;
        await rp.get(Utils.prepend("/getUserDocumentIds")).then(ids => {
            const { userDocumentId, sharingDocumentId, linkDatabaseId } = JSON.parse(ids);
            if (userDocumentId !== "guest") {
                return DocServer.GetRefField(userDocumentId).then(async field => {
                    Docs.newAccount = !(field instanceof Doc);
                    await Docs.Prototypes.initialize();
                    const userDoc = Docs.newAccount ? new Doc(userDocumentId, true) : field as Doc;
                    const updated = this.updateUserDocument(Doc.SetUserDoc(userDoc), sharingDocumentId, linkDatabaseId);
                    (await DocListCastAsync(Cast(Doc.UserDoc().myLinkDatabase, Doc, null)?.data))?.forEach(async link => { // make sure anchors are loaded to avoid incremental updates to computedFn's in LinkManager
                        const a1 = await Cast(link?.anchor1, Doc, null);
                        const a2 = await Cast(link?.anchor2, Doc, null);
                    });
                    return updated;
                });
            } else {
                throw new Error("There should be a user id! Why does Dash think there isn't one?");
            }
        });
    }

    public static _urlState: HistoryUtil.DocUrl;

    public static openDashboard = (userDoc: Doc, doc: Doc, fromHistory = false) => {
        CurrentUserUtils.MainDocId = doc[Id];

        if (doc) {  // this has the side-effect of setting the main container since we're assigning the active/guest dashboard
            !("presentationView" in doc) && (doc.presentationView = new List<Doc>([Docs.Create.TreeDocument([], { title: "Presentation" })]));
            userDoc ? (userDoc.activeDashboard = doc) : (CurrentUserUtils.GuestDashboard = doc);
        }
        const state = CurrentUserUtils._urlState;
        if (state.sharing === true && !userDoc) {
            DocServer.Control.makeReadOnly();
        } else {
            fromHistory || HistoryUtil.pushState({
                type: "doc",
                docId: doc[Id],
                readonly: state.readonly,
                nro: state.nro,
                sharing: false,
            });
            if (state.readonly === true || state.readonly === null) {
                DocServer.Control.makeReadOnly();
            } else if (state.safe) {
                if (!state.nro) {
                    DocServer.Control.makeReadOnly();
                }
                CollectionView.SetSafeMode(true);
            } else if (state.nro || state.nro === null || state.readonly === false) {
            } else if (doc.readOnly) {
                DocServer.Control.makeReadOnly();
            } else {
                DocServer.Control.makeEditable();
            }
        }

        return true;
    }

    public static importDocument = () => {
        const input = document.createElement("input");
        input.type = "file";
        input.multiple = true;
        input.accept = ".zip, application/pdf, video/*, image/*, audio/*";
        input.onchange = async _e => {
            const upload = Utils.prepend("/uploadDoc");
            const formData = new FormData();
            const file = input.files && input.files[0];
            if (file && file.type === 'application/zip') {
                formData.append('file', file);
                formData.append('remap', "true");
                const response = await fetch(upload, { method: "POST", body: formData });
                const json = await response.json();
                if (json !== "error") {
                    const doc = Docs.newAccount ? undefined : await DocServer.GetRefField(json);
                    if (doc instanceof Doc) {
                        setTimeout(() => SearchUtil.Search(`{!join from=id to=proto_i}id:link*`, true, {}).then(docs =>
                            docs.docs.forEach(d => LinkManager.Instance.addLink(d))), 2000); // need to give solr some time to update so that this query will find any link docs we've added.
                    }
                }
            } else if (input.files && input.files.length !== 0) {
                const importDocs = Cast(Doc.UserDoc().myImportDocs, Doc, null);
                const disposer = OverlayView.ShowSpinner();
                DocListCastAsync(importDocs.data).then(async list => {
                    const results = await DocUtils.uploadFilesToDocs(Array.from(input.files || []), {});
                    if (results.length !== input.files?.length) {
                        alert("Error uploading files - possibly due to unsupported file types");
                    }
                    list?.splice(0, 0, ...results);
                    disposer();
                });
            } else {
                console.log("No file selected");
            }
        };
        input.click();
    }

    public static async snapshotDashboard(userDoc: Doc) {
        const copy = await CollectionDockingView.Copy(CurrentUserUtils.ActiveDashboard);
        Doc.AddDocToList(Cast(userDoc.myDashboards, Doc, null), "data", copy);
        CurrentUserUtils.openDashboard(userDoc, copy);
    }

    public static createNewDashboard = async (userDoc: Doc, id?: string) => {
        const myPresentations = await userDoc.myPresentations as Doc;
        const presentation = Doc.MakeCopy(userDoc.emptyPresentation as Doc, true);
        const dashboards = await Cast(userDoc.myDashboards, Doc) as Doc;
        const dashboardCount = DocListCast(dashboards.data).length + 1;
        const emptyPane = Cast(userDoc.emptyPane, Doc, null);
        emptyPane["dragFactory-count"] = NumCast(emptyPane["dragFactory-count"]) + 1;
        const freeformOptions: DocumentOptions = {
            x: 0,
            y: 400,
            _width: 1500,
            _height: 1000,
            _fitWidth: true,
            title: `Untitled Tab ${NumCast(emptyPane["dragFactory-count"])}`,
        };
        const freeformDoc = CurrentUserUtils.GuestTarget || Docs.Create.FreeformDocument([], freeformOptions);
        const dashboardDoc = Docs.Create.StandardCollectionDockingDocument([{ doc: freeformDoc, initialWidth: 600 }], { title: `Dashboard ${dashboardCount}` }, id, "row");
        Doc.AddDocToList(myPresentations, "data", presentation);
        userDoc.activePresentation = presentation;
        const toggleTheme = ScriptField.MakeScript(`self.darkScheme = !self.darkScheme`);
        const toggleComic = ScriptField.MakeScript(`toggleComicMode()`);
        const snapshotDashboard = ScriptField.MakeScript(`snapshotDashboard()`);
        const createDashboard = ScriptField.MakeScript(`createNewDashboard()`);
        const shareDashboard = ScriptField.MakeScript(`shareDashboard(self)`);
        const addToDashboards = ScriptField.MakeScript(`addToDashboards(self)`);
        dashboardDoc.contextMenuScripts = new List<ScriptField>([toggleTheme!, toggleComic!, snapshotDashboard!, createDashboard!, shareDashboard!, addToDashboards!]);
        dashboardDoc.contextMenuLabels = new List<string>(["Toggle Theme Colors", "Toggle Comic Mode", "Snapshot Dashboard", "Create Dashboard", "Share Dashboard", "Add to Dashboards"]);

        Doc.AddDocToList(dashboards, "data", dashboardDoc);
        CurrentUserUtils.openDashboard(userDoc, dashboardDoc);
    }

    public static GetNewTextDoc(title: string, x: number, y: number, width?: number, height?: number, noMargins?: boolean, annotationOn?: Doc, maxHeight?: number) {
        const tbox = Docs.Create.TextDocument("", {
            _xMargin: noMargins ? 0 : undefined, _yMargin: noMargins ? 0 : undefined, annotationOn, docMaxAutoHeight: maxHeight,
            _width: width || 200, _height: height || 100, x: x, y: y, _fitWidth: true, _autoHeight: true, _fontSize: StrCast(Doc.UserDoc().fontSize),
            _fontFamily: StrCast(Doc.UserDoc().fontFamily), title
        });
        const template = Doc.UserDoc().defaultTextLayout;
        if (template instanceof Doc) {
            tbox._width = NumCast(template._width);
            tbox.layoutKey = "layout_" + StrCast(template.title);
            Doc.GetProto(tbox)[StrCast(tbox.layoutKey)] = template;
        }
        return tbox;
    }

    public static get MySearchPanelDoc() { return Cast(Doc.UserDoc().mySearchPanelDoc, Doc, null); }
    public static get ActiveDashboard() { return Cast(Doc.UserDoc().activeDashboard, Doc, null); }
    public static get ActivePresentation() { return Cast(Doc.UserDoc().activePresentation, Doc, null); }
    public static get MyRecentlyClosed() { return Cast(Doc.UserDoc().myRecentlyClosedDocs, Doc, null); }
    public static get MyDashboards() { return Cast(Doc.UserDoc().myDashboards, Doc, null); }
    public static get EmptyPane() { return Cast(Doc.UserDoc().emptyPane, Doc, null); }
    public static get OverlayDocs() { return DocListCast((Doc.UserDoc().myOverlayDocs as Doc)?.data); }
    public static set SelectedTool(tool: InkTool) { Doc.UserDoc().activeInkTool = tool; }
    @computed public static get SelectedTool(): InkTool { return StrCast(Doc.UserDoc().activeInkTool, InkTool.None) as InkTool; }
}

Scripting.addGlobal(function openDragFactory(dragFactory: Doc) {
    const copy = Doc.copyDragFactory(dragFactory);
    if (copy) {
        CollectionDockingView.AddSplit(copy, "right");
        const view = DocumentManager.Instance.getFirstDocumentView(copy);
        view && SelectionManager.SelectView(view, false);
    }
});
Scripting.addGlobal(function IsNoviceMode() { return Doc.UserDoc().noviceMode; },
    "is Dash in novice mode");
Scripting.addGlobal(function snapshotDashboard() { CurrentUserUtils.snapshotDashboard(Doc.UserDoc()); },
    "creates a snapshot copy of a dashboard");
Scripting.addGlobal(function createNewDashboard() { return CurrentUserUtils.createNewDashboard(Doc.UserDoc()); },
    "creates a new dashboard when called");
Scripting.addGlobal(function createNewPresentation() { return MainView.Instance.createNewPresentation(); },
    "creates a new presentation when called");
Scripting.addGlobal(function links(doc: any) { return new List(LinkManager.Instance.getAllRelatedLinks(doc)); },
    "returns all the links to the document or its annotations", "(doc: any)");
Scripting.addGlobal(function importDocument() { return CurrentUserUtils.importDocument(); },
    "imports files from device directly into the import sidebar");
Scripting.addGlobal(function shareDashboard(dashboard: Doc) {
    SharingManager.Instance.open(undefined, dashboard);
},
    "opens sharing dialog for Dashboard");
Scripting.addGlobal(function addToDashboards(dashboard: Doc) { Doc.AddDocToList(CurrentUserUtils.MyDashboards, "data", dashboard); },
    "adds Dashboard to set of Dashboards");