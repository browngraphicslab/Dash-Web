import { TextSelection } from "prosemirror-state";
import * as ReactDOM from 'react-dom';
import { Doc } from "../../../../fields/Doc";
import { DocServer } from "../../../DocServer";
import React = require("react");


// creates an inline comment in a note when '>>' is typed.
// the comment sits on the right side of the note and vertically aligns with its anchor in the text.
// the comment can be toggled on/off with the '<-' text anchor.
export class DashDocCommentView {
    _fieldWrapper: HTMLDivElement; // container for label and value

    constructor(node: any, view: any, getPos: any) {
        this._fieldWrapper = document.createElement("div");
        this._fieldWrapper.style.width = node.attrs.width;
        this._fieldWrapper.style.height = node.attrs.height;
        this._fieldWrapper.style.fontWeight = "bold";
        this._fieldWrapper.style.position = "relative";
        this._fieldWrapper.style.display = "inline-block";
        this._fieldWrapper.onkeypress = function (e: any) { e.stopPropagation(); };
        this._fieldWrapper.onkeydown = function (e: any) { e.stopPropagation(); };
        this._fieldWrapper.onkeyup = function (e: any) { e.stopPropagation(); };
        this._fieldWrapper.onmousedown = function (e: any) { e.stopPropagation(); };

        ReactDOM.render(<DashDocCommentViewInternal view={view} getPos={getPos} docid={node.attrs.docid} />, this._fieldWrapper);
        (this as any).dom = this._fieldWrapper;
    }

    destroy() {
        ReactDOM.unmountComponentAtNode(this._fieldWrapper);
    }

    selectNode() { }
}

interface IDashDocCommentViewInternal {
    docid: string;
    view: any;
    getPos: any;
}

export class DashDocCommentViewInternal extends React.Component<IDashDocCommentViewInternal>{

    constructor(props: IDashDocCommentViewInternal) {
        super(props);
        this.onPointerLeaveCollapsed = this.onPointerLeaveCollapsed.bind(this);
        this.onPointerEnterCollapsed = this.onPointerEnterCollapsed.bind(this);
        this.onPointerUpCollapsed = this.onPointerUpCollapsed.bind(this);
        this.onPointerDownCollapsed = this.onPointerDownCollapsed.bind(this);
    }

    onPointerLeaveCollapsed(e: any) {
        DocServer.GetRefField(this.props.docid).then(async dashDoc => dashDoc instanceof Doc && Doc.linkFollowUnhighlight());
        e.preventDefault();
        e.stopPropagation();
    }

    onPointerEnterCollapsed(e: any) {
        DocServer.GetRefField(this.props.docid).then(async dashDoc => dashDoc instanceof Doc && Doc.linkFollowHighlight(dashDoc, false));
        e.preventDefault();
        e.stopPropagation();
    }

    onPointerUpCollapsed(e: any) {
        const target = this.targetNode();

        if (target) {
            const expand = target.hidden;
            const tr = this.props.view.state.tr.setNodeMarkup(target.pos, undefined, { ...target.node.attrs, hidden: target.node.attrs.hidden ? false : true });
            this.props.view.dispatch(tr.setSelection(TextSelection.create(tr.doc, this.props.getPos() + (expand ? 2 : 1)))); // update the attrs
            setTimeout(() => {
                expand && DocServer.GetRefField(this.props.docid).then(async dashDoc => dashDoc instanceof Doc && Doc.linkFollowHighlight(dashDoc));
                try { this.props.view.dispatch(this.props.view.state.tr.setSelection(TextSelection.create(this.props.view.state.tr.doc, this.props.getPos() + (expand ? 2 : 1)))); } catch (e) { }
            }, 0);
        }
        e.stopPropagation();
    }

    onPointerDownCollapsed(e: any) {
        e.stopPropagation();
    }

    targetNode = () => {  // search forward in the prosemirror doc for the attached dashDocNode that is the target of the comment anchor
        const state = this.props.view.state;
        for (let i = this.props.getPos() + 1; i < state.doc.content.size; i++) {
            const m = state.doc.nodeAt(i);
            if (m && m.type === state.schema.nodes.dashDoc && m.attrs.docid === this.props.docid) {
                return { node: m, pos: i, hidden: m.attrs.hidden } as { node: any, pos: number, hidden: boolean };
            }
        }

        const dashDoc = state.schema.nodes.dashDoc.create({ width: 75, height: 35, title: "dashDoc", docid: this.props.docid, float: "right" });
        this.props.view.dispatch(state.tr.insert(this.props.getPos() + 1, dashDoc));
        setTimeout(() => { try { this.props.view.dispatch(state.tr.setSelection(TextSelection.create(state.tr.doc, this.props.getPos() + 2))); } catch (e) { } }, 0);
        return undefined;
    }

    render() {
        return (
            <span
                className="formattedTextBox-inlineComment"
                id={"DashDocCommentView-" + this.props.docid}
                onPointerLeave={this.onPointerLeaveCollapsed}
                onPointerEnter={this.onPointerEnterCollapsed}
                onPointerUp={this.onPointerUpCollapsed}
                onPointerDown={this.onPointerDownCollapsed}
            >
            </span>
        );
    }
}
