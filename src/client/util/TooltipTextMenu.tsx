import { library, dom } from '@fortawesome/fontawesome-svg-core';
import { faListUl } from '@fortawesome/free-solid-svg-icons';
import { action, observable } from "mobx";
import { Dropdown, icons, MenuItem } from "prosemirror-menu"; //no import css
import { Mark, MarkType, Node as ProsNode, NodeType, ResolvedPos, Schema } from "prosemirror-model";
import { wrapInList } from 'prosemirror-schema-list';
import { EditorState, NodeSelection, TextSelection, Transaction } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { Doc, Field, Opt } from "../../new_fields/Doc";
import { Id } from "../../new_fields/FieldSymbols";
import { Utils } from "../../Utils";
import { DocServer } from "../DocServer";
import { FieldViewProps } from "../views/nodes/FieldView";
import { FormattedTextBoxProps } from "../views/nodes/FormattedTextBox";
import { DocumentManager } from "./DocumentManager";
import { DragManager } from "./DragManager";
import { LinkManager } from "./LinkManager";
import { schema } from "./RichTextSchema";
import "./TooltipTextMenu.scss";
import { Cast, NumCast, StrCast } from '../../new_fields/Types';
import { updateBullets } from './ProsemirrorExampleTransfer';
import { DocumentDecorations } from '../views/DocumentDecorations';
import { SelectionManager } from './SelectionManager';
import { PastelSchemaPalette, DarkPastelSchemaPalette } from '../../new_fields/SchemaHeaderField';
const { toggleMark, setBlockType } = require("prosemirror-commands");
const { openPrompt, TextField } = require("./ProsemirrorCopy/prompt.js");

//appears above a selection of text in a RichTextBox to give user options such as Bold, Italics, etc.
export class TooltipTextMenu {

    public static Toolbar: HTMLDivElement | undefined;

    // editor state
    private view: EditorView;
    // private editorProps: FieldViewProps & FormattedTextBoxProps | undefined;
    private fontStyles: MarkType[] = [];
    private fontSizes: MarkType[] = [];
    private listTypes: (NodeType | any)[] = [];
    private fontSizeToNum: Map<MarkType, number> = new Map();
    private fontStylesToName: Map<MarkType, string> = new Map();
    private listTypeToIcon: Map<NodeType | any, string> = new Map();
    private _activeMarks: Mark[] = [];
    private _marksToDoms: Map<Mark, HTMLSpanElement> = new Map();
    private _collapsed: boolean = false;
    //private link: HTMLAnchorElement;

    // editor doms
    public tooltip: HTMLElement = document.createElement("div");
    private wrapper: HTMLDivElement = document.createElement("div");

    // editor button doms
    private linkEditor?: HTMLDivElement;
    private linkText?: HTMLDivElement;
    private linkDrag?: HTMLImageElement;
    private _linkDropdownDom?: Node;
    private _brushdom?: Node;
    private _brushDropdownDom?: Node;
    private fontSizeDom?: Node;
    private fontStyleDom?: Node;
    private listTypeBtnDom?: Node;
    private colorDom?: Node;
    private colorDropdownDom?: Node;
    private highlightDom?: Node;
    private highlightDropdownDom?: Node;


    // private _collapseBtn?: MenuItem;
    // private _brushIsEmpty: boolean = true;



    constructor(view: EditorView) {
        this.view = view;

        // // replace old active menu with this
        // if (TooltipTextMenuManager.Instance.activeMenu) {
        //     TooltipTextMenuManager.Instance.activeMenu.wrapper.remove();
        // }
        // TooltipTextMenuManager.Instance.activeMenu = this;

        // initialize the tooltip
        this.createTooltip(view);

        // initialize the wrapper
        this.wrapper = document.createElement("div");
        this.wrapper.className = "wrapper";
        this.wrapper.appendChild(this.tooltip);

        // positioning?
        TooltipTextMenu.Toolbar = this.wrapper;
    }

