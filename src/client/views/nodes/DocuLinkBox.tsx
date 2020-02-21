import { action, observable } from "mobx";
import { observer } from "mobx-react";
import { Doc, DocListCast } from "../../../new_fields/Doc";
import { documentSchema } from "../../../new_fields/documentSchemas";
import { makeInterface } from "../../../new_fields/Schema";
import { Cast, NumCast, StrCast } from "../../../new_fields/Types";
import { Utils } from '../../../Utils';
import { DocumentManager } from "../../util/DocumentManager";
import { DragManager } from "../../util/DragManager";
import { DocComponent } from "../DocComponent";
import "./DocuLinkBox.scss";
import { FieldView, FieldViewProps } from "./FieldView";
import React = require("react");
import { ContextMenuProps } from "../ContextMenuItem";
import { ContextMenu } from "../ContextMenu";
import { LinkEditor } from "../linking/LinkEditor";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { SelectionManager } from "../../util/SelectionManager";
const higflyout = require("@hig/flyout");
export const { anchorPoints } = higflyout;
export const Flyout = higflyout.default;

type DocLinkSchema = makeInterface<[typeof documentSchema]>;
const DocLinkDocument = makeInterface(documentSchema);

@observer
export class DocuLinkBox extends DocComponent<FieldViewProps, DocLinkSchema>(DocLinkDocument) {
    public static LayoutString(fieldKey: string) { return FieldView.LayoutString(DocuLinkBox, fieldKey); }
    _doubleTap = false;
    _lastTap: number = 0;
    _ref = React.createRef<HTMLDivElement>();
    _downX = 0;
    _downY = 0;
    _isOpen = false;
    _timeout: NodeJS.Timeout | undefined;
    @observable _x = 0;
    @observable _y = 0;
    @observable _selected = false;
    @observable _editing = false;
    @observable _forceOpen = false;

    onPointerDown = (e: React.PointerEvent) => {
        this._downX = e.clientX;
        this._downY = e.clientY;
        document.removeEventListener("pointermove", this.onPointerMove);
        document.removeEventListener("pointerup", this.onPointerUp);
        document.addEventListener("pointermove", this.onPointerMove);
        document.addEventListener("pointerup", this.onPointerUp);
        (e.button === 0 && !e.ctrlKey) && e.stopPropagation();
    }
    onPointerMove = action((e: PointerEvent) => {
        const cdiv = this._ref && this._ref.current && this._ref.current.parentElement;
        if (!this._isOpen && cdiv && (Math.abs(e.clientX - this._downX) > 5 || Math.abs(e.clientY - this._downY) > 5)) {
            const bounds = cdiv.getBoundingClientRect();
            const pt = Utils.getNearestPointInPerimeter(bounds.left, bounds.top, bounds.width, bounds.height, e.clientX, e.clientY);
            const separation = Math.sqrt((pt[0] - e.clientX) * (pt[0] - e.clientX) + (pt[1] - e.clientY) * (pt[1] - e.clientY));
            const dragdist = Math.sqrt((pt[0] - this._downX) * (pt[0] - this._downX) + (pt[1] - this._downY) * (pt[1] - this._downY));
            if (separation > 100) {
                //DragManager.StartLinkTargetsDrag(this._ref.current!, pt[0], pt[1], Cast(this.props.Document[this.props.fieldKey], Doc) as Doc, [this.props.Document]); // Containging collection is the document, not a collection... hack.
                const dragData = new DragManager.DocumentDragData([this.props.Document]);
                dragData.dropAction = "alias";
                DragManager.StartDocumentDrag([this._ref.current!], dragData, this._downX, this._downY);
                document.removeEventListener("pointermove", this.onPointerMove);
                document.removeEventListener("pointerup", this.onPointerUp);
            } else if (dragdist > separation) {
                this.props.Document[this.props.fieldKey + "_x"] = (pt[0] - bounds.left) / bounds.width * 100;
                this.props.Document[this.props.fieldKey + "_y"] = (pt[1] - bounds.top) / bounds.height * 100;
            }
        }
    });
    onPointerUp = (e: PointerEvent) => {
        document.removeEventListener("pointermove", this.onPointerMove);
        document.removeEventListener("pointerup", this.onPointerUp);
        if (Math.abs(e.clientX - this._downX) < 3 && Math.abs(e.clientY - this._downY) < 3 && (e.button === 2 || e.ctrlKey || !this.props.Document.isButton)) {
            this.props.select(false);
        }
        this._doubleTap = (Date.now() - this._lastTap < 300 && e.button === 0 && Math.abs(e.clientX - this._downX) < 2 && Math.abs(e.clientY - this._downY) < 2);
        this._lastTap = Date.now();
    }

