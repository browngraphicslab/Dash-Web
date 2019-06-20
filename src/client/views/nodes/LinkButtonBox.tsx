import React = require("react");
import { library } from '@fortawesome/fontawesome-svg-core';
import { faCaretUp, faFilePdf, faFilm, faImage, faObjectGroup, faStickyNote } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { computed, observable, runInAction } from "mobx";
import { observer } from "mobx-react";
import { FieldView, FieldViewProps } from './FieldView';
import "./LinkButtonBox.scss";
import { DocumentView } from "./DocumentView";
import { Doc } from "../../../new_fields/Doc";
import { LinkButtonField } from "../../../new_fields/LinkButtonField";
import { Cast, StrCast, BoolCast } from "../../../new_fields/Types";
import { CollectionDockingView } from "../collections/CollectionDockingView";
import { DocumentManager } from "../../util/DocumentManager";
import { Id } from "../../../new_fields/FieldSymbols";

library.add(faCaretUp);
library.add(faObjectGroup);
library.add(faStickyNote);
library.add(faFilePdf);
library.add(faFilm);

@observer
export class LinkButtonBox extends React.Component<FieldViewProps> {
    public static LayoutString() { return FieldView.LayoutString(LinkButtonBox); }

    followLink = (): void => {
        console.log("follow link???");
        let field = Cast(this.props.Document[this.props.fieldKey], LinkButtonField, new LinkButtonField({ sourceViewId: "-1", targetViewId: "-1" }));
        let targetView = DocumentManager.Instance.getDocumentViewById(field.data.targetViewId);
        if (targetView && targetView.props.ContainingCollectionView) {
            CollectionDockingView.Instance.AddRightSplit(targetView.props.ContainingCollectionView.props.Document);
        }
    }

    render() {

        let field = Cast(this.props.Document[this.props.fieldKey], LinkButtonField, new LinkButtonField({ sourceViewId: "-1", targetViewId: "-1" }));
        let targetView = DocumentManager.Instance.getDocumentViewById(field.data.targetViewId);

        let text = "Could not find link";
        if (targetView) {
            let context = targetView.props.ContainingCollectionView ? (" in the context of " + StrCast(targetView.props.ContainingCollectionView.props.Document.title)) : "";
            text = "Link to " + StrCast(targetView.props.Document.title) + context;
        }

        let activeDvs = DocumentManager.Instance.DocumentViews.filter(dv => dv.isSelected() || BoolCast(dv.props.Document.libraryBrush, false));
        let display = activeDvs.reduce((found, dv) => {
            let matchSv = field.data.sourceViewId === StrCast(dv.props.Document[Id]);
            let matchTv = field.data.targetViewId === StrCast(dv.props.Document[Id]);
            let match = matchSv || matchTv;
            return match || found;
        }, false);

        return (
            <div className="linkBox-cont" style={{ display: display ? "block" : "none" }}>
                <div className="linkBox-cont-wrapper">
                    <p>{text}</p>
                </div>
            </div >
        );
    }
}