    private async createTooltip(view: EditorView) {
        // initialize tooltip dom
        this.tooltip = document.createElement("div");
        this.tooltip.className = "tooltipMenu";

        // init buttons to the tooltip -- paths to svgs are obtained from fontawesome
        let items = [
            { command: toggleMark(schema.marks.strong), dom: this.svgIcon("strong", "Bold", "M333.49 238a122 122 0 0 0 27-65.21C367.87 96.49 308 32 233.42 32H34a16 16 0 0 0-16 16v48a16 16 0 0 0 16 16h31.87v288H34a16 16 0 0 0-16 16v48a16 16 0 0 0 16 16h209.32c70.8 0 134.14-51.75 141-122.4 4.74-48.45-16.39-92.06-50.83-119.6zM145.66 112h87.76a48 48 0 0 1 0 96h-87.76zm87.76 288h-87.76V288h87.76a56 56 0 0 1 0 112z") },
            { command: toggleMark(schema.marks.em), dom: this.svgIcon("em", "Italic", "M320 48v32a16 16 0 0 1-16 16h-62.76l-80 320H208a16 16 0 0 1 16 16v32a16 16 0 0 1-16 16H16a16 16 0 0 1-16-16v-32a16 16 0 0 1 16-16h62.76l80-320H112a16 16 0 0 1-16-16V48a16 16 0 0 1 16-16h192a16 16 0 0 1 16 16z") },
            { command: toggleMark(schema.marks.underline), dom: this.svgIcon("underline", "Underline", "M32 64h32v160c0 88.22 71.78 160 160 160s160-71.78 160-160V64h32a16 16 0 0 0 16-16V16a16 16 0 0 0-16-16H272a16 16 0 0 0-16 16v32a16 16 0 0 0 16 16h32v160a80 80 0 0 1-160 0V64h32a16 16 0 0 0 16-16V16a16 16 0 0 0-16-16H32a16 16 0 0 0-16 16v32a16 16 0 0 0 16 16zm400 384H16a16 16 0 0 0-16 16v32a16 16 0 0 0 16 16h416a16 16 0 0 0 16-16v-32a16 16 0 0 0-16-16z") },
            { command: toggleMark(schema.marks.strikethrough), dom: this.svgIcon("strikethrough", "Strikethrough", "M496 224H293.9l-87.17-26.83A43.55 43.55 0 0 1 219.55 112h66.79A49.89 49.89 0 0 1 331 139.58a16 16 0 0 0 21.46 7.15l42.94-21.47a16 16 0 0 0 7.16-21.46l-.53-1A128 128 0 0 0 287.51 32h-68a123.68 123.68 0 0 0-123 135.64c2 20.89 10.1 39.83 21.78 56.36H16a16 16 0 0 0-16 16v32a16 16 0 0 0 16 16h480a16 16 0 0 0 16-16v-32a16 16 0 0 0-16-16zm-180.24 96A43 43 0 0 1 336 356.45 43.59 43.59 0 0 1 292.45 400h-66.79A49.89 49.89 0 0 1 181 372.42a16 16 0 0 0-21.46-7.15l-42.94 21.47a16 16 0 0 0-7.16 21.46l.53 1A128 128 0 0 0 224.49 480h68a123.68 123.68 0 0 0 123-135.64 114.25 114.25 0 0 0-5.34-24.36z") },
            { command: toggleMark(schema.marks.superscript), dom: this.svgIcon("superscript", "Superscript", "M496 160h-16V16a16 16 0 0 0-16-16h-48a16 16 0 0 0-14.29 8.83l-16 32A16 16 0 0 0 400 64h16v96h-16a16 16 0 0 0-16 16v32a16 16 0 0 0 16 16h96a16 16 0 0 0 16-16v-32a16 16 0 0 0-16-16zM336 64h-67a16 16 0 0 0-13.14 6.87l-79.9 115-79.9-115A16 16 0 0 0 83 64H16A16 16 0 0 0 0 80v48a16 16 0 0 0 16 16h33.48l77.81 112-77.81 112H16a16 16 0 0 0-16 16v48a16 16 0 0 0 16 16h67a16 16 0 0 0 13.14-6.87l79.9-115 79.9 115A16 16 0 0 0 269 448h67a16 16 0 0 0 16-16v-48a16 16 0 0 0-16-16h-33.48l-77.81-112 77.81-112H336a16 16 0 0 0 16-16V80a16 16 0 0 0-16-16z") },
            { command: toggleMark(schema.marks.subscript), dom: this.svgIcon("subscript", "Subscript", "M496 448h-16V304a16 16 0 0 0-16-16h-48a16 16 0 0 0-14.29 8.83l-16 32A16 16 0 0 0 400 352h16v96h-16a16 16 0 0 0-16 16v32a16 16 0 0 0 16 16h96a16 16 0 0 0 16-16v-32a16 16 0 0 0-16-16zM336 64h-67a16 16 0 0 0-13.14 6.87l-79.9 115-79.9-115A16 16 0 0 0 83 64H16A16 16 0 0 0 0 80v48a16 16 0 0 0 16 16h33.48l77.81 112-77.81 112H16a16 16 0 0 0-16 16v48a16 16 0 0 0 16 16h67a16 16 0 0 0 13.14-6.87l79.9-115 79.9 115A16 16 0 0 0 269 448h67a16 16 0 0 0 16-16v-48a16 16 0 0 0-16-16h-33.48l-77.81-112 77.81-112H336a16 16 0 0 0 16-16V80a16 16 0 0 0-16-16z") },
            // { command: toggleMark(schema.marks.highlight), dom: this.icon("H", 'blue', 'Blue') }
        ];

        // add menu items
        this._marksToDoms = new Map();
        items.forEach(({ dom, command }) => {
            this.tooltip.appendChild(dom);
            switch (dom.title) {
                case "Bold":
                    this._marksToDoms.set(schema.mark(schema.marks.strong), dom);
                    break;
                case "Italic":
                    this._marksToDoms.set(schema.mark(schema.marks.em), dom);
                    break;
                case "Underline":
                    this._marksToDoms.set(schema.mark(schema.marks.underline), dom);
                    break;
            }

            //pointer down handler to activate button effects
            dom.addEventListener("pointerdown", e => {
                e.preventDefault();
                this.view.focus();
                if (dom.contains(e.target as Node)) {
                    e.stopPropagation();
                    command(this.view.state, this.view.dispatch, this.view);
                    // if (this.view.state.selection.empty) {
                    //     if (dom.style.color === "white") { dom.style.color = "greenyellow"; }
                    //     else { dom.style.color = "white"; }
                    // }
                }
            });

        });

        // highlight menu
        this.highlightDom = this.createHighlightTool().render(this.view).dom;
        this.highlightDropdownDom = this.createHighlightDropdown().render(this.view).dom;
        this.tooltip.appendChild(this.highlightDom);
        this.tooltip.appendChild(this.highlightDropdownDom);

        // color menu
        this.colorDom = this.createColorTool().render(this.view).dom;
        this.colorDropdownDom = this.createColorDropdown().render(this.view).dom;
        this.tooltip.appendChild(this.colorDom);
        this.tooltip.appendChild(this.colorDropdownDom);

        // link menu
        this.updateLinkMenu();
        let dropdown = await this.createLinkDropdown();
        this._linkDropdownDom = dropdown.render(this.view).dom;
        this.tooltip.appendChild(this._linkDropdownDom);

        // list of font styles
        this.initFontStyles();

        // font sizes
        this.initFontSizes();

        // list types
        this.initListTypes();

        // init brush tool
        this._brushdom = this.createBrush().render(this.view).dom;
        this.tooltip.appendChild(this._brushdom);
        this._brushDropdownDom = this.createBrushDropdown().render(this.view).dom;
        this.tooltip.appendChild(this._brushDropdownDom);

        // star
        // this.tooltip.appendChild(this.createLink().render(this.view).dom);
        this.tooltip.appendChild(this.createStar().render(this.view).dom);

        //
        this.updateListItemDropdown(":", this.listTypeBtnDom);

        //
        await this.updateFromDash(view, undefined, undefined);
        // TooltipTextMenu.Toolbar = this.wrapper;

        // dragger
        // TODO: onclick handler in drag handles collapsing
        this.createDragger();
    }

    initFontStyles() {
        this.fontStylesToName = new Map();
        this.fontStylesToName.set(schema.marks.timesNewRoman, "Times New Roman");
        this.fontStylesToName.set(schema.marks.arial, "Arial");
        this.fontStylesToName.set(schema.marks.georgia, "Georgia");
        this.fontStylesToName.set(schema.marks.comicSans, "Comic Sans MS");
        this.fontStylesToName.set(schema.marks.tahoma, "Tahoma");
        this.fontStylesToName.set(schema.marks.impact, "Impact");
        this.fontStylesToName.set(schema.marks.crimson, "Crimson Text");
        this.fontStyles = Array.from(this.fontStylesToName.keys());
    }

    initFontSizes() {
        this.fontSizeToNum = new Map();
        this.fontSizeToNum.set(schema.marks.p10, 10);
        this.fontSizeToNum.set(schema.marks.p12, 12);
        this.fontSizeToNum.set(schema.marks.p14, 14);
        this.fontSizeToNum.set(schema.marks.p16, 16);
        this.fontSizeToNum.set(schema.marks.p18, 18);
        this.fontSizeToNum.set(schema.marks.p20, 20);
        this.fontSizeToNum.set(schema.marks.p24, 24);
        this.fontSizeToNum.set(schema.marks.p32, 32);
        this.fontSizeToNum.set(schema.marks.p48, 48);
        this.fontSizeToNum.set(schema.marks.p72, 72);
        this.fontSizeToNum.set(schema.marks.pFontSize, 10);
        this.fontSizes = Array.from(this.fontSizeToNum.keys());
    }

    initListTypes() {
        this.listTypeToIcon = new Map();
        this.listTypeToIcon.set(schema.nodes.bullet_list, ":");
        this.listTypeToIcon.set(schema.nodes.ordered_list.create({ mapStyle: "decimal" }), "1.1");
        this.listTypeToIcon.set(schema.nodes.ordered_list.create({ mapStyle: "multi" }), "1.A");
        // this.listTypeToIcon.set(schema.nodes.bullet_list, "⬜");
        this.listTypes = Array.from(this.listTypeToIcon.keys());
    }

    createDragger() {
        const dragger = document.createElement("div");
        dragger.className = "dragger";

        let draggerWrapper = document.createElement("div");
        draggerWrapper.className = "dragger-wrapper";

        let line1 = document.createElement("span");
        line1.className = "dragger-line";
        let line2 = document.createElement("span");
        line2.className = "dragger-line";
        let line3 = document.createElement("span");
        line3.className = "dragger-line";

        draggerWrapper.appendChild(line1);
        draggerWrapper.appendChild(line2);
        draggerWrapper.appendChild(line3);

        dragger.appendChild(draggerWrapper);

        this.tooltip.appendChild(dragger);
        this.dragElement(dragger);
    }

    //label of dropdown will change to given label
    updateFontSizeDropdown(label: string) {
        //filtering function - might be unecessary
        let cut = (arr: MenuItem[]) => arr.filter(x => x);

        //font SIZES
        let fontSizeBtns: MenuItem[] = [];
        this.fontSizeToNum.forEach((number, mark) => {
            fontSizeBtns.push(this.dropdownMarkBtn(String(number), "color: black; width: 50px;", mark, this.view, this.changeToMarkInGroup, this.fontSizes));
        });

        let newfontSizeDom = (new Dropdown(cut(fontSizeBtns), {
            label: label,
            css: "color:black; min-width: 60px; padding-left: 5px; margin-right: 0;"
        }) as MenuItem).render(this.view).dom;
        if (this.fontSizeDom) { this.tooltip.replaceChild(newfontSizeDom, this.fontSizeDom); }
        else {
            this.tooltip.appendChild(newfontSizeDom);
        }
        this.fontSizeDom = newfontSizeDom;
    }

