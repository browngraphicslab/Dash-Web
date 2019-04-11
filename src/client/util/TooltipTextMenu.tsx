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
import { library } from '@fortawesome/fontawesome-svg-core'
import { wrapInList, bulletList, liftListItem, listItem } from 'prosemirror-schema-list'
import {
    faListUl,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

const SVG = "http://www.w3.org/2000/svg"

//appears above a selection of text in a RichTextBox to give user options such as Bold, Italics, etc.
export class TooltipTextMenu {

    private tooltip: HTMLElement;
    private num_icons = 0;
    private view: EditorView;
    private fontStyles: MarkType[];
    private fontSizes: MarkType[];

    constructor(view: EditorView) {
        this.view = view;
        this.tooltip = document.createElement("div");
        this.tooltip.className = "tooltipMenu";

        //add the div which is the tooltip
        view.dom.parentNode!.appendChild(this.tooltip);

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
        ]
        //add menu items
        items.forEach(({ dom, command }) => {
            this.tooltip.appendChild(dom);

            //pointer down handler to activate button effects
            dom.addEventListener("pointerdown", e => {
                e.preventDefault();
                view.focus();
                command(view.state, view.dispatch, view);
            })

        });

        //dropdowns
        //list of font btns to add
        this.fontStyles = [
            schema.marks.timesNewRoman,
            schema.marks.arial,
            schema.marks.georgia,
            schema.marks.comicSans,
            schema.marks.tahoma,
            schema.marks.impact,
        ]
        this.fontSizes = [
            schema.marks.p10,
            schema.marks.p12,
            schema.marks.p16,
            schema.marks.p24,
            schema.marks.p32,
            schema.marks.p48,
            schema.marks.p72,
        ]
        this.addFontDropdowns();

        this.update(view, undefined);
    }

    //adds font size and font style dropdowns
    addFontDropdowns() {
        //filtering function - might be unecessary
        let cut = (arr: MenuItem[]) => arr.filter(x => x);
        let fontBtns = [
            this.dropdownBtn("Times New Roman", "font-family: Times New Roman, Times, serif; width: 120px;", schema.marks.timesNewRoman, this.view, this.changeToMarkInGroup, this.fontStyles),
            this.dropdownBtn("Arial", "font-family: Arial, Helvetica, sans-serif; width: 120px;", schema.marks.arial, this.view, this.changeToMarkInGroup, this.fontStyles),
            this.dropdownBtn("Georgia", "font-family: Georgia, serif; width: 120px; width: 120px;", schema.marks.georgia, this.view, this.changeToMarkInGroup, this.fontStyles),
            this.dropdownBtn("ComicSans", "font-family: Comic Sans MS, cursive, sans-serif; width: 120px;", schema.marks.comicSans, this.view, this.changeToMarkInGroup, this.fontStyles),
            this.dropdownBtn("Tahoma", "font-family: Tahoma, Geneva, sans-serif; width: 120px;", schema.marks.tahoma, this.view, this.changeToMarkInGroup, this.fontStyles),
            this.dropdownBtn("Impact", "font-family: Impact, Charcoal, sans-serif; width: 120px;", schema.marks.impact, this.view, this.changeToMarkInGroup, this.fontStyles),
        ]

        let fontSizeBtns = [
            this.dropdownBtn("10", "width: 50px;", schema.marks.p10, this.view, this.changeToMarkInGroup, this.fontSizes),
            this.dropdownBtn("12", "width: 50px;", schema.marks.p12, this.view, this.changeToMarkInGroup, this.fontSizes),
            this.dropdownBtn("16", "width: 50px;", schema.marks.p16, this.view, this.changeToMarkInGroup, this.fontSizes),
            this.dropdownBtn("24", "width: 50px;", schema.marks.p24, this.view, this.changeToMarkInGroup, this.fontSizes),
            this.dropdownBtn("32", "width: 50px;", schema.marks.p32, this.view, this.changeToMarkInGroup, this.fontSizes),
            this.dropdownBtn("48", "width: 50px;", schema.marks.p48, this.view, this.changeToMarkInGroup, this.fontSizes),
            this.dropdownBtn("72", "width: 50px;", schema.marks.p72, this.view, this.changeToMarkInGroup, this.fontSizes),
        ]

        //dropdown to hold font btns
        let dd_fontStyle = new Dropdown(cut(fontBtns), { label: "Font Style", css: "color:white;" }) as MenuItem;
        let dd_fontSize = new Dropdown(cut(fontSizeBtns), { label: "Font Size", css: "color:white;" }) as MenuItem;
        this.tooltip.appendChild(dd_fontStyle.render(this.view).dom);
        this.tooltip.appendChild(dd_fontSize.render(this.view).dom);
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
                    let has = false, tr = state.tr
                    for (let i = 0; !has && i < ranges.length; i++) {
                        let { $from, $to } = ranges[i]
                        has = state.doc.rangeHasMark($from.pos, $to.pos, type)
                    }
                    for (let i = 0; i < ranges.length; i++) {
                        let { $from, $to } = ranges[i]
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
        span.className = "menuicon " + name;
        span.title = name;
        span.textContent = text;
        span.style.color = "white";
        return span;
    }

    //method for checking whether node can be inserted
    canInsert(state: EditorState, nodeType: NodeType<Schema<string, string>>) {
        let $from = state.selection.$from
        for (let d = $from.depth; d >= 0; d--) {
            let index = $from.index(d)
            if ($from.node(d).canReplaceWith(index, index, nodeType)) return true
        }
        return false
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
        }
    }

    //updates the tooltip menu when the selection changes
    update(view: EditorView, lastState: EditorState | undefined) {
        let state = view.state
        // Don't do anything if the document/selection didn't change
        if (lastState && lastState.doc.eq(state.doc) &&
            lastState.selection.eq(state.selection)) return

        // Hide the tooltip if the selection is empty
        if (state.selection.empty) {
            this.tooltip.style.display = "none"
            return
        }

        // Otherwise, reposition it and update its content
        this.tooltip.style.display = ""
        let { from, to } = state.selection
        let start = view.coordsAtPos(from), end = view.coordsAtPos(to)
        // The box in which the tooltip is positioned, to use as base
        let box = this.tooltip.offsetParent!.getBoundingClientRect()
        // Find a center-ish x position from the selection endpoints (when
        // crossing lines, end may be more to the left)
        let left = Math.max((start.left + end.left) / 2, start.left + 3)
        this.tooltip.style.left = (left - box.left) + "px"
        //let width = Math.abs(start.left - end.left) / 2;
        let width = 220;
        let mid = Math.min(start.left, end.left) + width;
        this.tooltip.style.width = width + "px";
        this.tooltip.style.bottom = (box.bottom - start.top) + "px";
    }

    destroy() { this.tooltip.remove() }
}
