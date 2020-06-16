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
import { Doc, DocListCast, Field, HeightSym, WidthSym } from "../../../../fields/Doc";
import { Id } from "../../../../fields/FieldSymbols";
import { List } from "../../../../fields/List";
import { ObjectField } from "../../../../fields/ObjectField";
import { listSpec } from "../../../../fields/Schema";
import { SchemaHeaderField } from "../../../../fields/SchemaHeaderField";
import { ComputedField } from "../../../../fields/ScriptField";
import { BoolCast, Cast, NumCast, StrCast, FieldValue } from "../../../../fields/Types";
import { emptyFunction, returnEmptyString, returnFalse, returnOne, Utils, returnZero } from "../../../../Utils";
import { DocServer } from "../../../DocServer";
import { Docs, DocUtils } from "../../../documents/Documents";
import { CollectionViewType } from "../../collections/CollectionView";
import { DocumentView } from "../DocumentView";
import { FormattedTextBox } from "./FormattedTextBox";
import { DocumentManager } from "../../../util/DocumentManager";
import { Transform } from "../../../util/Transform";
import React = require("react");



// export class DashDocCommentView {
//     _collapsed: HTMLElement;
//     _view: any;
//     constructor(node: any, view: any, getPos: any) {

//         console.log("DashDocCommentView constructor");

//         //moved
//         this._collapsed = document.createElement("span");
//         this._collapsed.className = "formattedTextBox-inlineComment";
//         this._collapsed.id = "DashDocCommentView-" + node.attrs.docid;
//         this._view = view;
//         //moved
//         const targetNode = () => {  // search forward in the prosemirror doc for the attached dashDocNode that is the target of the comment anchor
//             for (let i = getPos() + 1; i < view.state.doc.content.size; i++) {
//                 const m = view.state.doc.nodeAt(i);
//                 if (m && m.type === view.state.schema.nodes.dashDoc && m.attrs.docid === node.attrs.docid) {
//                     return { node: m, pos: i, hidden: m.attrs.hidden } as { node: any, pos: number, hidden: boolean };
//                 }
//             }
//             const dashDoc = view.state.schema.nodes.dashDoc.create({ width: 75, height: 35, title: "dashDoc", docid: node.attrs.docid, float: "right" });
//             view.dispatch(view.state.tr.insert(getPos() + 1, dashDoc));
//             setTimeout(() => { try { view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.tr.doc, getPos() + 2))); } catch (e) { } }, 0);
//             return undefined;
//         };
//         //moved
//         this._collapsed.onpointerdown = (e: any) => {
//             e.stopPropagation();
//         };
//         //moved
//         this._collapsed.onpointerup = (e: any) => {
//             const target = targetNode();
//             if (target) {
//                 const expand = target.hidden;
//                 const tr = view.state.tr.setNodeMarkup(target.pos, undefined, { ...target.node.attrs, hidden: target.node.attrs.hidden ? false : true });
//                 view.dispatch(tr.setSelection(TextSelection.create(tr.doc, getPos() + (expand ? 2 : 1)))); // update the attrs
//                 setTimeout(() => {
//                     expand && DocServer.GetRefField(node.attrs.docid).then(async dashDoc => dashDoc instanceof Doc && Doc.linkFollowHighlight(dashDoc));
//                     try { view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.tr.doc, getPos() + (expand ? 2 : 1)))); } catch (e) { }
//                 }, 0);
//             }
//             e.stopPropagation();
//         };
//         //moved
//         this._collapsed.onpointerenter = (e: any) => {
//             DocServer.GetRefField(node.attrs.docid).then(async dashDoc => dashDoc instanceof Doc && Doc.linkFollowHighlight(dashDoc, false));
//             e.preventDefault();
//             e.stopPropagation();
//         };
//         //moved
//         this._collapsed.onpointerleave = (e: any) => {
//             DocServer.GetRefField(node.attrs.docid).then(async dashDoc => dashDoc instanceof Doc && Doc.linkFollowUnhighlight());
//             e.preventDefault();
//             e.stopPropagation();
//         };

//         (this as any).dom = this._collapsed;
//     }
//     //moved
//     selectNode() { }
// }

export class DashDocView {
    _dashSpan: HTMLDivElement;
    _outer: HTMLElement;
    _dashDoc: Doc | undefined;
    _reactionDisposer: IReactionDisposer | undefined;
    _renderDisposer: IReactionDisposer | undefined;
    _textBox: FormattedTextBox;

