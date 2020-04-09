import React = require("react");
import { IReactionDisposer } from "mobx";
import { observer } from "mobx-react";
import { documentSchema } from "../../../new_fields/documentSchemas";
import { Id } from '../../../new_fields/FieldSymbols';
import { makeInterface } from "../../../new_fields/Schema";
import { StrCast } from "../../../new_fields/Types";
import { SelectionManager } from "../../util/SelectionManager";
import { DocAnnotatableComponent } from '../DocComponent';
import { SearchBox } from "../search/SearchBox";
import { FieldView, FieldViewProps } from './FieldView';
import "./QueryBox.scss";

type QueryDocument = makeInterface<[typeof documentSchema]>;
const QueryDocument = makeInterface(documentSchema);

@observer
export class QueryBox extends DocAnnotatableComponent<FieldViewProps, QueryDocument>(QueryDocument) {
    public static LayoutString(fieldKey: string) { return FieldView.LayoutString(QueryBox, fieldKey); }
    _docListChangedReaction: IReactionDisposer | undefined;
    componentDidMount() {
    }

    componentWillUnmount() {
        this._docListChangedReaction?.();
    }

    render() {
        const dragging = !SelectionManager.GetIsDragging() ? "" : "-dragging";
        return <div className={`queryBox${dragging}`} onWheel={(e) => e.stopPropagation()} >
            <SearchBox id={this.props.Document[Id]} searchQuery={StrCast(this.dataDoc.searchQuery)} filterQuery={this.dataDoc.filterQuery} />
        </div >;
    }
}