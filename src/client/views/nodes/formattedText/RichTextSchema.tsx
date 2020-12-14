import { IReactionDisposer, reaction } from "mobx";
import { NodeSelection } from "prosemirror-state";
import * as ReactDOM from 'react-dom';
import { Doc, HeightSym, WidthSym } from "../../../../fields/Doc";
import { Id } from "../../../../fields/FieldSymbols";
import { Cast, StrCast } from "../../../../fields/Types";
import { emptyFunction, returnFalse, Utils } from "../../../../Utils";
import { DocServer } from "../../../DocServer";
import { Docs, DocUtils } from "../../../documents/Documents";
import { CurrentUserUtils } from "../../../util/CurrentUserUtils";
import { Transform } from "../../../util/Transform";
import { DefaultStyleProvider } from "../../StyleProvider";
import { DocumentView } from "../DocumentView";
import { FormattedTextBox } from "./FormattedTextBox";
import React = require("react");


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
    contentScaling = () => Doc.NativeWidth(this._dashDoc) > 0 ? this._dashDoc![WidthSym]() / Doc.NativeWidth(this._dashDoc) : 1;

    //moved
    outerFocus = (target: Doc) => this._textBox.props.focus(this._textBox.props.Document);  // ideally, this would scroll to show the focus target

    constructor(node: any, view: any, getPos: any, tbox: FormattedTextBox) {
        //moved
        this._textBox = tbox;

        this._dashSpan = document.createElement("div");
        this._outer = document.createElement("span");
        this._outer.style.position = "relative";
        this._outer.style.textIndent = "0";
        this._outer.style.border = "1px solid " + StrCast(tbox.layoutDoc.color, (CurrentUserUtils.ActiveDashboard.darkScheme ? "dimGray" : "lightGray"));
        this._outer.style.width = node.attrs.width;
        this._outer.style.height = node.attrs.height;
        this._outer.style.display = node.attrs.hidden ? "none" : "inline-block";
        // this._outer.style.overflow = "hidden";  // bcz: not sure if this is needed.  if it's used, then the doc doesn't highlight when you hover over a docComment
        (this._outer.style as any).float = node.attrs.float;

        this._dashSpan.style.width = node.attrs.width;
        this._dashSpan.style.height = node.attrs.height;
        this._dashSpan.style.position = "absolute";
        this._dashSpan.style.display = "inline-block";
        this._dashSpan.style.left = "0";
        this._dashSpan.style.top = "0";
        this._dashSpan.style.whiteSpace = "normal";

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
                this._outer.style.border = "1px solid " + StrCast(finalLayout.color, (CurrentUserUtils.ActiveDashboard.darkScheme ? "dimGray" : "lightGray"));
            }, { fireImmediately: true });

            const doReactRender = (finalLayout: Doc, resolvedDataDoc: Doc) => {
                ReactDOM.unmountComponentAtNode(this._dashSpan);

                ReactDOM.render(<DocumentView
                    Document={finalLayout}
                    DataDoc={resolvedDataDoc}
                    addDocument={returnFalse}
                    rootSelected={this._textBox.props.isSelected}
                    removeDocument={removeDoc}
                    ScreenToLocalTransform={this.getDocTransform}
                    addDocTab={this._textBox.props.addDocTab}
                    pinToPres={returnFalse}
                    renderDepth={self._textBox.props.renderDepth + 1}
                    PanelWidth={finalLayout[WidthSym]}
                    PanelHeight={finalLayout[HeightSym]}
                    focus={this.outerFocus}
                    styleProvider={DefaultStyleProvider}
                    parentActive={returnFalse}
                    whenActiveChanged={returnFalse}
                    bringToFront={emptyFunction}
                    dontRegisterView={false}
                    docFilters={this._textBox.props.docFilters}
                    docRangeFilters={this._textBox.props.docRangeFilters}
                    searchFilterDocs={this._textBox.props.searchFilterDocs}
                    ContainingCollectionView={this._textBox.props.ContainingCollectionView}
                    ContainingCollectionDoc={this._textBox.props.ContainingCollectionDoc}
                    ContentScaling={this.contentScaling}
                />, this._dashSpan);

                if (node.attrs.width !== dashDoc._width + "px" || node.attrs.height !== dashDoc._height + "px") {
                    try { // bcz: an exception will be thrown if two aliases are open at the same time when a doc view comment is made
                        if (getPos() !== undefined) {
                            const node = view.state.tr.doc.nodeAt(getPos());
                            if (node.attrs.width !== dashDoc._width + "px" ||
                                node.attrs.height !== dashDoc._height + "px") {
                                view.dispatch(view.state.tr.setNodeMarkup(getPos(), null, { ...node.attrs, width: dashDoc._width + "px", height: dashDoc._height + "px" }));
                            }
                        }
                    } catch (e) {
                        console.log("RichTextSchema: " + e);
                    }
                }
            };

            this._renderDisposer?.();
            this._renderDisposer = reaction(() => {
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
