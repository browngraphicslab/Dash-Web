import * as React from 'react';
import { observable, action } from 'mobx';
import { CheckBox } from './CheckBox';
import "./CollectionFilters.scss";
import * as anime from 'animejs';

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

    @observable public _resetBoolean = false;
    @observable public _resetCounter: number = 0;
    
    @observable private _collectionsSelected = this.props.collectionStatus;
    @observable private _timeline: anime.AnimeTimelineInstance;
    @observable private _ref: any;

    constructor(props: CollectionFilterProps) {
        super(props);
        CollectionFilters.Instance = this;
        this._ref = React.createRef();

        this._timeline = anime.timeline({
            loop: false,
            autoplay: false,
            direction: "reverse",
        });
    }

    componentDidMount = () => {
        this._timeline.add({
            targets: this._ref.current,
            easing: "easeInOutQuad",
            duration: 500,
            opacity: 1,
        });

        if (this._collectionsSelected) {
            this._timeline.play();
            this._timeline.reverse();
        }
    }

    @action.bound
    resetCollectionFilters() { this._resetBoolean = true; }

    @action.bound
    updateColStat(val: boolean) {
        this.props.updateCollectionStatus(val);

        if (this._collectionsSelected !== val) {
            this._timeline.play();
            this._timeline.reverse();
        }

        this._collectionsSelected = val;
    }

    render() {
        return (
            <div>
                <div className="collection-filters">
                    <div className="collection-filters main">
                        <CheckBox default={false} title={"limit to current collection"} parent={this} numCount={3} updateStatus={this.updateColStat} originalStatus={this.props.collectionStatus} />
                    </div>
                    <div className="collection-filters optional" ref={this._ref}>
                        <CheckBox default={true} title={"Search in self"} parent={this} numCount={3} updateStatus={this.props.updateSelfCollectionStatus} originalStatus={this.props.collectionSelfStatus} />
                        <CheckBox default={true} title={"Search in parent"} parent={this} numCount={3} updateStatus={this.props.updateParentCollectionStatus} originalStatus={this.props.collectionParentStatus} />
                    </div>
                </div>
            </div>
        );
    }
}