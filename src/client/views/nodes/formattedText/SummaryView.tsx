import { IReactionDisposer, observable, computed, action } from "mobx";
import { Fragment, Node, Slice } from "prosemirror-model";
import { TextSelection } from "prosemirror-state";

import * as ReactDOM from 'react-dom';
import React = require("react");
import { dom } from "@fortawesome/fontawesome-svg-core";
import { observer } from "mobx-react";

export class SummaryView {

    _fieldWrapper: HTMLDivElement; // container for label 

    constructor(node: any, view: any, getPos: any) {

        this._fieldWrapper = document.createElement("div");
        this._fieldWrapper.style.fontWeight = "bold";
        this._fieldWrapper.style.position = "relative";
        this._fieldWrapper.style.display = "inline-block";
        this._fieldWrapper.style.backgroundColor = "red";

        const js = node.toJSON;
        node.toJSON = function () {
            return js.apply(this, arguments);
        };

        console.log("rendering new SummaryViewInternal")
        ReactDOM.render(<SummaryViewInternal
            view={view}
            getPos={getPos}
            node={node}

        />, this._fieldWrapper);
        (this as any).dom = this._fieldWrapper;
    }

    selectNode() { }
    deselectNode() { }

    destroy() {
        ReactDOM.unmountComponentAtNode(this._fieldWrapper);
    }

}

interface ISummaryViewInternal {
    node: any;
    view: any;
    getPos: any;
}

export class SummaryViewInternal extends React.Component<ISummaryViewInternal>{
    _className: any;
    _view: any;
    _reactionDisposer: IReactionDisposer | undefined;

    constructor(props: ISummaryViewInternal) {
        super(props);

        this._className = this.className(this.props.node.attrs.visibility);
        this._view = this.props.view;

        this.onPointerDownCollapsed = this.onPointerDownCollapsed.bind(this);
        this.updateSummarizedText = this.updateSummarizedText.bind(this);

    }

    componentWillUnmount() {
        this._reactionDisposer?.();
    }


    className(visible: boolean) {
        return "formattedTextBox-summarizer" + (visible ? "" : "-collapsed");
    }

    onPointerDownCollapsed(e: any) {
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

        this._className = this.className(visible);

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

    // @computed get fieldValueContent() {
    //     return null;
    // }
    // {this.fieldValueContent}


    render() {

        return (
            <span
                className={this._className}
                onPointerDown={this.onPointerDownCollapsed}>

            </span>
        );

    }

}

