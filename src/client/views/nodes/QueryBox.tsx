import React = require("react");
import { IReactionDisposer } from "mobx";
import { observer } from "mobx-react";
import { documentSchema } from "../../../fields/documentSchemas";
import { Id } from '../../../fields/FieldSymbols';
import { makeInterface, listSpec } from "../../../fields/Schema";
import { StrCast, Cast } from "../../../fields/Types";
import { SelectionManager } from "../../util/SelectionManager";
import { ViewBoxAnnotatableComponent } from '../DocComponent';
import { SearchBox } from "../search/SearchBox";
import { FieldView, FieldViewProps } from './FieldView';
import "./QueryBox.scss";
import { List } from "../../../fields/List";

type QueryDocument = makeInterface<[typeof documentSchema]>;
const QueryDocument = makeInterface(documentSchema);

@observer
export class QueryBox extends ViewBoxAnnotatableComponent<FieldViewProps, QueryDocument>(QueryDocument) {
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
            <SearchBox
                id={this.props.Document[Id]}
                setSearchQuery={q => this.dataDoc.searchQuery = q}
                searchQuery={StrCast(this.dataDoc.searchQuery)}
                setSearchFileTypes={q => this.dataDoc.searchFileTypes = new List<string>(q)}
                searchFileTypes={Cast(this.dataDoc.searchFileTypes, listSpec("string"), [])}
                filterQquery={StrCast(this.dataDoc.filterQuery)} />
        </div >;
    }
}