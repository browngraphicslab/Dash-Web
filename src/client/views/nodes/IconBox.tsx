import React = require("react");
import { library } from '@fortawesome/fontawesome-svg-core';
import { faCaretUp, faFilePdf, faFilm, faImage, faObjectGroup, faStickyNote } from '@fortawesome/free-solid-svg-icons';
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


library.add(faCaretUp);
library.add(faObjectGroup);
library.add(faStickyNote);
library.add(faFilePdf);
library.add(faFilm);

@observer
export class IconBox extends React.Component<FieldViewProps> {
    public static LayoutString() { return FieldView.LayoutString(IconBox); }

    @computed get layout(): string { const field = Cast(this.props.Document[this.props.fieldKey], IconField); return field ? field.icon : "<p>Error loading icon data</p>"; }
    @computed get minimizedIcon() { return IconBox.DocumentIcon(this.layout); }

    public static DocumentIcon(layout: string) {
        let button = layout.indexOf("PDFBox") !== -1 ? faFilePdf :
            layout.indexOf("ImageBox") !== -1 ? faImage :
                layout.indexOf("Formatted") !== -1 ? faStickyNote :
                    layout.indexOf("Video") !== -1 ? faFilm :
                        layout.indexOf("Collection") !== -1 ? faObjectGroup :
                            faCaretUp;
        return <FontAwesomeIcon icon={button} className="documentView-minimizedIcon" />;
    }

    setLabelField = (): void => {
        this.props.Document.hideLabel = !BoolCast(this.props.Document.hideLabel);
    }
    setUseOwnTitleField = (): void => {
        this.props.Document.useOwnTitle = !BoolCast(this.props.Document.useTargetTitle);
    }

    specificContextMenu = (): void => {
        ContextMenu.Instance.addItem({
            description: BoolCast(this.props.Document.hideLabel) ? "Show label with icon" : "Remove label from icon",
            event: this.setLabelField
        });
        let maxDocs = DocListCast(this.props.Document.maximizedDocs);
        if (maxDocs.length === 1 && !BoolCast(this.props.Document.hideLabel)) {
            ContextMenu.Instance.addItem({
                description: BoolCast(this.props.Document.useOwnTitle) ? "Use target title for label" : "Use own title label",
                event: this.setUseOwnTitleField
            });
        }
    }
    @observable _panelWidth: number = 0;
    @observable _panelHeight: number = 0;
    render() {
        let labelField = StrCast(this.props.Document.labelField);
        let hideLabel = BoolCast(this.props.Document.hideLabel);
        let maxDocs = DocListCast(this.props.Document.maximizedDocs);
        let firstDoc = maxDocs.length ? maxDocs[0] : undefined;
        let label = hideLabel ? "" : (firstDoc && labelField && !BoolCast(this.props.Document.useOwnTitle, false) ? firstDoc[labelField] : this.props.Document.title);
        return (
            <div className="iconBox-container" onContextMenu={this.specificContextMenu}>
                {this.minimizedIcon}
                <Measure offset onResize={(r) => runInAction(() => {
                    if (r.offset!.width || BoolCast(this.props.Document.hideLabel)) {
                        this.props.Document.nativeWidth = (r.offset!.width + Number(MINIMIZED_ICON_SIZE));
                        if (this.props.Document.height === Number(MINIMIZED_ICON_SIZE)) this.props.Document.width = this.props.Document.nativeWidth;
                    }
                })}>
                    {({ measureRef }) =>
                        <span ref={measureRef} className="iconBox-label">{label}</span>
                    }
                </Measure>
            </div>);
    }
}