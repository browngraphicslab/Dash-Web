import * as React from 'react';
import { observer } from 'mobx-react';
import { observable, action, runInAction } from 'mobx';
import "./SearchBox.scss";
import { CheckBox } from './CheckBox';
import { Keys } from './SearchBox';
import "./SearchBox.scss";
import "./CollectionFilters.scss";
import { FieldFilters } from './FieldFilters';
import * as anime from 'animejs';
import { DocumentView } from '../nodes/DocumentView';
import { SelectionManager } from '../../util/SelectionManager';

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
    @observable collectionsSelected = this.props.collectionStatus;
    @observable timeline: anime.AnimeTimelineInstance;
    @observable ref: any;

    constructor(props: CollectionFilterProps) {
        super(props);
        CollectionFilters.Instance = this;
        this.ref = React.createRef();

        this.timeline = anime.timeline({
            loop: false,
            autoplay: false,
            direction: "reverse",
        });
    }

    componentDidMount = () => {
        this.timeline.add({
            targets: this.ref.current,
            easing: "easeInOutQuad",
            duration: 500,
            opacity: 1,
        });

        if (this.collectionsSelected) {
            this.timeline.play();
            this.timeline.reverse();
        }
    }

    @action.bound
    resetCollectionFilters() { this.resetBoolean = true; }

    @action.bound
    updateColStat(val: boolean) {
        this.props.updateCollectionStatus(val);

            if (this.collectionsSelected !== val) {
                this.timeline.play();
                this.timeline.reverse();
            }

        this.collectionsSelected = val;
    }

    render() {
        return (
            <div>
                <div className="collection-filters">
                    <div className="collection-filters main">
                        <CheckBox default={false} title={"limit to current collection"} parent={this} numCount={3} updateStatus={this.updateColStat} originalStatus={this.props.collectionStatus} />
                    </div>
                    <div className="collection-filters optional" ref={this.ref}>
                        <CheckBox default={true} title={"Search in self"} parent={this} numCount={3} updateStatus={this.props.updateSelfCollectionStatus} originalStatus={this.props.collectionSelfStatus} />
                        <CheckBox default={true} title={"Search in parent"} parent={this} numCount={3} updateStatus={this.props.updateParentCollectionStatus} originalStatus={this.props.collectionParentStatus} />
                    </div>
                </div>
            </div>
        );
    }
}