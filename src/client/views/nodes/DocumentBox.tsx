import { observer } from "mobx-react";
import { Doc } from "../../../new_fields/Doc";
import { documentSchema } from "../../../new_fields/documentSchemas";
import { makeInterface } from "../../../new_fields/Schema";
import { ComputedField } from "../../../new_fields/ScriptField";
import { emptyFunction, emptyPath } from "../../../Utils";
import { ContextMenu } from "../ContextMenu";
import { ContextMenuProps } from "../ContextMenuItem";
import { DocComponent } from "../DocComponent";
import { ContentFittingDocumentView } from "./ContentFittingDocumentView";
import "./DocumentBox.scss";
import { FieldView, FieldViewProps } from "./FieldView";
import React = require("react");

type DocBoxSchema = makeInterface<[typeof documentSchema]>;
const DocBoxDocument = makeInterface(documentSchema);

@observer
export class DocumentBox extends DocComponent<FieldViewProps, DocBoxSchema>(DocBoxDocument) {
    public static LayoutString(fieldKey: string) { return FieldView.LayoutString(DocumentBox, fieldKey); }


    specificContextMenu = (e: React.MouseEvent): void => {
        const funcs: ContextMenuProps[] = [];
        funcs.push({ description: "Auto Show Selected", event: () => Doc.GetProto(this.props.Document).data = ComputedField.MakeFunction("selectedDocs(this,true,[_last_])?.[0]"), icon: "expand-arrows-alt" });

        ContextMenu.Instance.addItem({ description: "DocumentBox Funcs...", subitems: funcs, icon: "asterisk" });
    }
    render() {
        const containedDoc = this.props.Document[this.props.fieldKey] as Doc;
        return <div className="documentBox-container" onContextMenu={this.specificContextMenu}>
            {!containedDoc ? (null) : <ContentFittingDocumentView
                Document={containedDoc}
                DataDocument={undefined}
                LibraryPath={emptyPath}
                fitToBox={this.props.fitToBox}
                addDocument={this.props.addDocument}
                moveDocument={this.props.moveDocument}
                removeDocument={this.props.removeDocument}
                ruleProvider={this.props.ruleProvider}
                addDocTab={this.props.addDocTab}
                pinToPres={this.props.pinToPres}
                getTransform={this.props.ScreenToLocalTransform}
                renderDepth={this.props.renderDepth - 1}
                PanelWidth={this.props.PanelWidth}
                PanelHeight={this.props.PanelHeight}
                focus={this.props.focus}
                active={this.props.active}
                whenActiveChanged={this.props.whenActiveChanged}
                setPreviewScript={emptyFunction}
                previewScript={undefined}
            />}
        </div>;
    }
}
