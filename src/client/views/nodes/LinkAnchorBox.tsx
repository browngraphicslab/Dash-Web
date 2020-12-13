import { action, observable } from "mobx";
import { observer } from "mobx-react";
import { Doc, DocListCast } from "../../../fields/Doc";
import { documentSchema } from "../../../fields/documentSchemas";
import { makeInterface } from "../../../fields/Schema";
import { Cast, NumCast, StrCast } from "../../../fields/Types";
import { Utils, setupMoveUpEvents, emptyFunction, OmitKeys } from '../../../Utils';
import { DocumentManager } from "../../util/DocumentManager";
import { DragManager } from "../../util/DragManager";
import { ViewBoxBaseComponent } from "../DocComponent";
import "./LinkAnchorBox.scss";
import { FieldView, FieldViewProps } from "./FieldView";
import React = require("react");
import { ContextMenuProps } from "../ContextMenuItem";
import { ContextMenu } from "../ContextMenu";
import { LinkEditor } from "../linking/LinkEditor";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { SelectionManager } from "../../util/SelectionManager";
import { TraceMobx } from "../../../fields/util";
import { Id } from "../../../fields/FieldSymbols";
import { LinkDocPreview } from "./LinkDocPreview";
import { StyleProp } from "../StyleProvider";
const higflyout = require("@hig/flyout");
export const { anchorPoints } = higflyout;
export const Flyout = higflyout.default;

type LinkAnchorSchema = makeInterface<[typeof documentSchema]>;
const LinkAnchorDocument = makeInterface(documentSchema);

@observer
export class LinkAnchorBox extends ViewBoxBaseComponent<FieldViewProps, LinkAnchorSchema>(LinkAnchorDocument) {
    public static LayoutString(fieldKey: string) { return FieldView.LayoutString(LinkAnchorBox, fieldKey); }
    _doubleTap = false;
    _lastTap: number = 0;
    _ref = React.createRef<HTMLDivElement>();
    _isOpen = false;
    _timeout: NodeJS.Timeout | undefined;
    @observable _x = 0;
    @observable _y = 0;
    @observable _selected = false;
    @observable _editing = false;
    @observable _forceOpen = false;

    onPointerDown = (e: React.PointerEvent) => {
        setupMoveUpEvents(this, e, this.onPointerMove, emptyFunction, emptyFunction, false);
    }
    onPointerMove = action((e: PointerEvent, down: number[], delta: number[]) => {
        const cdiv = this._ref && this._ref.current && this._ref.current.parentElement;
        if (!this._isOpen && cdiv) {
            const bounds = cdiv.getBoundingClientRect();
            const pt = Utils.getNearestPointInPerimeter(bounds.left, bounds.top, bounds.width, bounds.height, e.clientX, e.clientY);
            const separation = Math.sqrt((pt[0] - e.clientX) * (pt[0] - e.clientX) + (pt[1] - e.clientY) * (pt[1] - e.clientY));
            if (separation > 100) {
                const dragData = new DragManager.DocumentDragData([this.rootDoc]);
                dragData.dropAction = "alias";
                dragData.removeDropProperties = ["anchor1_x", "anchor1_y", "anchor2_x", "anchor2_y", "isLinkButton"];
                DragManager.StartDocumentDrag([this._ref.current!], dragData, pt[0], pt[1]);
                return true;
            } else {
                this.rootDoc[this.fieldKey + "_x"] = (pt[0] - bounds.left) / bounds.width * 100;
                this.rootDoc[this.fieldKey + "_y"] = (pt[1] - bounds.top) / bounds.height * 100;
            }
        }
        return false;
    });
    @action
    onClick = (e: React.MouseEvent) => {
        if ((e.button === 2 || e.ctrlKey || !this.layoutDoc.isLinkButton)) {
            this.props.select(false);
        }
        if (!this._doubleTap && !e.ctrlKey && e.button < 2) {
            const anchorContainerDoc = this.props.styleProvider?.(this.dataDoc, this.props, StyleProp.LinkSource);
            this._editing = true;
            anchorContainerDoc && this.props.bringToFront(anchorContainerDoc, false);
            if (anchorContainerDoc && !this.layoutDoc.onClick && !this._isOpen) {
                this._timeout = setTimeout(action(() => {
                    DocumentManager.Instance.FollowLink(this.rootDoc, anchorContainerDoc, (doc, where) => this.props.addDocTab(doc, where), false);
                    this._editing = false;
                }), 300 - (Date.now() - this._lastTap));
            }
        } else {
            this._timeout && clearTimeout(this._timeout);
            this._timeout = undefined;
            this._doubleTap = false;
            this.openLinkEditor(e);
            e.stopPropagation();
        }
    }

