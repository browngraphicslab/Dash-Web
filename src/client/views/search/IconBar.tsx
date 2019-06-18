import * as React from 'react';
import { observer } from 'mobx-react';
import { observable, action, runInAction } from 'mobx';
import "./SearchBox.scss";
import "./IconBar.scss";
import * as anime from 'animejs';
import { DocTypes } from '../../documents/Documents';
import { faSearch, faFilePdf, faFilm, faImage, faObjectGroup, faStickyNote, faMusic, faLink, faChartBar, faGlobeAsia, faBan, faTimesCircle, faCheckCircle } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { library, icon } from '@fortawesome/fontawesome-svg-core';
import * as _ from "lodash";
import $ from 'jquery';
import { array } from 'prop-types';
import { IconButton } from './IconButton';
import { list } from 'serializr';

library.add(faSearch);
library.add(faObjectGroup);
library.add(faImage);
library.add(faStickyNote);
library.add(faFilePdf);
library.add(faFilm);
library.add(faMusic);
library.add(faLink);
library.add(faChartBar);
library.add(faGlobeAsia);
library.add(faBan);

export interface IconBarProps {
    updateIcon(icons: string[]): void;
    getIcons(): string[]
    allIcons: string[];
    updateSelected(list: any[]): void;
}

@observer
export class IconBar extends React.Component<IconBarProps> {

    static Instance: IconBar;
    
    allIcons: string[] = [DocTypes.AUDIO, DocTypes.COL, DocTypes.HIST, DocTypes.IMG, DocTypes.LINK, DocTypes.PDF, DocTypes.TEXT, DocTypes.VID, DocTypes.WEB];
    @observable typesToFind: string[];
    @observable public ResetClicked: boolean = false;
    @observable public SelectAllClicked: boolean = false;
    public Reset: number = 0;
    public Select: number = 0;

    constructor(props: IconBarProps) {
        super(props);
        this.typesToFind = [DocTypes.AUDIO, DocTypes.COL, DocTypes.HIST, DocTypes.IMG, DocTypes.LINK, DocTypes.PDF, DocTypes.TEXT, DocTypes.VID, DocTypes.WEB];
        IconBar.Instance = this;
    }

    @action.bound
    getList = (): string[] => {
        return this.typesToFind;
    }

    @action.bound
    updateList(newList: string[]) {
        this.typesToFind = newList;
        console.log(newList)
    }

    @action.bound
    resetSelf = () => {
        this.ResetClicked = true;
        this.updateList([]);
    }

    @action.bound
    selectAll = () => {
        this.SelectAllClicked = true;
        this.updateList(this.allIcons);
    }

    render() {
        return (
            <div>
                <div className="filter icon-title">Filter by type of node</div>
                <div className="filter icon-bar">
                <div className="filter type-outer">
                        <div className={"type-icon none not-selected"}
                            onClick={this.selectAll}>
                            <FontAwesomeIcon className="fontawesome-icon" icon={faCheckCircle} />
                        </div>
                        <div className="filter-description">Select All</div>
                    </div>
                    {this.allIcons.map((type: string) =>
                        <IconButton type={type} active={this.typesToFind.indexOf(type) !== -1} getList={this.getList} updateList={this.updateList} />
                    )}
                    <div className="filter type-outer">
                        <div className={"type-icon none not-selected"}
                            onClick={this.resetSelf}>
                            <FontAwesomeIcon className="fontawesome-icon" icon={faTimesCircle} />
                        </div>
                        <div className="filter-description">Clear</div>
                    </div>
                </div>
            </div>
        );
    }
}