    //moved
    getDocTransform = () => {
        const { scale, translateX, translateY } = Utils.GetScreenTransform(this._outer);
        return new Transform(-translateX, -translateY, 1).scale(1 / this.contentScaling() / scale);
    }

    //moved
    contentScaling = () => NumCast(this._dashDoc!._nativeWidth) > 0 ? this._dashDoc![WidthSym]() / NumCast(this._dashDoc!._nativeWidth) : 1;

    //moved
    outerFocus = (target: Doc) => this._textBox.props.focus(this._textBox.props.Document);  // ideally, this would scroll to show the focus target

    constructor(node: any, view: any, getPos: any, tbox: FormattedTextBox) {
        //moved
        this._textBox = tbox;

        this._dashSpan = document.createElement("div");
        this._outer = document.createElement("span");
        this._outer.style.position = "relative";
        this._outer.style.textIndent = "0";
        this._outer.style.border = "1px solid " + StrCast(tbox.layoutDoc.color, (Cast(Doc.UserDoc().activeWorkspace, Doc, null).darkScheme ? "dimGray" : "lightGray"));
        this._outer.style.width = node.attrs.width;
        this._outer.style.height = node.attrs.height;
        this._outer.style.display = node.attrs.hidden ? "none" : "inline-block";
        // this._outer.style.overflow = "hidden";  // bcz: not sure if this is needed.  if it's used, then the doc doesn't highlight when you hover over a docComment
        (this._outer.style as any).float = node.attrs.float;

        this._dashSpan.style.width = node.attrs.width;
        this._dashSpan.style.height = node.attrs.height;
        this._dashSpan.style.position = "absolute";
        this._dashSpan.style.display = "inline-block";
        this._dashSpan.style.whiteSpace = "normal";

        this._dashSpan.onpointerleave = () => {

            console.log("DashDocView_dashSpan.onpointerleave");  // SMM
            console.log("DashDocCommentView-id=", node.attrs.docid);  // SMM

            const ele = document.getElementById("DashDocCommentView-" + node.attrs.docid);
            if (ele) {
                (ele as HTMLDivElement).style.backgroundColor = "";
            }
        };

        this._dashSpan.onpointerenter = () => {
            console.log("DashDocView_dashSpan.onpointerenter"); // SMM
            console.log("DashDocCommentView-id=", node.attrs.docid);  // SMM

            const ele = document.getElementById("DashDocCommentView-" + node.attrs.docid);
            if (ele) {
                (ele as HTMLDivElement).style.backgroundColor = "orange";
            }
        };

        const removeDoc = () => {
            console.log("DashDocView.removeDoc"); // SMM
            const pos = getPos();
            const ns = new NodeSelection(view.state.doc.resolve(pos));
            view.dispatch(view.state.tr.setSelection(ns).deleteSelection());
            return true;
        };

        const alias = node.attrs.alias;
        const self = this;
        const docid = node.attrs.docid || tbox.props.Document[Id];// tbox.props.DataDoc?.[Id] || tbox.dataDoc?.[Id];

        DocServer.GetRefField(docid + alias).then(async dashDoc => {

            if (!(dashDoc instanceof Doc)) {
                alias && DocServer.GetRefField(docid).then(async dashDocBase => {
                    if (dashDocBase instanceof Doc) {
                        const aliasedDoc = Doc.MakeAlias(dashDocBase, docid + alias);
                        aliasedDoc.layoutKey = "layout";
                        node.attrs.fieldKey && DocUtils.makeCustomViewClicked(aliasedDoc, Docs.Create.StackingDocument, node.attrs.fieldKey, undefined);
                        self.doRender(aliasedDoc, removeDoc, node, view, getPos);
                    }
                });
            } else {
                self.doRender(dashDoc, removeDoc, node, view, getPos);
            }
        });


        this._dashSpan.onkeydown = function (e: any) {
            e.stopPropagation();
            if (e.key === "Tab" || e.key === "Enter") {
                e.preventDefault();
            }
        };
        this._dashSpan.onkeypress = function (e: any) { e.stopPropagation(); };
        this._dashSpan.onwheel = function (e: any) { e.preventDefault(); };
        this._dashSpan.onkeyup = function (e: any) { e.stopPropagation(); };
        this._outer.appendChild(this._dashSpan);
        (this as any).dom = this._outer;
    }

