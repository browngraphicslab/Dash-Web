import { IReactionDisposer, reaction, observable, action } from "mobx";
import { NodeSelection } from "prosemirror-state";
import { Doc, HeightSym, WidthSym } from "../../../../fields/Doc";
import { Cast, StrCast } from "../../../../fields/Types";
import { emptyFunction, returnEmptyDoclist, returnEmptyFilter, returnEmptyString, returnFalse, Utils } from "../../../../Utils";
import { DocServer } from "../../../DocServer";
import { Docs, DocUtils } from "../../../documents/Documents";
import { CurrentUserUtils } from "../../../util/CurrentUserUtils";
import { Transform } from "../../../util/Transform";
import { DocumentView } from "../DocumentView";
import { FormattedTextBox } from "./FormattedTextBox";
import React = require("react");
import * as ReactDOM from 'react-dom';
import { observer } from "mobx-react";

export class DashDocView {
    _fieldWrapper: HTMLSpanElement; // container for label and value

    constructor(node: any, view: any, getPos: any, tbox: FormattedTextBox) {
        this._fieldWrapper = document.createElement("span");
        this._fieldWrapper.style.position = "relative";
        this._fieldWrapper.style.textIndent = "0";
        this._fieldWrapper.style.border = "1px solid " + StrCast(tbox.layoutDoc.color, (CurrentUserUtils.ActiveDashboard.darkScheme ? "dimGray" : "lightGray"));
        this._fieldWrapper.style.width = node.attrs.width;
        this._fieldWrapper.style.height = node.attrs.height;
        this._fieldWrapper.style.display = node.attrs.hidden ? "none" : "inline-block";
        (this._fieldWrapper.style as any).float = node.attrs.float;
        this._fieldWrapper.onkeypress = function (e: any) { e.stopPropagation(); };
        this._fieldWrapper.onkeydown = function (e: any) { e.stopPropagation(); };
        this._fieldWrapper.onkeyup = function (e: any) { e.stopPropagation(); };
        this._fieldWrapper.onmousedown = function (e: any) { e.stopPropagation(); };

        ReactDOM.render(<DashDocViewInternal
            docid={node.attrs.docid}
            alias={node.attrs.alias}
            width={node.attrs.width}
            height={node.attrs.height}
            hidden={node.attrs.hidden}
            fieldKey={node.attrs.fieldKey}
            tbox={tbox}
            view={view}
            node={node}
            getPos={getPos}
        />, this._fieldWrapper);
        (this as any).dom = this._fieldWrapper;
    }
    destroy() { ReactDOM.unmountComponentAtNode(this._fieldWrapper); }
    selectNode() { }
}

interface IDashDocViewInternal {
    docid: string;
    alias: string;
    tbox: FormattedTextBox;
    width: string;
    height: string;
    hidden: boolean;
    fieldKey: string;
    view: any;
    node: any;
    getPos: any;
}
@observer
export class DashDocViewInternal extends React.Component<IDashDocViewInternal> {
    _spanRef = React.createRef<HTMLDivElement>();
    _disposers: { [name: string]: IReactionDisposer } = {};
    _textBox: FormattedTextBox;
    @observable _dashDoc: Doc | undefined;
    @observable _finalLayout: any;
    @observable _resolvedDataDoc: any;

