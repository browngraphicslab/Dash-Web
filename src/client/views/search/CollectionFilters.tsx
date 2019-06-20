import * as React from 'react';
import { observer } from 'mobx-react';
import { observable, action, runInAction } from 'mobx';
import "./SearchBox.scss";
import { CheckBox } from './CheckBox';
import { Keys } from './SearchBox';
import "./SearchBox.scss";
import "./CollectionFilters.scss";
import { FieldFilters } from './FieldFilters';

interface CollectionFilterProps {
    collectionStatus: boolean;
    updateCollectionStatus(val: boolean): void;
    collectionSelfStatus: boolean;
    updateSelfCollectionStatus(val: boolean): void;
    collectionParentStatus: boolean;
    updateParentCollectionStatus(val: boolean): void;
}

export class CollectionFilters extends React.Component<CollectionFilterProps> {

    static Instance: CollectionFilters;

    @observable public resetBoolean = false;
    @observable public resetCounter: number = 0;

    constructor(props:CollectionFilterProps){
        super(props);
        CollectionFilters.Instance = this;
    }

    resetCollectionFilters() {
        this.resetBoolean = true;
    }

    render() {
        return (
            <div>
                <div className='collection-title'>Search in current collections</div>
                <div className="collection-filters">
                    <div className="collection-filters main">
                        <CheckBox default = {false} title={"limit to current collection"} parent={this} numCount={3} updateStatus={this.props.updateCollectionStatus} originalStatus={this.props.collectionStatus} />
                    </div>
                    <div className="collection-filters optional">
                        <CheckBox default = {true} title={"Search in self"} parent={this} numCount={3} updateStatus={this.props.updateSelfCollectionStatus} originalStatus={this.props.collectionSelfStatus} />
                        <CheckBox default = {true} title={"Search in parent"} parent={this} numCount={3} updateStatus={this.props.updateParentCollectionStatus} originalStatus={this.props.collectionParentStatus} />
                    </div>
                </div>
            </div>
        );
    }
}