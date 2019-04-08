import { action, IReactionDisposer, reaction } from "mobx";
import { Dropdown, DropdownSubmenu, MenuItem } from "prosemirror-menu";
import { baseKeymap, lift } from "prosemirror-commands";
import { history, redo, undo } from "prosemirror-history";
import { keymap } from "prosemirror-keymap";
import { EditorState, Transaction, NodeSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { schema } from "./RichTextSchema";
import { Schema, NodeType } from "prosemirror-model";
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

  constructor(view: EditorView) {
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
      { command: toggleMark(schema.marks.timesNewRoman), dom: this.icon("x", "TNR") },
      { command: lift, dom: this.icon("<", "lift") },
    ]
    //add menu items
    items.forEach(({ dom, command }) => {
      this.tooltip.appendChild(dom);
    });

    //add dropdowns

    //pointer down handler to activate button effects
    this.tooltip.addEventListener("pointerdown", e => {
      e.preventDefault();
      view.focus();
      //update view of icons
      this.num_icons = 0;
      items.forEach(({ command, dom }) => {
        if (e.srcElement && dom.contains(e.srcElement as Node)) {
          //let active = command(view.state, view.dispatch, view);
          let active = command(view.state, view.dispatch, view);
          //uncomment this if we want the bullet button to disappear if current selection is bulleted
          //dom.style.display = active ? "" : "none";
        }
      })
    })

    this.update(view, undefined);
  }

  // Helper function to create menu icons
  icon(text: string, name: string) {
    let span = document.createElement("span");
    span.className = "menuicon " + name;
    span.title = name;
    span.textContent = text;
    return span;
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

  //this doesn't currently work but could be used to use icons for buttons
  unorderedListIcon(): HTMLSpanElement {
    let span = document.createElement("span");
    //let icon = document.createElement("FontAwesomeIcon");
    //icon.className = "menuicon";
    //icon.style.color = "white";
    //span.appendChild(<i style={{ color: "white" }} icon="list-ul" size="lg" />);
    let i = document.createElement("i");
    i.className = "fa falist-ul";
    span.appendChild(i);
    //span.appendChild(icon);
    //return liftItem.spec.icon.sty

    //let sym = document.createElementNS(SVG, "symbol")
    // sym.id = name
    //sym.style.color = "white";
    //width then height
    //sym.setAttribute("viewBox", "0 0 " + 1024 + " " + 1024);
    //let path = sym.appendChild(document.createElementNS(SVG, "path"));
    //path.setAttribute("d", "M219 310v329q0 7-5 12t-12 5q-8 0-13-5l-164-164q-5-5-5-13t5-13l164-164q5-5 13-5 7 0 12 5t5 12zM1024 749v109q0 7-5 12t-12 5h-987q-7 0-12-5t-5-12v-109q0-7 5-12t12-5h987q7 0 12 5t5 12zM1024 530v109q0 7-5 12t-12 5h-621q-7 0-12-5t-5-12v-109q0-7 5-12t12-5h621q7 0 12 5t5 12zM1024 310v109q0 7-5 12t-12 5h-621q-7 0-12-5t-5-12v-109q0-7 5-12t12-5h621q7 0 12 5t5 12zM1024 91v109q0 7-5 12t-12 5h-987q-7 0-12-5t-5-12v-109q0-7 5-12t12-5h987q7 0 12 5t5 12z");
    //span.appendChild(sym);
    return span;
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
    let width = 8 * 16 + 15;
    let mid = Math.min(start.left, end.left) + width;

    //THIS WIDTH IS 15 * NUMBER OF ICONS + 15
    this.tooltip.style.width = width + "px";
    this.tooltip.style.bottom = (box.bottom - start.top) + "px";
  }

  destroy() { this.tooltip.remove() }
}