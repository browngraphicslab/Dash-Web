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
import { BoolCast, Cast, NumCast, StrCast, FieldValue } from "../../../../new_fields/Types";
import { emptyFunction, returnEmptyString, returnFalse, returnOne, Utils, returnZero } from "../../../../Utils";
import { DocServer } from "../../../DocServer";
import { Docs } from "../../../documents/Documents";
import { CollectionViewType } from "../../collections/CollectionView";
import { DocumentView } from "../DocumentView";
import { FormattedTextBox } from "./FormattedTextBox";
import { DocumentManager } from "../../../util/DocumentManager";
import { Transform } from "../../../util/Transform";
import React = require("react");

import { schema } from "./schema_rts";

export class OrderedListView {
    update(node: any) {
        return false; // if attr's of an ordered_list (e.g., bulletStyle) change, return false forces the dom node to be recreated which is necessary for the bullet labels to update
    }
}

export class ImageResizeView {
    _handle: HTMLElement;
    _img: HTMLElement;
    _outer: HTMLElement;
    constructor(node: any, view: any, getPos: any, addDocTab: any) {
        //moved
        this._handle = document.createElement("span");
        this._img = document.createElement("img");
        this._outer = document.createElement("span");
        this._outer.style.position = "relative";
        this._outer.style.width = node.attrs.width;
        this._outer.style.height = node.attrs.height;
        this._outer.style.display = "inline-block";
        this._outer.style.overflow = "hidden";
        (this._outer.style as any).float = node.attrs.float;
        //moved
        this._img.setAttribute("src", node.attrs.src);
        this._img.style.width = "100%";
        this._handle.style.position = "absolute";
        this._handle.style.width = "20px";
        this._handle.style.height = "20px";
        this._handle.style.backgroundColor = "blue";
        this._handle.style.borderRadius = "15px";
        this._handle.style.display = "none";
        this._handle.style.bottom = "-10px";
        this._handle.style.right = "-10px";
        const self = this;
        //moved
        this._img.onclick = function (e: any) {
            e.stopPropagation();
            e.preventDefault();
            if (view.state.selection.node && view.state.selection.node.type !== view.state.schema.nodes.image) {
                view.dispatch(view.state.tr.setSelection(new NodeSelection(view.state.doc.resolve(view.state.selection.from - 2))));
            }
        };
        //moved
        this._img.onpointerdown = function (e: any) {
            if (e.ctrlKey) {
                e.preventDefault();
                e.stopPropagation();
                DocServer.GetRefField(node.attrs.docid).then(async linkDoc =>
                    (linkDoc instanceof Doc) &&
                    DocumentManager.Instance.FollowLink(linkDoc, view.state.schema.Document,
                        document => addDocTab(document, node.attrs.location ? node.attrs.location : "inTab"), false));
            }
        };
        //moved
        this._handle.onpointerdown = function (e: any) {
            e.preventDefault();
            e.stopPropagation();
            const wid = Number(getComputedStyle(self._img).width.replace(/px/, ""));
            const hgt = Number(getComputedStyle(self._img).height.replace(/px/, ""));
            const startX = e.pageX;
            const startWidth = parseFloat(node.attrs.width);
            const onpointermove = (e: any) => {
                const currentX = e.pageX;
                const diffInPx = currentX - startX;
                self._outer.style.width = `${startWidth + diffInPx}`;
                self._outer.style.height = `${(startWidth + diffInPx) * hgt / wid}`;
            };

            const onpointerup = () => {
                document.removeEventListener("pointermove", onpointermove);
                document.removeEventListener("pointerup", onpointerup);
                const pos = view.state.selection.from;
                view.dispatch(view.state.tr.setNodeMarkup(getPos(), null, { ...node.attrs, width: self._outer.style.width, height: self._outer.style.height }));
                view.dispatch(view.state.tr.setSelection(new NodeSelection(view.state.doc.resolve(pos))));
            };

            document.addEventListener("pointermove", onpointermove);
            document.addEventListener("pointerup", onpointerup);
        };
        //Moved
        this._outer.appendChild(this._img);
        this._outer.appendChild(this._handle);
        (this as any).dom = this._outer;
    }

