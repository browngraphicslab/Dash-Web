import { TextSelection } from "prosemirror-state";
import { Fragment, Node, Slice } from "prosemirror-model";
import * as ReactDOM from 'react-dom';
import React = require("react");

// an elidable textblock that collapses when its '<-' is clicked and expands when its '...' anchor is clicked.
// this node actively edits prosemirror (as opposed to just changing how things are rendered) and thus doesn't
// really need a react view.  However, it would be cleaner to figure out how to do this just as a react rendering
// method instead of changing prosemirror's text when the expand/elide buttons are clicked.
export class SummaryView {
    _fieldWrapper: HTMLSpanElement; // container for label and value

    constructor(node: any, view: any, getPos: any) {
        const self = this;
        this._fieldWrapper = document.createElement("span");
        this._fieldWrapper.className = this.className(node.attrs.visibility);
        this._fieldWrapper.onpointerdown = function (e: any) { self.onPointerDown(e, node, view, getPos); }
        this._fieldWrapper.onkeypress = function (e: any) { e.stopPropagation(); };
        this._fieldWrapper.onkeydown = function (e: any) { e.stopPropagation(); };
        this._fieldWrapper.onkeyup = function (e: any) { e.stopPropagation(); };
        this._fieldWrapper.onmousedown = function (e: any) { e.stopPropagation(); };

        const js = node.toJSON;
        node.toJSON = function () { return js.apply(this, arguments); };

        ReactDOM.render(<SummaryViewInternal />, this._fieldWrapper);
        (this as any).dom = this._fieldWrapper;
    }

    className = (visible: boolean) => "formattedTextBox-summarizer" + (visible ? "" : "-collapsed");
    destroy() { ReactDOM.unmountComponentAtNode(this._fieldWrapper); }
    selectNode() { }

    updateSummarizedText(start: any, view: any) {
        const mtype = view.state.schema.marks.summarize;
        const mtypeInc = view.state.schema.marks.summarizeInclusive;
        let endPos = start;

        const visited = new Set();
        for (let i: number = start + 1; i < view.state.doc.nodeSize - 1; i++) {
            let skip = false;
            view.state.doc.nodesBetween(start, i, (node: Node, pos: number, parent: Node, index: number) => {
                if (node.isLeaf && !visited.has(node) && !skip) {
                    if (node.marks.find((m: any) => m.type === mtype || m.type === mtypeInc)) {
                        visited.add(node);
                        endPos = i + node.nodeSize - 1;
                    }
                    else skip = true;
                }
            });
        }
        return TextSelection.create(view.state.doc, start, endPos);
    }

    onPointerDown = (e: any, node: any, view: any, getPos: any) => {
        const visible = !node.attrs.visibility;
        const attrs = { ...node.attrs, visibility: visible };
        let textSelection = TextSelection.create(view.state.doc, getPos() + 1);
        if (!visible) { // update summarized text and save in attrs
            textSelection = this.updateSummarizedText(getPos() + 1, view);
            attrs.text = textSelection.content();
            attrs.textslice = attrs.text.toJSON();
        }
        view.dispatch(view.state.tr.
            setSelection(textSelection). // select the current summarized text (or where it will be if its collapsed)
            replaceSelection(!visible ? new Slice(Fragment.fromArray([]), 0, 0) : node.attrs.text). // collapse/expand it
            setNodeMarkup(getPos(), undefined, attrs)); // update the attrs
        e.preventDefault();
        e.stopPropagation();
        this._fieldWrapper.className = this.className(visible);
    }
}

interface ISummaryView {
}
// currently nothing needs to be rendered for the internal view of a summary.
export class SummaryViewInternal extends React.Component<ISummaryView> {
    render() {
        return <> </>;
    }
}