    doRender(dashDoc: Doc, removeDoc: any, node: any, view: any, getPos: any) {
        this._dashDoc = dashDoc;
        const self = this;
        const dashLayoutDoc = Doc.Layout(dashDoc);
        const finalLayout = node.attrs.docid ? dashDoc : Doc.expandTemplateLayout(dashLayoutDoc, dashDoc, node.attrs.fieldKey);

        if (!finalLayout) setTimeout(() => self.doRender(dashDoc, removeDoc, node, view, getPos), 0);
        else {
            this._reactionDisposer?.();
            this._reactionDisposer = reaction(() => ({ dim: [finalLayout[WidthSym](), finalLayout[HeightSym]()], color: finalLayout.color }), ({ dim, color }) => {
                this._dashSpan.style.width = this._outer.style.width = Math.max(20, dim[0]) + "px";
                this._dashSpan.style.height = this._outer.style.height = Math.max(20, dim[1]) + "px";
                this._outer.style.border = "1px solid " + StrCast(finalLayout.color, (Cast(Doc.UserDoc().activeWorkspace, Doc, null).darkScheme ? "dimGray" : "lightGray"));
            }, { fireImmediately: true });
            
            const doReactRender = (finalLayout: Doc, resolvedDataDoc: Doc) => {
                ReactDOM.unmountComponentAtNode(this._dashSpan);

                ReactDOM.render(<DocumentView
                    Document={finalLayout}
                    DataDoc={resolvedDataDoc}
                    LibraryPath={this._textBox.props.LibraryPath}
                    fitToBox={BoolCast(dashDoc._fitToBox)}
                    addDocument={returnFalse}
                    rootSelected={this._textBox.props.isSelected}
                    removeDocument={removeDoc}
                    ScreenToLocalTransform={this.getDocTransform}
                    addDocTab={this._textBox.props.addDocTab}
                    pinToPres={returnFalse}
                    renderDepth={self._textBox.props.renderDepth + 1}
                    NativeHeight={returnZero}
                    NativeWidth={returnZero}
                    PanelWidth={finalLayout[WidthSym]}
                    PanelHeight={finalLayout[HeightSym]}
                    focus={this.outerFocus}
                    backgroundColor={returnEmptyString}
                    parentActive={returnFalse}
                    whenActiveChanged={returnFalse}
                    bringToFront={emptyFunction}
                    dontRegisterView={false}
                    ContainingCollectionView={this._textBox.props.ContainingCollectionView}
                    ContainingCollectionDoc={this._textBox.props.ContainingCollectionDoc}
                    ContentScaling={this.contentScaling}
                />, this._dashSpan);

                if (node.attrs.width !== dashDoc._width + "px" || node.attrs.height !== dashDoc._height + "px") {
                    try { // bcz: an exception will be thrown if two aliases are open at the same time when a doc view comment is made
                        view.dispatch(view.state.tr.setNodeMarkup(getPos(), null, { ...node.attrs, width: dashDoc._width + "px", height: dashDoc._height + "px" }));
                    } catch (e) {
                        console.log(e);
                    }
                }
            };

            this._renderDisposer?.();
            this._renderDisposer = reaction(() => {
                // if (!Doc.AreProtosEqual(finalLayout, dashDoc)) {
                //     finalLayout.rootDocument = dashDoc.aliasOf; // bcz: check on this ... why is it here?
                // }
                const layoutKey = StrCast(finalLayout.layoutKey);
                const finalKey = layoutKey && StrCast(finalLayout[layoutKey]).split("'")?.[1];
                if (finalLayout !== dashDoc && finalKey) {
                    const finalLayoutField = finalLayout[finalKey];
                    if (finalLayoutField instanceof ObjectField) {
                        finalLayout[finalKey + "-textTemplate"] = ComputedField.MakeFunction(`copyField(this.${finalKey})`, { this: Doc.name });
                    }
                }
                return { finalLayout, resolvedDataDoc: Cast(finalLayout.resolvedDataDoc, Doc, null) };
            },
                (res) => doReactRender(res.finalLayout, res.resolvedDataDoc),
                { fireImmediately: true });
        }
    }

    destroy() {
        ReactDOM.unmountComponentAtNode(this._dashSpan);
        this._reactionDisposer?.();
    }
}
