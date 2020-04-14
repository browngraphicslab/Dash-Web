import { action, observable } from "mobx";
import { observer } from "mobx-react";
import { Doc, DocListCast } from "../../../new_fields/Doc";
import { documentSchema } from "../../../new_fields/documentSchemas";
import { makeInterface } from "../../../new_fields/Schema";
import { Cast, NumCast, StrCast } from "../../../new_fields/Types";
import { Utils, setupMoveUpEvents } from '../../../Utils';
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
import { TraceMobx } from "../../../new_fields/util";
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
        setupMoveUpEvents(this, e, this.onPointerMove, () => { }, this.onClick);
    }
    onPointerMove = action((e: PointerEvent, down: number[], delta: number[]) => {
        const cdiv = this._ref && this._ref.current && this._ref.current.parentElement;
        if (!this._isOpen && cdiv) {
            const bounds = cdiv.getBoundingClientRect();
            const pt = Utils.getNearestPointInPerimeter(bounds.left, bounds.top, bounds.width, bounds.height, e.clientX, e.clientY);
            const separation = Math.sqrt((pt[0] - e.clientX) * (pt[0] - e.clientX) + (pt[1] - e.clientY) * (pt[1] - e.clientY));
            const dragdist = Math.sqrt((pt[0] - down[0]) * (pt[0] - down[0]) + (pt[1] - down[1]) * (pt[1] - down[1]));
            if (separation > 100) {
                const dragData = new DragManager.DocumentDragData([this.rootDoc]);
                dragData.dropAction = "alias";
                dragData.removeDropProperties = ["anchor1_x", "anchor1_y", "anchor2_x", "anchor2_y", "isLinkButton"];
                DragManager.StartDocumentDrag([this._ref.current!], dragData, down[0], down[1]);
                return true;
            } else if (dragdist > separation) {
                this.layoutDoc[this.fieldKey + "_x"] = (pt[0] - bounds.left) / bounds.width * 100;
                this.layoutDoc[this.fieldKey + "_y"] = (pt[1] - bounds.top) / bounds.height * 100;
            }
        }
        return false;
    });
    @action
    onClick = (e: PointerEvent) => {
        this._doubleTap = (Date.now() - this._lastTap < 300 && e.button === 0);
        this._lastTap = Date.now();
        if ((e.button === 2 || e.ctrlKey || !this.layoutDoc.isLinkButton)) {
            this.props.select(false);
        }
        if (!this._doubleTap && !e.ctrlKey && e.button < 2) {
            const anchorContainerDoc = this.props.ContainingCollectionDoc; // bcz: hack!  need a better prop for passing the anchor's container 
            this._editing = true;
            anchorContainerDoc && this.props.bringToFront(anchorContainerDoc, false);
            if (anchorContainerDoc && !this.layoutDoc.onClick && !this._isOpen) {
                this._timeout = setTimeout(action(() => {
                    DocumentManager.Instance.FollowLink(this.rootDoc, anchorContainerDoc, document => this.props.addDocTab(document, StrCast(this.layoutDoc.linkOpenLocation, "inTab")), false);
                    this._editing = false;
                }), 300 - (Date.now() - this._lastTap));
            }
        } else {
            this._timeout && clearTimeout(this._timeout);
            this._timeout = undefined;
        }
    }

    openLinkDocOnRight = (e: React.MouseEvent) => {
        this.props.addDocTab(this.rootDoc, "onRight");
    }
    openLinkTargetOnRight = (e: React.MouseEvent) => {
        const alias = Doc.MakeAlias(Cast(this.layoutDoc[this.fieldKey], Doc, null));
        alias.isLinkButton = undefined;
        alias.isBackground = undefined;
        alias.layoutKey = "layout";
        this.props.addDocTab(alias, "onRight");
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

        ContextMenu.Instance.addItem({ description: "Link Funcs...", subitems: funcs, icon: "asterisk" });
    }

    render() {
        TraceMobx();
        const x = this.props.PanelWidth() > 1 ? NumCast(this.layoutDoc[this.fieldKey + "_x"], 100) : 0;
        const y = this.props.PanelWidth() > 1 ? NumCast(this.layoutDoc[this.fieldKey + "_y"], 100) : 0;
        const c = StrCast(this.layoutDoc.backgroundColor, "lightblue");
        const anchor = this.fieldKey === "anchor1" ? "anchor2" : "anchor1";
        const anchorScale = (x === 0 || x === 100 || y === 0 || y === 100) ? 1 : .15;

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
        const small = this.props.PanelWidth() <= 1;
        return <div className={`linkAnchorBox-cont${small ? "-small" : ""}`} onPointerDown={this.onPointerDown} title={targetTitle} onContextMenu={this.specificContextMenu}
            ref={this._ref} style={{
                background: c,
                left: !small ? `calc(${x}% - 7.5px)` : undefined,
                top: !small ? `calc(${y}% - 7.5px)` : undefined,
                transform: `scale(${anchorScale / this.props.ContentScaling()})`
            }} >
            {!this._editing && !this._forceOpen ? (null) :
                <Flyout anchorPoint={anchorPoints.LEFT_TOP} content={flyout} open={this._forceOpen ? true : undefined} onOpen={() => this._isOpen = true} onClose={action(() => this._isOpen = this._forceOpen = this._editing = false)}>
                    <span className="parentDocumentSelector-button" >
                        <FontAwesomeIcon icon={"eye"} size={"lg"} />
                    </span>
                </Flyout>}
        </div>;
    }
}