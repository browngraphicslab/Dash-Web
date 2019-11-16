import React = require("react");
import { library } from '@fortawesome/fontawesome-svg-core';
import { faArrowLeft, faArrowRight, faEdit, faMinus, faPlay, faPlus, faStop, faTimes } from '@fortawesome/free-solid-svg-icons';
import { IReactionDisposer } from "mobx";
import { observer } from "mobx-react";
import { FilterBox } from "../search/FilterBox";
import { FieldView, FieldViewProps } from './FieldView';
import "./PresBox.scss";

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
    public static LayoutString(fieldKey: string) { return FieldView.LayoutString(QueryBox, fieldKey); }
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