    selectNode() {
        this._img.classList.add("ProseMirror-selectednode");

        this._handle.style.display = "";
    }

    deselectNode() {
        this._img.classList.remove("ProseMirror-selectednode");

        this._handle.style.display = "none";
    }
}

export class DashDocCommentView {
    _collapsed: HTMLElement;
    _view: any;
    constructor(node: any, view: any, getPos: any) {
        //moved
        this._collapsed = document.createElement("span");
        this._collapsed.className = "formattedTextBox-inlineComment";
        this._collapsed.id = "DashDocCommentView-" + node.attrs.docid;
        this._view = view;
        //moved
        const targetNode = () => {  // search forward in the prosemirror doc for the attached dashDocNode that is the target of the comment anchor
            for (let i = getPos() + 1; i < view.state.doc.content.size; i++) {
                const m = view.state.doc.nodeAt(i);
                if (m && m.type === view.state.schema.nodes.dashDoc && m.attrs.docid === node.attrs.docid) {
                    return { node: m, pos: i, hidden: m.attrs.hidden } as { node: any, pos: number, hidden: boolean };
                }
            }
            const dashDoc = view.state.schema.nodes.dashDoc.create({ width: 75, height: 35, title: "dashDoc", docid: node.attrs.docid, float: "right" });
            view.dispatch(view.state.tr.insert(getPos() + 1, dashDoc));
            setTimeout(() => { try { view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.tr.doc, getPos() + 2))); } catch (e) { } }, 0);
            return undefined;
        };
        //moved
        this._collapsed.onpointerdown = (e: any) => {
            e.stopPropagation();
        };
        //moved
        this._collapsed.onpointerup = (e: any) => {
            const target = targetNode();
            if (target) {
                const expand = target.hidden;
                const tr = view.state.tr.setNodeMarkup(target.pos, undefined, { ...target.node.attrs, hidden: target.node.attrs.hidden ? false : true });
                view.dispatch(tr.setSelection(TextSelection.create(tr.doc, getPos() + (expand ? 2 : 1)))); // update the attrs
                setTimeout(() => {
                    expand && DocServer.GetRefField(node.attrs.docid).then(async dashDoc => dashDoc instanceof Doc && Doc.linkFollowHighlight(dashDoc));
                    try { view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.tr.doc, getPos() + (expand ? 2 : 1)))); } catch (e) { }
                }, 0);
            }
            e.stopPropagation();
        };
        //moved
        this._collapsed.onpointerenter = (e: any) => {
            DocServer.GetRefField(node.attrs.docid).then(async dashDoc => dashDoc instanceof Doc && Doc.linkFollowHighlight(dashDoc, false));
            e.preventDefault();
            e.stopPropagation();
        };
        //moved
        this._collapsed.onpointerleave = (e: any) => {
            DocServer.GetRefField(node.attrs.docid).then(async dashDoc => dashDoc instanceof Doc && Doc.linkFollowUnhighlight());
            e.preventDefault();
            e.stopPropagation();
        };

        (this as any).dom = this._collapsed;
    }
    //moved
    selectNode() { }
}

export class DashDocView {
    _dashSpan: HTMLDivElement;
    _outer: HTMLElement;
    _dashDoc: Doc | undefined;
    _reactionDisposer: IReactionDisposer | undefined;
    _renderDisposer: IReactionDisposer | undefined;
    _textBox: FormattedTextBox;

    getDocTransform = () => {
        const { scale, translateX, translateY } = Utils.GetScreenTransform(this._outer);
        return new Transform(-translateX, -translateY, 1).scale(1 / this.contentScaling() / scale);
    }
    contentScaling = () => NumCast(this._dashDoc!._nativeWidth) > 0 ? this._dashDoc![WidthSym]() / NumCast(this._dashDoc!._nativeWidth) : 1;

    outerFocus = (target: Doc) => this._textBox.props.focus(this._textBox.props.Document);  // ideally, this would scroll to show the focus target

