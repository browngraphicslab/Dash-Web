import React = require("react");
import { Doc } from "../../new_fields/Doc";
import { DocumentManager } from "../util/DocumentManager";
import { library } from '@fortawesome/fontawesome-svg-core';
import { faCaretUp, faFilePdf, faFilm, faImage, faObjectGroup, faStickyNote } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Cast } from "../../new_fields/Types";
import { FieldView, FieldViewProps } from './nodes/FieldView';
import { computed } from "mobx";
import { IconField } from "../../new_fields/IconField";


export interface SearchProps {
    doc: Doc;
}

library.add(faCaretUp);
library.add(faObjectGroup);
library.add(faStickyNote);
library.add(faFilePdf);
library.add(faFilm);

export class SearchItem extends React.Component<SearchProps> {

    onClick = () => {
        DocumentManager.Instance.jumpToDocument(this.props.doc);
    }

    //needs help
    // @computed get layout(): string { const field = Cast(this.props.doc[fieldKey], IconField); return field ? field.icon : "<p>Error loading icon data</p>"; }


    public static DocumentIcon(layout: string) {
        let button = layout.indexOf("PDFBox") !== -1 ? faFilePdf :
            layout.indexOf("ImageBox") !== -1 ? faImage :
                layout.indexOf("Formatted") !== -1 ? faStickyNote :
                    layout.indexOf("Video") !== -1 ? faFilm :
                        layout.indexOf("Collection") !== -1 ? faObjectGroup :
                            faCaretUp;
        return <FontAwesomeIcon icon={button} className="documentView-minimizedIcon" />;
    }

    render() {
        return (
            <div className="search-item" id="result" onClick={this.onClick}>
                <div className="search-title" id="result" >title: {this.props.doc.title}</div>
                {/* <div className="search-type" id="result" >Type: {this.props.doc.layout}</div> */}
                {/* <div className="search-type" >{SearchItem.DocumentIcon(this.layout)}</div> */}
            </div>
        );
    }
} 