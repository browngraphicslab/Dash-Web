import { action, IReactionDisposer, reaction } from "mobx";
import { Dropdown, DropdownSubmenu, MenuItem, MenuItemSpec, renderGrouped, icons, } from "prosemirror-menu"; //no import css
import { baseKeymap, lift } from "prosemirror-commands";
import { history, redo, undo } from "prosemirror-history";
import { keymap } from "prosemirror-keymap";
import { EditorState, Transaction, NodeSelection, TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { schema } from "./RichTextSchema";
import { Schema, NodeType, MarkType } from "prosemirror-model";
import React = require("react");
import "./TooltipTextMenu.scss";
const { toggleMark, setBlockType, wrapIn } = require("prosemirror-commands");
import { library } from '@fortawesome/fontawesome-svg-core';
import { wrapInList, bulletList, liftListItem, listItem } from 'prosemirror-schema-list';
import {
    faListUl,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { FieldViewProps } from "../views/nodes/FieldView";
import { throwStatement } from "babel-types";

const SVG = "http://www.w3.org/2000/svg";

//appears above a selection of text in a RichTextBox to give user options such as Bold, Italics, etc.
export class TooltipTextMenu {

    private tooltip: HTMLElement;
    private num_icons = 0;
    private view: EditorView;
    private fontStyles: MarkType[];
    private fontSizes: MarkType[];
    private editorProps: FieldViewProps;
    private state: EditorState;
    private fontSizeToNum: Map<MarkType, number>;
    private fontStylesToName: Map<MarkType, string>;
    private fontSizeIndicator: HTMLSpanElement = document.createElement("span");
    //dropdown doms
    private fontSizeDom: Node;
    private fontStyleDom: Node;

    constructor(view: EditorView, editorProps: FieldViewProps) {
        this.view = view;
        this.state = view.state;
        this.editorProps = editorProps;
        this.tooltip = document.createElement("div");
        this.tooltip.className = "tooltipMenu";

        //add the div which is the tooltip
        view.dom.parentNode!.parentNode!.appendChild(this.tooltip);

        //add additional icons
        library.add(faListUl);
        //add the buttons to the tooltip
        let items = [
            { command: toggleMark(schema.marks.strong), dom: this.icon("B", "strong") },
            { command: toggleMark(schema.marks.em), dom: this.icon("i", "em") },
            { command: toggleMark(schema.marks.underline), dom: this.icon("U", "underline") },
            { command: toggleMark(schema.marks.strikethrough), dom: this.icon("S", "strikethrough") },
            { command: toggleMark(schema.marks.superscript), dom: this.icon("s", "superscript") },
            { command: toggleMark(schema.marks.subscript), dom: this.icon("s", "subscript") },
            { command: wrapInList(schema.nodes.bullet_list), dom: this.icon(":", "bullets") },
            { command: lift, dom: this.icon("<", "lift") },
        ];
        //add menu items
        items.forEach(({ dom, command }) => {
            this.tooltip.appendChild(dom);

            //pointer down handler to activate button effects
            dom.addEventListener("pointerdown", e => {
                e.preventDefault();
                view.focus();
                command(view.state, view.dispatch, view);
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
        this.fontSizeToNum.set(schema.marks.p16, 16);
        this.fontSizeToNum.set(schema.marks.p24, 24);
        this.fontSizeToNum.set(schema.marks.p32, 32);
        this.fontSizeToNum.set(schema.marks.p48, 48);
        this.fontSizeToNum.set(schema.marks.p72, 72);
        this.fontSizes = Array.from(this.fontSizeToNum.keys());

        //this.addFontDropdowns();

        this.update(view, undefined);
    }

    //label of dropdown will change to given label
    updateFontSizeDropdown(label: string) {
        //filtering function - might be unecessary
        let cut = (arr: MenuItem[]) => arr.filter(x => x);

        //font SIZES
        let fontSizeBtns: MenuItem[] = [];
        this.fontSizeToNum.forEach((number, mark) => {
            fontSizeBtns.push(this.dropdownBtn(String(number), "width: 50px;", mark, this.view, this.changeToMarkInGroup, this.fontSizes));
        });

        if (this.fontSizeDom) { this.tooltip.removeChild(this.fontSizeDom); }
        this.fontSizeDom = (new Dropdown(cut(fontSizeBtns), {
            label: label,
            css: "color:white; min-width: 60px; padding-left: 5px; margin-right: 0;"
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
            fontBtns.push(this.dropdownBtn(name, "font-family: " + name + ", sans-serif; width: 125px;", mark, this.view, this.changeToMarkInGroup, this.fontStyles));
        });

        if (this.fontStyleDom) { this.tooltip.removeChild(this.fontStyleDom); }
        this.fontStyleDom = (new Dropdown(cut(fontBtns), {
            label: label,
            css: "color:white; width: 125px; margin-left: -3px; padding-left: 2px;"
        }) as MenuItem).render(this.view).dom;

        this.tooltip.appendChild(this.fontStyleDom);
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

    //makes a button for the drop down
    //css is the style you want applied to the button
    dropdownBtn(label: string, css: string, markType: MarkType, view: EditorView, changeToMarkInGroup: (markType: MarkType<any>, view: EditorView, groupMarks: MarkType[]) => any, groupMarks: MarkType[]) {
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
    // Helper function to create menu icons
    icon(text: string, name: string) {
        let span = document.createElement("span");
        span.className = name + " menuicon";
        span.title = name;
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

    //updates the tooltip menu when the selection changes
    update(view: EditorView, lastState: EditorState | undefined) {
        let state = view.state;
        // Don't do anything if the document/selection didn't change
        if (lastState && lastState.doc.eq(state.doc) &&
            lastState.selection.eq(state.selection)) return;

        // Hide the tooltip if the selection is empty
        if (state.selection.empty) {
            this.tooltip.style.display = "none";
            return;
        }

        // Otherwise, reposition it and update its content
        this.tooltip.style.display = "";
        let { from, to } = state.selection;
        let start = view.coordsAtPos(from), end = view.coordsAtPos(to);
        // The box in which the tooltip is positioned, to use as base
        let box = this.tooltip.offsetParent!.getBoundingClientRect();
        // Find a center-ish x position from the selection endpoints (when
        // crossing lines, end may be more to the left)
        let left = Math.max((start.left + end.left) / 2, start.left + 3);
        this.tooltip.style.left = (left - box.left) * this.editorProps.ScreenToLocalTransform().Scale + "px";
        let width = Math.abs(start.left - end.left) / 2 * this.editorProps.ScreenToLocalTransform().Scale;
        let mid = Math.min(start.left, end.left) + width;

        this.tooltip.style.width = 225 + "px";
        this.tooltip.style.bottom = (box.bottom - start.top) * this.editorProps.ScreenToLocalTransform().Scale + "px";

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
    }

    //finds all active marks on selection
    activeMarksOnSelection(markGroup: MarkType[]) {
        //current selection
        let { empty, $cursor, ranges } = this.view.state.selection as TextSelection;
        let state = this.view.state;
        let dispatch = this.view.dispatch;

        let activeMarks = markGroup.filter(mark => {
            if (dispatch) {
                let has = false, tr = state.tr;
                for (let i = 0; !has && i < ranges.length; i++) {
                    let { $from, $to } = ranges[i];
                    return state.doc.rangeHasMark($from.pos, $to.pos, mark);
                }
            }
            return false;
        });
        return activeMarks;
    }

    destroy() { this.tooltip.remove(); }
}
