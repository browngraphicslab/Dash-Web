import React = require("react");
import "./PDFMenu.scss";
import { observable } from "mobx";
import { observer } from "mobx-react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { emptyFunction } from "../../../Utils";
import { Doc } from "../../../new_fields/Doc";

@observer
export default class PDFMenu extends React.Component {
    static Instance: PDFMenu;

    @observable Top: number = 0;
    @observable Left: number = 0;
    StartDrag: (e: PointerEvent) => void = emptyFunction;
    Highlight: (d: Doc | undefined) => void = emptyFunction;

    constructor(props: Readonly<{}>) {
        super(props);

        PDFMenu.Instance = this;
    }

    pointerDown = (e: React.PointerEvent) => {
        document.removeEventListener("pointermove", this.StartDrag);
        document.addEventListener("pointermove", this.StartDrag);
        document.removeEventListener("pointerup", this.pointerUp)
        document.addEventListener("pointerup", this.pointerUp)

        e.stopPropagation();
        e.preventDefault();
    }

    pointerUp = (e: PointerEvent) => {
        document.removeEventListener("pointermove", this.StartDrag);
        document.removeEventListener("pointerup", this.pointerUp);
        e.stopPropagation();
        e.preventDefault();
    }

    render() {
        return (
            <div className="pdfMenu-cont" style={{ left: this.Left, top: this.Top }}>
                <button className="pdfMenu-button" title="Highlight" onClick={() => this.Highlight(undefined)}><FontAwesomeIcon icon="highlighter" size="sm" /></button>
                <button className="pdfMenu-button" title="Annotate" onPointerDown={this.pointerDown}><FontAwesomeIcon icon="comment-alt" size="sm" /></button>
            </div>
        )
    }
}