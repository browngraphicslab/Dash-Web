import * as React from 'react';
import { observable, action } from 'mobx';
import { CheckBox } from './CheckBox';
import { Keys } from './FilterBox';
import "./FieldFilters.scss";

export interface FieldFilterProps {
    titleFieldStatus: boolean;
    authorFieldStatus: boolean;
    bothFieldStatus:  boolean;
    updateTitleStatus(stat: boolean): void;
    updateAuthorStatus(stat: boolean): void;
    updateBothStatus(stat: boolean): void;
}

export class FieldFilters extends React.Component<FieldFilterProps> {

    static Instance: FieldFilters;

    @observable public _resetBoolean = false;
    @observable public _resetCounter: number = 0;


    constructor(props: FieldFilterProps) {
        super(props);
        FieldFilters.Instance = this;
    }

    resetFieldFilters() {
        this._resetBoolean = true;
    }

    render() {
        return (
            <div className="field-filters">
                <CheckBox default={true} numCount={3} parent={this} originalStatus={this.props.titleFieldStatus} updateStatus={this.props.updateTitleStatus} title={"title"} />
                <CheckBox default={true} numCount={3} parent={this} originalStatus={this.props.authorFieldStatus} updateStatus={this.props.updateAuthorStatus} title={"author"} />
                <CheckBox default={false} numCount={3} parent={this} originalStatus={this.props.bothFieldStatus} updateStatus={this.props.updateBothStatus} title={"Check only author and title"} />
            </div>
        );
    }
}