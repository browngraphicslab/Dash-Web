import { EditorView } from "prosemirror-view";
import { EditorState } from "prosemirror-state";
import { keymap } from "prosemirror-keymap";
import { baseKeymap, toggleMark } from "prosemirror-commands";
import { schema } from "./schema_rts";
import { redo, undo } from "prosemirror-history";
import { StepMap } from "prosemirror-transform";

import React = require("react");

interface IFootnoteView {
    innerView: any;
    outerView: any;
    node: any;
    dom: any;
    getPos: any;
}

export class FootnoteView extends React.Component<IFootnoteView>  {
    _innerView: any;
    _node: any;

    constructor(props: IFootnoteView) {
        super(props);
        const node = this.props.node;
        const outerView = this.props.outerView;
        const _innerView = this.props.innerView;
        const getPos = this.props.getPos;
    }

    selectNode() {
        const attrs = { ...this.props.node.attrs };
        attrs.visibility = true;
        this.dom.classList.add("ProseMirror-selectednode");
        if (!this.props.innerView) this.open();
    }

    deselectNode() {
        const attrs = { ...this.props.node.attrs };
        attrs.visibility = false;
        this.dom.classList.remove("ProseMirror-selectednode");
        if (this.props.innerView) this.close();
    }
    open() {
        // Append a tooltip to the outer node
        const tooltip = this.dom.appendChild(document.createElement("div"));
        tooltip.className = "footnote-tooltip";
        // And put a sub-ProseMirror into that
        this.props.innerView.defineProperty(new EditorView(tooltip, {
            // You can use any node as an editor document
            state: EditorState.create({
                doc: this.props.node,
                plugins: [keymap(baseKeymap),
                keymap({
                    "Mod-z": () => undo(this.props.outerView.state, this.props.outerView.dispatch),
                    "Mod-y": () => redo(this.props.outerView.state, this.props.outerView.dispatch),
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
                    if (this.props.outerView.hasFocus()) this.props.innerView.focus();
                }) as any
            }
        }));
        setTimeout(() => this.props.innerView && this.props.innerView.docView.setSelection(0, 0, this.props.innerView.root, true), 0);
    }

    ignore = (e: PointerEvent) => {
        e.stopPropagation();
        document.removeEventListener("pointerup", this.ignore, true);
    }

    dispatchInner(tr: any) {
        const { state, transactions } = this.props.innerView.state.applyTransaction(tr);
        this.props.innerView.updateState(state);

        if (!tr.getMeta("fromOutside")) {
            const outerTr = this.props.outerView.state.tr, offsetMap = StepMap.offset(this.props.getPos() + 1);
            for (const transaction of transactions) {
                const steps = transaction.steps;
                for (const step of steps) {
                    outerTr.step(step.map(offsetMap));
                }
            }
            if (outerTr.docChanged) this.props.outerView.dispatch(outerTr);
        }
    }
    update(node: any) {
        if (!node.sameMarkup(this.props.node)) return false;
        this._node = node; //not sure
        if (this.props.innerView) {
            const state = this.props.innerView.state;
            const start = node.content.findDiffStart(state.doc.content);
            if (start !== null) {
                let { a: endA, b: endB } = node.content.findDiffEnd(state.doc.content);
                const overlap = start - Math.min(endA, endB);
                if (overlap > 0) { endA += overlap; endB += overlap; }
                this.props.innerView.dispatch(
                    state.tr
                        .replace(start, endB, node.slice(start, endA))
                        .setMeta("fromOutside", true));
            }
        }
        return true;
    }
    onPointerUp = (e: any) => {
        this.toggle(e);
    }

    toggle = (e: any) => {
        e.preventDefault();
        if (this.props.innerView) this.close();
        else {
            this.open();
        }
    }

    close() {
        this.props.innerView && this.props.innerView.destroy();
        this._innerView = null;
        this.dom.textContent = "";
    }

    destroy() {
        if (this.props.innerView) this.close();
    }

    stopEvent(event: any) {
        return this.props.innerView && this.props.innerView.dom.contains(event.target);
    }

    ignoreMutation() { return true; }


    render() {
        return (
            <div
                className="footnote"
                onPointerUp={this.onPointerUp}>
                <div className="footnote-tooltip" >

                </div >
            </div>
        );
    }
}
