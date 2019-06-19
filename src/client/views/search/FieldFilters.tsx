import * as React from 'react';
import { observer } from 'mobx-react';
import { observable, action, runInAction } from 'mobx';
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

    constructor(props: FieldFilterProps){
        super(props);
        FieldFilters.Instance = this;
    }

resetFieldFilters() {
    this.props.updateAuthorStatus(true);
    this.props.updateDataStatus(true);
    this.props.updateTitleStatus(true);
    this.resetBoolean = true;
}

    render() {
        return (
            <div>
                <div className="filter field-title">Filter by Basic Keys</div>
                <CheckBox numCount = {3} parent = {this} originalStatus={this.props.titleFieldStatus} updateStatus={this.props.updateTitleStatus} title={Keys.TITLE} />
                <CheckBox numCount = {3} parent = {this}  originalStatus={this.props.authorFieldStatus} updateStatus={this.props.updateAuthorStatus} title={Keys.AUTHOR} />
                <CheckBox numCount = {3} parent = {this} originalStatus={this.props.dataFieldStatus} updateStatus={this.props.updateDataStatus} title={Keys.DATA} />
            </div>
        );
    }
}