    constructor(props: IDashDocViewInternal) {
        super(props);
        this._textBox = this.props.tbox;

        const updateDoc = action((dashDoc: Doc) => {
            this._dashDoc = dashDoc;
            this._finalLayout = this.props.docid ? dashDoc : Doc.expandTemplateLayout(Doc.Layout(dashDoc), dashDoc, this.props.fieldKey);

            if (this._finalLayout) {
                if (!Doc.AreProtosEqual(this._finalLayout, dashDoc)) {
                    this._finalLayout.rootDocument = dashDoc.aliasOf;
                }
                this._resolvedDataDoc = Cast(this._finalLayout.resolvedDataDoc, Doc, null);
            }
            if (this.props.width !== (this._dashDoc?._width ?? "") + "px" || this.props.height !== (this._dashDoc?._height ?? "") + "px") {
                try { // bcz: an exception will be thrown if two aliases are open at the same time when a doc view comment is made
                    this.props.view.dispatch(this.props.view.state.tr.setNodeMarkup(this.props.getPos(), null, {
                        ...this.props.node.attrs, width: (this._dashDoc?._width ?? "") + "px", height: (this._dashDoc?._height ?? "") + "px"
                    }));
                } catch (e) {
                    console.log("DashDocView:" + e);
                }
            }
        });

        DocServer.GetRefField(this.props.docid + this.props.alias).then(async dashDoc => {
            if (!(dashDoc instanceof Doc)) {
                this.props.alias && DocServer.GetRefField(this.props.docid).then(async dashDocBase => {
                    if (dashDocBase instanceof Doc) {
                        const aliasedDoc = Doc.MakeAlias(dashDocBase, this.props.docid + this.props.alias);
                        aliasedDoc.layoutKey = "layout";
                        this.props.fieldKey && DocUtils.makeCustomViewClicked(aliasedDoc, Docs.Create.StackingDocument, this.props.fieldKey, undefined);
                        updateDoc(aliasedDoc);
                    }
                });
            } else {
                updateDoc(dashDoc);
            }
        });
    }

    removeDoc = () => {
        this.props.view.dispatch(this.props.view.state.tr
            .setSelection(new NodeSelection(this.props.view.state.doc.resolve(this.props.getPos())))
            .deleteSelection());
        return true;
    }

    getDocTransform = () => {
        if (!this._spanRef.current) return Transform.Identity();
        const { scale, translateX, translateY } = Utils.GetScreenTransform(this._spanRef.current);
        return new Transform(-translateX, -translateY, 1).scale(1 / scale);
    }
    outerFocus = (target: Doc) => this._textBox.props.focus(this._textBox.props.Document);  // ideally, this would scroll to show the focus target

    onKeyDown = (e: any) => {
        e.stopPropagation();
        if (e.key === "Tab" || e.key === "Enter") {
            e.preventDefault();
        }
    }

    onPointerLeave = () => {
        const ele = document.getElementById("DashDocCommentView-" + this.props.docid) as HTMLDivElement;
        ele && (ele.style.backgroundColor = "");
    }

    onPointerEnter = () => {
        const ele = document.getElementById("DashDocCommentView-" + this.props.docid) as HTMLDivElement;
        ele && (ele.style.backgroundColor = "orange");
    }

    componentWillUnmount = () => Object.values(this._disposers).forEach(disposer => disposer?.());

    render() {
        return !this._dashDoc || !this._finalLayout || this.props.hidden ? null :
            <div ref={this._spanRef}
                className="dash-span"
                style={{
                    width: this.props.width,
                    height: this.props.height,
                    position: 'absolute',
                    display: 'inline-block'
                }}
                onPointerLeave={this.onPointerLeave}
                onPointerEnter={this.onPointerEnter}
                onKeyDown={this.onKeyDown}
                onKeyPress={e => e.stopPropagation()}
                onKeyUp={e => e.stopPropagation()}
                onWheel={e => e.preventDefault()}
            >
                <DocumentView
                    Document={this._finalLayout}
                    DataDoc={this._resolvedDataDoc}
                    addDocument={returnFalse}
                    rootSelected={this._textBox.props.isSelected}
                    removeDocument={this.removeDoc}
                    layerProvider={this._textBox.props.layerProvider}
                    styleProvider={this._textBox.props.styleProvider}
                    docViewPath={this._textBox.props.docViewPath}
                    ScreenToLocalTransform={this.getDocTransform}
                    addDocTab={this._textBox.props.addDocTab}
                    pinToPres={returnFalse}
                    renderDepth={this._textBox.props.renderDepth + 1}
                    PanelWidth={this._finalLayout[WidthSym]}
                    PanelHeight={this._finalLayout[HeightSym]}
                    focus={this.outerFocus}
                    whenChildContentsActiveChanged={returnFalse}
                    bringToFront={emptyFunction}
                    dontRegisterView={false}
                    docFilters={this.props.tbox?.props.docFilters}
                    docRangeFilters={this.props.tbox?.props.docRangeFilters}
                    searchFilterDocs={this.props.tbox?.props.searchFilterDocs}
                    ContainingCollectionView={this._textBox.props.ContainingCollectionView}
                    ContainingCollectionDoc={this._textBox.props.ContainingCollectionDoc}
                />
            </div>;
    }
}