    // Make the DIV element draggable

    //label of dropdown will change to given label
    updateFontStyleDropdown(label: string) {
        //filtering function - might be unecessary
        let cut = (arr: MenuItem[]) => arr.filter(x => x);

        //font STYLES
        let fontBtns: MenuItem[] = [];
        this.fontStylesToName.forEach((name, mark) => {
            fontBtns.push(this.dropdownMarkBtn(name, "color: black; font-family: " + name + ", sans-serif; width: 125px;", mark, this.view, this.changeToMarkInGroup, this.fontStyles));
        });

        let newfontStyleDom = (new Dropdown(cut(fontBtns), {
            label: label,
            css: "color:black; width: 125px; margin-left: -3px; padding-left: 2px;"
        }) as MenuItem).render(this.view).dom;
        if (this.fontStyleDom) { this.tooltip.replaceChild(newfontStyleDom, this.fontStyleDom); }
        else {
            this.tooltip.appendChild(newfontStyleDom);
        }
        this.fontStyleDom = newfontStyleDom;

    }

    updateLinkMenu() {
        if (!this.linkEditor || !this.linkText) {
            this.linkEditor = document.createElement("div");
            this.linkEditor.className = "ProseMirror-icon menuicon";
            // this.linkEditor.style.color = "black";
            this.linkText = document.createElement("div");
            // this.linkText.style.cssFloat = "left";
            // this.linkText.style.marginRight = "5px";
            // this.linkText.style.marginLeft = "5px";
            this.linkText.setAttribute("contenteditable", "true");
            this.linkText.style.whiteSpace = "nowrap";
            this.linkText.style.width = "150px";
            this.linkText.style.overflow = "hidden";
            this.linkText.style.color = "white";
            this.linkText.onpointerdown = (e: PointerEvent) => { e.stopPropagation(); };
            let linkBtn = document.createElement("div");
            linkBtn.textContent = ">>";
            linkBtn.style.width = "10px";
            linkBtn.style.height = "10px";
            linkBtn.style.color = "white";
            linkBtn.style.cssFloat = "left";
            linkBtn.onpointerdown = (e: PointerEvent) => {
                let node = this.view.state.selection.$from.nodeAfter;
                let link = node && node.marks.find(m => m.type.name === "link");
                if (link) {
                    let href: string = link.attrs.href;
                    if (href.indexOf(Utils.prepend("/doc/")) === 0) {
                        let docid = href.replace(Utils.prepend("/doc/"), "");
                        DocServer.GetRefField(docid).then(action((f: Opt<Field>) => {
                            if (f instanceof Doc) {
                                if (DocumentManager.Instance.getDocumentView(f)) {
                                    DocumentManager.Instance.getDocumentView(f)!.props.focus(f, false);
                                }
                                else this.editorProps && this.editorProps.addDocTab(f, undefined, "onRight");
                            }
                        }));
                    }
                    // TODO This should have an else to handle external links
                    e.stopPropagation();
                    e.preventDefault();
                }
            };
            this.linkDrag = document.createElement("img");
            this.linkDrag.src = "https://seogurusnyc.com/wp-content/uploads/2016/12/link-1.png";
            this.linkDrag.style.width = "15px";
            this.linkDrag.style.height = "15px";
            this.linkDrag.title = "Drag to create link";
            this.linkDrag.id = "link-drag";
            // this.linkDrag.style.color = "black";
            // this.linkDrag.style.background = "black";
            // this.linkDrag.style.cssFloat = "left";
            this.linkDrag.onpointerdown = (e: PointerEvent) => {
                if (!this.editorProps) return;
                let dragData = new DragManager.LinkDragData(this.editorProps.Document);
                dragData.dontClearTextBox = true;
                // hack to get source context -sy
                let docView = DocumentManager.Instance.getDocumentView(this.editorProps.Document);
                e.stopPropagation();
                let ctrlKey = e.ctrlKey;
                DragManager.StartLinkDrag(this.linkDrag!, dragData, e.clientX, e.clientY,
                    {
                        handlers: {
                            dragComplete: action(() => {
                                if (dragData.linkDocument) {
                                    let linkDoc = dragData.linkDocument;
                                    let proto = Doc.GetProto(linkDoc);
                                    if (proto && docView) {
                                        proto.sourceContext = docView.props.ContainingCollectionDoc;
                                    }
                                    let text = this.makeLinkToDoc(linkDoc, ctrlKey ? "onRight" : "inTab");
                                    if (linkDoc instanceof Doc && linkDoc.anchor2 instanceof Doc) {
                                        proto.title = text === "" ? proto.title : text + " to " + linkDoc.anchor2.title; // TODODO open to more descriptive descriptions of following in text link
                                    }
                                }
                            }),
                        },
                        hideSource: false
                    });
                e.stopPropagation();
                e.preventDefault();
            };
            this.linkEditor.appendChild(this.linkDrag);
            this.tooltip.appendChild(this.linkEditor);
        }

        let node = this.view.state.selection.$from.nodeAfter;
        let link = node && node.marks.find(m => m.type.name === "link");
        this.linkText.textContent = link ? link.attrs.href : "-empty-";

        this.linkText.onkeydown = (e: KeyboardEvent) => {
            if (e.key === "Enter") {
                // this.makeLink(this.linkText!.textContent!);
                e.stopPropagation();
                e.preventDefault();
            }
        };
        // this.tooltip.appendChild(this.linkEditor);
    }

    async getTextLinkTargetTitle() {
        let node = this.view.state.selection.$from.nodeAfter;
        let link = node && node.marks.find(m => m.type.name === "link");
        // let href = link!.attrs.href;
        if (link) {
            let href = link.attrs.href;
            if (href) {
                if (href.indexOf(Utils.prepend("/doc/")) === 0) {
                    const linkclicked = href.replace(Utils.prepend("/doc/"), "").split("?")[0];
                    if (linkclicked) {
                        let linkDoc = await DocServer.GetRefField(linkclicked);
                        if (linkDoc instanceof Doc) {
                            let anchor1 = await Cast(linkDoc.anchor1, Doc);
                            let anchor2 = await Cast(linkDoc.anchor2, Doc);
                            let currentDoc = SelectionManager.SelectedDocuments().length && SelectionManager.SelectedDocuments()[0].props.Document;
                            if (currentDoc && anchor1 && anchor2) {
                                if (Doc.AreProtosEqual(currentDoc, anchor1)) {
                                    return StrCast(anchor2.title);
                                }
                                if (Doc.AreProtosEqual(currentDoc, anchor2)) {
                                    return StrCast(anchor1.title);
                                }
                            }
                        }
                    }
                } else {
                    return href;
                }
            } else {
                return link.attrs.title;
            }
        }
    }

    async createLinkDropdown() {
        let targetTitle = await this.getTextLinkTargetTitle();
        let input = document.createElement("input");

        // menu item for input for hyperlink url 
        // TODO: integrate search to allow users to search for a doc to link to
        let linkInfo = new MenuItem({
            title: "",
            execEvent: "",
            class: "button-setting-disabled",
            css: "",
            render() {
                let p = document.createElement("p");
                p.textContent = "Linked to:";

                input.type = "text";
                input.placeholder = "Enter URL";
                console.log(targetTitle);
                if (targetTitle) input.value = targetTitle;
                input.onclick = (e: MouseEvent) => {
                    input.select();
                    input.focus();
                };

                let div = document.createElement("div");
                div.appendChild(p);
                div.appendChild(input);
                return div;
            },
            enable() { return false; },
            run(p1, p2, p3, event) {
                event.stopPropagation();
            }
        });

        // menu item to update/apply the hyperlink to the selected text
        let linkApply = new MenuItem({
            title: "",
            execEvent: "",
            class: "",
            css: "",
            render() {
                let button = document.createElement("button");
                button.className = "link-url-button";
                button.textContent = "Apply hyperlink";
                return button;
            },
            enable() { return false; },
            run: (state, dispatch, view, event) => {
                event.stopPropagation();
                this.makeLinkToURL(input.value, "onRight");
            }
        });

        // menu item to remove the link
        // TODO: allow this to be undoable
        let self = this;
        let deleteLink = new MenuItem({
            title: "Delete link",
            execEvent: "",
            class: "separated-button",
            css: "",
            render() {
                let button = document.createElement("button");
                button.textContent = "Remove link";

                let wrapper = document.createElement("div");
                wrapper.appendChild(button);
                return wrapper;
            },
            enable() { return true; },
            async run() {
                self.deleteLink();
                // update link dropdown
                let dropdown = await self.createLinkDropdown();
                let newLinkDropdowndom = dropdown.render(self.view).dom;
                self._linkDropdownDom && self.tooltip.replaceChild(newLinkDropdowndom, self._linkDropdownDom);
                self._linkDropdownDom = newLinkDropdowndom;
            }
        });


        let linkDropdown = new Dropdown(targetTitle ? [linkInfo, linkApply, deleteLink] : [linkInfo, linkApply], { class: "buttonSettings-dropdown" }) as MenuItem;
        return linkDropdown;
    }

