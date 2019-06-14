import React = require("react");
import "./PDFMenu.scss";
import { observable } from "mobx";
import { observer } from "mobx-react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

@observer
export default class PDFMenu extends React.Component {
    static Instance: PDFMenu;

    @observable Top: number = 0;
    @observable Left: number = 0;

    constructor(props: Readonly<{}>) {
        super(props);

        PDFMenu.Instance = this;
    }

    render() {
        return (
            <div className="pdfMenu-cont" style={{ left: this.Left, top: this.Top }}>
                <button className="pdfMenu-button" title="Highlight"><FontAwesomeIcon icon="highlighter" size="sm" /></button>
                <button className="pdfMenu-button" title="Annotate"><FontAwesomeIcon icon="comment-alt" size="sm" /></button>
            </div>
        )
    }
}