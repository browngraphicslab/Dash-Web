import { TextSelection } from "prosemirror-state";
import { Fragment, Node, Slice } from "prosemirror-model";

import React = require("react");

interface ISummaryView {
    node: any;
    view: any;
    getPos: any;
    self: any;
}
export class SummaryView extends React.Component<ISummaryView> {

    onPointerDown = (e: any) => {
        const visible = !this.props.node.attrs.visibility;
        const attrs = { ...this.props.node.attrs, visibility: visible };
        let textSelection = TextSelection.create(this.props.view.state.doc, this.props.getPos() + 1);
        if (!visible) { // update summarized text and save in attrs
            textSelection = this.updateSummarizedText(this.props.getPos() + 1);
            attrs.text = textSelection.content();
            attrs.textslice = attrs.text.toJSON();
        }
        this.props.view.dispatch(this.props.view.state.tr.
            setSelection(textSelection). // select the current summarized text (or where it will be if its collapsed)
            replaceSelection(!visible ? new Slice(Fragment.fromArray([]), 0, 0) : this.props.node.attrs.text). // collapse/expand it
            setNodeMarkup(this.props.getPos(), undefined, attrs)); // update the attrs
        e.preventDefault();
        e.stopPropagation();
        const _collapsed = document.getElementById('collapse') as HTMLElement;
        _collapsed.className = this.className(visible);
    }

    updateSummarizedText(start?: any) {
        const mtype = this.props.view.state.schema.marks.summarize;
        const mtypeInc = this.props.view.state.schema.marks.summarizeInclusive;
        let endPos = start;

        const visited = new Set();
        for (let i: number = start + 1; i < this.props.view.state.doc.nodeSize - 1; i++) {
            let skip = false;
            this.props.view.state.doc.nodesBetween(start, i, (node: Node, pos: number, parent: Node, index: number) => {
                if (this.props.node.isLeaf && !visited.has(node) && !skip) {
                    if (this.props.node.marks.find((m: any) => m.type === mtype || m.type === mtypeInc)) {
                        visited.add(node);
                        endPos = i + this.props.node.nodeSize - 1;
                    }
                    else skip = true;
                }
            });
        }
        return TextSelection.create(this.props.view.state.doc, start, endPos);
    }

    className = (visible: boolean) => "formattedTextBox-summarizer" + (visible ? "" : "-collapsed");

    selectNode() { }

    deselectNode() { }

    render() {
        const _view = this.props.node.view;
        const js = this.props.node.toJSon;

        this.props.node.toJSON = function () {
            return js.apply(this, arguments);
        };

        const spanCollapsedClassName = this.className(this.props.node.attrs.visibility);

        return (
            <span
                className={spanCollapsedClassName}
                id='collapse'
                onPointerDown={this.onPointerDown}
            >

            </span>
        );

    }
}