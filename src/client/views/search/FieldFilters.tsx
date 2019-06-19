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
    render() {
        return (
            <div>
                <div className="filter field-title">Filter by Basic Keys</div>
                <CheckBox originalStatus={this.props.titleFieldStatus} updateStatus={this.props.updateTitleStatus} title={Keys.TITLE} />
                <CheckBox originalStatus={this.props.authorFieldStatus} updateStatus={this.props.updateAuthorStatus} title={Keys.AUTHOR} />
                <CheckBox originalStatus={this.props.dataFieldStatus} updateStatus={this.props.updateDataStatus} title={Keys.DATA} />
            </div>
        )
    }
}