    dragElement(elmnt: HTMLElement) {
        var pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
        if (elmnt) {
            // if present, the header is where you move the DIV from:
            elmnt.onpointerdown = dragMouseDown;
            elmnt.ondblclick = onClick;
        }
        const self = this;

        function dragMouseDown(e: PointerEvent) {
            e = e || window.event;
            //e.preventDefault();
            // get the mouse cursor position at startup:
            pos3 = e.clientX;
            pos4 = e.clientY;
            document.onpointerup = closeDragElement;
            // call a function whenever the cursor moves:
            document.onpointermove = elementDrag;
        }

        function onClick(e: MouseEvent) {
            self._collapsed = !self._collapsed;
            const children = self.wrapper.childNodes;
            if (self._collapsed && children.length > 1) {
                self.wrapper.removeChild(self.tooltip);
            }
            else {
                self.wrapper.appendChild(self.tooltip);
            }
        }

        function elementDrag(e: PointerEvent) {
            e = e || window.event;
            //e.preventDefault();
            // calculate the new cursor position:
            pos1 = pos3 - e.clientX;
            pos2 = pos4 - e.clientY;
            pos3 = e.clientX;
            pos4 = e.clientY;
            // set the element's new position:
            // elmnt.style.top = (elmnt.offsetTop - pos2) + "px";
            // elmnt.style.left = (elmnt.offsetLeft - pos1) + "px";

            self.wrapper.style.top = (self.wrapper.offsetTop - pos2) + "px";
            self.wrapper.style.left = (self.wrapper.offsetLeft - pos1) + "px";
        }

        function closeDragElement() {
            // stop moving when mouse button is released:
            document.onpointerup = null;
            document.onpointermove = null;
            //self.highlightSearchTerms(self.state, ["hello"]);
            //FormattedTextBox.Instance.unhighlightSearchTerms();
        }
    }

    // makeLinkWithState = (state: EditorState, target: string, location: string) => {
    //     let link = state.schema.mark(state.schema.marks.link, { href: target, location: location });
    // }

    makeLinkToDoc = (targetDoc: Doc, location: string): string => {
        let target = Utils.prepend("/doc/" + targetDoc[Id]);
        let node = this.view.state.selection.$from.nodeAfter;
        let link = this.view.state.schema.mark(this.view.state.schema.marks.link, { href: target, location: location, guid: targetDoc[Id] });
        this.view.dispatch(this.view.state.tr.removeMark(this.view.state.selection.from, this.view.state.selection.to, this.view.state.schema.marks.link));
        this.view.dispatch(this.view.state.tr.addMark(this.view.state.selection.from, this.view.state.selection.to, link));
        node = this.view.state.selection.$from.nodeAfter;
        link = node && node.marks.find(m => m.type.name === "link");
        if (node) {
            if (node.text) {
                return node.text;
            }
        }
        return "";
    }

    makeLinkToURL = (target: String, lcoation: string) => {
        let node = this.view.state.selection.$from.nodeAfter;
        let link = this.view.state.schema.mark(this.view.state.schema.marks.link, { href: target, location: location });
        this.view.dispatch(this.view.state.tr.removeMark(this.view.state.selection.from, this.view.state.selection.to, this.view.state.schema.marks.link));
        this.view.dispatch(this.view.state.tr.addMark(this.view.state.selection.from, this.view.state.selection.to, link));
        node = this.view.state.selection.$from.nodeAfter;
        link = node && node.marks.find(m => m.type.name === "link");
    }

    deleteLink = () => {
        let node = this.view.state.selection.$from.nodeAfter;
        let link = node && node.marks.find(m => m.type.name === "link");
        let href = link!.attrs.href;
        if (href) {
            if (href.indexOf(Utils.prepend("/doc/")) === 0) {
                const linkclicked = href.replace(Utils.prepend("/doc/"), "").split("?")[0];
                if (linkclicked) {
                    DocServer.GetRefField(linkclicked).then(async linkDoc => {
                        if (linkDoc instanceof Doc) {
                            LinkManager.Instance.deleteLink(linkDoc);
                            this.view.dispatch(this.view.state.tr.removeMark(this.view.state.selection.from, this.view.state.selection.to, this.view.state.schema.marks.link));
                        }
                    });
                }
            }
        }


    }


    //will display a remove-list-type button if selection is in list, otherwise will show list type dropdown
    updateListItemDropdown(label: string, listTypeBtn: any) {
        //remove old btn
        if (listTypeBtn) { this.tooltip.removeChild(listTypeBtn); }

        //Make a dropdown of all list types
        let toAdd: MenuItem[] = [];
        this.listTypeToIcon.forEach((icon, type) => {
            toAdd.push(this.dropdownNodeBtn(icon, "color: black; width: 40px;", type, this.view, this.listTypes, this.changeToNodeType));
        });
        //option to remove the list formatting
        toAdd.push(this.dropdownNodeBtn("X", "color: black; width: 40px;", undefined, this.view, this.listTypes, this.changeToNodeType));

        listTypeBtn = (new Dropdown(toAdd, {
            label: label,
            css: "color:black; width: 40px;"
        }) as MenuItem).render(this.view).dom;

        //add this new button and return it
        this.tooltip.appendChild(listTypeBtn);
        return listTypeBtn;
    }

    //for a specific grouping of marks (passed in), remove all and apply the passed-in one to the selected text
    changeToMarkInGroup = (markType: MarkType | undefined, view: EditorView, fontMarks: MarkType[]) => {
        let { $cursor, ranges } = view.state.selection as TextSelection;
        let state = view.state;
        let dispatch = view.dispatch;

        //remove all other active font marks
        fontMarks.forEach((type) => {
            if (dispatch) {
                if ($cursor) {
                    if (type.isInSet(state.storedMarks || $cursor.marks())) {
                        dispatch(state.tr.removeStoredMark(type));
                    }
                } else {
                    let has = false;
                    for (let i = 0; !has && i < ranges.length; i++) {
                        let { $from, $to } = ranges[i];
                        has = state.doc.rangeHasMark($from.pos, $to.pos, type);
                    }
                    for (let i of ranges) {
                        if (has) {
                            toggleMark(type)(view.state, view.dispatch, view);
                        }
                    }
                }
            }
        });

        if (markType) {
            // fontsize
            if (markType.name[0] === 'p') {
                let size = this.fontSizeToNum.get(markType);
                if (size) { this.updateFontSizeDropdown(String(size) + " pt"); }
                if (this.editorProps) {
                    let ruleProvider = this.editorProps.ruleProvider;
                    let heading = NumCast(this.editorProps.Document.heading);
                    if (ruleProvider && heading) {
                        ruleProvider["ruleSize_" + heading] = size;
                    }
                }
            }
            else {
                let fontName = this.fontStylesToName.get(markType);
                if (fontName) { this.updateFontStyleDropdown(fontName); }
                if (this.editorProps) {
                    let ruleProvider = this.editorProps.ruleProvider;
                    let heading = NumCast(this.editorProps.Document.heading);
                    if (ruleProvider && heading) {
                        ruleProvider["ruleFont_" + heading] = fontName;
                    }
                }
            }
            //actually apply font
            if ((view.state.selection as any).node && (view.state.selection as any).node.type === view.state.schema.nodes.ordered_list) {
                let status = updateBullets(view.state.tr.setNodeMarkup(view.state.selection.from, (view.state.selection as any).node.type,
                    { ...(view.state.selection as NodeSelection).node.attrs, setFontFamily: markType.name, setFontSize: Number(markType.name.replace(/p/, "")) }), view.state.schema);
                view.dispatch(status.setSelection(new NodeSelection(status.doc.resolve(view.state.selection.from))));
            }
            else toggleMark(markType)(view.state, view.dispatch, view);
        }
    }

