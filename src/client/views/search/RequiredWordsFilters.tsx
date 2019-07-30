import * as React from 'react';
import { observable } from 'mobx';
import { CheckBox } from './CheckBox';
import "./FieldFilters.scss";

export interface RequiredWordsFilterProps {
    anyKeywordStatus: boolean;
    allKeywordStatus: boolean;
    updateAnyKeywordStatus(stat: boolean): void;
    updateAllKeywordStatus(stat: boolean): void;
}

export class RequiredWordsFilter extends React.Component<RequiredWordsFilterProps> {

    static Instance: RequiredWordsFilter;

    @observable public _resetBoolean = false;
    @observable public _resetCounter: number = 0;

    constructor(props: RequiredWordsFilterProps) {
        super(props);
        RequiredWordsFilter.Instance = this;
    }

    resetRequiredFieldFilters() {
        this._resetBoolean = true;
    }

    render() {
        return (
            <div className="field-filters-required">
                <CheckBox default={true} numCount={2} parent={this} originalStatus={this.props.anyKeywordStatus} updateStatus={this.props.updateAnyKeywordStatus} title={"Include Any Keywords"} />
                <CheckBox default={true} numCount={2} parent={this} originalStatus={this.props.allKeywordStatus} updateStatus={this.props.updateAllKeywordStatus} title={"Include All Keywords"} />
            </div>
        );
    }
}