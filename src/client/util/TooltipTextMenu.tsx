import { action, IReactionDisposer, reaction } from "mobx";
import { Dropdown, DropdownSubmenu, MenuItem, MenuItemSpec, renderGrouped, icons, } from "prosemirror-menu"; //no import css
import { baseKeymap, lift, deleteSelection } from "prosemirror-commands";
import { history, redo, undo } from "prosemirror-history";
import { keymap } from "prosemirror-keymap";
import { EditorState, Transaction, NodeSelection, TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { schema } from "./RichTextSchema";
import { Schema, NodeType, MarkType, Mark } from "prosemirror-model";
import { Node as ProsNode } from "prosemirror-model"
import React = require("react");
import "./TooltipTextMenu.scss";
const { toggleMark, setBlockType, wrapIn } = require("prosemirror-commands");
import { library } from '@fortawesome/fontawesome-svg-core';
import { wrapInList, bulletList, liftListItem, listItem, } from 'prosemirror-schema-list';
import { liftTarget, RemoveMarkStep, AddMarkStep } from 'prosemirror-transform';
import {
    faListUl, faGrinTongueSquint,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { FieldViewProps } from "../views/nodes/FieldView";
import { throwStatement } from "babel-types";
const { openPrompt, TextField } = require("./ProsemirrorCopy/prompt.js");
import { View } from "@react-pdf/renderer";
import { DragManager } from "./DragManager";
import { Doc, Opt, Field } from "../../new_fields/Doc";
import { DocServer } from "../DocServer";
import { CollectionFreeFormDocumentView } from "../views/nodes/CollectionFreeFormDocumentView";
import { CollectionDockingView } from "../views/collections/CollectionDockingView";
import { DocumentManager } from "./DocumentManager";
import { Id } from "../../new_fields/FieldSymbols";
import { Utils } from "../../Utils";
import { FormattedTextBoxProps } from "../views/nodes/FormattedTextBox";
import { text } from "body-parser";
// import { wrap } from "module";

const SVG = "http://www.w3.org/2000/svg";

//appears above a selection of text in a RichTextBox to give user options such as Bold, Italics, etc.
export class TooltipTextMenu {

    public tooltip: HTMLElement;
    private num_icons = 0;
    private view: EditorView;
    private fontStyles: MarkType[];
    private fontSizes: MarkType[];
    private listTypes: NodeType[];
    private editorProps: FieldViewProps & FormattedTextBoxProps;
    private state: EditorState;
    private fontSizeToNum: Map<MarkType, number>;
    private fontStylesToName: Map<MarkType, string>;
    private listTypeToIcon: Map<NodeType, string>;
    private fontSizeIndicator: HTMLSpanElement = document.createElement("span");
    private link: HTMLAnchorElement;

    private linkEditor?: HTMLDivElement;
    private linkText?: HTMLDivElement;
    private linkDrag?: HTMLImageElement;
    //dropdown doms
    private fontSizeDom?: Node;
    private fontStyleDom?: Node;
    private listTypeBtnDom?: Node;

    constructor(view: EditorView, editorProps: FieldViewProps & FormattedTextBoxProps) {
        this.view = view;
        this.state = view.state;
        this.editorProps = editorProps;
        this.tooltip = document.createElement("div");
        this.tooltip.className = "tooltipMenu";

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
            { command: deleteSelection, dom: this.icon("C", 'collapse', 'Collapse') }
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
        this.fontSizeToNum.set(schema.marks.p24, 24);
        this.fontSizeToNum.set(schema.marks.p32, 32);
        this.fontSizeToNum.set(schema.marks.p48, 48);
        this.fontSizeToNum.set(schema.marks.p72, 72);
        this.fontSizes = Array.from(this.fontSizeToNum.keys());

        //list types
        this.listTypeToIcon = new Map();
        this.listTypeToIcon.set(schema.nodes.bullet_list, ":");
        this.listTypeToIcon.set(schema.nodes.ordered_list, "1)");
        this.listTypes = Array.from(this.listTypeToIcon.keys());

        this.link = document.createElement("a");
        this.link.target = "_blank";
        this.link.style.color = "white";
        //this.tooltip.appendChild(this.link);

        this.tooltip.appendChild(this.createLink().render(this.view).dom);

        this.tooltip.appendChild(this.createStar().render(this.view).dom);

        this.update(view, undefined);

        //view.dom.parentNode!.parentNode!.insertBefore(this.tooltip, view.dom.parentNode);

        // quick and dirty null check
        const outer_div = this.editorProps.outer_div;
        outer_div && outer_div(this.tooltip);

        console.log("hi");
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

        if (this.fontSizeDom) { this.tooltip.removeChild(this.fontSizeDom); }
        this.fontSizeDom = (new Dropdown(cut(fontSizeBtns), {
            label: label,
            css: "color:black; min-width: 60px; padding-left: 5px; margin-right: 0;"
        }) as MenuItem).render(this.view).dom;
        this.tooltip.appendChild(this.fontSizeDom);
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

        if (this.fontStyleDom) { this.tooltip.removeChild(this.fontStyleDom); }
        this.fontStyleDom = (new Dropdown(cut(fontBtns), {
            label: label,
            css: "color:black; width: 125px; margin-left: -3px; padding-left: 2px;"
        }) as MenuItem).render(this.view).dom;

        this.tooltip.appendChild(this.fontStyleDom);
    }

    updateLinkMenu() {
        if (!this.linkEditor || !this.linkText) {
            this.linkEditor = document.createElement("div");
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
                                    DocumentManager.Instance.getDocumentView(f)!.props.focus(f);
                                }
                                else if (CollectionDockingView.Instance) CollectionDockingView.Instance.AddRightSplit(f);
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
            this.linkDrag.style.width = "20px";
            this.linkDrag.style.height = "20px";
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
            // this.linkEditor.appendChild(this.linkDrag);
            // this.linkEditor.appendChild(this.linkText);
            // this.linkEditor.appendChild(linkBtn);
            //this.tooltip.appendChild(this.linkEditor);
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

    insertStar(state: EditorState<any>, dispatch: any) {
        console.log("creating star...");
        let newNode = schema.nodes.star.create({ visibility: false, text: state.selection.content(), oldtextslice: state.selection.content().toJSON(), oldtextlen: state.selection.to - state.selection.from });
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
    changeToMarkInGroup(markType: MarkType, view: EditorView, fontMarks: MarkType[]) {
        let { empty, $cursor, ranges } = view.state.selection as TextSelection;
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
                    let has = false, tr = state.tr;
                    for (let i = 0; !has && i < ranges.length; i++) {
                        let { $from, $to } = ranges[i];
                        has = state.doc.rangeHasMark($from.pos, $to.pos, type);
                    }
                    for (let i of ranges) {
                        let { $from, $to } = i;
                        if (has) {
                            toggleMark(type)(view.state, view.dispatch, view);
                        }
                    }
                }
            }
        }); //actually apply font
        return toggleMark(markType)(view.state, view.dispatch, view);
    }

    //remove all node typeand apply the passed-in one to the selected text
    changeToNodeType(nodeType: NodeType | undefined, view: EditorView, allNodes: NodeType[]) {
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
            enable(state) { return true; },
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
            run: (state, dispatch, view) => {
                this.insertStar(state, dispatch);
            }

        });
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
                if (this.markActive(state, markType)) {
                    toggleMark(markType)(state, dispatch);
                    return true;
                }
                // to create link
                openPrompt({
                    title: "Create a link",
                    fields: {
                        href: new TextField({
                            label: "Link target",
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
            enable(state) { return true; },
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

        //let linksInSelection = this.activeMarksOnSelection([schema.marks.link]);
        // if (linksInSelection.length > 0) {
        //     let attributes = this.getMarksInSelection(this.view.state, [schema.marks.link])[0].attrs;
        //     this.link.href = attributes.href;
        //     this.link.textContent = attributes.title;
        //     this.link.style.visibility = "visible";
        // } else this.link.style.visibility = "hidden";

        // Otherwise, reposition it and update its content
        //this.tooltip.style.display = "";
        let { from, to } = state.selection;
        let start = view.coordsAtPos(from), end = view.coordsAtPos(to);
        // The box in which the tooltip is positioned, to use as base
        //let box = this.tooltip.offsetParent!.getBoundingClientRect();
        // Find a center-ish x position from the selection endpoints (when
        // crossing lines, end may be more to the left)
        let left = Math.max((start.left + end.left) / 2, start.left + 3);
        //this.tooltip.style.left = (left - box.left) * this.editorProps.ScreenToLocalTransform().Scale + "px";
        let width = Math.abs(start.left - end.left) / 2 * this.editorProps.ScreenToLocalTransform().Scale;
        let mid = Math.min(start.left, end.left) + width;

        //this.tooltip.style.width = 225 + "px";
        // this.tooltip.style.bottom = (box.bottom - start.top) * this.editorProps.ScreenToLocalTransform().Scale + "px";
        // this.tooltip.style.top = "-100px";
        //this.tooltip.style.height = "100px";

        // let transform = this.editorProps.ScreenToLocalTransform();
        // this.tooltip.style.width = `${225 / transform.Scale}px`;
        // Utils

        //UPDATE LIST ITEM DROPDOWN
        this.listTypeBtnDom = this.updateListItemDropdown(":", this.listTypeBtnDom!);

        //UPDATE FONT STYLE DROPDOWN
        let activeStyles = this.activeMarksOnSelection(this.fontStyles);
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

        //UPDATE FONT SIZE DROPDOWN
        let activeSizes = this.activeMarksOnSelection(this.fontSizes);
        if (activeSizes.length === 1) { //if there's only one active font size
            let size = this.fontSizeToNum.get(activeSizes[0]);
            if (size) { this.updateFontSizeDropdown(String(size) + " pt"); }
        } else if (activeSizes.length === 0) {
            //should be 14 on default  
            this.updateFontSizeDropdown("14 pt");
        } else { //multiple font sizes selected
            this.updateFontSizeDropdown("Various");
        }

        this.updateLinkMenu();
    }

    //finds all active marks on selection in given group
    activeMarksOnSelection(markGroup: MarkType[]) {
        //current selection
        let { empty, $cursor, ranges } = this.view.state.selection as TextSelection;
        let state = this.view.state;
        let dispatch = this.view.dispatch;
        let activeMarks: MarkType[];
        if (!empty) {
            activeMarks = markGroup.filter(mark => {
                if (dispatch) {
                    let has = false, tr = state.tr;
                    for (let i = 0; !has && i < ranges.length; i++) {
                        let { $from, $to } = ranges[i];
                        return state.doc.rangeHasMark($from.pos, $to.pos, mark);
                    }
                }
                return false;
            });
        }
        else {
            let pos = this.view.state.selection.$from;
            let ref_node: ProsNode;
            if (pos.nodeAfter !== null && pos.nodeAfter !== undefined) {
                ref_node = pos.nodeAfter;
            }
            else if (pos.nodeBefore !== null && pos.nodeBefore !== undefined) {
                ref_node = pos.nodeBefore;
            }
            else {
                return [];
            }
            let text_node_type: NodeType;
            if (ref_node.isText) {
                text_node_type = ref_node.type;
            }
            else {
                return [];
            }

            activeMarks = markGroup.filter(mark_type => {
                if (dispatch) {
                    let mark = state.schema.mark(mark_type);
                    return ref_node.marks.includes(mark);
                }
                return false;
            });
        }
        return activeMarks;
    }

    destroy() { this.tooltip.remove(); }
}
