import React = require("react");
import { library } from '@fortawesome/fontawesome-svg-core';
import { faCaretUp, faFilePdf, faFilm, faImage, faObjectGroup, faStickyNote } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { action, computed } from "mobx";
import { observer } from "mobx-react";
import { Document } from '../../../fields/Document';
import { IconField } from "../../../fields/IconFIeld";
import { KeyStore } from "../../../fields/KeyStore";
import { SelectionManager } from "../../util/SelectionManager";
import { FieldView, FieldViewProps } from './FieldView';
import "./IconBox.scss";


library.add(faCaretUp);
library.add(faObjectGroup);
library.add(faStickyNote);
library.add(faFilePdf);
library.add(faFilm);

@observer
export class IconBox extends React.Component<FieldViewProps> {
    public static LayoutString() { return FieldView.LayoutString(IconBox); }

    @computed get maximized() { return this.props.Document.GetT(KeyStore.MaximizedDoc, Document); }
    @computed get layout(): string { return this.props.Document.GetData(this.props.fieldKey, IconField, "<p>Error loading layout data</p>" as string); }
    @computed get minimizedIcon() { return IconBox.DocumentIcon(this.layout); }

    public static DocumentIcon(layout: string) {
        let button = layout.indexOf("PDFBox") !== -1 ? faFilePdf :
            layout.indexOf("ImageBox") !== -1 ? faImage :
                layout.indexOf("Formatted") !== -1 ? faStickyNote :
                    layout.indexOf("Video") !== -1 ? faFilm :
                        layout.indexOf("Collection") !== -1 ? faObjectGroup :
                            faCaretUp;
        return <FontAwesomeIcon icon={button} className="documentView-minimizedIcon" />
    }

    render() {
        return (
            <div className="iconBox-container">
                {this.minimizedIcon}
            </div>);
    }
}