    openLinkDocOnRight = (e: React.MouseEvent) => {
        this.props.addDocTab(this.rootDoc, "add:right");
    }
    openLinkTargetOnRight = (e: React.MouseEvent) => {
        const alias = Doc.MakeAlias(Cast(this.layoutDoc[this.fieldKey], Doc, null));
        alias.isLinkButton = undefined;
        alias.layers = undefined;
        alias.layoutKey = "layout";
        this.props.addDocTab(alias, "add:right");
    }
    @action
    openLinkEditor = action((e: React.MouseEvent) => {
        SelectionManager.DeselectAll();
        this._editing = this._forceOpen = true;
    });

    specificContextMenu = (e: React.MouseEvent): void => {
        const funcs: ContextMenuProps[] = [];
        funcs.push({ description: "Open Link Target on Right", event: () => this.openLinkTargetOnRight(e), icon: "eye" });
        funcs.push({ description: "Open Link on Right", event: () => this.openLinkDocOnRight(e), icon: "eye" });
        funcs.push({ description: "Open Link Editor", event: () => this.openLinkEditor(e), icon: "eye" });
        funcs.push({ description: "Toggle Always Show Link", event: () => this.props.Document.linkDisplay = !this.props.Document.linkDisplay, icon: "eye" });

        ContextMenu.Instance.addItem({ description: "Options...", subitems: funcs, icon: "asterisk" });
    }

    render() {
        TraceMobx();
        const small = this.props.PanelWidth() <= 1; // this happens when rendered in a treeView
        const x = NumCast(this.rootDoc[this.fieldKey + "_x"], 100);
        const y = NumCast(this.rootDoc[this.fieldKey + "_y"], 100);
        const linkSource = this.props.styleProvider?.(this.dataDoc, this.props, StyleProp.LinkSource);
        const background = this.props.styleProvider?.(this.dataDoc, this.props, StyleProp.BackgroundColor);
        const anchor = this.fieldKey === "anchor1" ? "anchor2" : "anchor1";
        const anchorScale = !this.dataDoc[this.fieldKey + "-useLinkSmallAnchor"] && (x === 0 || x === 100 || y === 0 || y === 100) ? 1 : .25;

        const timecode = this.dataDoc[anchor + "_timecode"];
        const targetTitle = StrCast((this.dataDoc[anchor] as Doc)?.title) + (timecode !== undefined ? ":" + timecode : "");
        const flyout = (
            <div className="linkAnchorBoxBox-flyout" title=" " onPointerOver={() => Doc.UnBrushDoc(this.rootDoc)}>
                <LinkEditor sourceDoc={Cast(this.dataDoc[this.fieldKey], Doc, null)} hideback={true} linkDoc={this.rootDoc} showLinks={action(() => { })} />
                {!this._forceOpen ? (null) : <div className="linkAnchorBox-linkCloser" onPointerDown={action(() => this._isOpen = this._editing = this._forceOpen = false)}>
                    <FontAwesomeIcon color="dimGray" icon={"times"} size={"sm"} />
                </div>}
            </div>
        );
        return <div className={`linkAnchorBox-cont${small ? "-small" : ""} ${this.rootDoc[Id]}`}
            onPointerLeave={action(() => LinkDocPreview.LinkInfo = undefined)}
            onPointerEnter={action(e => LinkDocPreview.LinkInfo = {
                addDocTab: this.props.addDocTab,
                linkSrc: linkSource,
                linkDoc: this.rootDoc,
                Location: [e.clientX, e.clientY + 20]
            })}
            onPointerDown={this.onPointerDown} onClick={this.onClick} title={targetTitle} onContextMenu={this.specificContextMenu}
            ref={this._ref}
            style={{
                background,
                left: `calc(${x}% - ${small ? 2.5 : 7.5}px)`,
                top: `calc(${y}% - ${small ? 2.5 : 7.5}px)`,
                transform: `scale(${anchorScale})`
            }} >
            {!this._editing && !this._forceOpen ? (null) :
                <Flyout anchorPoint={anchorPoints.LEFT_TOP} content={flyout} open={this._forceOpen ? true : undefined} onOpen={() => this._isOpen = true} onClose={action(() => this._isOpen = this._forceOpen = this._editing = false)}>
                    <span className="linkAnchorBox-button" >
                        <FontAwesomeIcon icon={"eye"} size={"lg"} />
                    </span>
                </Flyout>}
        </div>;
    }
}
