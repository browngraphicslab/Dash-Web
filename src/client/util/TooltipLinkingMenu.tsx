import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { FieldViewProps } from "../views/nodes/FieldView";
import "./TooltipTextMenu.scss";
import React = require("react");
const { toggleMark, setBlockType, wrapIn } = require("prosemirror-commands");

const SVG = "http://www.w3.org/2000/svg";

//appears above a selection of text in a RichTextBox to give user options such as Bold, Italics, etc.
export class TooltipLinkingMenu {

    private tooltip: HTMLElement;
    private view: EditorView;
    private editorProps: FieldViewProps;

    constructor(view: EditorView, editorProps: FieldViewProps) {
        this.view = view;
        this.editorProps = editorProps;
        this.tooltip = document.createElement("div");
        this.tooltip.className = "tooltipMenu linking";

        //add the div which is the tooltip
        view.dom.parentNode!.parentNode!.appendChild(this.tooltip);

        let target = "https://www.google.com";

        let link = document.createElement("a");
        link.href = target;
        link.textContent = target;
        link.target = "_blank";
        link.style.color = "white";
        this.tooltip.appendChild(link);

        this.update(view, undefined);
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

        console.log("STORED:");
        console.log(state.doc.content.firstChild!.content);

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

        this.tooltip.style.width = "auto";
        this.tooltip.style.bottom = (box.bottom - start.top) * this.editorProps.ScreenToLocalTransform().Scale + "px";
    }

    destroy() { this.tooltip.remove(); }
}
