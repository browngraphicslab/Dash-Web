import React = require("react");
import { library } from '@fortawesome/fontawesome-svg-core';
import { faCaretUp, faFilePdf, faFilm, faImage, faObjectGroup, faStickyNote, faTag, faTextHeight } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { computed, observable, runInAction } from "mobx";
import { observer } from "mobx-react";
import { FieldView, FieldViewProps } from './FieldView';
import "./IconBox.scss";
import { Cast, StrCast, BoolCast } from "../../../new_fields/Types";
import { Doc, DocListCast } from "../../../new_fields/Doc";
import { IconField } from "../../../new_fields/IconField";
import { ContextMenu } from "../ContextMenu";
import Measure from "react-measure";
import { MINIMIZED_ICON_SIZE } from "../../views/globalCssVariables.scss";
import { Scripting } from "../../util/Scripting";
import { ComputedField } from "../../../new_fields/ScriptField";


library.add(faCaretUp);
library.add(faObjectGroup);
library.add(faStickyNote);
library.add(faFilePdf);
library.add(faFilm, faTag, faTextHeight);

@observer
export class IconBox extends React.Component<FieldViewProps> {
    public static LayoutString(fieldKey: string) { return FieldView.LayoutString(IconBox, fieldKey); }

    @observable _panelWidth: number = 0;
    @observable _panelHeight: number = 0;
    @computed get layout(): string { const field = Cast(this.props.Document[this.props.fieldKey], IconField); return field ? field.icon : "<p>Error loading icon data</p>"; }
    @computed get minimizedIcon() { return IconBox.DocumentIcon(this.layout); }

    public static summaryTitleScript(inputDoc: Doc) {
        const sumDoc = Cast(inputDoc.summaryDoc, Doc) as Doc;
        if (sumDoc && StrCast(sumDoc.title).startsWith("-")) {
            return sumDoc.title + ".expanded";
        }
        return "???";
    }
    public static titleScript(inputDoc: Doc) {
        const maxDoc = DocListCast(inputDoc.maximizedDocs);
        if (maxDoc.length === 1) {
            return maxDoc[0].title + ".icon";
        }
        return maxDoc.length > 1 ? "-multiple-.icon" : "???";
    }

    public static AutomaticTitle(doc: Doc) {
        Doc.GetProto(doc).title = ComputedField.MakeFunction('iconTitle(this);');
    }

    public static DocumentIcon(layout: string) {
        const button = layout.indexOf("PDFBox") !== -1 ? faFilePdf :
            layout.indexOf("ImageBox") !== -1 ? faImage :
                layout.indexOf("Formatted") !== -1 ? faStickyNote :
                    layout.indexOf("Video") !== -1 ? faFilm :
                        layout.indexOf("Collection") !== -1 ? faObjectGroup :
                            faCaretUp;
        return <FontAwesomeIcon icon={button} className="documentView-minimizedIcon" />;
    }

    setLabelField = (): void => {
        this.props.Document.hideLabel = !this.props.Document.hideLabel;
    }

    specificContextMenu = (): void => {
        const cm = ContextMenu.Instance;
        cm.addItem({ description: this.props.Document.hideLabel ? "Show label with icon" : "Remove label from icon", event: this.setLabelField, icon: "tag" });
        if (!this.props.Document.hideLabel) {
            cm.addItem({ description: "Use Target Title", event: () => IconBox.AutomaticTitle(this.props.Document), icon: "text-height" });
        }
    }
    render() {
        const label = this.props.Document.hideLabel ? "" : this.props.Document.title;
        return (
            <div className="iconBox-container" onContextMenu={this.specificContextMenu}>
                {this.minimizedIcon}
                <Measure offset onResize={(r) => runInAction(() => {
                    if (r.offset!.width || this.props.Document.hideLabel) {
                        this.props.Document.iconWidth = (r.offset!.width + Number(MINIMIZED_ICON_SIZE));
                        if (this.props.Document._height === Number(MINIMIZED_ICON_SIZE)) this.props.Document._width = this.props.Document.iconWidth;
                    }
                })}>
                    {({ measureRef }) =>
                        <span ref={measureRef} className="iconBox-label">{label}</span>
                    }
                </Measure>
            </div>);
    }
}
Scripting.addGlobal(function iconTitle(doc: any) { return IconBox.titleScript(doc); });
Scripting.addGlobal(function summaryTitle(doc: any) { return IconBox.summaryTitleScript(doc); });