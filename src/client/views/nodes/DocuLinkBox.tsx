import { action, observable } from "mobx";
import { observer } from "mobx-react";
import { Doc } from "../../../new_fields/Doc";
import { makeInterface } from "../../../new_fields/Schema";
import { NumCast, StrCast } from "../../../new_fields/Types";
import { Utils } from '../../../Utils';
import { DocumentManager } from "../../util/DocumentManager";
import { DragLinksAsDocuments } from "../../util/DragManager";
import { DocComponent } from "../DocComponent";
import { documentSchema } from "./DocumentView";
import "./DocumentView.scss";
import { FieldView, FieldViewProps } from "./FieldView";
import React = require("react");

type DocLinkSchema = makeInterface<[typeof documentSchema]>;
const DocLinkDocument = makeInterface(documentSchema);

@observer
export class DocuLinkBox extends DocComponent<FieldViewProps, DocLinkSchema>(DocLinkDocument) {
    public static LayoutString(fieldKey: string, fieldExt?: string) { return FieldView.LayoutString(DocuLinkBox, fieldKey, fieldExt); }
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
        e.stopPropagation();
    }
    onPointerMove = action((e: PointerEvent) => {
        let cdiv = this._ref.current!.parentElement;
        if (cdiv && (Math.abs(e.clientX - this._downx) > 5 || Math.abs(e.clientY - this._downy) > 5)) {
            let bounds = cdiv.getBoundingClientRect();
            let pt = Utils.getNearestPointInPerimeter(bounds.left, bounds.top, bounds.width, bounds.height, e.clientX, e.clientY);
            let separation = Math.sqrt((pt[0] - e.clientX) * (pt[0] - e.clientX) + (pt[1] - e.clientY) * (pt[1] - e.clientY));
            let dragdist = Math.sqrt((pt[0] - this._downx) * (pt[0] - this._downx) + (pt[1] - this._downy) * (pt[1] - this._downy))
            if (separation > 100) {
                DragLinksAsDocuments(this._ref.current!, pt[0], pt[1], this.props.ContainingCollectionDoc as Doc, this.props.Document); // Containging collection is the document, not a collection... hack.
                document.removeEventListener("pointermove", this.onPointerMove);
                document.removeEventListener("pointerup", this.onPointerUp);
            } else if (dragdist > separation) {
                this.props.Document[this.props.fieldKey + "_x"] = (pt[0] - bounds.left) / bounds.width * 100;
                this.props.Document[this.props.fieldKey + "_y"] = (pt[1] - bounds.top) / bounds.height * 100;
            }
        }
    })
    onPointerUp = (e: PointerEvent) => {
        document.removeEventListener("pointermove", this.onPointerMove);
        document.removeEventListener("pointerup", this.onPointerUp);
        if (Math.abs(e.clientX - this._downx) < 3 && Math.abs(e.clientY - this._downy) < 3 && (e.button === 2 || e.ctrlKey)) {
            this.props.select(false);
        }
    }
    onClick = (e: React.MouseEvent) => {
        if (Math.abs(e.clientX - this._downx) < 3 && Math.abs(e.clientY - this._downy) < 3 && (e.button !== 2 && !e.ctrlKey)) {
            DocumentManager.Instance.FollowLink(this.props.Document, this.props.Document[this.props.fieldKey] as Doc, document => this.props.addDocTab(document, undefined, "inTab"), false);
        }
        e.stopPropagation();
    }
    render() {
        let y = NumCast(this.props.Document[this.props.fieldKey + "_y"], 100);
        let x = NumCast(this.props.Document[this.props.fieldKey + "_x"], 100);
        let c = StrCast(this.props.Document.backgroundColor, "lightblue");
        return <div onPointerDown={this.onPointerDown} onClick={this.onClick} title={StrCast((this.props.Document[this.props.fieldKey === "anchor1" ? "anchor2" : "anchor1"]! as Doc).title)} ref={this._ref} style={{
            cursor: "default", position: "absolute", background: c, width: "25px", height: "25px", borderRadius: "20px", textAlign: "center", left: `calc(${x}% - 12.5px)`, top: `calc(${y}% - 12.5px)`,
            pointerEvents: "all",
        }} />
    }
}
