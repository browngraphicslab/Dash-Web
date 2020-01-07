import { action, observable } from "mobx";
import { observer } from "mobx-react";
import { Doc, WidthSym, HeightSym } from "../../../new_fields/Doc";
import { makeInterface } from "../../../new_fields/Schema";
import { NumCast, StrCast, Cast } from "../../../new_fields/Types";
import { Utils } from '../../../Utils';
import { DocumentManager } from "../../util/DocumentManager";
import { DragManager } from "../../util/DragManager";
import { DocComponent } from "../DocComponent";
import "./DocuLinkBox.scss";
import { FieldView, FieldViewProps } from "./FieldView";
import React = require("react");
import { DocumentType } from "../../documents/DocumentTypes";
import { documentSchema } from "../../../new_fields/documentSchemas";
import { Id } from "../../../new_fields/FieldSymbols";

type DocLinkSchema = makeInterface<[typeof documentSchema]>;
const DocLinkDocument = makeInterface(documentSchema);

@observer
export class DocuLinkBox extends DocComponent<FieldViewProps, DocLinkSchema>(DocLinkDocument) {
    public static LayoutString(fieldKey: string) { return FieldView.LayoutString(DocuLinkBox, fieldKey); }
    _downx = 0;
    _downy = 0;
    @observable _x = 0;
    @observable _y = 0;
    @observable _selected = false;
    _ref = React.createRef<HTMLDivElement>();

    onPointerDown = (e: React.PointerEvent) => {
        this._downx = e.clientX;
        this._downy = e.clientY;
        document.removeEventListener("pointermove", this.onPointerMove);
        document.removeEventListener("pointerup", this.onPointerUp);
        document.addEventListener("pointermove", this.onPointerMove);
        document.addEventListener("pointerup", this.onPointerUp);
        (e.button === 0 && !e.ctrlKey) && e.stopPropagation();
    }
    onPointerMove = action((e: PointerEvent) => {
        const cdiv = this._ref && this._ref.current && this._ref.current.parentElement;
        if (cdiv && (Math.abs(e.clientX - this._downx) > 5 || Math.abs(e.clientY - this._downy) > 5)) {
            const bounds = cdiv.getBoundingClientRect();
            const pt = Utils.getNearestPointInPerimeter(bounds.left, bounds.top, bounds.width, bounds.height, e.clientX, e.clientY);
            const separation = Math.sqrt((pt[0] - e.clientX) * (pt[0] - e.clientX) + (pt[1] - e.clientY) * (pt[1] - e.clientY));
            const dragdist = Math.sqrt((pt[0] - this._downx) * (pt[0] - this._downx) + (pt[1] - this._downy) * (pt[1] - this._downy));
            if (separation > 100) {
                DragManager.StartLinkTargetsDrag(this._ref.current!, pt[0], pt[1], Cast(this.props.Document[this.props.fieldKey], Doc) as Doc, [this.props.Document]); // Containging collection is the document, not a collection... hack.
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
        if (Math.abs(e.clientX - this._downx) < 3 && Math.abs(e.clientY - this._downy) < 3 && (e.button === 2 || e.ctrlKey || !this.props.Document.isButton)) {
            this.props.select(false);
        }
    }
    onClick = (e: React.MouseEvent) => {
        if (Math.abs(e.clientX - this._downx) < 3 && Math.abs(e.clientY - this._downy) < 3 && (e.button !== 2 && !e.ctrlKey && this.props.Document.isButton)) {
            DocumentManager.Instance.FollowLink(this.props.Document, this.props.Document[this.props.fieldKey] as Doc, document => this.props.addDocTab(document, undefined, "inTab"), false);
        }
        e.stopPropagation();
    }

    render() {
        const anchorDoc = Cast(this.props.Document[this.props.fieldKey], Doc);
        let anchorScale = anchorDoc instanceof Doc && anchorDoc.type === DocumentType.PDFANNO ? 0.33 : 1;
        let y = NumCast(this.props.Document[this.props.fieldKey + "_y"], 100);
        let x = NumCast(this.props.Document[this.props.fieldKey + "_x"], 100);
        const c = StrCast(this.props.Document.backgroundColor, "lightblue");
        const anchor = this.props.fieldKey === "anchor1" ? "anchor2" : "anchor1";

        // really hacky stuff to make the link box display at the top right of hypertext link in a formatted text box.  somehow, this should get moved into the hyperlink itself...
        const other = window.document.getElementById((this.props.Document[anchor] as Doc)[Id]);
        if (other) {
            (this.props.Document[this.props.fieldKey] as Doc)?.data; // ugh .. assumes that 'data' is the field used to store the text
            setTimeout(() => {
                let m = other.getBoundingClientRect();
                let mp = this.props.ScreenToLocalTransform().transformPoint(m.right - 5, m.top + 5);
                this.props.Document[this.props.fieldKey + "_x"] = mp[0] / this.props.PanelWidth() * 100;
                this.props.Document[this.props.fieldKey + "_y"] = mp[1] / this.props.PanelHeight() * 100;
            }, 0);
            anchorScale = 0.15;
        }

        const timecode = this.props.Document[anchor + "Timecode"];
        const targetTitle = StrCast((this.props.Document[anchor]! as Doc).title) + (timecode !== undefined ? ":" + timecode : "");
        return <div className="docuLinkBox-cont" onPointerDown={this.onPointerDown} onClick={this.onClick} title={targetTitle}
            ref={this._ref} style={{
                background: c, left: `calc(${x}% - 12.5px)`, top: `calc(${y}% - 12.5px)`,
                transform: `scale(${anchorScale / this.props.ContentScaling()})`
            }} />;
    }
}
