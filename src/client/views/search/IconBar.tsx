import * as React from 'react';
import { observer } from 'mobx-react';
import { observable, action } from 'mobx';
// import "./SearchBox.scss";
import "./IconBar.scss";
import "./IconButton.scss";
import { DocTypes } from '../../documents/Documents';
import { faSearch, faFilePdf, faFilm, faImage, faObjectGroup, faStickyNote, faMusic, faLink, faChartBar, faGlobeAsia, faBan, faTimesCircle, faCheckCircle } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { library } from '@fortawesome/fontawesome-svg-core';
import * as _ from "lodash";
import { IconButton } from './IconButton';
import { FilterBox } from './FilterBox';

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

@observer
export class IconBar extends React.Component {

    static Instance: IconBar;

    @observable public _resetClicked: boolean = false;
    @observable public _selectAllClicked: boolean = false;
    @observable public _reset: number = 0;
    @observable public _select: number = 0;

    constructor(props: any) {
        super(props);
        IconBar.Instance = this;
    }

    @action.bound
    getList(): string[] { return FilterBox.Instance.getIcons(); }

    @action.bound
    updateList(newList: string[]) { FilterBox.Instance.updateIcon(newList); }

    @action.bound
    resetSelf = () => {
        this._resetClicked = true;
        this.updateList([]);
    }

    @action.bound
    selectAll = () => {
        this._selectAllClicked = true;
        this.updateList(FilterBox.Instance._allIcons);
    }

    render() {
        return (
            <div className="icon-bar">
                <div className="type-outer">
                    <div className={"type-icon all"}
                        onClick={this.selectAll}>
                    <FontAwesomeIcon className="fontawesome-icon" icon={faCheckCircle} />
                    </div>
                    <div className="filter-description">Select All</div>
                </div>
                {FilterBox.Instance._allIcons.map((type: string) =>
                    <IconButton type={type} />
                )}
                <div className="type-outer">
                    <div className={"type-icon none"}
                        onClick={this.resetSelf}>
                        <FontAwesomeIcon className="fontawesome-icon" icon={faTimesCircle} />
                    </div>
                    <div className="filter-description">Clear</div>
                </div>
            </div>
        );
    }
}