    //remove all node typeand apply the passed-in one to the selected text
    changeToNodeType = (nodeType: NodeType | undefined, view: EditorView) => {
        //remove oldif (nodeType) { //add new
        if (nodeType === schema.nodes.bullet_list) {
            wrapInList(nodeType)(view.state, view.dispatch);
        } else {
            var marks = view.state.storedMarks || (view.state.selection.$to.parentOffset && view.state.selection.$from.marks());
            if (!wrapInList(schema.nodes.ordered_list)(view.state, (tx2: any) => {
                let tx3 = updateBullets(tx2, schema, (nodeType as any).attrs.mapStyle);
                marks && tx3.ensureMarks([...marks]);
                marks && tx3.setStoredMarks([...marks]);

                view.dispatch(tx2);
            })) {
                let tx2 = view.state.tr;
                let tx3 = nodeType ? updateBullets(tx2, schema, (nodeType as any).attrs.mapStyle) : tx2;
                marks && tx3.ensureMarks([...marks]);
                marks && tx3.setStoredMarks([...marks]);

                view.dispatch(tx3);
            }
        }
    }

    //makes a button for the drop down FOR MARKS
    //css is the style you want applied to the button
    dropdownMarkBtn(label: string, css: string, markType: MarkType, view: EditorView, changeToMarkInGroup: (markType: MarkType<any>, view: EditorView, groupMarks: MarkType[]) => any, groupMarks: MarkType[]) {
        return new MenuItem({
            title: "",
            label: label,
            execEvent: "",
            class: "menuicon",
            css: css,
            enable() { return true; },
            run() {
                changeToMarkInGroup(markType, view, groupMarks);
            }
        });
    }

    createStar() {
        return new MenuItem({
            title: "Summarize",
            label: "Summarize",
            icon: icons.join,
            css: "color:white;",
            class: "menuicon",
            execEvent: "",
            run: (state, dispatch) => {
                TooltipTextMenu.insertStar(this.view.state, this.view.dispatch);
            }

        });
    }

    public static insertStar(state: EditorState<any>, dispatch: any) {
        if (state.selection.empty) return false;
        let mark = state.schema.marks.highlight.create();
        let tr = state.tr;
        tr.addMark(state.selection.from, state.selection.to, mark);
        let content = tr.selection.content();
        let newNode = state.schema.nodes.star.create({ visibility: false, text: content, textslice: content.toJSON() });
        dispatch && dispatch(tr.replaceSelectionWith(newNode).removeMark(tr.selection.from - 1, tr.selection.from, mark));
        return true;
    }

    createHighlightTool() {
        return new MenuItem({
            title: "Highlight",
            css: "color:white;",
            class: "menuicon",
            execEvent: "",
            render() {
                let svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
                svg.setAttribute("viewBox", "-100 -100 650 650");
                let path = document.createElementNS('http://www.w3.org/2000/svg', "path");
                path.setAttributeNS(null, "d", "M0 479.98L99.92 512l35.45-35.45-67.04-67.04L0 479.98zm124.61-240.01a36.592 36.592 0 0 0-10.79 38.1l13.05 42.83-50.93 50.94 96.23 96.23 50.86-50.86 42.74 13.08c13.73 4.2 28.65-.01 38.15-10.78l35.55-41.64-173.34-173.34-41.52 35.44zm403.31-160.7l-63.2-63.2c-20.49-20.49-53.38-21.52-75.12-2.35L190.55 183.68l169.77 169.78L530.27 154.4c19.18-21.74 18.15-54.63-2.35-75.13z");
                svg.appendChild(path);

                let color = document.createElement("div");
                color.className = "buttonColor";
                color.style.backgroundColor = TooltipTextMenuManager.Instance.highlight.toString();

                let wrapper = document.createElement("div");
                wrapper.id = "colorPicker";
                wrapper.appendChild(svg);
                wrapper.appendChild(color);
                return wrapper;
            },
            run: (state, dispatch) => {
                TooltipTextMenu.insertHighlight(TooltipTextMenuManager.Instance.highlight, this.view.state, this.view.dispatch);
            }
        });
    }

    public static insertHighlight(color: String, state: EditorState<any>, dispatch: any) {
        if (state.selection.empty) return false;

        let highlightMark = state.schema.mark(state.schema.marks.highlight2, { highlight: color });
        dispatch(state.tr.addMark(state.selection.from, state.selection.to, highlightMark));
    }

    createHighlightDropdown() {
        // menu item for color picker
        let self = this;
        let colors = new MenuItem({
            title: "",
            execEvent: "",
            class: "button-setting-disabled",
            css: "",
            render() {
                let p = document.createElement("p");
                p.textContent = "Change highlight:";

                let colorsWrapper = document.createElement("div");
                colorsWrapper.className = "colorPicker-wrapper";

                let colors = [
                    PastelSchemaPalette.get("pink2"),
                    PastelSchemaPalette.get("purple4"),
                    PastelSchemaPalette.get("bluegreen1"),
                    PastelSchemaPalette.get("yellow4"),
                    PastelSchemaPalette.get("red2"),
                    PastelSchemaPalette.get("bluegreen7"),
                    PastelSchemaPalette.get("bluegreen5"),
                    PastelSchemaPalette.get("orange1"),
                    "white",
                    "transparent"
                ];

                colors.forEach(color => {
                    let button = document.createElement("button");
                    button.className = color === TooltipTextMenuManager.Instance.highlight ? "colorPicker active" : "colorPicker";
                    if (color) {
                        button.style.backgroundColor = color;
                        button.textContent = color === "transparent" ? "X" : "";
                        button.onclick = e => {
                            TooltipTextMenuManager.Instance.highlight = color;

                            TooltipTextMenu.insertHighlight(TooltipTextMenuManager.Instance.highlight, self.view.state, self.view.dispatch);

                            // update color menu
                            let highlightDom = self.createHighlightTool().render(self.view).dom;
                            let highlightDropdownDom = self.createHighlightDropdown().render(self.view).dom;
                            self.highlightDom && self.tooltip.replaceChild(highlightDom, self.highlightDom);
                            self.highlightDropdownDom && self.tooltip.replaceChild(highlightDropdownDom, self.highlightDropdownDom);
                            self.highlightDom = highlightDom;
                            self.highlightDropdownDom = highlightDropdownDom;
                        };
                    }
                    colorsWrapper.appendChild(button);
                });

                let div = document.createElement("div");
                div.appendChild(p);
                div.appendChild(colorsWrapper);
                return div;
            },
            enable() { return false; },
            run(p1, p2, p3, event) {
                event.stopPropagation();
            }
        });

        let colorDropdown = new Dropdown([colors], { class: "buttonSettings-dropdown" }) as MenuItem;
        return colorDropdown;
    }