    constructor(node: any, view: any, getPos: any, tbox: FormattedTextBox) {
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
        this._dashSpan.onpointerleave = () => {
            const ele = document.getElementById("DashDocCommentView-" + node.attrs.docid);
            if (ele) {
                (ele as HTMLDivElement).style.backgroundColor = "";
            }
        };
        this._dashSpan.onpointerenter = () => {
            const ele = document.getElementById("DashDocCommentView-" + node.attrs.docid);
            if (ele) {
                (ele as HTMLDivElement).style.backgroundColor = "orange";
            }
        };
        const removeDoc = () => {
            const pos = getPos();
            const ns = new NodeSelection(view.state.doc.resolve(pos));
            view.dispatch(view.state.tr.setSelection(ns).deleteSelection());
            return true;
        };
        const alias = node.attrs.alias;

        const docid = node.attrs.docid || tbox.props.Document[Id];// tbox.props.DataDoc?.[Id] || tbox.dataDoc?.[Id];
        DocServer.GetRefField(docid + alias).then(async dashDoc => {
            if (!(dashDoc instanceof Doc)) {
                alias && DocServer.GetRefField(docid).then(async dashDocBase => {
                    if (dashDocBase instanceof Doc) {
                        const aliasedDoc = Doc.MakeAlias(dashDocBase, docid + alias);
                        aliasedDoc.layoutKey = "layout";
                        node.attrs.fieldKey && Doc.makeCustomViewClicked(aliasedDoc, Docs.Create.StackingDocument, node.attrs.fieldKey, undefined);
                        self.doRender(aliasedDoc, removeDoc, node, view, getPos);
                    }
                });
            } else {
                self.doRender(dashDoc, removeDoc, node, view, getPos);
            }
        });
        const self = this;
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

    ignoreMutation() { return true; }
}

export class SummaryView {
    _collapsed: HTMLElement;
    _view: any;
    constructor(node: any, view: any, getPos: any) {
        this._collapsed = document.createElement("span");
        this._collapsed.className = this.className(node.attrs.visibility);
        this._view = view;
        const js = node.toJSON;
        node.toJSON = function () {
            return js.apply(this, arguments);
        };

        this._collapsed.onpointerdown = (e: any) => {
            const visible = !node.attrs.visibility;
            const attrs = { ...node.attrs, visibility: visible };
            let textSelection = TextSelection.create(view.state.doc, getPos() + 1);
            if (!visible) { // update summarized text and save in attrs
                textSelection = this.updateSummarizedText(getPos() + 1);
                attrs.text = textSelection.content();
                attrs.textslice = attrs.text.toJSON();
            }
            view.dispatch(view.state.tr.
                setSelection(textSelection). // select the current summarized text (or where it will be if its collapsed)
                replaceSelection(!visible ? new Slice(Fragment.fromArray([]), 0, 0) : node.attrs.text). // collapse/expand it
                setNodeMarkup(getPos(), undefined, attrs)); // update the attrs
            e.preventDefault();
            e.stopPropagation();
            this._collapsed.className = this.className(visible);
        };
        (this as any).dom = this._collapsed;
    }
    selectNode() { }

    deselectNode() { }

    className = (visible: boolean) => "formattedTextBox-summarizer" + (visible ? "" : "-collapsed");

    updateSummarizedText(start?: any) {
        const mtype = this._view.state.schema.marks.summarize;
        const mtypeInc = this._view.state.schema.marks.summarizeInclusive;
        let endPos = start;

        const visited = new Set();
        for (let i: number = start + 1; i < this._view.state.doc.nodeSize - 1; i++) {
            let skip = false;
            this._view.state.doc.nodesBetween(start, i, (node: Node, pos: number, parent: Node, index: number) => {
                if (node.isLeaf && !visited.has(node) && !skip) {
                    if (node.marks.find((m: any) => m.type === mtype || m.type === mtypeInc)) {
                        visited.add(node);
                        endPos = i + node.nodeSize - 1;
                    }
                    else skip = true;
                }
            });
        }
        return TextSelection.create(this._view.state.doc, start, endPos);
    }
}