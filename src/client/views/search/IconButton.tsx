import * as React from 'react';
import { observer } from 'mobx-react';
import { observable, action, runInAction } from 'mobx';
import "./SearchBox.scss";
import "./IconBar.scss";
import { faSearch, faFilePdf, faFilm, faImage, faObjectGroup, faStickyNote, faMusic, faLink, faChartBar, faGlobeAsia, faBan } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { library, icon } from '@fortawesome/fontawesome-svg-core';

interface IconButtonProps {
    ref: React.RefObject<HTMLDivElement>;
    isRefSelected(r: any): boolean;
    isRemoved(ref: any): boolean;
    type: string;
    getInitialSelectedStatus(ref: any): string;
    getInitialRemovedStatus(ref: any): string;
    onClick(t: string): void;
    icon: any;
}

@observer
export class IconButton extends React.Component<IconButtonProps>{

    render() {
        return (
            <div className="type-outer">
                <div className={"type-icon filter " + (this.props.isRefSelected(this.props.ref) ? "selected " + (this.props.isRemoved(this.props.ref) ? "removed" : "add") : "not-selected")}
                    ref={this.props.ref}
                    data-selected={this.props.getInitialSelectedStatus(this.props.type)}
                    data-removed={this.props.getInitialRemovedStatus(this.props.type)}
                    onClick={() => { this.props.onClick(this.props.type); }}>
                    <FontAwesomeIcon className="fontawesome-icon" icon={this.props.icon} />
                </div>
                <div className="filter-description">{this.props.type}</div>
            </div>
        );
    }
}