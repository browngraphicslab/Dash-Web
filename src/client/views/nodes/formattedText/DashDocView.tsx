import { IReactionDisposer, reaction } from "mobx";
import { NodeSelection } from "prosemirror-state";
import { Doc, HeightSym, WidthSym } from "../../../../new_fields/Doc";
import { Id } from "../../../../new_fields/FieldSymbols";
import { ObjectField } from "../../../../new_fields/ObjectField";
import { ComputedField } from "../../../../new_fields/ScriptField";
import { BoolCast, Cast, NumCast, StrCast } from "../../../../new_fields/Types";
import { emptyFunction, returnEmptyString, returnFalse, Utils, returnZero } from "../../../../Utils";
import { DocServer } from "../../../DocServer";
import { Docs } from "../../../documents/Documents";
import { DocumentView } from "../DocumentView";
import { FormattedTextBox } from "./FormattedTextBox";
import { Transform } from "../../../util/Transform";
import React = require("react");

interface IDashDocView {
    node: any;
    view: any;
    getPos: any;
    tbox?: FormattedTextBox;
    self: any;
}

export class DashDocView extends React.Component<IDashDocView> {

    _dashDoc: Doc | undefined;
    _reactionDisposer: IReactionDisposer | undefined;
    _renderDisposer: IReactionDisposer | undefined;
    _textBox: FormattedTextBox;
    _finalLayout: any;
    _resolvedDataDoc: any;


    //    constructor(node: any, view: any, getPos: any, tbox: FormattedTextBox) {

    constructor(props: IDashDocView) {
        super(props);

        const node = this.props.node;
        this._textBox = this.props.tbox as FormattedTextBox;

        const alias = node.attrs.alias;
        const docid = node.attrs.docid || this._textBox.props.Document[Id];

        DocServer.GetRefField(docid + alias).then(async dashDoc => {
            if (!(dashDoc instanceof Doc)) {
                alias && DocServer.GetRefField(docid).then(async dashDocBase => {
                    if (dashDocBase instanceof Doc) {
                        const aliasedDoc = Doc.MakeAlias(dashDocBase, docid + alias);
                        aliasedDoc.layoutKey = "layout";
                        node.attrs.fieldKey && Doc.makeCustomViewClicked(aliasedDoc, Docs.Create.StackingDocument, node.attrs.fieldKey, undefined);
                        this._dashDoc = aliasedDoc;
                        //                        self.doRender(aliasedDoc, removeDoc, node, view, getPos);
                    }
                });
            } else {
                this._dashDoc = dashDoc;
                //                self.doRender(dashDoc, removeDoc, node, view, getPos);
            }
        });

        this.onPointerLeave = this.onPointerLeave.bind(this);
        this.onPointerEnter = this.onPointerEnter.bind(this);
        this.onKeyDown = this.onKeyDown.bind(this);
        this.onKeyPress = this.onKeyPress.bind(this);
        this.onKeyUp = this.onKeyUp.bind(this);
        this.onWheel = this.onWheel.bind(this);
    }
    /* #region Internal functions */

    removeDoc = () => {
        const view = this.props.view;
        const pos = this.props.getPos();
        const ns = new NodeSelection(view.state.doc.resolve(pos));
        view.dispatch(view.state.tr.setSelection(ns).deleteSelection());
        return true;
    }

    getDocTransform = () => {
        const outerElement = document.getElementById('dash-document-view-outer') as HTMLElement;
        const { scale, translateX, translateY } = Utils.GetScreenTransform(outerElement);
        return new Transform(-translateX, -translateY, 1).scale(1 / this.contentScaling() / scale);
    }
    contentScaling = () => NumCast(this._dashDoc!._nativeWidth) > 0 ? this._dashDoc![WidthSym]() / NumCast(this._dashDoc!._nativeWidth) : 1;

    outerFocus = (target: Doc) => this._textBox.props.focus(this._textBox.props.Document);  // ideally, this would scroll to show the focus target

    onKeyPress = (e: any) => {
        e.stopPropagation();
    }
    onWheel = (e: any) => {
        e.preventDefault();
    }
    onKeyUp = (e: any) => {
        e.stopPropagation();
    }
    onKeyDown = (e: any) => {
        e.stopPropagation();
        if (e.key === "Tab" || e.key === "Enter") {
            e.preventDefault();
        }
    }
    onPointerLeave = () => {
        const ele = document.getElementById("DashDocCommentView-" + this.props.node.attrs.docid);
        if (ele) {
            (ele as HTMLDivElement).style.backgroundColor = "";
        }
    }
    onPointerEnter = () => {
        const ele = document.getElementById("DashDocCommentView-" + this.props.node.attrs.docid);
        if (ele) {
            (ele as HTMLDivElement).style.backgroundColor = "orange";
        }
    }
    /*endregion*/

    componentWillMount = () => {
        this._reactionDisposer?.();
    }

