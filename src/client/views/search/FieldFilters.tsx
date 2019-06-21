import * as React from 'react';
import { observer } from 'mobx-react';
import { observable, action, runInAction, } from 'mobx';
import "./SearchBox.scss";
import { CheckBox } from './CheckBox';
import { Keys } from './SearchBox';
import "./SearchBox.scss";

export interface FieldFilterProps {
    titleFieldStatus: boolean;
    dataFieldStatus: boolean;
    authorFieldStatus: boolean;
    updateTitleStatus(stat: boolean): void;
    updateAuthorStatus(stat: boolean): void;
    updateDataStatus(stat: boolean): void;
}

export class FieldFilters extends React.Component<FieldFilterProps> {

    static Instance: FieldFilters;
    @observable public resetBoolean = false;
    @observable public resetCounter: number = 0;

    constructor(props: FieldFilterProps) {
        super(props);
        FieldFilters.Instance = this;
    }

    resetFieldFilters() {
        this.resetBoolean = true;
    }

    render() {
        return (
            <div className = "field-filters">
                <CheckBox default = {true} numCount={3} parent={this} originalStatus={this.props.titleFieldStatus} updateStatus={this.props.updateTitleStatus} title={Keys.TITLE} />
                <CheckBox default = {true} numCount={3} parent={this} originalStatus={this.props.authorFieldStatus} updateStatus={this.props.updateAuthorStatus} title={Keys.AUTHOR} />
                <CheckBox default = {true} numCount={3} parent={this} originalStatus={this.props.dataFieldStatus} updateStatus={this.props.updateDataStatus} title={Keys.DATA} />
            </div>
        );
    }
}