    createColorTool() {
        return new MenuItem({
            title: "Color",
            css: "color:white;",
            class: "menuicon",
            execEvent: "",
            render() {
                let svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
                svg.setAttribute("viewBox", "-100 -100 650 650");
                let path = document.createElementNS('http://www.w3.org/2000/svg', "path");
                path.setAttributeNS(null, "d", "M204.3 5C104.9 24.4 24.8 104.3 5.2 203.4c-37 187 131.7 326.4 258.8 306.7 41.2-6.4 61.4-54.6 42.5-91.7-23.1-45.4 9.9-98.4 60.9-98.4h79.7c35.8 0 64.8-29.6 64.9-65.3C511.5 97.1 368.1-26.9 204.3 5zM96 320c-17.7 0-32-14.3-32-32s14.3-32 32-32 32 14.3 32 32-14.3 32-32 32zm32-128c-17.7 0-32-14.3-32-32s14.3-32 32-32 32 14.3 32 32-14.3 32-32 32zm128-64c-17.7 0-32-14.3-32-32s14.3-32 32-32 32 14.3 32 32-14.3 32-32 32zm128 64c-17.7 0-32-14.3-32-32s14.3-32 32-32 32 14.3 32 32-14.3 32-32 32z");
                svg.appendChild(path);

                let color = document.createElement("div");
                color.className = "buttonColor";
                color.style.backgroundColor = TooltipTextMenuManager.Instance.color.toString();

                let wrapper = document.createElement("div");
                wrapper.id = "colorPicker";
                wrapper.appendChild(svg);
                wrapper.appendChild(color);
                return wrapper;
            },
            run: (state, dispatch) => {
                TooltipTextMenu.insertColor(TooltipTextMenuManager.Instance.color, this.view.state, this.view.dispatch);
            }
        });
    }

    public static insertColor(color: String, state: EditorState<any>, dispatch: any) {
        if (state.selection.empty) return false;

        let colorMark = state.schema.mark(state.schema.marks.color, { color: color });
        dispatch(state.tr.addMark(state.selection.from, state.selection.to, colorMark));
    }

    createColorDropdown() {
        // menu item for color picker
        let self = this;
        let colors = new MenuItem({
            title: "",
            execEvent: "",
            class: "button-setting-disabled",
            css: "",
            render() {
                let p = document.createElement("p");
                p.textContent = "Change color:";

                let colorsWrapper = document.createElement("div");
                colorsWrapper.className = "colorPicker-wrapper";

                let colors = [
                    DarkPastelSchemaPalette.get("pink2"),
                    DarkPastelSchemaPalette.get("purple4"),
                    DarkPastelSchemaPalette.get("bluegreen1"),
                    DarkPastelSchemaPalette.get("yellow4"),
                    DarkPastelSchemaPalette.get("red2"),
                    DarkPastelSchemaPalette.get("bluegreen7"),
                    DarkPastelSchemaPalette.get("bluegreen5"),
                    DarkPastelSchemaPalette.get("orange1"),
                    "#757472",
                    "#000"
                ];

                colors.forEach(color => {
                    let button = document.createElement("button");
                    button.className = color === TooltipTextMenuManager.Instance.color ? "colorPicker active" : "colorPicker";
                    if (color) {
                        button.style.backgroundColor = color;
                        button.onclick = e => {
                            TooltipTextMenuManager.Instance.color = color;

                            TooltipTextMenu.insertColor(TooltipTextMenuManager.Instance.color, self.view.state, self.view.dispatch);

                            // update color menu
                            let colorDom = self.createColorTool().render(self.view).dom;
                            let colorDropdownDom = self.createColorDropdown().render(self.view).dom;
                            self.colorDom && self.tooltip.replaceChild(colorDom, self.colorDom);
                            self.colorDropdownDom && self.tooltip.replaceChild(colorDropdownDom, self.colorDropdownDom);
                            self.colorDom = colorDom;
                            self.colorDropdownDom = colorDropdownDom;
                        };
                    }
                    colorsWrapper.appendChild(button);
                });

                let div = document.createElement("div");
                div.appendChild(p);
                div.appendChild(colorsWrapper);
                return div;
            },
            enable() { return false; },
            run(p1, p2, p3, event) {
                event.stopPropagation();
            }
        });

        let colorDropdown = new Dropdown([colors], { class: "buttonSettings-dropdown" }) as MenuItem;
        return colorDropdown;
    }

    deleteLinkItem() {
        const icon = {
            height: 16, width: 16,
            path: "M15.898,4.045c-0.271-0.272-0.713-0.272-0.986,0l-4.71,4.711L5.493,4.045c-0.272-0.272-0.714-0.272-0.986,0s-0.272,0.714,0,0.986l4.709,4.711l-4.71,4.711c-0.272,0.271-0.272,0.713,0,0.986c0.136,0.136,0.314,0.203,0.492,0.203c0.179,0,0.357-0.067,0.493-0.203l4.711-4.711l4.71,4.711c0.137,0.136,0.314,0.203,0.494,0.203c0.178,0,0.355-0.067,0.492-0.203c0.273-0.273,0.273-0.715,0-0.986l-4.711-4.711l4.711-4.711C16.172,4.759,16.172,4.317,15.898,4.045z"
        };
        return new MenuItem({
            title: "Delete Link",
            label: "X",
            icon: icon,
            css: "color: red",
            class: "summarize",
            execEvent: "",
            run: (state, dispatch) => {
                this.deleteLink();
            }
        });
    }

    createBrush(active: boolean = false) {
        const icon = {
            height: 32, width: 32,
            path: "M30.828 1.172c-1.562-1.562-4.095-1.562-5.657 0l-5.379 5.379-3.793-3.793-4.243 4.243 3.326 3.326-14.754 14.754c-0.252 0.252-0.358 0.592-0.322 0.921h-0.008v5c0 0.552 0.448 1 1 1h5c0 0 0.083 0 0.125 0 0.288 0 0.576-0.11 0.795-0.329l14.754-14.754 3.326 3.326 4.243-4.243-3.793-3.793 5.379-5.379c1.562-1.562 1.562-4.095 0-5.657zM5.409 30h-3.409v-3.409l14.674-14.674 3.409 3.409-14.674 14.674z"
        };
        let self = this;
        return new MenuItem({
            title: "Brush tool",
            label: "Brush tool",
            icon: icon,
            css: "color:white;",
            class: active ? "menuicon-active" : "menuicon",
            execEvent: "",
            run: (state, dispatch) => {
                this.brush_function(state, dispatch);

                // update dropdown with marks
                let newBrushDropdowndom = self.createBrushDropdown().render(self.view).dom;
                self._brushDropdownDom && self.tooltip.replaceChild(newBrushDropdowndom, self._brushDropdownDom);
                self._brushDropdownDom = newBrushDropdowndom;
            },
            active: (state) => {
                return true;
            }
        });
    }

    // selectionchanged event handler

    brush_function(state: EditorState<any>, dispatch: any) {
        if (TooltipTextMenuManager.Instance._brushIsEmpty) {
            const selected_marks = this.getMarksInSelection(this.view.state);
            if (this._brushdom) {
                if (selected_marks.size >= 0) {
                    TooltipTextMenuManager.Instance._brushMarks = selected_marks;
                    const newbrush = this.createBrush(true).render(this.view).dom;
                    this.tooltip.replaceChild(newbrush, this._brushdom);
                    this._brushdom = newbrush;
                    TooltipTextMenuManager.Instance._brushIsEmpty = !TooltipTextMenuManager.Instance._brushIsEmpty;
                }
            }
        }
        else {
            let { from, to, $from } = this.view.state.selection;
            if (this._brushdom) {
                if (!this.view.state.selection.empty && $from && $from.nodeAfter) {
                    if (TooltipTextMenuManager.Instance._brushMarks && to - from > 0) {
                        this.view.dispatch(this.view.state.tr.removeMark(from, to));
                        Array.from(TooltipTextMenuManager.Instance._brushMarks).filter(m => m.type !== schema.marks.user_mark).forEach((mark: Mark) => {
                            const markType = mark.type;
                            this.changeToMarkInGroup(markType, this.view, []);
                        });
                    }
                }
                else {
                    const newbrush = this.createBrush(false).render(this.view).dom;
                    this.tooltip.replaceChild(newbrush, this._brushdom);
                    this._brushdom = newbrush;
                    TooltipTextMenuManager.Instance._brushIsEmpty = !TooltipTextMenuManager.Instance._brushIsEmpty;
                }
            }
        }


    }

