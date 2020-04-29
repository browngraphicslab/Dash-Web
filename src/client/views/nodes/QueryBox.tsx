import React = require("react");
import { IReactionDisposer } from "mobx";
import { observer } from "mobx-react";
import { documentSchema } from "../../../new_fields/documentSchemas";
import { Id } from '../../../new_fields/FieldSymbols';
import { makeInterface, listSpec } from "../../../new_fields/Schema";
import { StrCast, Cast } from "../../../new_fields/Types";
import { SelectionManager } from "../../util/SelectionManager";
import { ViewBoxAnnotatableComponent } from '../DocComponent';
import { SearchBox } from "../search/SearchBox";
import { FieldView, FieldViewProps } from './FieldView';
import "./QueryBox.scss";
import { List } from "../../../new_fields/List";

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
        let side = false;
        if (this.dataDoc.searchQuery===undefined){
            console.log("YAAA");
            side = true;
        }
        const dragging = !SelectionManager.GetIsDragging() ? "" : "-dragging";
        return <div className={`queryBox${dragging}`} onWheel={(e) => e.stopPropagation()} >
            
            <SearchBox  Document={this.props.Document}  />
        </div >;
    }
}

//<SearchBox id={this.props.Document[Id]} sideBar={side} Document={this.props.Document} searchQuery={StrCast(this.dataDoc.searchQuery)} filterQuery={this.dataDoc.filterQuery} />
