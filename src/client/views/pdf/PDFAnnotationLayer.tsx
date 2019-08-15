import React = require("react");
import { observer } from "mobx-react";
import "./PDFAnnotationLayer.scss";

interface IAnnotationProps {

}

@observer
export class PDFAnnotationLayer extends React.Component {
    onPointerDown = (e: React.PointerEvent) => {
        if (e.ctrlKey) {
            console.log("annotating");
            e.stopPropagation();
        }
    }

    render() {
        return <div className="pdfAnnotationLayer-cont" onPointerDown={this.onPointerDown} />;
    }
}