    createBrushDropdown(active: boolean = false) {
        let label = "Stored marks: ";
        if (TooltipTextMenuManager.Instance._brushMarks && TooltipTextMenuManager.Instance._brushMarks.size > 0) {
            TooltipTextMenuManager.Instance._brushMarks.forEach((mark: Mark) => {
                const markType = mark.type;
                label += markType.name;
                label += ", ";
            });
            label = label.substring(0, label.length - 2);
        } else {
            label = "No marks are currently stored";
        }


        let brushInfo = new MenuItem({
            title: "",
            label: label,
            execEvent: "",
            class: "button-setting-disabled",
            css: "",
            enable() { return false; },
            run(p1, p2, p3, event) {
                event.stopPropagation();
            }
        });

        let self = this;
        let clearBrush = new MenuItem({
            title: "Clear brush",
            execEvent: "",
            class: "separated-button",
            css: "",
            render() {
                let button = document.createElement("button");
                button.textContent = "Clear brush";

                let wrapper = document.createElement("div");
                wrapper.appendChild(button);
                return wrapper;
            },
            enable() { return true; },
            run() {
                TooltipTextMenuManager.Instance._brushIsEmpty = true;
                TooltipTextMenuManager.Instance._brushMarks = new Set();

                // update brush tool
                // TODO: this probably isn't very clean
                let newBrushdom = self.createBrush().render(self.view).dom;
                self._brushdom && self.tooltip.replaceChild(newBrushdom, self._brushdom);
                self._brushdom = newBrushdom;
                let newBrushDropdowndom = self.createBrushDropdown().render(self.view).dom;
                self._brushDropdownDom && self.tooltip.replaceChild(newBrushDropdowndom, self._brushDropdownDom);
                self._brushDropdownDom = newBrushDropdowndom;
            }
        });

        let hasMarks = TooltipTextMenuManager.Instance._brushMarks && TooltipTextMenuManager.Instance._brushMarks.size > 0;
        let brushDom = new Dropdown(hasMarks ? [brushInfo, clearBrush] : [brushInfo], { class: "buttonSettings-dropdown" }) as MenuItem;
        return brushDom;
    }

    // createCollapse() {
    //     this._collapseBtn = new MenuItem({
    //         title: "Collapse",
    //         //label: "Collapse",
    //         icon: icons.join,
    //         execEvent: "",
    //         css: "color:white;",
    //         class: "summarize",
    //         run: () => {
    //             this.collapseToolTip();
    //         }
    //     });
    // }

    // collapseToolTip() {
    //     if (this._collapseBtn) {
    //         if (this._collapseBtn.spec.title === "Collapse") {
    //             // const newcollapseBtn = new MenuItem({
    //             //     title: "Expand",
    //             //     icon: icons.join,
    //             //     execEvent: "",
    //             //     css: "color:white;",
    //             //     class: "summarize",
    //             //     run: (state, dispatch, view) => {
    //             //         this.collapseToolTip();
    //             //     }
    //             // });
    //             // this.tooltip.replaceChild(newcollapseBtn.render(this.view).dom, this._collapseBtn.render(this.view).dom);
    //             // this._collapseBtn = newcollapseBtn;
    //             this.tooltip.style.width = "30px";
    //             this._collapseBtn.spec.title = "Expand";
    //             this._collapseBtn.render(this.view);
    //         }
    //         else {
    //             this._collapseBtn.spec.title = "Collapse";
    //             this.tooltip.style.width = "550px";
    //             this._collapseBtn.render(this.view);
    //         }
    //     }
    // }

    createLink() {
        let markType = schema.marks.link;
        return new MenuItem({
            title: "Add or remove link",
            label: "Add or remove link",
            execEvent: "",
            icon: icons.link,
            css: "color:white;",
            class: "menuicon",
            enable(state) { return !state.selection.empty; },
            run: (state, dispatch, view) => {
                // to remove link
                let curLink = "";
                if (this.markActive(state, markType)) {

                    let { from, $from, to, empty } = state.selection;
                    let node = state.doc.nodeAt(from);
                    node && node.marks.map(m => {
                        m.type === markType && (curLink = m.attrs.href);
                    });
                    //toggleMark(markType)(state, dispatch);
                    //return true;
                }
                // to create link
                openPrompt({
                    title: "Create a link",
                    fields: {
                        href: new TextField({
                            value: curLink,
                            label: "Link Target",
                            required: true
                        }),
                        title: new TextField({ label: "Title" })
                    },
                    callback(attrs: any) {
                        toggleMark(markType, attrs)(view.state, view.dispatch);
                        view.focus();
                    },
                    flyout_top: 0,
                    flyout_left: 0
                });
            }
        });
    }

    //makes a button for the drop down FOR NODE TYPES
    //css is the style you want applied to the button
    dropdownNodeBtn(label: string, css: string, nodeType: NodeType | undefined, view: EditorView, groupNodes: NodeType[], changeToNodeInGroup: (nodeType: NodeType<any> | undefined, view: EditorView, groupNodes: NodeType[]) => any) {
        return new MenuItem({
            title: "",
            label: label,
            execEvent: "",
            class: "menuicon",
            css: css,
            enable() { return true; },
            run() {
                changeToNodeInGroup(nodeType, view, groupNodes);
            }
        });
    }

    markActive = function (state: EditorState<any>, type: MarkType<Schema<string, string>>) {
        let { from, $from, to, empty } = state.selection;
        if (empty) return type.isInSet(state.storedMarks || $from.marks());
        else return state.doc.rangeHasMark(from, to, type);
    };

    // Helper function to create menu icons
    icon(text: string, name: string, title: string = name) {
        let span = document.createElement("span");
        span.className = name + " menuicon";
        span.title = title;
        span.textContent = text;
        span.style.color = "white";
        return span;
    }

    svgIcon(name: string, title: string = name, dpath: string) {
        let svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("viewBox", "-100 -100 650 650");
        let path = document.createElementNS('http://www.w3.org/2000/svg', "path");
        path.setAttributeNS(null, "d", dpath);
        svg.appendChild(path);

        let span = document.createElement("span");
        span.className = name + " menuicon";
        span.title = title;
        span.appendChild(svg);

        return span;
    }

    //method for checking whether node can be inserted
    canInsert(state: EditorState, nodeType: NodeType<Schema<string, string>>) {
        let $from = state.selection.$from;
        for (let d = $from.depth; d >= 0; d--) {
            let index = $from.index(d);
            if ($from.node(d).canReplaceWith(index, index, nodeType)) return true;
        }
        return false;
    }


    //adapted this method - use it to check if block has a tag (ie bulleting)
    blockActive(type: NodeType<Schema<string, string>>, state: EditorState) {
        let attrs = {};

        if (state.selection instanceof NodeSelection) {
            const sel: NodeSelection = state.selection;
            let $from = sel.$from;
            let to = sel.to;
            let node = sel.node;

            if (node) {
                return node.hasMarkup(type, attrs);
            }

            return to <= $from.end() && $from.parent.hasMarkup(type, attrs);
        }
    }

    // Create an icon for a heading at the given level
    heading(level: number) {
        return {
            command: setBlockType(schema.nodes.heading, { level }),
            dom: this.icon("H" + level, "heading")
        };
    }

    getMarksInSelection(state: EditorState<any>) {
        let found = new Set<Mark>();
        let { from, to } = state.selection as TextSelection;
        state.doc.nodesBetween(from, to, (node) => {
            let marks = node.marks;
            if (marks) {
                marks.forEach(m => {
                    found.add(m);
                });
            }
        });
        return found;
    }

    reset_mark_doms() {
        let iterator = this._marksToDoms.values();
        let next = iterator.next();
        while (!next.done) {
            next.value.style.color = "white";
            next = iterator.next();
        }
    }

