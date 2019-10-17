import { action, observable } from "mobx";
import { observer } from "mobx-react";
import { Doc, Opt } from "../../../new_fields/Doc";
import { NumCast, StrCast } from "../../../new_fields/Types";
import { Utils } from '../../../Utils';
import { DocumentManager } from "../../util/DocumentManager";
import "./DocumentView.scss";
import React = require("react");
import { DragManager, DragLinksAsDocuments } from "../../util/DragManager";
import { UndoManager } from "../../util/UndoManager";


interface DocuLinkViewProps {
    Document: Doc;
    isSelected: () => boolean;
    addDocTab: (doc: Doc, dataDoc: Opt<Doc>, where: string) => void;
    anchor: string;
    otherAnchor: string;
    scale: () => number;
    contentDiv: HTMLDivElement | null;
    link: Doc;
    index: number;
    selectedLink: () => number;
    selectLink: (id: number) => void;
    blacklist: Opt<Doc>
}

@observer
export class DocuLinkView extends React.Component<DocuLinkViewProps> {
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
        if (this.props.contentDiv && (Math.abs(e.clientX - this._downx) > 5 || Math.abs(e.clientY - this._downy) > 5)) {
            let bounds = this.props.contentDiv.getBoundingClientRect();
            let pt = Utils.getNearestPointInPerimeter(bounds.left, bounds.top, bounds.width, bounds.height, e.clientX, e.clientY);
            let separation = Math.sqrt((pt[0] - e.clientX) * (pt[0] - e.clientX) + (pt[1] - e.clientY) * (pt[1] - e.clientY));
            let dragdist = Math.sqrt((pt[0] - this._downx) * (pt[0] - this._downx) + (pt[1] - this._downy) * (pt[1] - this._downy))
            if (separation > 100) {
                DragLinksAsDocuments(this._ref.current!, pt[0], pt[1], this.props.Document, this.props.link);
                document.removeEventListener("pointermove", this.onPointerMove);
                document.removeEventListener("pointerup", this.onPointerUp);
            } else if (dragdist > separation) {
                this.props.link[this.props.anchor + "_x"] = (pt[0] - bounds.left) / bounds.width * 100;
                this.props.link[this.props.anchor + "_y"] = (pt[1] - bounds.top) / bounds.height * 100;
            }
        }
    })
    onPointerUp = (e: PointerEvent) => {
        document.removeEventListener("pointermove", this.onPointerMove);
        document.removeEventListener("pointerup", this.onPointerUp);
        if (Math.abs(e.clientX - this._downx) < 3 && Math.abs(e.clientY - this._downy) < 3 && (e.button === 2 || e.ctrlKey)) {
            this.props.selectLink(this.props.selectedLink() === this.props.index ? -1 : this.props.index);
        }
    }
    onClick = (e: React.MouseEvent) => {
        if (Math.abs(e.clientX - this._downx) < 3 && Math.abs(e.clientY - this._downy) < 3 && (e.button !== 2 && !e.ctrlKey)) {
            DocumentManager.Instance.FollowLink(this.props.link, this.props.link[this.props.anchor] as Doc, document => this.props.addDocTab(document, undefined, "inTab"), false);
        }
        e.stopPropagation();
    }
    render() {
        let y = NumCast(this.props.link[this.props.anchor + "_y"], 100);
        let x = NumCast(this.props.link[this.props.anchor + "_x"], 100);
        let c = StrCast(this.props.link[this.props.anchor + "_background"], "lightblue");
        return <div onPointerDown={this.onPointerDown} onClick={this.onClick} title={StrCast((this.props.link[this.props.otherAnchor]! as Doc).title)} ref={this._ref} style={{
            cursor: "default", position: "absolute", background: c, width: "25px", height: "25px", borderRadius: "20px", textAlign: "center", left: `calc(${x}% - 12.5px)`, top: `calc(${y}% - 12.5px)`,
            transform: `scale(${1 / this.props.scale()})`,
            border: this.props.selectedLink() === this.props.index && this.props.isSelected() ? "solid 3px black" : undefined
        }} />
    }
}
