import React = require("react");
import { observer } from "mobx-react";

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
        return (
            <div className="pdfAnnotationLayer-cont" style={{ width: "100%", height: "100%", position: "relative", top: "-200%" }} onPointerDown={this.onPointerDown}>

            </div>
        );
    }
}