    update(view: EditorView, lastState: EditorState | undefined) { this.updateFromDash(view, lastState, this.editorProps); }
    //updates the tooltip menu when the selection changes
    public async updateFromDash(view: EditorView, lastState: EditorState | undefined, props: any) {
        if (!view) {
            console.log("no editor?  why?");
            return;
        }
        this.view = view;
        let state = view.state;
        DocumentDecorations.Instance.TextBar && DocumentDecorations.Instance.setTextBar(DocumentDecorations.Instance.TextBar);
        props && (this.editorProps = props);
        // Don't do anything if the document/selection didn't change
        if (lastState && lastState.doc.eq(state.doc) &&
            lastState.selection.eq(state.selection)) return;

        this.reset_mark_doms();

        // Hide the tooltip if the selection is empty
        if (state.selection.empty) {
            //this.tooltip.style.display = "none";
            //return;
        }
        //UPDATE LIST ITEM DROPDOWN

        // update link dropdown
        let linkDropdown = await this.createLinkDropdown();
        let newLinkDropdowndom = linkDropdown.render(this.view).dom;
        this._linkDropdownDom && this.tooltip.replaceChild(newLinkDropdowndom, this._linkDropdownDom);
        this._linkDropdownDom = newLinkDropdowndom;

        //UPDATE FONT STYLE DROPDOWN
        let activeStyles = this.activeMarksOnSelection(this.fontStyles);
        if (activeStyles !== undefined) {
            // activeStyles.forEach((markType) => {
            //     this._activeMarks.push(this.view.state.schema.mark(markType));
            // });
            if (activeStyles.length === 1) {
                // if we want to update something somewhere with active font name
                let fontName = this.fontStylesToName.get(activeStyles[0]);
                if (fontName) { this.updateFontStyleDropdown(fontName); }
            } else if (activeStyles.length === 0) {
                //crimson on default
                this.updateFontStyleDropdown("Crimson Text");
            } else {
                this.updateFontStyleDropdown("Various");
            }
        }

        //UPDATE FONT SIZE DROPDOWN
        let activeSizes = this.activeMarksOnSelection(this.fontSizes);
        if (activeSizes !== undefined) {
            if (activeSizes.length === 1) { //if there's only one active font size
                // activeSizes.forEach((markType) => {
                //     this._activeMarks.push(this.view.state.schema.mark(markType));
                // });
                let size = this.fontSizeToNum.get(activeSizes[0]);
                if (size) { this.updateFontSizeDropdown(String(size) + " pt"); }
            } else if (activeSizes.length === 0) {
                //should be 14 on default  
                this.updateFontSizeDropdown("14 pt");
            } else { //multiple font sizes selected
                this.updateFontSizeDropdown("Various");
            }
        }

        this.update_mark_doms();
    }

    public mark_key_pressed(marks: Mark<any>[]) {
        if (this.view.state.selection.empty) {
            if (marks) this._activeMarks = marks;
            this.update_mark_doms();
        }
    }

    update_mark_doms() {
        this.reset_mark_doms();
        let foundlink = false;
        // let children = this.extras.childNodes;
        this._activeMarks.forEach((mark) => {
            if (this._marksToDoms.has(mark)) {
                let dom = this._marksToDoms.get(mark);
                if (dom) dom.style.color = "greenyellow";
            }
            // if (children.length > 1) {
            //     foundlink = true;
            // }
            // if (mark.type.name === "link" && children.length === 1) {
            //     // let del = document.createElement("button");
            //     // del.textContent = "X";
            //     // del.style.color = "red";
            //     // del.style.height = "10px";
            //     // del.style.width = "10px";
            //     // del.style.marginLeft = "5px";
            //     // del.onclick = this.deleteLink;
            //     // this.extras.appendChild(del);
            //     let del = this.deleteLinkItem().render(this.view).dom;
            //     this.extras.appendChild(del);
            //     foundlink = true;
            // }
        });
        // if (!foundlink) {
        //     if (children.length > 1) {
        //         this.extras.removeChild(children[1]);
        //     }
        // }

        // keeps brush tool highlighted if active when switching between textboxes
        if (!TooltipTextMenuManager.Instance._brushIsEmpty) {
            if (this._brushdom) {
                const newbrush = this.createBrush(true).render(this.view).dom;
                this.tooltip.replaceChild(newbrush, this._brushdom);
                this._brushdom = newbrush;
            }
        }

    }

    //finds all active marks on selection in given group
    activeMarksOnSelection(markGroup: MarkType[]) {
        //current selection
        let { empty, ranges, $to } = this.view.state.selection as TextSelection;
        let state = this.view.state;
        let dispatch = this.view.dispatch;
        let activeMarks: MarkType[];
        if (!empty) {
            activeMarks = markGroup.filter(mark => {
                if (dispatch) {
                    let has = false;
                    for (let i = 0; !has && i < ranges.length; i++) {
                        let { $from, $to } = ranges[i];
                        return state.doc.rangeHasMark($from.pos, $to.pos, mark);
                    }
                }
                return false;
            });

            const refnode = this.reference_node($to);
            this._activeMarks = refnode.marks;
        }
        else {
            const pos = this.view.state.selection.$from;
            const ref_node: ProsNode = this.reference_node(pos);
            if (ref_node !== null && ref_node !== this.view.state.doc) {
                if (ref_node.isText) {
                }
                else {
                    return [];
                }
                this._activeMarks = ref_node.marks;
                activeMarks = markGroup.filter(mark_type => {
                    if (dispatch) {
                        let mark = state.schema.mark(mark_type);
                        return ref_node.marks.includes(mark);
                    }
                    return false;
                });
            }
            else {
                return [];
            }

        }
        return activeMarks;
    }

    reference_node(pos: ResolvedPos<any>): ProsNode {
        let ref_node: ProsNode = this.view.state.doc;
        if (pos.nodeBefore !== null && pos.nodeBefore !== undefined) {
            ref_node = pos.nodeBefore;
        }
        else if (pos.nodeAfter !== null && pos.nodeAfter !== undefined) {
            ref_node = pos.nodeAfter;
        }
        else if (pos.pos > 0) {
            let skip = false;
            for (let i: number = pos.pos - 1; i > 0; i--) {
                this.view.state.doc.nodesBetween(i, pos.pos, (node: ProsNode) => {
                    if (node.isLeaf && !skip) {
                        ref_node = node;
                        skip = true;
                    }

                });
            }
        }
        if (!ref_node.isLeaf && ref_node.childCount > 0) {
            ref_node = ref_node.child(0);
        }
        return ref_node;
    }

    destroy() {
        this.wrapper.remove();
    }
}


class TooltipTextMenuManager {
    private static _instance: TooltipTextMenuManager;

    public pinnedX: number = 0;
    public pinnedY: number = 0;
    public unpinnedX: number = 0;
    public unpinnedY: number = 0;
    private _isPinned: boolean = false;

    public _brushMarks: Set<Mark> | undefined;
    public _brushIsEmpty: boolean = true;

    public color: String = "#000";
    public highlight: String = "transparent";

    public activeMenu: TooltipTextMenu | undefined;

    static get Instance() {
        if (!TooltipTextMenuManager._instance) {
            TooltipTextMenuManager._instance = new TooltipTextMenuManager();
        }
        return TooltipTextMenuManager._instance;
    }

    // private pinnedToUnpinned() {
    //     let position = MainOverlayTextBox.Instance.position;

    //     this.unpinnedX = this.pinnedX - position[0];
    //     this.unpinnedY = this.pinnedY - position[1];
    // }

    // private unpinnedToPinned() {
    //     let position = MainOverlayTextBox.Instance.position;

    //     this.pinnedX = position[0] + this.unpinnedX;
    //     this.pinnedY = position[1] + this.unpinnedY;
    // }

    public get isPinned() {
        return this._isPinned;
    }

    public toggleIsPinned() {
        // if (this._isPinned) {
        //     this.pinnedToUnpinned();
        // } else {
        //     this.unpinnedToPinned();
        // }
        this._isPinned = !this._isPinned;
    }
}
