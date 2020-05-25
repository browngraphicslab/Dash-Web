import { EditorView } from "prosemirror-view";
import { EditorState } from "prosemirror-state";
import { keymap } from "prosemirror-keymap";
import { baseKeymap, toggleMark } from "prosemirror-commands";
import { schema } from "./schema_rts";
import { redo, undo } from "prosemirror-history";
import { StepMap } from "prosemirror-transform";

export class FootnoteView {
    innerView: any;
    outerView: any;
    node: any;
    dom: any;
    getPos: any;

    constructor(node: any, view: any, getPos: any) {
        // We'll need these later
        this.node = node;
        this.outerView = view;
        this.getPos = getPos;

        // The node's representation in the editor (empty, for now)
        this.dom = document.createElement("footnote");

        this.dom.addEventListener("pointerup", this.toggle, true);
        // These are used when the footnote is selected
        this.innerView = null;
    }

    selectNode() {
        const attrs = { ...this.node.attrs };
        attrs.visibility = true;
        this.dom.classList.add("ProseMirror-selectednode");
        if (!this.innerView) this.open();
    }

    deselectNode() {
        const attrs = { ...this.node.attrs };
        attrs.visibility = false;
        this.dom.classList.remove("ProseMirror-selectednode");
        if (this.innerView) this.close();
    }

    open() {
        // Append a tooltip to the outer node
        const tooltip = this.dom.appendChild(document.createElement("div"));
        tooltip.className = "footnote-tooltip";
        // And put a sub-ProseMirror into that
        this.innerView = new EditorView(tooltip, {
            // You can use any node as an editor document
            state: EditorState.create({
                doc: this.node,
                plugins: [keymap(baseKeymap),
                keymap({
                    "Mod-z": () => undo(this.outerView.state, this.outerView.dispatch),
                    "Mod-y": () => redo(this.outerView.state, this.outerView.dispatch),
                    "Mod-b": toggleMark(schema.marks.strong)
                }),
                    // new Plugin({
                    //     view(newView) {
                    //         // TODO -- make this work with RichTextMenu
                    //         // return FormattedTextBox.getToolTip(newView);
                    //     }
                    // })
                ],

            }),
            // This is the magic part
            dispatchTransaction: this.dispatchInner.bind(this),
            handleDOMEvents: {
                pointerdown: ((view: any, e: PointerEvent) => {
                    // Kludge to prevent issues due to the fact that the whole
                    // footnote is node-selected (and thus DOM-selected) when
                    // the parent editor is focused.
                    e.stopPropagation();
                    document.addEventListener("pointerup", this.ignore, true);
                    if (this.outerView.hasFocus()) this.innerView.focus();
                }) as any
            }
        });
        setTimeout(() => this.innerView && this.innerView.docView.setSelection(0, 0, this.innerView.root, true), 0);
    }

    ignore = (e: PointerEvent) => {
        e.stopPropagation();
        document.removeEventListener("pointerup", this.ignore, true);
    }

    toggle = () => {
        if (this.innerView) this.close();
        else {
            this.open();
        }
    }

    close() {
        this.innerView && this.innerView.destroy();
        this.innerView = null;
        this.dom.textContent = "";
    }

    dispatchInner(tr: any) {
        const { state, transactions } = this.innerView.state.applyTransaction(tr);
        this.innerView.updateState(state);

        if (!tr.getMeta("fromOutside")) {
            const outerTr = this.outerView.state.tr, offsetMap = StepMap.offset(this.getPos() + 1);
            for (const transaction of transactions) {
                const steps = transaction.steps;
                for (const step of steps) {
                    outerTr.step(step.map(offsetMap));
                }
            }
            if (outerTr.docChanged) this.outerView.dispatch(outerTr);
        }
    }

    update(node: any) {
        if (!node.sameMarkup(this.node)) return false;
        this.node = node;
        if (this.innerView) {
            const state = this.innerView.state;
            const start = node.content.findDiffStart(state.doc.content);
            if (start !== null) {
                let { a: endA, b: endB } = node.content.findDiffEnd(state.doc.content);
                const overlap = start - Math.min(endA, endB);
                if (overlap > 0) { endA += overlap; endB += overlap; }
                this.innerView.dispatch(
                    state.tr
                        .replace(start, endB, node.slice(start, endA))
                        .setMeta("fromOutside", true));
            }
        }
        return true;
    }

    destroy() {
        if (this.innerView) this.close();
    }

    stopEvent(event: any) {
        return this.innerView && this.innerView.dom.contains(event.target);
    }

    ignoreMutation() {
        return true;
    }
}

