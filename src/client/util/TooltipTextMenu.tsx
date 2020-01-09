import { Dropdown, icons, MenuItem } from "prosemirror-menu"; //no import css
import { Mark, MarkType, Node as ProsNode, NodeType, ResolvedPos, Schema } from "prosemirror-model";
import { wrapInList } from 'prosemirror-schema-list';
import { EditorState, NodeSelection, TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { Doc, Field, Opt } from "../../new_fields/Doc";
import { Utils } from "../../Utils";
import { DocServer } from "../DocServer";
import { FieldViewProps } from "../views/nodes/FieldView";
import { FormattedTextBoxProps } from "../views/nodes/FormattedTextBox";
import { LinkManager } from "./LinkManager";
import { schema } from "./RichTextSchema";
import "./TooltipTextMenu.scss";
import { Cast, NumCast, StrCast } from '../../new_fields/Types';
import { updateBullets } from './ProsemirrorExampleTransfer';
import { DocumentDecorations } from '../views/DocumentDecorations';
import { SelectionManager } from './SelectionManager';
import { PastelSchemaPalette, DarkPastelSchemaPalette } from '../../new_fields/SchemaHeaderField';
const { toggleMark } = require("prosemirror-commands");

// deprecated in favor of richtextmenu

//appears above a selection of text in a RichTextBox to give user options such as Bold, Italics, etc.
export class TooltipTextMenu {
    public static Toolbar: HTMLDivElement | undefined;

    // editor state properties
    private view: EditorView;
    private editorProps: FieldViewProps & FormattedTextBoxProps | undefined;

    private fontStyles: Mark[] = [];
    private fontSizes: Mark[] = [];
    private _marksToDoms: Map<MarkType, HTMLSpanElement> = new Map();
    private _collapsed: boolean = false;

    // editor doms
    public tooltip: HTMLElement = document.createElement("div");
    private wrapper: HTMLDivElement = document.createElement("div");

    // editor button doms
    private colorDom?: Node;
    private colorDropdownDom?: Node;
    private linkDom?: Node;
    private highighterDom?: Node;
    private highlighterDropdownDom?: Node;
    private linkDropdownDom?: Node;
    private _brushdom?: Node;
    private _brushDropdownDom?: Node;
    private fontSizeDom?: Node;
    private fontStyleDom?: Node;
    private basicTools?: HTMLElement;

    static createDiv(className: string) { const div = document.createElement("div"); div.className = className; return div; }
    static createSpan(className: string) { const div = document.createElement("span"); div.className = className; return div; }
    constructor(view: EditorView) {
        this.view = view;

        // initialize the tooltip -- sets this.tooltip
        this.initTooltip(view);

        // initialize the wrapper
        this.wrapper = TooltipTextMenu.createDiv("wrapper");
        this.wrapper.appendChild(this.tooltip);

        TooltipTextMenu.Toolbar = this.wrapper;
    }

    private async initTooltip(view: EditorView) {
        const self = this;
        this.tooltip = TooltipTextMenu.createDiv("tooltipMenu");
        this.basicTools = TooltipTextMenu.createDiv("basic-tools");

        const svgIcon = (name: string, title: string = name, dpath: string) => {
            const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            svg.setAttribute("viewBox", "-100 -100 650 650");
            const path = document.createElementNS('http://www.w3.org/2000/svg', "path");
            path.setAttributeNS(null, "d", dpath);
            svg.appendChild(path);

            const span = TooltipTextMenu.createSpan(name + " menuicon");
            span.title = title;
            span.appendChild(svg);

            return span;
        };

        const basicItems = [ // init basicItems in minimized toolbar -- paths to svgs are obtained from fontawesome
            { mark: schema.marks.strong, dom: svgIcon("strong", "Bold", "M333.49 238a122 122 0 0 0 27-65.21C367.87 96.49 308 32 233.42 32H34a16 16 0 0 0-16 16v48a16 16 0 0 0 16 16h31.87v288H34a16 16 0 0 0-16 16v48a16 16 0 0 0 16 16h209.32c70.8 0 134.14-51.75 141-122.4 4.74-48.45-16.39-92.06-50.83-119.6zM145.66 112h87.76a48 48 0 0 1 0 96h-87.76zm87.76 288h-87.76V288h87.76a56 56 0 0 1 0 112z") },
            { mark: schema.marks.em, dom: svgIcon("em", "Italic", "M320 48v32a16 16 0 0 1-16 16h-62.76l-80 320H208a16 16 0 0 1 16 16v32a16 16 0 0 1-16 16H16a16 16 0 0 1-16-16v-32a16 16 0 0 1 16-16h62.76l80-320H112a16 16 0 0 1-16-16V48a16 16 0 0 1 16-16h192a16 16 0 0 1 16 16z") },
            { mark: schema.marks.underline, dom: svgIcon("underline", "Underline", "M32 64h32v160c0 88.22 71.78 160 160 160s160-71.78 160-160V64h32a16 16 0 0 0 16-16V16a16 16 0 0 0-16-16H272a16 16 0 0 0-16 16v32a16 16 0 0 0 16 16h32v160a80 80 0 0 1-160 0V64h32a16 16 0 0 0 16-16V16a16 16 0 0 0-16-16H32a16 16 0 0 0-16 16v32a16 16 0 0 0 16 16zm400 384H16a16 16 0 0 0-16 16v32a16 16 0 0 0 16 16h416a16 16 0 0 0 16-16v-32a16 16 0 0 0-16-16z") },
        ];
        const items = [ // init items in full size toolbar
            { mark: schema.marks.strikethrough, dom: svgIcon("strikethrough", "Strikethrough", "M496 224H293.9l-87.17-26.83A43.55 43.55 0 0 1 219.55 112h66.79A49.89 49.89 0 0 1 331 139.58a16 16 0 0 0 21.46 7.15l42.94-21.47a16 16 0 0 0 7.16-21.46l-.53-1A128 128 0 0 0 287.51 32h-68a123.68 123.68 0 0 0-123 135.64c2 20.89 10.1 39.83 21.78 56.36H16a16 16 0 0 0-16 16v32a16 16 0 0 0 16 16h480a16 16 0 0 0 16-16v-32a16 16 0 0 0-16-16zm-180.24 96A43 43 0 0 1 336 356.45 43.59 43.59 0 0 1 292.45 400h-66.79A49.89 49.89 0 0 1 181 372.42a16 16 0 0 0-21.46-7.15l-42.94 21.47a16 16 0 0 0-7.16 21.46l.53 1A128 128 0 0 0 224.49 480h68a123.68 123.68 0 0 0 123-135.64 114.25 114.25 0 0 0-5.34-24.36z") },
            { mark: schema.marks.superscript, dom: svgIcon("superscript", "Superscript", "M496 160h-16V16a16 16 0 0 0-16-16h-48a16 16 0 0 0-14.29 8.83l-16 32A16 16 0 0 0 400 64h16v96h-16a16 16 0 0 0-16 16v32a16 16 0 0 0 16 16h96a16 16 0 0 0 16-16v-32a16 16 0 0 0-16-16zM336 64h-67a16 16 0 0 0-13.14 6.87l-79.9 115-79.9-115A16 16 0 0 0 83 64H16A16 16 0 0 0 0 80v48a16 16 0 0 0 16 16h33.48l77.81 112-77.81 112H16a16 16 0 0 0-16 16v48a16 16 0 0 0 16 16h67a16 16 0 0 0 13.14-6.87l79.9-115 79.9 115A16 16 0 0 0 269 448h67a16 16 0 0 0 16-16v-48a16 16 0 0 0-16-16h-33.48l-77.81-112 77.81-112H336a16 16 0 0 0 16-16V80a16 16 0 0 0-16-16z") },
            { mark: schema.marks.subscript, dom: svgIcon("subscript", "Subscript", "M496 448h-16V304a16 16 0 0 0-16-16h-48a16 16 0 0 0-14.29 8.83l-16 32A16 16 0 0 0 400 352h16v96h-16a16 16 0 0 0-16 16v32a16 16 0 0 0 16 16h96a16 16 0 0 0 16-16v-32a16 16 0 0 0-16-16zM336 64h-67a16 16 0 0 0-13.14 6.87l-79.9 115-79.9-115A16 16 0 0 0 83 64H16A16 16 0 0 0 0 80v48a16 16 0 0 0 16 16h33.48l77.81 112-77.81 112H16a16 16 0 0 0-16 16v48a16 16 0 0 0 16 16h67a16 16 0 0 0 13.14-6.87l79.9-115 79.9 115A16 16 0 0 0 269 448h67a16 16 0 0 0 16-16v-48a16 16 0 0 0-16-16h-33.48l-77.81-112 77.81-112H336a16 16 0 0 0 16-16V80a16 16 0 0 0-16-16z") },
        ];

        basicItems.map(({ dom, mark }) => this.basicTools?.appendChild(dom.cloneNode(true)));
        basicItems.concat(items).forEach(({ dom, mark }) => {
            this.tooltip.appendChild(dom);
            this._marksToDoms.set(mark, dom);

            //pointer down handler to activate button effects
            dom.addEventListener("pointerdown", e => {
                this.view.focus();
                if (dom.contains(e.target as Node)) {
                    e.preventDefault();
                    e.stopPropagation();
                    toggleMark(mark)(this.view.state, this.view.dispatch, this.view);
                    this.updateHighlightStateOfButtons();
                }
            });
        });

        // summarize menu
        this.highighterDom = this.createHighlightTool().render(this.view).dom;
        this.highlighterDropdownDom = this.createHighlightDropdown().render(this.view).dom;
        this.tooltip.appendChild(this.highighterDom);
        this.tooltip.appendChild(this.highlighterDropdownDom);

        // color menu
        this.colorDom = this.createColorTool().render(this.view).dom;
        this.colorDropdownDom = this.createColorDropdown().render(this.view).dom;
        this.tooltip.appendChild(this.colorDom);
        this.tooltip.appendChild(this.colorDropdownDom);

        // link menu
        this.linkDom = this.createLinkTool().render(this.view).dom;
        this.linkDropdownDom = this.createLinkDropdown("").render(this.view).dom;
        this.tooltip.appendChild(this.linkDom);
        this.tooltip.appendChild(this.linkDropdownDom);

        // list of font styles
        this.fontSizes.push(schema.marks.pFontSize.create({ fontSize: 7 }));
        this.fontSizes.push(schema.marks.pFontSize.create({ fontSize: 8 }));
        this.fontSizes.push(schema.marks.pFontSize.create({ fontSize: 9 }));
        this.fontSizes.push(schema.marks.pFontSize.create({ fontSize: 10 }));
        this.fontSizes.push(schema.marks.pFontSize.create({ fontSize: 12 }));
        this.fontSizes.push(schema.marks.pFontSize.create({ fontSize: 14 }));
        this.fontSizes.push(schema.marks.pFontSize.create({ fontSize: 16 }));
        this.fontSizes.push(schema.marks.pFontSize.create({ fontSize: 18 }));
        this.fontSizes.push(schema.marks.pFontSize.create({ fontSize: 20 }));
        this.fontSizes.push(schema.marks.pFontSize.create({ fontSize: 24 }));
        this.fontSizes.push(schema.marks.pFontSize.create({ fontSize: 32 }));
        this.fontSizes.push(schema.marks.pFontSize.create({ fontSize: 48 }));
        this.fontSizes.push(schema.marks.pFontSize.create({ fontSize: 72 }));

        // font sizes
        this.fontStyles.push(schema.marks.pFontFamily.create({ family: "Times New Roman" }));
        this.fontStyles.push(schema.marks.pFontFamily.create({ family: "Arial" }));
        this.fontStyles.push(schema.marks.pFontFamily.create({ family: "Georgia" }));
        this.fontStyles.push(schema.marks.pFontFamily.create({ family: "Comic Sans MS" }));
        this.fontStyles.push(schema.marks.pFontFamily.create({ family: "Tahoma" }));
        this.fontStyles.push(schema.marks.pFontFamily.create({ family: "Impact" }));
        this.fontStyles.push(schema.marks.pFontFamily.create({ family: "Crimson Text" }));


        // init brush tool
        this._brushdom = this.createBrushTool().render(this.view).dom;
        this.tooltip.appendChild(this._brushdom);
        this._brushDropdownDom = this.createBrushDropdown().render(this.view).dom;
        this.tooltip.appendChild(this._brushDropdownDom);

        // summarizer tool
        const summarizer = new MenuItem({
            title: "Summarize",
            label: "Summarize",
            icon: icons.join,
            css: "fill:white;",
            class: "menuicon",
            execEvent: "",
            run: (state, dispatch) => TooltipTextMenu.insertSummarizer(state, dispatch)
        });
        this.tooltip.appendChild(summarizer.render(this.view).dom);

        // list types dropdown
        const listDropdownTypes = [{ mapStyle: "bullet", label: ":" }, { mapStyle: "decimal", label: "1.1" }, { mapStyle: "multi", label: "A.1" }, { label: "X" }];
        const listTypes = new Dropdown(listDropdownTypes.map(({ mapStyle, label }) =>
            new MenuItem({
                title: "Set Bullet Style",
                label: label,
                execEvent: "",
                class: "dropdown-item",
                css: "color: black; width: 40px;",
                enable() { return true; },
                run() {
                    const marks = self.view.state.storedMarks || (view.state.selection.$to.parentOffset && view.state.selection.$from.marks());
                    if (!wrapInList(schema.nodes.ordered_list)(view.state, (tx2: any) => {
                        const tx3 = updateBullets(tx2, schema, mapStyle);
                        marks && tx3.ensureMarks([...marks]);
                        marks && tx3.setStoredMarks([...marks]);

                        view.dispatch(tx2);
                    })) {
                        const tx2 = view.state.tr;
                        const tx3 = updateBullets(tx2, schema, mapStyle);
                        marks && tx3.ensureMarks([...marks]);
                        marks && tx3.setStoredMarks([...marks]);

                        view.dispatch(tx3);
                    }
                }
            })), { label: ":", css: "color:black; width: 40px;" });
        this.tooltip.appendChild(listTypes.render(this.view).dom);

        await this.updateFromDash(view, undefined, undefined);

        const draggerWrapper = TooltipTextMenu.createDiv("dragger-wrapper");
        const dragger = TooltipTextMenu.createDiv("dragger");
        dragger.appendChild(TooltipTextMenu.createSpan("dragger-line"));
        dragger.appendChild(TooltipTextMenu.createSpan("dragger-line"));
        dragger.appendChild(TooltipTextMenu.createSpan("dragger-line"));
        draggerWrapper.appendChild(dragger);
        this.wrapper.appendChild(draggerWrapper);
        this.setupDragElementInteractions(draggerWrapper);
    }

    setupDragElementInteractions(elmnt: HTMLElement) {
        var pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
        if (elmnt) {
            // if present, the header is where you move the DIV from:
            elmnt.onpointerdown = dragPointerDown;
            elmnt.ondblclick = onClick;
        }
        const self = this;

        function dragPointerDown(e: PointerEvent) {
            e = e || window.event;
            e.preventDefault();
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
            if (self._collapsed && children.length > 0) {
                self.wrapper.removeChild(self.tooltip);
                self.basicTools && self.wrapper.prepend(self.basicTools);
            }
            else {
                self.wrapper.prepend(self.tooltip);
                self.basicTools && self.wrapper.removeChild(self.basicTools);
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
        }
    }

    //label of dropdown will change to given label
    updateFontSizeDropdown(label: string) {
        //font SIZES
        const fontSizeBtns: MenuItem[] = [];
        const self = this;
        this.fontSizes.forEach(mark =>
            fontSizeBtns.push(new MenuItem({
                title: "Set Font Size",
                label: String(mark.attrs.fontSize),
                execEvent: "",
                class: "dropdown-item",
                css: "color: black; width: 50px;",
                enable() { return true; },
                run() {
                    const size = mark.attrs.fontSize;
                    if (size) { self.updateFontSizeDropdown(String(size) + " pt"); }
                    if (self.editorProps) {
                        const ruleProvider = self.editorProps.ruleProvider;
                        const heading = NumCast(self.editorProps.Document.heading);
                        if (ruleProvider && heading) {
                            ruleProvider["ruleSize_" + heading] = size;
                        }
                    }
                    TooltipTextMenu.setMark(self.view.state.schema.marks.pFontSize.create({ fontSize: size }), self.view.state, self.view.dispatch);
                }
            })));

        const newfontSizeDom = (new Dropdown(fontSizeBtns, { label: label, css: "color:black; min-width: 60px;" }) as MenuItem).render(this.view).dom;
        if (this.fontSizeDom) {
            this.tooltip.replaceChild(newfontSizeDom, this.fontSizeDom);
        }
        else {
            this.tooltip.appendChild(newfontSizeDom);
        }
        this.fontSizeDom = newfontSizeDom;
    }

    //label of dropdown will change to given label
    updateFontStyleDropdown(label: string) {
        //font STYLES
        const fontBtns: MenuItem[] = [];
        const self = this;
        this.fontStyles.forEach(mark =>
            fontBtns.push(new MenuItem({
                title: "Set Font Family",
                label: mark.attrs.family,
                execEvent: "",
                class: "dropdown-item",
                css: "color: black; font-family: " + mark.attrs.family + ", sans-serif; width: 125px;",
                enable() { return true; },
                run() {
                    const fontName = mark.attrs.family;
                    if (fontName) { self.updateFontStyleDropdown(fontName); }
                    if (self.editorProps) {
                        const ruleProvider = self.editorProps.ruleProvider;
                        const heading = NumCast(self.editorProps.Document.heading);
                        if (ruleProvider && heading) {
                            ruleProvider["ruleFont_" + heading] = fontName;
                        }
                    }
                    TooltipTextMenu.setMark(self.view.state.schema.marks.pFontFamily.create({ family: fontName }), self.view.state, self.view.dispatch);
                }
            })));

        const newfontStyleDom = (new Dropdown(fontBtns, { label: label, css: "color:black; width: 125px;" }) as MenuItem).render(this.view).dom;
        if (this.fontStyleDom) {
            this.tooltip.replaceChild(newfontStyleDom, this.fontStyleDom);
        }
        else {
            this.tooltip.appendChild(newfontStyleDom);
        }
        this.fontStyleDom = newfontStyleDom;
    }
    async getTextLinkTargetTitle() {
        const node = this.view.state.selection.$from.nodeAfter;
        const link = node && node.marks.find(m => m.type.name === "link");
        if (link) {
            const href = link.attrs.href;
            if (href) {
                if (href.indexOf(Utils.prepend("/doc/")) === 0) {
                    const linkclicked = href.replace(Utils.prepend("/doc/"), "").split("?")[0];
                    if (linkclicked) {
                        const linkDoc = await DocServer.GetRefField(linkclicked);
                        if (linkDoc instanceof Doc) {
                            const anchor1 = await Cast(linkDoc.anchor1, Doc);
                            const anchor2 = await Cast(linkDoc.anchor2, Doc);
                            const currentDoc = SelectionManager.SelectedDocuments().length && SelectionManager.SelectedDocuments()[0].props.Document;
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

    // LINK TOOL
    createLinkTool(active: boolean = false) {
        return new MenuItem({
            title: "Link tool",
            label: "Link tool",
            icon: icons.link,
            css: "fill:white;",
            class: active ? "menuicon-active" : "menuicon",
            execEvent: "",
            run: async (state, dispatch) => { },
            active: (state) => true
        });
    }

    createLinkDropdown(targetTitle: string) {
        const input = document.createElement("input");

        // menu item for input for hyperlink url 
        // TODO: integrate search to allow users to search for a doc to link to
        const linkInfo = new MenuItem({
            title: "",
            execEvent: "",
            class: "button-setting-disabled",
            css: "",
            render() {
                const p = document.createElement("p");
                p.textContent = "Linked to:";

                input.type = "text";
                input.placeholder = "Enter URL";
                if (targetTitle) input.value = targetTitle;
                input.onclick = (e: MouseEvent) => {
                    input.select();
                    input.focus();
                };

                const div = document.createElement("div");
                div.appendChild(p);
                div.appendChild(input);
                return div;
            },
            enable() { return false; },
            run(p1, p2, p3, event) { event.stopPropagation(); }
        });

        // menu item to update/apply the hyperlink to the selected text
        const linkApply = new MenuItem({
            title: "",
            execEvent: "",
            class: "",
            css: "",
            render() {
                const button = document.createElement("button");
                button.className = "link-url-button";
                button.textContent = "Apply hyperlink";
                return button;
            },
            enable() { return false; },
            run: async (state, dispatch, view, event) => {
                event.stopPropagation();
                let node = this.view.state.selection.$from.nodeAfter;
                let link = this.view.state.schema.mark(this.view.state.schema.marks.link, { href: input.value, location: "onRight" });
                this.view.dispatch(this.view.state.tr.removeMark(this.view.state.selection.from, this.view.state.selection.to, this.view.state.schema.marks.link));
                this.view.dispatch(this.view.state.tr.addMark(this.view.state.selection.from, this.view.state.selection.to, link));
                node = this.view.state.selection.$from.nodeAfter;
                link = node && node.marks.find(m => m.type.name === "link");

                // update link menu
                const linkDom = self.createLinkTool(true).render(self.view).dom;
                const linkDropdownDom = self.createLinkDropdown(await self.getTextLinkTargetTitle()).render(self.view).dom;
                self.linkDom && self.tooltip.replaceChild(linkDom, self.linkDom);
                self.linkDropdownDom && self.tooltip.replaceChild(linkDropdownDom, self.linkDropdownDom);
                self.linkDom = linkDom;
                self.linkDropdownDom = linkDropdownDom;
            }
        });

        // menu item to remove the link
        // TODO: allow this to be undoable
        const self = this;
        const deleteLink = new MenuItem({
            title: "Delete link",
            execEvent: "",
            class: "separated-button",
            css: "",
            render() {
                const button = document.createElement("button");
                button.textContent = "Remove link";

                const wrapper = document.createElement("div");
                wrapper.appendChild(button);
                return wrapper;
            },
            enable() { return true; },
            async run() {
                // delete the link
                const node = self.view.state.selection.$from.nodeAfter;
                const link = node && node.marks.find(m => m.type === self.view.state.schema.marks.link);
                const href = link!.attrs.href;
                if (href?.indexOf(Utils.prepend("/doc/")) === 0) {
                    const linkclicked = href.replace(Utils.prepend("/doc/"), "").split("?")[0];
                    linkclicked && DocServer.GetRefField(linkclicked).then(async linkDoc => {
                        if (linkDoc instanceof Doc) {
                            LinkManager.Instance.deleteLink(linkDoc);
                            self.view.dispatch(self.view.state.tr.removeMark(self.view.state.selection.from, self.view.state.selection.to, self.view.state.schema.marks.link));
                        }
                    });
                }
                // update link menu
                const linkDom = self.createLinkTool(false).render(self.view).dom;
                const linkDropdownDom = self.createLinkDropdown("").render(self.view).dom;
                self.linkDom && self.tooltip.replaceChild(linkDom, self.linkDom);
                self.linkDropdownDom && self.tooltip.replaceChild(linkDropdownDom, self.linkDropdownDom);
                self.linkDom = linkDom;
                self.linkDropdownDom = linkDropdownDom;
            }
        });

        return new Dropdown(targetTitle ? [linkInfo, linkApply, deleteLink] : [linkInfo, linkApply], { class: "buttonSettings-dropdown" }) as MenuItem;
    }

    public MakeLinkToSelection = (linkDocId: string, title: string, location: string, targetDocId: string): string => {
        const link = this.view.state.schema.marks.link.create({ href: Utils.prepend("/doc/" + linkDocId), title: title, location: location, targetId: targetDocId });
        this.view.dispatch(this.view.state.tr.removeMark(this.view.state.selection.from, this.view.state.selection.to, this.view.state.schema.marks.link).
            addMark(this.view.state.selection.from, this.view.state.selection.to, link));
        return this.view.state.selection.$from.nodeAfter?.text || "";
    }

    // SUMMARIZER TOOL
    static insertSummarizer(state: EditorState<any>, dispatch: any) {
        if (!state.selection.empty) {
            const mark = state.schema.marks.summarize.create();
            const tr = state.tr.addMark(state.selection.from, state.selection.to, mark);
            const content = tr.selection.content();
            const newNode = state.schema.nodes.summary.create({ visibility: false, text: content, textslice: content.toJSON() });
            dispatch?.(tr.replaceSelectionWith(newNode).removeMark(tr.selection.from - 1, tr.selection.from, mark));
        }
    }

    // HIGHLIGHTER TOOL
    createHighlightTool() {
        return new MenuItem({
            title: "Highlight",
            css: "fill:white;",
            class: "menuicon",
            execEvent: "",
            render() {
                const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
                svg.setAttribute("viewBox", "-100 -100 650 650");
                const path = document.createElementNS('http://www.w3.org/2000/svg', "path");
                path.setAttributeNS(null, "d", "M0 479.98L99.92 512l35.45-35.45-67.04-67.04L0 479.98zm124.61-240.01a36.592 36.592 0 0 0-10.79 38.1l13.05 42.83-50.93 50.94 96.23 96.23 50.86-50.86 42.74 13.08c13.73 4.2 28.65-.01 38.15-10.78l35.55-41.64-173.34-173.34-41.52 35.44zm403.31-160.7l-63.2-63.2c-20.49-20.49-53.38-21.52-75.12-2.35L190.55 183.68l169.77 169.78L530.27 154.4c19.18-21.74 18.15-54.63-2.35-75.13z");
                svg.appendChild(path);

                const color = TooltipTextMenu.createDiv("buttonColor");
                color.style.backgroundColor = TooltipTextMenuManager.Instance.highlighter.toString();

                const wrapper = TooltipTextMenu.createDiv("colorPicker");
                wrapper.appendChild(svg);
                wrapper.appendChild(color);
                return wrapper;
            },
            run: (state, dispatch) => TooltipTextMenu.insertHighlight(TooltipTextMenuManager.Instance.highlighter, state, dispatch)
        });
    }

    static insertHighlight(color: String, state: EditorState<any>, dispatch: any) {
        if (!state.selection.empty) {
            toggleMark(state.schema.marks.marker, { highlight: color })(state, dispatch);
        }
    }

    createHighlightDropdown() {
        // menu item for color picker
        const self = this;
        const colors = new MenuItem({
            title: "",
            execEvent: "",
            class: "button-setting-disabled",
            css: "",
            render() {
                const p = document.createElement("p");
                p.textContent = "Change highlight:";

                const colorsWrapper = TooltipTextMenu.createDiv("colorPicker-wrapper");

                const colors = [
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
                    const button = document.createElement("button");
                    button.className = color === TooltipTextMenuManager.Instance.highlighter ? "colorPicker active" : "colorPicker";
                    if (color) {
                        button.style.backgroundColor = color;
                        button.textContent = color === "transparent" ? "X" : "";
                        button.onclick = e => {
                            TooltipTextMenuManager.Instance.highlighter = color;

                            TooltipTextMenu.insertHighlight(TooltipTextMenuManager.Instance.highlighter, self.view.state, self.view.dispatch);

                            // update color menu
                            const highlightDom = self.createHighlightTool().render(self.view).dom;
                            const highlightDropdownDom = self.createHighlightDropdown().render(self.view).dom;
                            self.highighterDom && self.tooltip.replaceChild(highlightDom, self.highighterDom);
                            self.highlighterDropdownDom && self.tooltip.replaceChild(highlightDropdownDom, self.highlighterDropdownDom);
                            self.highighterDom = highlightDom;
                            self.highlighterDropdownDom = highlightDropdownDom;
                        };
                    }
                    colorsWrapper.appendChild(button);
                });

                const div = document.createElement("div");
                div.appendChild(p);
                div.appendChild(colorsWrapper);
                return div;
            },
            enable() { return false; },
            run(p1, p2, p3, event) {
                event.stopPropagation();
            }
        });

        return new Dropdown([colors], { class: "buttonSettings-dropdown" }) as MenuItem;
    }

    // COLOR TOOL
    createColorTool() {
        return new MenuItem({
            title: "Color",
            css: "fill:white;",
            class: "menuicon",
            execEvent: "",
            render() {
                const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
                svg.setAttribute("viewBox", "-100 -100 650 650");
                const path = document.createElementNS('http://www.w3.org/2000/svg', "path");
                path.setAttributeNS(null, "d", "M204.3 5C104.9 24.4 24.8 104.3 5.2 203.4c-37 187 131.7 326.4 258.8 306.7 41.2-6.4 61.4-54.6 42.5-91.7-23.1-45.4 9.9-98.4 60.9-98.4h79.7c35.8 0 64.8-29.6 64.9-65.3C511.5 97.1 368.1-26.9 204.3 5zM96 320c-17.7 0-32-14.3-32-32s14.3-32 32-32 32 14.3 32 32-14.3 32-32 32zm32-128c-17.7 0-32-14.3-32-32s14.3-32 32-32 32 14.3 32 32-14.3 32-32 32zm128-64c-17.7 0-32-14.3-32-32s14.3-32 32-32 32 14.3 32 32-14.3 32-32 32zm128 64c-17.7 0-32-14.3-32-32s14.3-32 32-32 32 14.3 32 32-14.3 32-32 32z");
                svg.appendChild(path);

                const color = TooltipTextMenu.createDiv("buttonColor");
                color.style.backgroundColor = TooltipTextMenuManager.Instance.color.toString();

                const wrapper = TooltipTextMenu.createDiv("colorPicker");
                wrapper.appendChild(svg);
                wrapper.appendChild(color);
                return wrapper;
            },
            run: (state, dispatch) => TooltipTextMenu.insertColor(TooltipTextMenuManager.Instance.color, state, dispatch)
        });
    }

    static insertColor(color: String, state: EditorState<any>, dispatch: any) {
        const colorMark = state.schema.mark(state.schema.marks.pFontColor, { color: color });
        if (state.selection.empty) {
            dispatch(state.tr.addStoredMark(colorMark));
        } else {
            this.setMark(colorMark, state, dispatch);
        }
    }

    createColorDropdown() {
        // menu item for color picker
        const self = this;
        const colors = new MenuItem({
            title: "",
            execEvent: "",
            class: "button-setting-disabled",
            css: "",
            render() {
                const p = document.createElement("p");
                p.textContent = "Change color:";

                const colorsWrapper = TooltipTextMenu.createDiv("colorPicker-wrapper");

                const colors = [
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
                    const button = document.createElement("button");
                    button.className = color === TooltipTextMenuManager.Instance.color ? "colorPicker active" : "colorPicker";
                    if (color) {
                        button.style.backgroundColor = color;
                        button.onclick = e => {
                            TooltipTextMenuManager.Instance.color = color;

                            TooltipTextMenu.insertColor(TooltipTextMenuManager.Instance.color, self.view.state, self.view.dispatch);

                            // update color menu
                            const colorDom = self.createColorTool().render(self.view).dom;
                            const colorDropdownDom = self.createColorDropdown().render(self.view).dom;
                            self.colorDom && self.tooltip.replaceChild(colorDom, self.colorDom);
                            self.colorDropdownDom && self.tooltip.replaceChild(colorDropdownDom, self.colorDropdownDom);
                            self.colorDom = colorDom;
                            self.colorDropdownDom = colorDropdownDom;
                        };
                    }
                    colorsWrapper.appendChild(button);
                });

                const div = document.createElement("div");
                div.appendChild(p);
                div.appendChild(colorsWrapper);
                return div;
            },
            enable() { return false; },
            run(p1, p2, p3, event) { event.stopPropagation(); }
        });

        return new Dropdown([colors], { class: "buttonSettings-dropdown" }) as MenuItem;
    }

    // BRUSH TOOL
    createBrushTool(active: boolean = false) {
        const icon = {
            height: 32, width: 32,
            path: "M30.828 1.172c-1.562-1.562-4.095-1.562-5.657 0l-5.379 5.379-3.793-3.793-4.243 4.243 3.326 3.326-14.754 14.754c-0.252 0.252-0.358 0.592-0.322 0.921h-0.008v5c0 0.552 0.448 1 1 1h5c0 0 0.083 0 0.125 0 0.288 0 0.576-0.11 0.795-0.329l14.754-14.754 3.326 3.326 4.243-4.243-3.793-3.793 5.379-5.379c1.562-1.562 1.562-4.095 0-5.657zM5.409 30h-3.409v-3.409l14.674-14.674 3.409 3.409-14.674 14.674z"
        };
        const self = this;
        return new MenuItem({
            title: "Brush tool",
            label: "Brush tool",
            icon: icon,
            css: "fill:white;",
            class: active ? "menuicon-active" : "menuicon",
            execEvent: "",
            run: (state, dispatch) => {
                this.brush_function(state, dispatch);

                // update dropdown with marks
                const newBrushDropdowndom = self.createBrushDropdown().render(self.view).dom;
                self._brushDropdownDom && self.tooltip.replaceChild(newBrushDropdowndom, self._brushDropdownDom);
                self._brushDropdownDom = newBrushDropdowndom;
            },
            active: (state) => true
        });
    }

    brush_function(state: EditorState<any>, dispatch: any) {
        if (TooltipTextMenuManager.Instance._brushIsEmpty) {
            // get marks in the selection
            const selected_marks = new Set<Mark>();
            const { from, to } = state.selection as TextSelection;
            state.doc.nodesBetween(from, to, (node) => node.marks?.forEach(m => selected_marks.add(m)));

            if (this._brushdom && selected_marks.size >= 0) {
                TooltipTextMenuManager.Instance._brushMarks = selected_marks;
                const newbrush = this.createBrushTool(true).render(this.view).dom;
                this.tooltip.replaceChild(newbrush, this._brushdom);
                this._brushdom = newbrush;
                TooltipTextMenuManager.Instance._brushIsEmpty = !TooltipTextMenuManager.Instance._brushIsEmpty;
            }
        }
        else {
            const { from, to, $from } = this.view.state.selection;
            if (this._brushdom) {
                if (!this.view.state.selection.empty && $from && $from.nodeAfter) {
                    if (TooltipTextMenuManager.Instance._brushMarks && to - from > 0) {
                        this.view.dispatch(this.view.state.tr.removeMark(from, to));
                        Array.from(TooltipTextMenuManager.Instance._brushMarks).filter(m => m.type !== schema.marks.user_mark).forEach((mark: Mark) => {
                            TooltipTextMenu.setMark(mark, this.view.state, this.view.dispatch);
                        });
                    }
                }
                else {
                    const newbrush = this.createBrushTool(false).render(this.view).dom;
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
            TooltipTextMenuManager.Instance._brushMarks.forEach((mark: Mark) => label += mark.type.name + ", ");
            label = label.substring(0, label.length - 2);
        } else {
            label = "No marks are currently stored";
        }

        const brushInfo = new MenuItem({
            title: "",
            label: label,
            execEvent: "",
            class: "button-setting-disabled",
            css: "",
            enable() { return false; },
            run(p1, p2, p3, event) { event.stopPropagation(); }
        });

        const self = this;
        const input = document.createElement("input");
        const clearBrush = new MenuItem({
            title: "Clear brush",
            execEvent: "",
            class: "separated-button",
            css: "",
            render() {
                const button = document.createElement("button");
                button.textContent = "Clear brush";

                input.textContent = "editme";
                input.style.width = "75px";
                input.style.height = "30px";
                input.style.background = "white";
                input.setAttribute("contenteditable", "true");
                input.style.whiteSpace = "nowrap";
                input.type = "text";
                input.placeholder = "Enter URL";
                input.onpointerdown = (e: PointerEvent) => {
                    e.stopPropagation();
                    e.preventDefault();
                };
                input.onclick = (e: MouseEvent) => {
                    input.select();
                    input.focus();
                };
                input.onkeypress = (e: KeyboardEvent) => {
                    if (e.key === "Enter") {
                        TooltipTextMenuManager.Instance._brushMarks && TooltipTextMenuManager.Instance._brushMap.set(input.value, TooltipTextMenuManager.Instance._brushMarks);
                        input.style.background = "lightGray";
                    }
                };

                const wrapper = document.createElement("div");
                wrapper.appendChild(input);
                wrapper.appendChild(button);
                return wrapper;
            },
            enable() { return true; },
            run() {
                TooltipTextMenuManager.Instance._brushIsEmpty = true;
                TooltipTextMenuManager.Instance._brushMarks = new Set();

                // update brush tool
                // TODO: this probably isn't very clean
                const newBrushdom = self.createBrushTool().render(self.view).dom;
                self._brushdom && self.tooltip.replaceChild(newBrushdom, self._brushdom);
                self._brushdom = newBrushdom;
                const newBrushDropdowndom = self.createBrushDropdown().render(self.view).dom;
                self._brushDropdownDom && self.tooltip.replaceChild(newBrushDropdowndom, self._brushDropdownDom);
                self._brushDropdownDom = newBrushDropdowndom;
            }
        });

        const hasMarks = TooltipTextMenuManager.Instance._brushMarks && TooltipTextMenuManager.Instance._brushMarks.size > 0;
        return new Dropdown(hasMarks ? [brushInfo, clearBrush] : [brushInfo], { class: "buttonSettings-dropdown" }) as MenuItem;
    }

    static setMark = (mark: Mark, state: EditorState<any>, dispatch: any) => {
        if (mark) {
            const node = (state.selection as NodeSelection).node;
            if (node?.type === schema.nodes.ordered_list) {
                let attrs = node.attrs;
                if (mark.type === schema.marks.pFontFamily) attrs = { ...attrs, setFontFamily: mark.attrs.family };
                if (mark.type === schema.marks.pFontSize) attrs = { ...attrs, setFontSize: mark.attrs.fontSize };
                if (mark.type === schema.marks.pFontColor) attrs = { ...attrs, setFontColor: mark.attrs.color };
                const tr = updateBullets(state.tr.setNodeMarkup(state.selection.from, node.type, attrs), state.schema);
                dispatch(tr.setSelection(new NodeSelection(tr.doc.resolve(state.selection.from))));
            } else {
                toggleMark(mark.type, mark.attrs)(state, (tx: any) => {
                    const { from, $from, to, empty } = tx.selection;
                    if (!tx.doc.rangeHasMark(from, to, mark.type)) {
                        toggleMark(mark.type, mark.attrs)({ tr: tx, doc: tx.doc, selection: tx.selection, storedMarks: tx.storedMarks }, dispatch);
                    } else dispatch(tx);
                });
            }
        }
    }

    // called by Prosemirror
    update(view: EditorView, lastState: EditorState | undefined) { this.updateFromDash(view, lastState, this.editorProps); }
    //updates the tooltip menu when the selection changes
    public async updateFromDash(view: EditorView, lastState: EditorState | undefined, props: any) {
        if (!view) {
            console.log("no editor?  why?");
            return;
        }
        this.view = view;
        DocumentDecorations.Instance.showTextBar();
        props && (this.editorProps = props);

        // Don't do anything if the document/selection didn't change
        if (!lastState || !lastState.doc.eq(view.state.doc) || !lastState.selection.eq(view.state.selection)) {

            // UPDATE LINK DROPDOWN
            const linkTarget = await this.getTextLinkTargetTitle();
            const linkDom = this.createLinkTool(linkTarget ? true : false).render(this.view).dom;
            const linkDropdownDom = this.createLinkDropdown(linkTarget).render(this.view).dom;
            this.linkDom && this.tooltip.replaceChild(linkDom, this.linkDom);
            this.linkDropdownDom && this.tooltip.replaceChild(linkDropdownDom, this.linkDropdownDom);
            this.linkDom = linkDom;
            this.linkDropdownDom = linkDropdownDom;

            //UPDATE FONT STYLE DROPDOWN
            const activeStyles = this.activeFontFamilyOnSelection();
            this.updateFontStyleDropdown(activeStyles.length === 1 ? activeStyles[0] : activeStyles.length ? "various" : "default");

            //UPDATE FONT SIZE DROPDOWN
            const activeSizes = this.activeFontSizeOnSelection();
            this.updateFontSizeDropdown(activeSizes.length === 1 ? String(activeSizes[0]) + " pt" : activeSizes.length ? "various" : "default");

            //UPDATE ALL OTHER BUTTONS
            this.updateHighlightStateOfButtons();
        }
    }

    updateHighlightStateOfButtons() {
        Array.from(this._marksToDoms.values()).forEach(val => val.style.fill = "white");
        this.activeMarksOnSelection().filter(mark => this._marksToDoms.has(mark)).forEach(mark =>
            this._marksToDoms.get(mark)!.style.fill = "greenyellow");

        // keeps brush tool highlighted if active when switching between textboxes
        if (!TooltipTextMenuManager.Instance._brushIsEmpty && this._brushdom) {
            const newbrush = this.createBrushTool(true).render(this.view).dom;
            this.tooltip.replaceChild(newbrush, this._brushdom);
            this._brushdom = newbrush;
        }
    }

    //finds fontSize at start of selection
    activeFontSizeOnSelection() {
        //current selection
        const state = this.view.state;
        const activeSizes: number[] = [];
        const pos = this.view.state.selection.$from;
        const ref_node: ProsNode = this.reference_node(pos);
        if (ref_node && ref_node !== this.view.state.doc && ref_node.isText) {
            ref_node.marks.forEach(m => m.type === state.schema.marks.pFontSize && activeSizes.push(m.attrs.fontSize));
        }
        return activeSizes;
    }
    //finds fontSize at start of selection
    activeFontFamilyOnSelection() {
        //current selection
        const state = this.view.state;
        const activeFamilies: string[] = [];
        const pos = this.view.state.selection.$from;
        const ref_node: ProsNode = this.reference_node(pos);
        if (ref_node && ref_node !== this.view.state.doc && ref_node.isText) {
            ref_node.marks.forEach(m => m.type === state.schema.marks.pFontFamily && activeFamilies.push(m.attrs.family));
        }
        return activeFamilies;
    }
    //finds all active marks on selection in given group
    activeMarksOnSelection() {
        const markGroup = Array.from(this._marksToDoms.keys());
        if (this.view.state.storedMarks) return this.view.state.storedMarks.map(mark => mark.type);
        //current selection
        const { empty, ranges, $to } = this.view.state.selection as TextSelection;
        const state = this.view.state;
        let activeMarks: MarkType[] = [];
        if (!empty) {
            activeMarks = markGroup.filter(mark => {
                const has = false;
                for (let i = 0; !has && i < ranges.length; i++) {
                    return state.doc.rangeHasMark(ranges[i].$from.pos, ranges[i].$to.pos, mark);
                }
                return false;
            });
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
                activeMarks = markGroup.filter(mark_type => {
                    if (mark_type === state.schema.marks.pFontSize) {
                        return ref_node.marks.some(m => m.type.name === state.schema.marks.pFontSize.name);
                    }
                    const mark = state.schema.mark(mark_type);
                    return ref_node.marks.includes(mark);
                });
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
        // this.wrapper.remove();
    }
}


export class TooltipTextMenuManager {
    private static _instance: TooltipTextMenuManager;
    private _isPinned: boolean = false;

    public pinnedX: number = 0;
    public pinnedY: number = 0;
    public unpinnedX: number = 0;
    public unpinnedY: number = 0;

    public _brushMarks: Set<Mark> | undefined;
    public _brushMap: Map<string, Set<Mark>> = new Map();
    public _brushIsEmpty: boolean = true;

    public color: String = "#000";
    public highlighter: String = "transparent";

    public activeMenu: TooltipTextMenu | undefined;

    static get Instance() {
        if (!TooltipTextMenuManager._instance) {
            TooltipTextMenuManager._instance = new TooltipTextMenuManager();
        }
        return TooltipTextMenuManager._instance;
    }

    public get isPinned() { return this._isPinned; }

    public toggleIsPinned() { this._isPinned = !this._isPinned; }
}
