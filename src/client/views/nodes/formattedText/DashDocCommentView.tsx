import { IReactionDisposer, observable, reaction, runInAction } from "mobx";
import { baseKeymap, toggleMark } from "prosemirror-commands";
import { redo, undo } from "prosemirror-history";
import { keymap } from "prosemirror-keymap";
import { DOMOutputSpecArray, Fragment, MarkSpec, Node, NodeSpec, Schema, Slice } from "prosemirror-model";
import { bulletList, listItem, orderedList } from 'prosemirror-schema-list';
import { EditorState, NodeSelection, Plugin, TextSelection } from "prosemirror-state";
import { StepMap } from "prosemirror-transform";
import { EditorView } from "prosemirror-view";
import * as ReactDOM from 'react-dom';
import { Doc, DocListCast, Field, HeightSym, WidthSym } from "../../../../new_fields/Doc";
import { Id } from "../../../../new_fields/FieldSymbols";
import { List } from "../../../../new_fields/List";
import { ObjectField } from "../../../../new_fields/ObjectField";
import { listSpec } from "../../../../new_fields/Schema";
import { SchemaHeaderField } from "../../../../new_fields/SchemaHeaderField";
import { ComputedField } from "../../../../new_fields/ScriptField";
import { BoolCast, Cast, NumCast, StrCast } from "../../../../new_fields/Types";
import { emptyFunction, returnEmptyString, returnFalse, returnOne, Utils, returnZero } from "../../../../Utils";
import { DocServer } from "../../../DocServer";

import React = require("react");

import { schema } from "./schema_rts";

interface IDashDocCommentView {
    node: any;
    view: any;
    getPos: any;
}

export class DashDocCommentView extends React.Component<IDashDocCommentView>{
    constructor(props: IDashDocCommentView) {
        super(props);
    }

    targetNode = () => {  // search forward in the prosemirror doc for the attached dashDocNode that is the target of the comment anchor
        for (let i = this.props.getPos() + 1; i < this.props.view.state.doc.content.size; i++) {
            const m = this.props.view.state.doc.nodeAt(i);
            if (m && m.type === this.props.view.state.schema.nodes.dashDoc && m.attrs.docid === this.props.node.attrs.docid) {
                return { node: m, pos: i, hidden: m.attrs.hidden } as { node: any, pos: number, hidden: boolean };
            }
        }
        const dashDoc = this.props.view.state.schema.nodes.dashDoc.create({ width: 75, height: 35, title: "dashDoc", docid: this.props.node.attrs.docid, float: "right" });
        this.props.view.dispatch(this.props.view.state.tr.insert(this.props.getPos() + 1, dashDoc));
        setTimeout(() => { try { this.props.view.dispatch(this.props.view.state.tr.setSelection(TextSelection.create(this.props.view.state.tr.doc, this.props.getPos() + 2))); } catch (e) { } }, 0);
        return undefined;
    }

    onPointerDownCollapse = (e: any) => e.stopPropagation();

    onPointerUpCollapse = (e: any) => {
        const target = this.targetNode();
        if (target) {
            const expand = target.hidden;
            const tr = this.props.view.state.tr.setNodeMarkup(target.pos, undefined, { ...target.node.attrs, hidden: target.node.attrs.hidden ? false : true });
            this.props.view.dispatch(tr.setSelection(TextSelection.create(tr.doc, this.props.getPos() + (expand ? 2 : 1)))); // update the attrs
            setTimeout(() => {
                expand && DocServer.GetRefField(this.props.node.attrs.docid).then(async dashDoc => dashDoc instanceof Doc && Doc.linkFollowHighlight(dashDoc));
                try { this.props.view.dispatch(this.props.view.state.tr.setSelection(TextSelection.create(this.props.view.state.tr.doc, this.props.getPos() + (expand ? 2 : 1)))); } catch (e) { }
            }, 0);
        }
        e.stopPropagation();
    }

    onPointerEnterCollapse = (e: any) => {
        DocServer.GetRefField(this.props.node.attrs.docid).then(async dashDoc => dashDoc instanceof Doc && Doc.linkFollowHighlight(dashDoc, false));
        e.preventDefault();
        e.stopPropagation();
    }

    onPointerLeaveCollapse = (e: any) => {
        DocServer.GetRefField(this.props.node.attrs.docid).then(async dashDoc => dashDoc instanceof Doc && Doc.linkFollowUnhighlight());
        e.preventDefault();
        e.stopPropagation();
    }

    render() {

        const collapsedId = "DashDocCommentView-" + this.props.node.attrs.docid;

        return (
            <span
                className="formattedTextBox-inlineComment"
                id={collapsedId}
                onPointerDown={this.onPointerDownCollapse}
                onPointerUp={this.onPointerUpCollapse}
                onPointerEnter={this.onPointerEnterCollapse}
                onPointerLeave={this.onPointerLeaveCollapse}
            >

            </span >
        );
    }
}