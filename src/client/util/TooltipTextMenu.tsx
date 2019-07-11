import { action } from "mobx";
import { Dropdown, MenuItem, icons, } from "prosemirror-menu"; //no import css
import { EditorState, NodeSelection, TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { schema } from "./RichTextSchema";
import { Schema, NodeType, MarkType, Mark, ResolvedPos } from "prosemirror-model";
import { Node as ProsNode } from "prosemirror-model";
import "./TooltipTextMenu.scss";
const { toggleMark, setBlockType } = require("prosemirror-commands");
import { library } from '@fortawesome/fontawesome-svg-core';
import { wrapInList, liftListItem, } from 'prosemirror-schema-list';
import { faListUl } from '@fortawesome/free-solid-svg-icons';
import { FieldViewProps } from "../views/nodes/FieldView";
const { openPrompt, TextField } = require("./ProsemirrorCopy/prompt.js");
import { DragManager } from "./DragManager";
import { Doc, Opt, Field } from "../../new_fields/Doc";
import { DocServer } from "../DocServer";
import { CollectionDockingView } from "../views/collections/CollectionDockingView";
import { DocumentManager } from "./DocumentManager";
import { Id } from "../../new_fields/FieldSymbols";
import { FormattedTextBoxProps } from "../views/nodes/FormattedTextBox";

//appears above a selection of text in a RichTextBox to give user options such as Bold, Italics, etc.
export class TooltipTextMenu {

    public tooltip: HTMLElement;
    private view: EditorView;
    private fontStyles: MarkType[];
    private fontSizes: MarkType[];
    private listTypes: NodeType[];
    private editorProps: FieldViewProps & FormattedTextBoxProps;
    private fontSizeToNum: Map<MarkType, number>;
    private fontStylesToName: Map<MarkType, string>;
    private listTypeToIcon: Map<NodeType, string>;

    private linkEditor?: HTMLDivElement;
    private linkText?: HTMLDivElement;
    private linkDrag?: HTMLImageElement;
    //dropdown doms
    private fontSizeDom?: Node;
    private fontStyleDom?: Node;
    private listTypeBtnDom?: Node;

    private _activeMarks: Mark[] = [];

    private _collapseBtn?: MenuItem;

    constructor(view: EditorView, editorProps: FieldViewProps & FormattedTextBoxProps) {
        this.view = view;
        this.editorProps = editorProps;
        this.tooltip = document.createElement("div");
        this.tooltip.className = "tooltipMenu";

        // this.createCollapse();
        // if (this._collapseBtn) {
        //     this.tooltip.appendChild(this._collapseBtn.render(this.view).dom);
        // }
        //add the div which is the tooltip
        //view.dom.parentNode!.parentNode!.appendChild(this.tooltip);

        //add additional icons
        library.add(faListUl);
        //add the buttons to the tooltip
        let items = [
            { command: toggleMark(schema.marks.strong), dom: this.icon("B", "strong", "Bold") },
            { command: toggleMark(schema.marks.em), dom: this.icon("i", "em", "Italic") },
            { command: toggleMark(schema.marks.underline), dom: this.icon("U", "underline", "Underline") },
            { command: toggleMark(schema.marks.strikethrough), dom: this.icon("S", "strikethrough", "Strikethrough") },
            { command: toggleMark(schema.marks.superscript), dom: this.icon("s", "superscript", "Superscript") },
            { command: toggleMark(schema.marks.subscript), dom: this.icon("s", "subscript", "Subscript") },
            { command: toggleMark(schema.marks.highlight), dom: this.icon("H", 'blue', 'Blue') }
            // { command: wrapInList(schema.nodes.bullet_list), dom: this.icon(":", "bullets") },
            // { command: wrapInList(schema.nodes.ordered_list), dom: this.icon("1)", "bullets") },
            // { command: lift, dom: this.icon("<", "lift") },
        ];
        //add menu items
        items.forEach(({ dom, command }) => {
            this.tooltip.appendChild(dom);

            //pointer down handler to activate button effects
            dom.addEventListener("pointerdown", e => {
                e.preventDefault();
                view.focus();
                if (dom.contains(e.target as Node)) {
                    e.stopPropagation();
                    command(view.state, view.dispatch, view);
                }
            });

        });
        this.updateLinkMenu();

        //list of font styles
        this.fontStylesToName = new Map();
        this.fontStylesToName.set(schema.marks.timesNewRoman, "Times New Roman");
        this.fontStylesToName.set(schema.marks.arial, "Arial");
        this.fontStylesToName.set(schema.marks.georgia, "Georgia");
        this.fontStylesToName.set(schema.marks.comicSans, "Comic Sans MS");
        this.fontStylesToName.set(schema.marks.tahoma, "Tahoma");
        this.fontStylesToName.set(schema.marks.impact, "Impact");
        this.fontStylesToName.set(schema.marks.crimson, "Crimson Text");
        this.fontStyles = Array.from(this.fontStylesToName.keys());

        //font sizes
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
        this.fontSizeToNum.set(schema.marks.pFontSize, 10);
        this.fontSizes = Array.from(this.fontSizeToNum.keys());

        //list types
        this.listTypeToIcon = new Map();
        this.listTypeToIcon.set(schema.nodes.bullet_list, ":");
        this.listTypeToIcon.set(schema.nodes.ordered_list, "1)");
        this.listTypes = Array.from(this.listTypeToIcon.keys());

        this.tooltip.appendChild(this.createLink().render(this.view).dom);

        this.tooltip.appendChild(this.createStar().render(this.view).dom);



        this.updateListItemDropdown(":", this.listTypeBtnDom);

        this.update(view, undefined);

        //view.dom.parentNode!.parentNode!.insertBefore(this.tooltip, view.dom.parentNode);

        // quick and dirty null check
        const outer_div = this.editorProps.outer_div;
        outer_div && outer_div(this.tooltip);
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
            this.linkEditor.style.color = "black";
            this.linkText = document.createElement("div");
            this.linkText.style.cssFloat = "left";
            this.linkText.style.marginRight = "5px";
            this.linkText.style.marginLeft = "5px";
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
                    if (href.indexOf(DocServer.prepend("/doc/")) === 0) {
                        let docid = href.replace(DocServer.prepend("/doc/"), "");
                        DocServer.GetRefField(docid).then(action((f: Opt<Field>) => {
                            if (f instanceof Doc) {
                                if (DocumentManager.Instance.getDocumentView(f)) {
                                    DocumentManager.Instance.getDocumentView(f)!.props.focus(f, false);
                                }
                                else if (CollectionDockingView.Instance) CollectionDockingView.Instance.AddRightSplit(f, undefined);
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
            this.linkDrag.style.color = "black";
            this.linkDrag.style.background = "black";
            this.linkDrag.style.cssFloat = "left";
            this.linkDrag.onpointerdown = (e: PointerEvent) => {
                let dragData = new DragManager.LinkDragData(this.editorProps.Document);
                dragData.dontClearTextBox = true;
                DragManager.StartLinkDrag(this.linkDrag!, dragData, e.clientX, e.clientY,
                    {
                        handlers: {
                            dragComplete: action(() => {
                                let m = dragData.droppedDocuments;
                                this.makeLink(DocServer.prepend("/doc/" + m[0][Id]));
                            }),
                        },
                        hideSource: false
                    });
            };
            this.linkEditor.appendChild(this.linkDrag);
            // this.linkEditor.appendChild(this.linkText);
            // this.linkEditor.appendChild(linkBtn);
            this.tooltip.appendChild(this.linkEditor);
        }

        let node = this.view.state.selection.$from.nodeAfter;
        let link = node && node.marks.find(m => m.type.name === "link");
        this.linkText.textContent = link ? link.attrs.href : "-empty-";

        this.linkText.onkeydown = (e: KeyboardEvent) => {
            if (e.key === "Enter") {
                this.makeLink(this.linkText!.textContent!);
                e.stopPropagation();
                e.preventDefault();
            }
        };
        this.tooltip.appendChild(this.linkEditor);
    }

    makeLink = (target: string) => {
        let node = this.view.state.selection.$from.nodeAfter;
        let link = this.view.state.schema.mark(this.view.state.schema.marks.link, { href: target });
        this.view.dispatch(this.view.state.tr.removeMark(this.view.state.selection.from, this.view.state.selection.to, this.view.state.schema.marks.link));
        this.view.dispatch(this.view.state.tr.addMark(this.view.state.selection.from, this.view.state.selection.to, link));
        node = this.view.state.selection.$from.nodeAfter;
        link = node && node.marks.find(m => m.type.name === "link");
    }

    public static insertStar(state: EditorState<any>, dispatch: any) {
        let newNode = schema.nodes.star.create({ visibility: false, text: state.selection.content(), textslice: state.selection.content().toJSON(), textlen: state.selection.to - state.selection.from });
        if (dispatch) {
            //console.log(newNode.attrs.text.toString());
            dispatch(state.tr.replaceSelectionWith(newNode));
        }
        return true;
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
    changeToMarkInGroup = (markType: MarkType, view: EditorView, fontMarks: MarkType[]) => {
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
        // fontsize
        if (markType.name[0] === 'p') {
            let size = this.fontSizeToNum.get(markType);
            if (size) { this.updateFontSizeDropdown(String(size) + " pt"); }
        }
        else {
            let fontName = this.fontStylesToName.get(markType);
            if (fontName) { this.updateFontStyleDropdown(fontName); }
        }
        //actually apply font
        return toggleMark(markType)(view.state, view.dispatch, view);
    }

    //remove all node typeand apply the passed-in one to the selected text
    changeToNodeType(nodeType: NodeType | undefined, view: EditorView) {
        //remove old
        liftListItem(schema.nodes.list_item)(view.state, view.dispatch);
        if (nodeType) { //add new
            wrapInList(nodeType)(view.state, view.dispatch);
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
            class: "summarize",
            execEvent: "",
            run: (state, dispatch) => {
                TooltipTextMenu.insertStar(state, dispatch);
            }

        });
    }

    createCollapse() {
        this._collapseBtn = new MenuItem({
            title: "Collapse",
            //label: "Collapse",
            icon: icons.join,
            execEvent: "",
            css: "color:white;",
            class: "summarize",
            run: () => {
                this.collapseToolTip();
            }
        });
    }

    collapseToolTip() {
        if (this._collapseBtn) {
            if (this._collapseBtn.spec.title === "Collapse") {
                // const newcollapseBtn = new MenuItem({
                //     title: "Expand",
                //     icon: icons.join,
                //     execEvent: "",
                //     css: "color:white;",
                //     class: "summarize",
                //     run: (state, dispatch, view) => {
                //         this.collapseToolTip();
                //     }
                // });
                // this.tooltip.replaceChild(newcollapseBtn.render(this.view).dom, this._collapseBtn.render(this.view).dom);
                // this._collapseBtn = newcollapseBtn;
                this.tooltip.style.width = "30px";
                this._collapseBtn.spec.title = "Expand";
                this._collapseBtn.render(this.view);
            }
            else {
                this._collapseBtn.spec.title = "Collapse";
                this.tooltip.style.width = "550px";
                this._collapseBtn.render(this.view);
            }
        }
    }

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
                    })
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

    getMarksInSelection(state: EditorState<any>, targets: MarkType<any>[]) {
        let found: Mark<any>[] = [];
        let { from, to } = state.selection as TextSelection;
        state.doc.nodesBetween(from, to, (node) => {
            let marks = node.marks;
            if (marks) {
                marks.forEach(m => {
                    if (targets.includes(m.type)) found.push(m);
                });
            }
        });
        return found;
    }

    //updates the tooltip menu when the selection changes
    update(view: EditorView, lastState: EditorState | undefined) {
        let state = view.state;
        // Don't do anything if the document/selection didn't change
        if (lastState && lastState.doc.eq(state.doc) &&
            lastState.selection.eq(state.selection)) return;

        // Hide the tooltip if the selection is empty
        if (state.selection.empty) {
            //this.tooltip.style.display = "none";
            //return;
        }


        //UPDATE LIST ITEM DROPDOWN

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
        this.view.dispatch(this.view.state.tr.setStoredMarks(this._activeMarks));
    }

    //finds all active marks on selection in given group
    activeMarksOnSelection(markGroup: MarkType[]) {
        //current selection
        let { empty, ranges } = this.view.state.selection as TextSelection;
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
        if (pos.nodeAfter !== null && pos.nodeAfter !== undefined) {
            ref_node = pos.nodeAfter;
        }
        else if (pos.nodeBefore !== null && pos.nodeBefore !== undefined) {
            ref_node = pos.nodeBefore;
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
        return ref_node;
    }

    destroy() {
        this.tooltip.remove();
    }
}