    componentDidUpdate = () => {

        this._renderDisposer?.();
        this._renderDisposer = reaction(() => {

            const dashDoc = this._dashDoc as Doc;
            const dashLayoutDoc = Doc.Layout(dashDoc);
            const finalLayout = this.props.node.attrs.docid ? dashDoc : Doc.expandTemplateLayout(dashLayoutDoc, dashDoc, this.props.node.attrs.fieldKey);

            if (finalLayout) {
                if (!Doc.AreProtosEqual(finalLayout, dashDoc)) {
                    finalLayout.rootDocument = dashDoc.aliasOf;
                }
                const layoutKey = StrCast(finalLayout.layoutKey);
                const finalKey = layoutKey && StrCast(finalLayout[layoutKey]).split("'")?.[1];
                if (finalLayout !== dashDoc && finalKey) {
                    const finalLayoutField = finalLayout[finalKey];
                    if (finalLayoutField instanceof ObjectField) {
                        finalLayout[finalKey + "-textTemplate"] = ComputedField.MakeFunction(`copyField(this.${finalKey})`, { this: Doc.name });
                    }
                }
                this._finalLayout = finalLayout;
                this._resolvedDataDoc = Cast(finalLayout.resolvedDataDoc, Doc, null);
                return { finalLayout, resolvedDataDoc: Cast(finalLayout.resolvedDataDoc, Doc, null) };
            }
        },
            (res) => {

                if (res) {
                    this._finalLayout = res.finalLayout;
                    this._resolvedDataDoc = res.resolvedDataDoc;

                    this.forceUpdate(); // doReactRender(res.finalLayout, res.resolvedDataDoc),
                }
            },
            { fireImmediately: true });

    }

    render() {
        // doRender(dashDoc: Doc, removeDoc: any, node: any, view: any, getPos: any) {

        const node = this.props.node;
        const view = this.props.view;
        const getPos = this.props.getPos;

        const spanStyle = {
            width: this.props.node.props.width,
            height: this.props.node.props.height,
            position: 'absolute' as 'absolute',
            display: 'inline-block'
        };


        const outerStyle = {
            position: "relative" as "relative",
            textIndent: "0",
            border: "1px solid " + StrCast(this._textBox.Document.color, (Cast(Doc.UserDoc().activeWorkspace, Doc, null).darkScheme ? "dimGray" : "lightGray")),
            width: this.props.node.props.width,
            height: this.props.node.props.height,
            display: this.props.node.props.hidden ? "none" : "inline-block",
            float: this.props.node.props.float,
        };

        const dashDoc = this._dashDoc as Doc;
        const self = this;
        const dashLayoutDoc = Doc.Layout(dashDoc);
        const finalLayout = node.attrs.docid ? dashDoc : Doc.expandTemplateLayout(dashLayoutDoc, dashDoc, node.attrs.fieldKey);
        const resolvedDataDoc = this._resolvedDataDoc; //Added this

        if (!finalLayout) {
            return <div></div>;
            // if (!finalLayout) setTimeout(() => self.doRender(dashDoc, removeDoc, node, view, getPos), 0);
        } else {

            this._reactionDisposer?.();
            this._reactionDisposer = reaction(() =>
                ({
                    dim: [finalLayout[WidthSym](), finalLayout[HeightSym]()],
                    color: finalLayout.color
                }),
                ({ dim, color }) => {
                    spanStyle.width = outerStyle.width = Math.max(20, dim[0]) + "px";
                    spanStyle.height = outerStyle.height = Math.max(20, dim[1]) + "px";
                    outerStyle.border = "1px solid " + StrCast(finalLayout.color, (Cast(Doc.UserDoc().activeWorkspace, Doc, null).darkScheme ? "dimGray" : "lightGray"));
                }, { fireImmediately: true });

            if (node.attrs.width !== dashDoc._width + "px" || node.attrs.height !== dashDoc._height + "px") {
                try { // bcz: an exception will be thrown if two aliases are open at the same time when a doc view comment is made
                    view.dispatch(view.state.tr.setNodeMarkup(getPos(), null, { ...node.attrs, width: dashDoc._width + "px", height: dashDoc._height + "px" }));
                } catch (e) {
                    console.log(e);
                }
            }


            //const doReactRender = (finalLayout: Doc, resolvedDataDoc: Doc) => {
            //    ReactDOM.unmountComponentAtNode(this._dashSpan);

            return (
                <span id="dash-document-view-outer"
                    className="outer"
                    style={outerStyle}
                >
                    <div id="dashSpan"
                        className="dash-span"
                        style={spanStyle}
                        onPointerLeave={this.onPointerLeave}
                        onPointerEnter={this.onPointerEnter}
                        onKeyDown={this.onKeyDown}
                        onKeyPress={this.onKeyPress}
                        onKeyUp={this.onKeyUp}
                        onWheel={this.onWheel}
                    >
                        <DocumentView
                            Document={finalLayout}
                            DataDoc={resolvedDataDoc}
                            LibraryPath={this._textBox.props.LibraryPath}
                            fitToBox={BoolCast(dashDoc._fitToBox)}
                            addDocument={returnFalse}
                            rootSelected={this._textBox.props.isSelected}
                            removeDocument={this.removeDoc}
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
                        />

                    </div>
                </span>
            );

        }
    }

}