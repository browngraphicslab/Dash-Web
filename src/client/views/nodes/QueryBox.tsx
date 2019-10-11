import React = require("react");
import { library } from '@fortawesome/fontawesome-svg-core';
import { faArrowLeft, faArrowRight, faEdit, faMinus, faPlay, faPlus, faStop, faTimes } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { action, computed, reaction, IReactionDisposer } from "mobx";
import { observer } from "mobx-react";
import { Doc, DocListCast, DocListCastAsync } from "../../../new_fields/Doc";
import { listSpec } from "../../../new_fields/Schema";
import { Cast, FieldValue, NumCast } from "../../../new_fields/Types";
import { CurrentUserUtils } from "../../../server/authentication/models/current_user_utils";
import { DocumentManager } from "../../util/DocumentManager";
import { undoBatch } from "../../util/UndoManager";
import { CollectionViewType } from "../collections/CollectionBaseView";
import { CollectionDockingView } from "../collections/CollectionDockingView";
import { CollectionView } from "../collections/CollectionView";
import { ContextMenu } from "../ContextMenu";
import { FieldView, FieldViewProps } from './FieldView';
import "./PresBox.scss";
import { DocumentType } from "../../documents/DocumentTypes";
import { Docs } from "../../documents/Documents";
import { ComputedField } from "../../../new_fields/ScriptField";
import { SearchBox } from "../search/SearchBox";
import { FilterBox } from "../search/FilterBox";

library.add(faArrowLeft);
library.add(faArrowRight);
library.add(faPlay);
library.add(faStop);
library.add(faPlus);
library.add(faTimes);
library.add(faMinus);
library.add(faEdit);

@observer
export class QueryBox extends React.Component<FieldViewProps> {
    public static LayoutString(fieldKey?: string) { return FieldView.LayoutString(QueryBox, fieldKey); }
    _docListChangedReaction: IReactionDisposer | undefined;
    componentDidMount() {
    }

    componentWillUnmount() {
        this._docListChangedReaction && this._docListChangedReaction();
    }

    render() {
        return <div style={{ width: "100%", height: "100%", position: "absolute", pointerEvents: "all" }}>
            <FilterBox></FilterBox>
        </div>;
    }
}