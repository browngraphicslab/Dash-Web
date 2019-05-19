import React = require("react");
import { FieldViewProps, FieldView } from "../nodes/FieldView";
import { DocComponent } from "../DocComponent";
import { makeInterface } from "../../../new_fields/Schema";
import { positionSchema } from "../nodes/DocumentView";
import { pageSchema } from "../nodes/ImageBox";
import { PDFViewer } from "./PDFViewer";
import { RouteStore } from "../../../server/RouteStore";
import { InkingControl } from "../InkingControl";
import { observer } from "mobx-react";
import { trace } from "mobx";

type PdfDocument = makeInterface<[typeof positionSchema, typeof pageSchema]>;
const PdfDocument = makeInterface(positionSchema, pageSchema);

@observer
export class PDFBox2 extends DocComponent<FieldViewProps, PdfDocument>(PdfDocument) {
    public static LayoutString() { return FieldView.LayoutString(PDFBox2); }

    render() {
        trace();
        const pdfUrl = "https://mozilla.github.io/pdf.js/web/compressed.tracemonkey-pldi-09.pdf";
        let classname = "pdfBox-cont" + (this.props.isSelected() && !InkingControl.Instance.selectedTool);
        return (
            <PDFViewer url={pdfUrl} />
        )
    }
}