    @action
    onClick = (e: React.MouseEvent) => {
        if (!this._doubleTap) {
            this._editing = true;
            if (!this.props.Document.onClick && !this._isOpen) {
                this._timeout = setTimeout(action(() => {
                    if (Math.abs(e.clientX - this._downX) < 3 && Math.abs(e.clientY - this._downY) < 3 && (e.button !== 2 && !e.ctrlKey && this.props.Document.isButton)) {
                        DocumentManager.Instance.FollowLink(this.props.Document, this.props.ContainingCollectionDoc as Doc, document => this.props.addDocTab(document, StrCast(this.props.Document.linkOpenLocation, "inTab")), false);
                    }
                    this._editing = false;
                }), 300 - (Date.now() - this._lastTap));
            }
        } else {
            this._timeout && clearTimeout(this._timeout);
            this._timeout = undefined;
        }
        e.stopPropagation();
    }

    openLinkDocOnRight = (e: React.MouseEvent) => {
        this.props.addDocTab(this.props.Document, "onRight");
    }
    openLinkTargetOnRight = (e: React.MouseEvent) => {
        const alias = Doc.MakeAlias(Cast(this.props.Document[this.props.fieldKey], Doc, null));
        alias.isButton = undefined;
        alias.isBackground = undefined;
        alias.layoutKey = "layout";
        this.props.addDocTab(alias, "onRight");
    }
    @action
    openLinkEditor = action((e: React.MouseEvent) => {
        SelectionManager.DeselectAll();
        this._editing = this._forceOpen = true;
    })

    specificContextMenu = (e: React.MouseEvent): void => {
        const funcs: ContextMenuProps[] = [];
        funcs.push({ description: "Open Link Target on Right", event: () => this.openLinkTargetOnRight(e), icon: "eye" });
        funcs.push({ description: "Open Link on Right", event: () => this.openLinkDocOnRight(e), icon: "eye" });
        funcs.push({ description: "Open Link Editor", event: () => this.openLinkEditor(e), icon: "eye" });

        ContextMenu.Instance.addItem({ description: "Link Funcs...", subitems: funcs, icon: "asterisk" });
    }

    render() {
        const x = NumCast(this.props.Document[this.props.fieldKey + "_x"], 100);
        const y = NumCast(this.props.Document[this.props.fieldKey + "_y"], 100);
        const c = StrCast(this.props.Document.backgroundColor, "lightblue");
        const anchor = this.props.fieldKey === "anchor1" ? "anchor2" : "anchor1";
        const anchorScale = (x === 0 || x === 100 || y === 0 || y === 100) ? 1 : .15;

        const timecode = this.props.Document[anchor + "Timecode"];
        const targetTitle = StrCast((this.props.Document[anchor]! as Doc).title) + (timecode !== undefined ? ":" + timecode : "");
        const flyout = (
            <div className="docuLinkBox-flyout" title=" " onPointerOver={() => Doc.UnBrushDoc(this.props.Document)}>
                <LinkEditor sourceDoc={Cast(this.props.Document[this.props.fieldKey], Doc, null)!} hideback={true} linkDoc={this.props.Document} showLinks={action(() => { })} />
                {!this._forceOpen ? (null) : <div className="docuLinkBox-linkCloser" onPointerDown={action(() => this._isOpen = this._editing = this._forceOpen = false)}>
                    <FontAwesomeIcon color="dimGray" icon={"times"} size={"sm"} />
                </div>}
            </div>
        );
        return <div className="docuLinkBox-cont" onPointerDown={this.onPointerDown} onClick={this.onClick} title={targetTitle} onContextMenu={this.specificContextMenu}
            ref={this._ref} style={{
                background: c, left: `calc(${x}% - 7.5px)`, top: `calc(${y}% - 7.5px)`,
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
